const { db, init } = require('../db');
const crypto = require('crypto');

const users = [
    { username: 'dev', password: '12345679', admin_level: 'YUYUKO' },
    { username: 'dev1', password: '12341234', admin_level: null }
];

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

init();

function ensureSchema(cb) {
    db.all("PRAGMA table_info('User')", [], (err, rows) => {
        if (err) return cb(err);
        const cols = (rows || []).map(r => r.name);
        const required = ['id', 'username', 'password', 'admin_level', 'created_time'];
        const missing = required.filter(c => !cols.includes(c));
        if (missing.length > 0) {
            return cb(new Error(`User 表字段不完整，缺少: ${missing.join(', ')}`));
        }
        cb(null);
    });
}

ensureSchema((err) => {
    if (err) {
        console.error('Schema ensure failed:', err.message);
        db.close();
        process.exit(1);
    }

    const sql = `INSERT INTO User (id, username, password, avatar, admin_level, created_time)
                                 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                                 ON CONFLICT(username) DO UPDATE SET
                                     password = excluded.password,
                                     avatar = excluded.avatar,
                                     admin_level = excluded.admin_level`;

    function insertUser(i) {
        if (i >= users.length) {
            console.log('All users inserted/updated');
            db.close();
            return;
        }
        const u = users[i];
        const userId = crypto.randomUUID();
        const hashed = hashPassword(u.password);
        const adminVal = u.admin_level === null ? null : u.admin_level;
        db.run(sql, [userId, u.username, hashed, null, adminVal], function (err) {
            if (err) {
                console.error(`Insert failed for ${u.username}:`, err.message);
                process.exitCode = 2;
                // continue with next
            } else {
                console.log(`User inserted/updated with id=${userId}, username=${u.username}, admin_level=${adminVal}`);
            }
            insertUser(i + 1);
        });
    }

    insertUser(0);
});
