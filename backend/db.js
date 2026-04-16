const Database = require('better-sqlite3');
const path = require('path');

const dbFile = path.join(__dirname, 'data.sqlite');

let rawDb;
try {
    rawDb = new Database(dbFile);
} catch (e) {
    console.error('Failed to open DB:', e && e.message);
    throw e;
}

// Provide a small wrapper that mimics the sqlite3 async callback API used across the codebase
const db = {
    run(sql, params, cb) {
        if (typeof params === 'function') {
            cb = params;
            params = [];
        }
        if (params == null) params = [];
        const args = Array.isArray(params) ? params : [params];
        try {
            const stmt = rawDb.prepare(sql);
            const info = stmt.run(...args);
            if (cb) {
                const thisObj = { lastID: info.lastInsertRowid, changes: info.changes };
                process.nextTick(() => cb.call(thisObj, null));
            }
            return info;
        } catch (err) {
            if (cb) process.nextTick(() => cb(err));
            else throw err;
        }
    },
    get(sql, params, cb) {
        if (typeof params === 'function') {
            cb = params;
            params = [];
        }
        if (params == null) params = [];
        const args = Array.isArray(params) ? params : [params];
        try {
            const stmt = rawDb.prepare(sql);
            const row = stmt.get(...args);
            if (cb) process.nextTick(() => cb(null, row));
            return row;
        } catch (err) {
            if (cb) process.nextTick(() => cb(err));
            else throw err;
        }
    },
    all(sql, params, cb) {
        if (typeof params === 'function') {
            cb = params;
            params = [];
        }
        if (params == null) params = [];
        const args = Array.isArray(params) ? params : [params];
        try {
            const stmt = rawDb.prepare(sql);
            const rows = stmt.all(...args);
            if (cb) process.nextTick(() => cb(null, rows));
            return rows;
        } catch (err) {
            if (cb) process.nextTick(() => cb(err));
            else throw err;
        }
    },
    serialize(fn) {
        if (typeof fn === 'function') {
            try {
                fn();
            } catch (e) {
                throw e;
            }
        }
    },
    close(cb) {
        try {
            rawDb.close();
            if (cb) process.nextTick(() => cb(null));
        } catch (err) {
            if (cb) process.nextTick(() => cb(err));
            else throw err;
        }
    },
    _raw: rawDb
};

