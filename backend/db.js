const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbFile = path.join(__dirname, "data.sqlite");
const db = new sqlite3.Database(dbFile);

function init() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS "User" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            avatar TEXT,
            admin_level TEXT,
            created_time DATETIME DEFAULT CURRENT_TIMESTAMP
        );`);

        db.run(`CREATE INDEX IF NOT EXISTS idx_user_admin_level ON User(admin_level);`);

        // Ensure User table has is_banned and ban_reason columns (migration for existing DBs)
        db.all("PRAGMA table_info('User')", [], (err, rows) => {
            if (err) {
                console.error('Failed to check User table info:', err && err.message);
            } else {
                const cols = (rows || []).map(r => r.name);
                const runAlter = (sql, cb) => {
                    db.run(sql, [], (e) => {
                        if (e) console.warn(`${sql} failed:`, e.message);
                        else console.log(`Migrated: ${sql}`);
                        if (cb) cb(e);
                    });
                };
                if (!cols.includes('is_banned')) {
                    runAlter("ALTER TABLE User ADD COLUMN is_banned INTEGER DEFAULT 0");
                }
                if (!cols.includes('ban_reason')) {
                    runAlter("ALTER TABLE User ADD COLUMN ban_reason TEXT");
                }
            }
        });

        // Create Place table with base columns; migration will add updated_* if needed
        db.run(`CREATE TABLE IF NOT EXISTS "Place" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            description TEXT,
            latitude REAL,
            longitude REAL,
            category TEXT,
            creator_id INTEGER,
            created_time DATETIME DEFAULT CURRENT_TIMESTAMP
        );`);

        // Ensure Place has updated_time and updated_by columns (migration for existing DBs)
        db.all("PRAGMA table_info('Place')", [], (err, rows) => {
            if (err) {
                console.error('Failed to check Place table info:', err && err.message);
                // Still attempt to create remaining tables/indexes
                createRemaining();
                return;
            }

            const cols = (rows || []).map(r => r.name);
            const alterTasks = [];

            const runAlter = (sql, cb) => {
                db.run(sql, [], (e) => {
                    if (e) console.warn(`${sql} failed:`, e.message);
                    else console.log(`Migrated: ${sql}`);
                    if (cb) cb(e);
                });
            };

            if (!cols.includes('updated_time')) {
                alterTasks.push((next) => runAlter("ALTER TABLE Place ADD COLUMN updated_time DATETIME", next));
            }
            if (!cols.includes('updated_by')) {
                alterTasks.push((next) => runAlter("ALTER TABLE Place ADD COLUMN updated_by INTEGER", next));
            }

            // Execute alter tasks in sequence, then create indexes and remaining tables
            const runAltersSequential = (tasks, idx) => {
                if (!tasks || tasks.length === 0) {
                    createRemaining();
                    return;
                }
                if (idx >= tasks.length) {
                    createRemaining();
                    return;
                }
                try {
                    tasks[idx](() => runAltersSequential(tasks, idx + 1));
                } catch (e) {
                    console.warn('Error running alter task', e && e.message);
                    runAltersSequential(tasks, idx + 1);
                }
            };

            runAltersSequential(alterTasks, 0);
        });

        // Function to create indexes and other tables that may depend on columns
        function createRemaining() {
            db.run(`CREATE INDEX IF NOT EXISTS idx_place_creator_id ON Place(creator_id);`);
            // Index on updated_time may fail on older SQLite if column missing; by running after migration it should exist
            db.run(`CREATE INDEX IF NOT EXISTS idx_place_updated_time ON Place(updated_time);`, [], (e) => {
                if (e) console.warn('Failed to create idx_place_updated_time:', e.message);
            });

            db.run(`CREATE TABLE IF NOT EXISTS "Comment" (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                place_id INTEGER,
                user_id INTEGER,
                content TEXT,
                rating INTEGER,
                time DATETIME DEFAULT CURRENT_TIMESTAMP
            );`);

            db.run(`CREATE TABLE IF NOT EXISTS "AdminAudit" (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_id INTEGER,
                action TEXT,
                target_user_id INTEGER,
                details TEXT,
                time DATETIME DEFAULT CURRENT_TIMESTAMP
            );`);

            // Create PlaceRequest table, then create its indexes in callback to ensure order
            db.run(`CREATE TABLE IF NOT EXISTS "PlaceRequest" (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                place_id INTEGER,
                requester_id INTEGER,
                proposed TEXT,
                note TEXT,
                status TEXT DEFAULT 'pending',
                reviewed_by INTEGER,
                reviewed_time DATETIME,
                created_time DATETIME DEFAULT CURRENT_TIMESTAMP
            );`, [], (err) => {
                if (err) {
                    console.warn('Failed to create PlaceRequest table:', err.message);
                    return;
                }
                // Create indexes after table exists
                db.run(`CREATE INDEX IF NOT EXISTS idx_placerequest_place_id ON PlaceRequest(place_id);`, [], (e) => {
                    if (e) console.warn('Failed to create idx_placerequest_place_id:', e.message);
                });
                db.run(`CREATE INDEX IF NOT EXISTS idx_placerequest_requester_id ON PlaceRequest(requester_id);`, [], (e) => {
                    if (e) console.warn('Failed to create idx_placerequest_requester_id:', e.message);
                });
            });

            // Ensure InviteCode table exists for invite management
            db.run(`CREATE TABLE IF NOT EXISTS "InviteCode" (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT,
                max_uses INTEGER DEFAULT 1,
                current_uses INTEGER DEFAULT 0,
                created_time DATETIME DEFAULT CURRENT_TIMESTAMP
            );`, [], (err) => {
                if (err) {
                    console.warn('Failed to create InviteCode table:', err.message);
                    return;
                }
                db.run(`CREATE INDEX IF NOT EXISTS idx_invitecode_code ON InviteCode(code);`, [], (e) => {
                    if (e) console.warn('Failed to create idx_invitecode_code:', e.message);
                });
            });
        }

    });
}

module.exports = { db, init };
