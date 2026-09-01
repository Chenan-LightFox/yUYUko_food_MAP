const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'yuyuko-migration-'));
const databasePath = path.join(tempDirectory, 'legacy.sqlite');

function createLegacyDatabase() {
    const legacy = new Database(databasePath);
    legacy.exec(`
        CREATE TABLE User (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT);
        CREATE TABLE Place (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            description TEXT,
            latitude REAL,
            longitude REAL,
            category TEXT,
            per_person_cost INTEGER,
            creator_id INTEGER,
            created_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_by INTEGER
        );
        CREATE TABLE Comment (id INTEGER PRIMARY KEY AUTOINCREMENT, place_id INTEGER, user_id INTEGER);
        CREATE TABLE AdminAudit (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER, action TEXT, target_user_id INTEGER);
        CREATE TABLE SiteNotice (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL, color_key TEXT NOT NULL, created_by INTEGER);
        CREATE TABLE PlaceRequest (id INTEGER PRIMARY KEY AUTOINCREMENT, place_id INTEGER, requester_id INTEGER, reviewed_by INTEGER);
        CREATE TABLE DinnerEvent (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, place_name TEXT NOT NULL, start_time DATETIME NOT NULL, creator_id INTEGER NOT NULL);
        CREATE TABLE Favorite (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, place_id INTEGER NOT NULL, UNIQUE(user_id, place_id));
        CREATE TABLE Category (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            is_common INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 1000,
            created_by TEXT,
            created_time DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO User (id, username, password) VALUES (1, 'legacy-one', 'hash-1'), (2, 'legacy-two', 'hash-2');
        INSERT INTO Place (id, name, creator_id, updated_by) VALUES (10, 'legacy-place', 1, 2);
        INSERT INTO Comment (id, place_id, user_id) VALUES (20, 10, 1);
        INSERT INTO AdminAudit (id, admin_id, action, target_user_id) VALUES (30, 1, 'legacy-action', 2), (31, 1, 'orphan-history', 999);
        INSERT INTO SiteNotice (id, title, content, color_key, created_by) VALUES (40, 'legacy', 'legacy', 'blue', 1);
        INSERT INTO PlaceRequest (id, place_id, requester_id, reviewed_by) VALUES (50, 10, 1, 2);
        INSERT INTO DinnerEvent (id, title, place_name, start_time, creator_id) VALUES (60, 'legacy', 'legacy', CURRENT_TIMESTAMP, 1);
        INSERT INTO Favorite (id, user_id, place_id) VALUES (70, 2, 10);
        INSERT INTO Category (id, name, created_by) VALUES (80, 'legacy-category', '1');
    `);
    legacy.close();
}

function main() {
    createLegacyDatabase();
    process.env.DB_FILE = databasePath;
    process.env.LOG_TO_FILE = 'false';
    process.env.LOG_TO_CONSOLE = 'false';

    const { db, init } = require('../db');
    try {
        init();
        const firstId = db._raw.prepare('SELECT id FROM User WHERE username = ?').get('legacy-one').id;
        const secondId = db._raw.prepare('SELECT id FROM User WHERE username = ?').get('legacy-two').id;
        assert.match(firstId, /^[0-9a-f-]{36}$/);
        assert.match(secondId, /^[0-9a-f-]{36}$/);
        assert.notStrictEqual(firstId, secondId);

        assert.deepStrictEqual(
            db._raw.prepare('SELECT creator_id, updated_by FROM Place WHERE id = 10').get(),
            { creator_id: firstId, updated_by: secondId }
        );
        assert.strictEqual(db._raw.prepare('SELECT user_id FROM Comment WHERE id = 20').get().user_id, firstId);
        assert.deepStrictEqual(
            db._raw.prepare('SELECT admin_id, target_user_id FROM AdminAudit WHERE id = 30').get(),
            { admin_id: firstId, target_user_id: secondId }
        );
        assert.deepStrictEqual(
            db._raw.prepare('SELECT admin_id, target_user_id FROM AdminAudit WHERE id = 31').get(),
            { admin_id: firstId, target_user_id: '999' }
        );
        assert.strictEqual(db._raw.prepare('SELECT created_by FROM SiteNotice WHERE id = 40').get().created_by, firstId);
        assert.deepStrictEqual(
            db._raw.prepare('SELECT requester_id, reviewed_by FROM PlaceRequest WHERE id = 50').get(),
            { requester_id: firstId, reviewed_by: secondId }
        );
        assert.strictEqual(db._raw.prepare('SELECT creator_id FROM DinnerEvent WHERE id = 60').get().creator_id, firstId);
        assert.strictEqual(db._raw.prepare('SELECT user_id FROM Favorite WHERE id = 70').get().user_id, secondId);
        assert.strictEqual(db._raw.prepare('SELECT created_by FROM Category WHERE id = 80').get().created_by, firstId);

        const expectedTextColumns = {
            Place: ['creator_id', 'updated_by'],
            Comment: ['user_id'],
            AdminAudit: ['admin_id', 'target_user_id'],
            SiteNotice: ['created_by'],
            PlaceRequest: ['requester_id', 'reviewed_by'],
            DinnerEvent: ['creator_id'],
            Favorite: ['user_id']
        };
        for (const [table, names] of Object.entries(expectedTextColumns)) {
            const columns = new Map(db._raw.prepare(`PRAGMA table_info("${table}")`).all()
                .map((column) => [column.name, String(column.type).toUpperCase()]));
            names.forEach((name) => assert.strictEqual(columns.get(name), 'TEXT', `${table}.${name}`));
        }
        assert.strictEqual(db._raw.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
        assert.strictEqual(
            db._raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE '__User_%migration%'").get().n,
            0
        );
        process.stdout.write('Legacy database migration test passed\n');
    } finally {
        db.close();
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
}

try {
    main();
} catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    fs.rmSync(tempDirectory, { recursive: true, force: true });
    process.exitCode = 1;
}
