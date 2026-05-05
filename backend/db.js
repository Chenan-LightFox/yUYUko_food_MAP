const Database = require('better-sqlite3');
const path = require('path');

const dbFile = process.env.SQLITE_DB_FILE
    ? path.resolve(__dirname, process.env.SQLITE_DB_FILE)
    : path.join(__dirname, 'data.sqlite');
const SQLITE_UUID_EXPR = "lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))";

let rawDb;
try {
    rawDb = new Database(dbFile);
} catch (e) {
    console.error('Failed to open DB:', e && e.message);
    throw e;
}

console.log(`Using SQLite DB: ${dbFile}`);

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

        rawDb.exec(`CREATE TABLE IF NOT EXISTS "RecommendationSearchLog" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            search_session_id TEXT,
            user_id TEXT,
            search_source TEXT DEFAULT 'unknown',
            raw_query TEXT NOT NULL,
            normalized_query TEXT,
            parse_source TEXT,
            parse_mode TEXT,
            parse_coverage TEXT,
            parse_confidence TEXT,
            needs_second_pass INTEGER DEFAULT 0,
            modifier_tokens TEXT,
            unresolved_tokens TEXT,
            coverage_reasons TEXT,
            anchor_query TEXT,
            anchor_name TEXT,
            requested_sort_by TEXT,
            actual_sort_by TEXT,
            requested_center_lat REAL,
            requested_center_lng REAL,
            resolved_center_lat REAL,
            resolved_center_lng REAL,
            provider TEXT,
            provider_result_count INTEGER,
            candidate_count INTEGER DEFAULT 0,
            first_candidate_id TEXT,
            first_candidate_name TEXT,
            fallback_used INTEGER DEFAULT 0,
            rule_parse_snapshot TEXT,
            ip_hash TEXT,
            user_agent TEXT,
            elapsed_ms INTEGER,
            created_time DATETIME DEFAULT CURRENT_TIMESTAMP
        );`);
        const recommendationLogCols = rawDb.prepare("PRAGMA table_info('RecommendationSearchLog')").all().map(r => r.name);
        const addRecommendationLogIfMissing = (colDef) => {
            const colName = colDef.split(' ')[0];
            if (!recommendationLogCols.includes(colName)) {
                try {
                    rawDb.exec(`ALTER TABLE RecommendationSearchLog ADD COLUMN ${colDef}`);
                    console.log(`Migrated: ALTER TABLE RecommendationSearchLog ADD COLUMN ${colDef}`);
                } catch (e) {
                    console.warn(`ALTER TABLE RecommendationSearchLog ADD COLUMN ${colDef} failed:`, e.message);
                }
            }
        };
        addRecommendationLogIfMissing('fallback_used INTEGER DEFAULT 0');
        addRecommendationLogIfMissing('rule_parse_snapshot TEXT');
        try {
            rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_recommendationsearchlog_created_time ON RecommendationSearchLog(created_time DESC);`);
            rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_recommendationsearchlog_user_id ON RecommendationSearchLog(user_id);`);
            rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_recommendationsearchlog_session_time ON RecommendationSearchLog(search_session_id, created_time DESC);`);
            rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_recommendationsearchlog_parse_coverage ON RecommendationSearchLog(parse_coverage);`);
        } catch (e) {
            console.warn('Failed to create RecommendationSearchLog indexes:', e.message);
        }

    } catch (e) {
        console.error('DB init failed:', e && e.message);
        throw e;
    }
}

module.exports = { db, init };
