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
            avatar TEXT
        );`);

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

        db.run(`CREATE TABLE IF NOT EXISTS "Comment" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            place_id INTEGER,
            user_id INTEGER,
            content TEXT,
            rating INTEGER,
            time DATETIME DEFAULT CURRENT_TIMESTAMP
        );`);
    });
}

module.exports = { db, init };