const express = require("express");
const router = express.Router();
const { db } = require("../db");

// AIGC
// 用户注册（示例用途，密码应加密存储）
router.post("/register", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "缺少字段" });
    db.run("INSERT INTO User (username, password) VALUES (?, ?)", [username, password], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get("SELECT id, username FROM User WHERE id = ?", [this.lastID], (e, row) => {
            if (e) return res.status(500).json({ error: e.message });
            res.json(row);
        });
    });
});

// 简单登录（返回 user id）
router.post("/login", (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT id, username FROM User WHERE username = ? AND password = ?", [username, password], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(401).json({ error: "用户名或密码错误" });
        res.json(row);
    });
});

module.exports = router;
