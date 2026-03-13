const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const dbFile = path.join(__dirname, '..', 'data.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error('Failed to open DB:', err.message);
        process.exit(1);
    }
});

const users = [
    { id: 864, username: 'dev', password: '12345679', admin_level: 'YUYUKO' },
    { id: 126, username: 'dev1', password: '12341234', admin_level: null }
];

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function ensureSchema(cb) {
    db.serialize(() => {
        // 确保 User 表存在
        db.run(`CREATE TABLE IF NOT EXISTS "User" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            avatar TEXT
        );`, (err) => {
            if (err) return cb(err);

            // 检查 User 表的列，添加缺失的列
            db.all("PRAGMA table_info('User')", [], (err2, rows) => {
                if (err2) return cb(err2);
                const cols = (rows || []).map(r => r.name);
                const tasks = [];

                if (!cols.includes('admin_level')) {
                    tasks.push(cbAddColumn.bind(null, "admin_level TEXT"));
                }
                if (!cols.includes('created_time')) {
                    tasks.push(cbAddColumn.bind(null, "created_time DATETIME DEFAULT CURRENT_TIMESTAMP"));
                }

                function runTasks(i) {
                    if (i >= tasks.length) return cb(null);
                    tasks[i]((err3) => {
                        if (err3) return cb(err3);
                        runTasks(i + 1);
                    });
                }

                runTasks(0);
            });
        });
    });
}

function cbAddColumn(def, cb) {
    const sql = `ALTER TABLE User ADD COLUMN ${def}`;
    db.run(sql, [], (err) => {
        if (err) {
            // If column already exists or another error, report
            console.error('Failed to add column', def, err.message);
            return cb(err);
        }
        console.log('Added column:', def);
        cb(null);
    });
}

ensureSchema((err) => {
    if (err) {
        console.error('Schema ensure failed:', err.message);
        db.close();
        process.exit(1);
    }

    // 插入或替换用户记录
    const sql = `INSERT OR REPLACE INTO User (id, username, password, avatar, admin_level, created_time)
                 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;

    function insertUser(i) {
        if (i >= users.length) {
            console.log('All users inserted/updated');
            db.close();
            return;
        }
        const u = users[i];
        const hashed = hashPassword(u.password);
        const adminVal = u.admin_level === null ? null : u.admin_level;
        db.run(sql, [u.id, u.username, hashed, null, adminVal], function(err) {
            if (err) {
                console.error(`Insert failed for ${u.username}:`, err.message);
                process.exitCode = 2;
                // continue with next
            } else {
                console.log(`User inserted/updated with id=${u.id}, username=${u.username}, admin_level=${adminVal}`);
            }
            insertUser(i + 1);
        });
    }

    insertUser(0);
});
