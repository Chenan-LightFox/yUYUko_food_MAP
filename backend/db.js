const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('./utils/logger');

const dbFile = path.join(__dirname, 'data.sqlite');
const SQLITE_UUID_EXPR = "lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))";
const DB_SLOW_QUERY_MS = Math.max(1, Math.min(600000, Number.parseInt(process.env.DB_SLOW_QUERY_MS || '100', 10) || 100));

function queryFinished(operation, sql, startedAt) {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (durationMs < DB_SLOW_QUERY_MS) return;
    logger.warn('Slow SQLite query', {
        event: 'database.query.slow',
        operation,
        sql: String(sql || '').slice(0, 2000),
        durationMs: Number(durationMs.toFixed(1))
    });
}

function queryFailed(operation, sql, error) {
    logger.error('SQLite query failed', {
        event: 'database.query.failed',
        operation,
        sql: String(sql || '').slice(0, 2000),
        error
    });
}

function loadInitialCategories() {
    const seedPath = path.join(__dirname, 'seeds', 'categories.json');
    try {
        const data = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.warn('Failed to load category seed data:', error.message);
        return [];
    }
}

function parseCategoryNames(value) {
    return String(value || '')
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean);
}

let rawDb;
let vectorSearchAvailable = false;
try {
    rawDb = new Database(dbFile);
} catch (e) {
    console.error('Failed to open DB:', e && e.message);
    throw e;
}