function init() {
    try {
        rawDb.exec(`CREATE TABLE IF NOT EXISTS "User" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            avatar TEXT,
            admin_level TEXT,
            created_time DATETIME DEFAULT CURRENT_TIMESTAMP
        );`);

        rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_user_admin_level ON User(admin_level);`);

        // Ensure User table has optional columns
        const userCols = rawDb.prepare("PRAGMA table_info('User')").all().map(r => r.name);
        const addIfMissing = (colDef) => {
            const colName = colDef.split(' ')[0];
            if (!userCols.includes(colName)) {
                try {
                    rawDb.exec(`ALTER TABLE User ADD COLUMN ${colDef}`);
                    console.log(`Migrated: ALTER TABLE User ADD COLUMN ${colDef}`);
                } catch (e) {
                    console.warn(`ALTER TABLE User ADD COLUMN ${colDef} failed:`, e.message);
                }
            }
        };
        addIfMissing('is_banned INTEGER DEFAULT 0');
        addIfMissing('ban_reason TEXT');
        addIfMissing('ban_expires DATETIME');
        addIfMissing('map_settings TEXT');
        addIfMissing('qq TEXT');
        addIfMissing('avatar_blob BLOB');

        rawDb.exec(`CREATE TABLE IF NOT EXISTS "Place" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            description TEXT,
            latitude REAL,
            longitude REAL,
            category TEXT,
            creator_id INTEGER,
            created_time DATETIME DEFAULT CURRENT_TIMESTAMP
        );`);

        const placeCols = rawDb.prepare("PRAGMA table_info('Place')").all().map(r => r.name);
        const addPlaceIfMissing = (colDef) => {
            const colName = colDef.split(' ')[0];
            if (!placeCols.includes(colName)) {
                try {
                    rawDb.exec(`ALTER TABLE Place ADD COLUMN ${colDef}`);
                    console.log(`Migrated: ALTER TABLE Place ADD COLUMN ${colDef}`);
                } catch (e) {
                    console.warn(`ALTER TABLE Place ADD COLUMN ${colDef} failed:`, e.message);
                }
            }
        };
        addPlaceIfMissing('updated_time DATETIME');
        addPlaceIfMissing('updated_by INTEGER');
        addPlaceIfMissing('exterior_images TEXT');
        addPlaceIfMissing('menu_images TEXT');

        try {
            rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_place_creator_id ON Place(creator_id);`);
        } catch (e) {
            console.warn('Failed to create idx_place_creator_id:', e.message);
        }
        try {
            rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_place_updated_time ON Place(updated_time);`);
        } catch (e) {
            console.warn('Failed to create idx_place_updated_time:', e.message);
        }

        rawDb.exec(`CREATE TABLE IF NOT EXISTS "Comment" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            place_id INTEGER,
            user_id INTEGER,
            content TEXT,
            rating INTEGER,
            time DATETIME DEFAULT CURRENT_TIMESTAMP
        );`);

        rawDb.exec(`CREATE TABLE IF NOT EXISTS "AdminAudit" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_id INTEGER,
            action TEXT,
            target_user_id INTEGER,
            details TEXT,
            time DATETIME DEFAULT CURRENT_TIMESTAMP
        );`);

        rawDb.exec(`CREATE TABLE IF NOT EXISTS "PlaceRequest" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            place_id INTEGER,
            requester_id INTEGER,
            proposed TEXT,
            note TEXT,
            status TEXT DEFAULT 'pending',
            reviewed_by INTEGER,
            reviewed_time DATETIME,
            created_time DATETIME DEFAULT CURRENT_TIMESTAMP
        );`);
        try {
            rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_placerequest_place_id ON PlaceRequest(place_id);`);
            rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_placerequest_requester_id ON PlaceRequest(requester_id);`);
        } catch (e) {
            console.warn('Failed to create PlaceRequest indexes:', e.message);
        }

        rawDb.exec(`CREATE TABLE IF NOT EXISTS "InviteCode" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT,
            max_uses INTEGER DEFAULT 1,
            current_uses INTEGER DEFAULT 0,
            created_time DATETIME DEFAULT CURRENT_TIMESTAMP
        );`);
        try {
            rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_invitecode_code ON InviteCode(code);`);
        } catch (e) {
            console.warn('Failed to create idx_invitecode_code:', e.message);
        }

        rawDb.exec(`CREATE TABLE IF NOT EXISTS "DinnerEvent" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            place_name TEXT NOT NULL,
            start_time DATETIME NOT NULL,
            max_participants INTEGER,
            contact_info TEXT,
            status TEXT DEFAULT 'open',
            creator_id INTEGER NOT NULL,
            created_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_time DATETIME
        );`);
        try {
            rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_dinnerevent_start_time ON DinnerEvent(start_time);`);
            rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_dinnerevent_creator_id ON DinnerEvent(creator_id);`);
        } catch (e) {
            console.warn('Failed to create DinnerEvent indexes:', e.message);
        }

        rawDb.exec(`CREATE TABLE IF NOT EXISTS "Favorite" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            place_id INTEGER NOT NULL,
            created_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, place_id)
        );`);
        try {
            rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_favorite_user_id ON Favorite(user_id);`);
            rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_favorite_place_id ON Favorite(place_id);`);
        } catch (e) {
            console.warn('Failed to create Favorite indexes:', e.message);
        }

    } catch (e) {
        console.error('DB init failed:', e && e.message);
        throw e;
    }
}

module.exports = { db, init };
