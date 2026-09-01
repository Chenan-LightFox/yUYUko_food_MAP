const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'yuyuko-transactions-'));
process.env.DB_FILE = path.join(tempDirectory, 'transactions.sqlite');
process.env.LOG_TO_FILE = 'false';
process.env.LOG_TO_CONSOLE = 'false';

const { db, init } = require('../db');
const redis = require('../redis');
const usersRouter = require('../routes/users');
const placeRequestsRouter = require('../routes/placeRequests');
const { requestLogger, notFoundHandler, errorHandler } = require('../middleware/requestLogger');

const JWT_SECRET = process.env.JWT_SECRET || 'yuyuko_secret_key';

function hashCode(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

async function jsonRequest(url, options = {}) {
    const response = await fetch(url, options);
    const body = await response.json();
    return { response, body };
}

async function main() {
    init();

    const app = express();
    app.set('trust proxy', true);
    app.use(requestLogger);
    app.use(express.json());
    app.use('/users', usersRouter);
    app.use('/place-requests', placeRequestsRouter);
    app.use(notFoundHandler);
    app.use(errorHandler);

    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    const sessionIds = [];
    try {
        const baseUrl = `http://127.0.0.1:${server.address().port}`;
        const invite = 'single-use-invite';
        db._raw.prepare('INSERT INTO InviteCode (code, max_uses, current_uses) VALUES (?, 1, 0)')
            .run(hashCode(invite));
        db._raw.prepare('INSERT INTO QQWhitelist (qq) VALUES (?)').run('100001');
        db._raw.prepare('INSERT INTO QQWhitelist (qq) VALUES (?)').run('100002');

        const firstRegistration = await jsonRequest(`${baseUrl}/users/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'register-transaction-0001' },
            body: JSON.stringify({ username: 'first-user', password: 'secret-1', inviteCode: invite, qq: '100001' })
        });
        assert.strictEqual(firstRegistration.response.status, 201, JSON.stringify(firstRegistration.body));
        sessionIds.push(firstRegistration.body.user.id);

        const exhaustedRegistration = await jsonRequest(`${baseUrl}/users/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'register-transaction-0002' },
            body: JSON.stringify({ username: 'second-user', password: 'secret-2', inviteCode: invite, qq: '100002' })
        });
        assert.strictEqual(exhaustedRegistration.response.status, 400);
        assert.strictEqual(db._raw.prepare('SELECT current_uses FROM InviteCode WHERE code = ?').get(hashCode(invite)).current_uses, 1);
        assert.strictEqual(db._raw.prepare('SELECT COUNT(*) AS n FROM User WHERE username IN (?, ?)').get('first-user', 'second-user').n, 1);

        const adminId = crypto.randomUUID();
        db._raw.prepare('INSERT INTO User (id, username, password, admin_level) VALUES (?, ?, ?, ?)')
            .run(adminId, 'transaction-admin', 'unused', 'YUYUKO');
        const adminToken = jwt.sign({ id: adminId, username: 'transaction-admin' }, JWT_SECRET, { expiresIn: 3600 });
        if (redis.isReady()) await redis.set(`session:${adminId}`, adminToken, 'EX', 3600);
        sessionIds.push(adminId);

        const placeId = Number(db._raw.prepare(
            'INSERT INTO Place (name, creator_id) VALUES (?, ?)'
        ).run('before-review', firstRegistration.body.user.id).lastInsertRowid);
        const creationTraceId = 'request-create-0001';
        const createdRequest = await jsonRequest(`${baseUrl}/place-requests`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${firstRegistration.body.token}`,
                'Content-Type': 'application/json',
                'X-Request-ID': creationTraceId,
                'X-Forwarded-For': '198.51.100.20'
            },
            body: JSON.stringify({ place_id: placeId, proposed: { name: 'after-review' } })
        });
        assert.strictEqual(createdRequest.response.status, 201, JSON.stringify(createdRequest.body));
        const requestId = Number(createdRequest.body.id);
        const creationAudit = db._raw.prepare(
            'SELECT admin_id, ip, request_id FROM AdminAudit WHERE action = ?'
        ).get('place-request-created');
        assert.deepStrictEqual(creationAudit, {
            admin_id: firstRegistration.body.user.id,
            ip: '198.51.100.20',
            request_id: creationTraceId
        });

        const traceRequestId = 'review-transaction-0001';
        const review = await jsonRequest(`${baseUrl}/place-requests/${requestId}/review`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${adminToken}`,
                'Content-Type': 'application/json',
                'X-Request-ID': traceRequestId,
                'X-Forwarded-For': '198.51.100.23'
            },
            body: JSON.stringify({ action: 'approve' })
        });
        assert.strictEqual(review.response.status, 200, JSON.stringify(review.body));
        assert.strictEqual(db._raw.prepare('SELECT name FROM Place WHERE id = ?').get(placeId).name, 'after-review');
        const reviewedRow = db._raw.prepare('SELECT status, reviewed_by FROM PlaceRequest WHERE id = ?').get(requestId);
        assert.deepStrictEqual(reviewedRow, { status: 'approved', reviewed_by: adminId });
        const audit = db._raw.prepare(
            'SELECT admin_id, target_user_id, ip, request_id FROM AdminAudit WHERE action = ?'
        ).get('place-request-review');
        assert.deepStrictEqual(audit, {
            admin_id: adminId,
            target_user_id: firstRegistration.body.user.id,
            ip: '198.51.100.23',
            request_id: traceRequestId
        });

        const repeatedReview = await jsonRequest(`${baseUrl}/place-requests/${requestId}/review`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'approve' })
        });
        assert.strictEqual(repeatedReview.response.status, 409);
        assert.strictEqual(db._raw.prepare('SELECT COUNT(*) AS n FROM AdminAudit WHERE action = ?').get('place-request-review').n, 1);

        const missingPlaceRequestId = Number(db._raw.prepare(
            'INSERT INTO PlaceRequest (place_id, requester_id, proposed) VALUES (?, ?, ?)'
        ).run(999999, firstRegistration.body.user.id, JSON.stringify({ name: 'must-not-apply' })).lastInsertRowid);
        const missingPlaceReview = await jsonRequest(`${baseUrl}/place-requests/${missingPlaceRequestId}/review`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'approve' })
        });
        assert.strictEqual(missingPlaceReview.response.status, 409);
        assert.strictEqual(db._raw.prepare('SELECT status FROM PlaceRequest WHERE id = ?').get(missingPlaceRequestId).status, 'pending');

        process.stdout.write('Transaction and audit integration test passed\n');
    } finally {
        await new Promise((resolve) => server.close(resolve));
        for (const userId of sessionIds) {
            try { await redis.del(`session:${userId}`); } catch (error) { }
        }
        redis.disconnect();
        db.close();
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
}

main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    redis.disconnect();
    try { db.close(); } catch (closeError) { }
    fs.rmSync(tempDirectory, { recursive: true, force: true });
    process.exitCode = 1;
});
