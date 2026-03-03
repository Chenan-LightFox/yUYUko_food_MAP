const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { db } = require("../db");
const redis = require("../redis");

const JWT_SECRET = process.env.JWT_SECRET || "yuyuko_secret_key";
const JWT_EXPIRES_IN = 60 * 60 * 24 * 7; // 7天（秒）

function hashPassword(password) {
    return crypto.createHash("sha256").update(password).digest("hex");
}

router.post("/register", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "缺少字段" });

    const hashed = hashPassword(password);
    db.run("INSERT INTO User (username, password) VALUES (?, ?)", [username, hashed], function (err) {
        if (err) return res.status(500).json({ error: err.message });

        const userId = this.lastID;
        const token = jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        // 将 token 存入 Redis，key: session:<userId>，TTL 与 JWT 一致
        redis.set(`session:${userId}`, token, "EX", JWT_EXPIRES_IN);

        db.get("SELECT id, username FROM User WHERE id = ?", [userId], (e, row) => {
            if (e) return res.status(500).json({ error: e.message });
            res.status(201).json({ user: row, token });
        });
    });
});

// 用户登录，返回 token

router.post("/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "缺少字段" });

    const hashed = hashPassword(password);
    db.get("SELECT id, username FROM User WHERE username = ? AND password = ?", [username, hashed], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(401).json({ error: "用户名或密码错误" });

        const token = jwt.sign({ id: row.id, username: row.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        // 刷新 Redis 中的 session
        redis.set(`session:${row.id}`, token, "EX", JWT_EXPIRES_IN);

        res.json({ user: row, token });
    });
});

module.exports = router;