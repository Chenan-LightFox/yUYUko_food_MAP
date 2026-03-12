const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { db } = require("../db");
const redis = require("../redis");

const JWT_SECRET = process.env.JWT_SECRET || "yuyuko_secret_key";
const JWT_EXPIRES_IN = 60 * 60 * 24 * 7; // 7天（秒）

// 密码加密
function hashPassword(password) {
    return crypto.createHash("sha256").update(password).digest("hex");
}

// 邀请码加密
function hashCode(invite) {
    return crypto.createHash("sha256").update(invite).digest("hex"); // 加密邀请码
}

router.post("/register", (req, res) => {
    const { username, password, inviteCode } = req.body;
    if (!username || !password || !inviteCode) return res.status(400).json({ error: "缺少字段" });

    // 检查用户名是否已存在
    db.get("SELECT * FROM User WHERE username = ?", [username], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) return res.status(400).json({ error: "用户名已存在" });

        // 校验邀请码合法性
        const hashed = hashCode(inviteCode);
        db.get("SELECT * FROM InviteCode WHERE code = ?", [hashed], (err2, codeRow) => {
            if (err2) return res.status(500).json({ error: err2.message });
            if (!codeRow) return res.status(400).json({ error: "邀请码无效" });

            const { max_uses, current_uses } = codeRow;

            // 判断是否已达到最大使用次数
            if (current_uses >= max_uses) {
                return res.status(400).json({ error: "邀请码已超出最大可用次数" });
            }

            // 检验通过，用户注册逻辑
            const hashPwd = hashPassword(password);
            db.run(
                "INSERT INTO User (username, password) VALUES (?, ?)",
                [username, hashPwd],
                function (err3) {
                    if (err3) return res.status(500).json({ error: err3.message });
                    const userId = this.lastID;
                    const token = jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

                    // 将 token 存入 Redis，key: session:<userId>，TTL 与 JWT 一致
                    redis.set(`session:${userId}`, token, "EX", JWT_EXPIRES_IN);

                    // 更新邀请码的 current_uses
                    db.run(
                        "UPDATE InviteCode SET current_uses = current_uses + 1 WHERE code = ?",
                        [hashed],
                        (err4) => {
                            if (err4) console.error("邀请码更新失败：", err4.message); // 不影响注册流程
                        }
                    );
                    
                    // 检验是否注册成功
                    db.get("SELECT id, username FROM User WHERE id = ?", [userId], (e, row) => {
                        if (e) return res.status(500).json({ error: e.message });
                        res.status(201).json({ user: row, token });
                    });
                }
            );
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