try {
    const sqliteVec = require('sqlite-vec');
    sqliteVec.load(rawDb);
    vectorSearchAvailable = true;
} catch (error) {
    console.warn('sqlite-vec is unavailable; semantic search will stay disabled:', error.message);
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
        const startedAt = process.hrtime.bigint();
        try {
            const stmt = rawDb.prepare(sql);
            const info = stmt.run(...args);
            queryFinished('run', sql, startedAt);
            if (cb) {
                const thisObj = { lastID: info.lastInsertRowid, changes: info.changes };
                process.nextTick(() => cb.call(thisObj, null));
            }
            return info;
        } catch (err) {
            queryFailed('run', sql, err);
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
        const startedAt = process.hrtime.bigint();
        try {
            const stmt = rawDb.prepare(sql);
            const row = stmt.get(...args);
            queryFinished('get', sql, startedAt);
            if (cb) process.nextTick(() => cb(null, row));
            return row;
        } catch (err) {
            queryFailed('get', sql, err);
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
        const startedAt = process.hrtime.bigint();
        try {
            const stmt = rawDb.prepare(sql);
            const rows = stmt.all(...args);
            queryFinished('all', sql, startedAt);
            if (cb) process.nextTick(() => cb(null, rows));
            return rows;
        } catch (err) {
            queryFailed('all', sql, err);
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

function migrateUserTableToUuidIfNeeded() {
    const table = rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").get();
    if (!table) return;

    const cols = rawDb.prepare("PRAGMA table_info('User')").all();
    const idCol = cols.find((c) => c.name === 'id');
    const idType = String((idCol && idCol.type) || '').toUpperCase();
    const isUuidPrimaryKey = !!idCol && idCol.pk === 1 && idType.includes('TEXT');
    if (isUuidPrimaryKey) return;

    const colNames = new Set(cols.map((c) => c.name));
    const hasCol = (name) => colNames.has(name);

    const selectExpr = [
        `CASE WHEN typeof(id) = 'text' AND length(trim(id)) > 0 THEN id ELSE ${SQLITE_UUID_EXPR} END AS id`,
        `${hasCol('username') ? 'username' : 'NULL'} AS username`,
        `${hasCol('password') ? 'password' : 'NULL'} AS password`,
        `${hasCol('avatar') ? 'avatar' : 'NULL'} AS avatar`,
        `${hasCol('admin_level') ? 'admin_level' : 'NULL'} AS admin_level`,
        `${hasCol('created_time') ? 'created_time' : 'CURRENT_TIMESTAMP'} AS created_time`,
        `${hasCol('is_banned') ? 'is_banned' : '0'} AS is_banned`,
        `${hasCol('ban_reason') ? 'ban_reason' : 'NULL'} AS ban_reason`,
        `${hasCol('ban_expires') ? 'ban_expires' : 'NULL'} AS ban_expires`,
        `${hasCol('map_settings') ? 'map_settings' : 'NULL'} AS map_settings`,
        `${hasCol('qq') ? 'qq' : 'NULL'} AS qq`,
        `${hasCol('avatar_blob') ? 'avatar_blob' : 'NULL'} AS avatar_blob`
    ].join(', ');

    console.log('Migrating User.id to TEXT UUID primary key...');
    rawDb.exec('BEGIN');
    try {
        rawDb.exec(`CREATE TABLE IF NOT EXISTS "__User_uuid_migration" (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE,
            password TEXT,
            avatar TEXT,
            admin_level TEXT,
            created_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_banned INTEGER DEFAULT 0,
            ban_reason TEXT,
            ban_expires DATETIME,
            map_settings TEXT,
            qq TEXT,
            avatar_blob BLOB
        );`);

        rawDb.exec(`INSERT INTO "__User_uuid_migration" (id, username, password, avatar, admin_level, created_time, is_banned, ban_reason, ban_expires, map_settings, qq, avatar_blob)
                    SELECT ${selectExpr} FROM User;`);

        rawDb.exec('DROP TABLE User;');
        rawDb.exec('ALTER TABLE "__User_uuid_migration" RENAME TO User;');
        rawDb.exec('COMMIT');
        console.log('Migration complete: User.id is now UUID text primary key.');
    } catch (e) {
        rawDb.exec('ROLLBACK');
        throw e;
    }
}

function init() {
    try {
        migrateUserTableToUuidIfNeeded();

        rawDb.exec(`CREATE TABLE IF NOT EXISTS "User" (
            id TEXT PRIMARY KEY,
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

        try {
            rawDb.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_qq ON User(qq);`);
        } catch (e) {
            console.warn('Failed to create idx_user_qq:', e.message);
        }

        rawDb.exec(`CREATE TABLE IF NOT EXISTS "Place" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            description TEXT,
            latitude REAL,
            longitude REAL,
            category TEXT,
            per_person_cost INTEGER,
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
        addPlaceIfMissing('per_person_cost INTEGER');
        addPlaceIfMissing('has_vector INTEGER NOT NULL DEFAULT 0');
        addPlaceIfMissing('vector_updated_at DATETIME');

        // Repair image URLs saved by older frontend builds that replaced the
        // configured cn.dinnerparty.cc backend with the apex domain.
        const repairedImageUrls = rawDb.prepare(`
            UPDATE Place
            SET exterior_images = REPLACE(
                    REPLACE(exterior_images, 'https://dinnerparty.cc:2053', 'https://cn.dinnerparty.cc:2053'),
                    'http://dinnerparty.cc:2053', 'https://cn.dinnerparty.cc:2053'
                ),
                menu_images = REPLACE(
                    REPLACE(menu_images, 'https://dinnerparty.cc:2053', 'https://cn.dinnerparty.cc:2053'),
                    'http://dinnerparty.cc:2053', 'https://cn.dinnerparty.cc:2053'
                )
            WHERE exterior_images LIKE '%://dinnerparty.cc:2053/%'
               OR menu_images LIKE '%://dinnerparty.cc:2053/%'
        `).run();
        if (repairedImageUrls.changes > 0) {
            console.log(`Repaired legacy image URLs in ${repairedImageUrls.changes} place(s).`);
        }

        if (vectorSearchAvailable) {
            rawDb.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS place_vectors USING vec0(
                place_id INTEGER PRIMARY KEY,
                embedding FLOAT[1024] distance_metric=cosine
            );`);
        }

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

        rawDb.exec(`CREATE TABLE IF NOT EXISTS "Category" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL COLLATE NOCASE UNIQUE,
            is_common INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 1000,
            created_by TEXT,
            created_time DATETIME DEFAULT CURRENT_TIMESTAMP
        );`);

        const insertCategory = rawDb.prepare(
            `INSERT OR IGNORE INTO Category (name, is_common, sort_order, created_by)
             VALUES (?, ?, ?, ?)`
        );
        const upsertSeedCategory = rawDb.prepare(
            `INSERT INTO Category (name, is_common, sort_order, created_by)
             VALUES (?, ?, ?, NULL)
             ON CONFLICT(name) DO UPDATE SET
                 is_common = excluded.is_common,
                 sort_order = excluded.sort_order`
        );
        const initializeCategories = rawDb.transaction(() => {
            loadInitialCategories().forEach((category, index) => {
                const name = String(category && category.name || '').trim();
                if (!name) return;
                upsertSeedCategory.run(
                    name,
                    category.is_common ? 1 : 0,
                    Number.isInteger(category.sort_order) ? category.sort_order : index
                );
            });

            const places = rawDb.prepare(
                `SELECT category FROM Place
                 WHERE category IS NOT NULL AND trim(category) <> ''`
            ).all();
            const existingNames = new Set();
            places.forEach((place) => {
                parseCategoryNames(place.category).forEach((name) => existingNames.add(name));
            });
            existingNames.forEach((name) => insertCategory.run(name, 0, 1000, null));
        });
        initializeCategories();

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

        rawDb.exec(`CREATE TABLE IF NOT EXISTS "SiteNotice" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            color_key TEXT NOT NULL,
            created_by INTEGER,
            is_active INTEGER DEFAULT 1,
            created_time DATETIME DEFAULT CURRENT_TIMESTAMP
        );`);
        try {
            rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_sitenotice_active_created_time ON SiteNotice(is_active, created_time DESC);`);
        } catch (e) {
            console.warn('Failed to create idx_sitenotice_active_created_time:', e.message);
        }

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

        rawDb.exec(`CREATE TABLE IF NOT EXISTS "QQWhitelist" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            qq TEXT UNIQUE NOT NULL,
            created_time DATETIME DEFAULT CURRENT_TIMESTAMP
        );`);
        try {
            rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_qqwhitelist_qq ON QQWhitelist(qq);`);
        } catch (e) {
            console.warn('Failed to create idx_qqwhitelist_qq:', e.message);
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

module.exports = {
    db,
    init,
    isVectorSearchAvailable: () => vectorSearchAvailable
};
