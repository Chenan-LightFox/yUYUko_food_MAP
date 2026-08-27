const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const express = require('express');

const testLogDirectory = path.join(os.tmpdir(), `yuyuko-logging-test-${process.pid}`);
fs.rmSync(testLogDirectory, { recursive: true, force: true });
process.env.LOG_DIR = testLogDirectory;
process.env.LOG_TO_CONSOLE = 'false';
process.env.LOG_TO_FILE = 'true';
process.env.LOG_LEVEL = 'debug';
process.env.LOG_MAX_FILE_MB = '1';

const logger = require('../utils/logger');
const { requestLogger, notFoundHandler, errorHandler } = require('../middleware/requestLogger');
const usersRouter = require('../routes/users');
const redis = require('../redis');
const { db } = require('../db');

async function main() {
    const testUserId = crypto.randomUUID();
    const testUsername = `__logging_login_${process.pid}_${Date.now()}`;
    const testPassword = 'valid-login-test-password';
    db._raw.prepare('INSERT INTO User (id, username, password) VALUES (?, ?, ?)').run(
        testUserId,
        testUsername,
        crypto.createHash('sha256').update(testPassword).digest('hex')
    );

    const app = express();
    app.set('trust proxy', true);
    app.use(requestLogger);
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use('/users', usersRouter);
    app.use(notFoundHandler);
    app.use(errorHandler);

    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    try {
        const requestId = 'iphone-test-12345678';
        const port = server.address().port;
        const response = await fetch(`http://127.0.0.1:${port}/users/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'X-Request-ID': requestId,
                'User-Agent': 'LoggingTest/1.0'
            },
            body: 'username=__logging_probe__&password=super-secret-test'
        });
        const body = await response.json();
        assert.strictEqual(response.status, 401);
        assert.strictEqual(response.headers.get('x-request-id'), requestId);
        assert.strictEqual(body.requestId, requestId);

        const validLoginRequestId = 'valid-login-12345678';
        const validLoginResponse = await fetch(`http://127.0.0.1:${port}/users/login?request_id=${validLoginRequestId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: new URLSearchParams({ username: testUsername, password: testPassword })
        });
        const validLoginBody = await validLoginResponse.json();
        assert.strictEqual(validLoginResponse.status, 200);
        assert.strictEqual(validLoginResponse.headers.get('x-request-id'), validLoginRequestId);
        assert.ok(validLoginBody.token, 'valid login did not return a token');

        // This request intentionally follows immediately: it proves the login
        // response is not sent before the Redis session becomes visible.
        const meResponse = await fetch(`http://127.0.0.1:${port}/users/me`, {
            headers: { Authorization: `Bearer ${validLoginBody.token}` }
        });
        const meBody = await meResponse.json();
        assert.strictEqual(meResponse.status, 200, JSON.stringify(meBody));
        assert.strictEqual(meBody.user.id, testUserId);

        logger.info('Redaction probe', {
            event: 'test.redaction',
            password: 'super-secret-test',
            authorization: 'Bearer secret-token',
            nested: { inviteCode: 'invite-secret', safe: 'kept-value' }
        });
        logger.error('Error file probe', {
            event: 'test.error',
            error: new Error('expected logging test error')
        });
        await new Promise((resolve) => {
            db.get('SELECT * FROM __logging_test_missing_table__', [], (error) => {
                assert.ok(error, 'invalid SQLite query unexpectedly succeeded');
                resolve();
            });
        });

        await new Promise((resolve) => setTimeout(resolve, 25));
        await logger.flush();

        const files = fs.readdirSync(testLogDirectory).filter((name) => name.startsWith('app-'));
        assert.ok(files.length > 0, 'app log file was not created');
        const errorFiles = fs.readdirSync(testLogDirectory).filter((name) => name.startsWith('error-'));
        assert.ok(errorFiles.length > 0, 'error log file was not created');
        const contents = files.map((name) => fs.readFileSync(path.join(testLogDirectory, name), 'utf8')).join('\n');
        assert.ok(contents.includes(requestId), 'request ID was not written to logs');
        assert.ok(contents.includes('auth.login.rejected'), 'login rejection event was not logged');
        assert.ok(contents.includes('http.request.completed'), 'request completion event was not logged');
        assert.ok(contents.includes('database.query.failed'), 'database failure event was not logged');
        assert.ok(contents.includes('[REDACTED]'), 'sensitive fields were not redacted');
        assert.ok(contents.includes('kept-value'), 'safe diagnostic field was lost');
        assert.ok(!contents.includes('super-secret-test'), 'password leaked into logs');
        assert.ok(!contents.includes('secret-token'), 'authorization token leaked into logs');
        assert.ok(!contents.includes('invite-secret'), 'invite code leaked into logs');

        const cliResult = spawnSync(process.execPath, [path.join(__dirname, 'read_logs.js'), '--request-id', requestId, '--since', '1h'], {
            env: { ...process.env, LOG_DIR: testLogDirectory },
            encoding: 'utf8'
        });
        assert.strictEqual(cliResult.status, 0, cliResult.stderr);
        assert.ok(cliResult.stdout.includes(requestId), 'log reader could not find the request ID');

        process.stdout.write('Logging integration test passed\n');
    } finally {
        await new Promise((resolve) => server.close(resolve));
        try { await redis.del(`session:${testUserId}`); } catch (error) { }
        db._raw.prepare('DELETE FROM User WHERE id = ?').run(testUserId);
        redis.disconnect();
        await logger.flush();
        fs.rmSync(testLogDirectory, { recursive: true, force: true });
    }
}

main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    redis.disconnect();
    fs.rmSync(testLogDirectory, { recursive: true, force: true });
    process.exitCode = 1;
});
