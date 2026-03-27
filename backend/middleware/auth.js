const jwt = require("jsonwebtoken");
const { db } = require("../db");
const redis = require("../redis");

const JWT_SECRET = process.env.JWT_SECRET || "yuyuko_secret_key";

function extractBearerToken(req) {
    const auth = req.get("Authorization") || req.get("authorization");
    if (!auth || !auth.startsWith("Bearer ")) return null;
    return auth.slice(7).trim();
}

function loadUserById(userId) {
    return new Promise((resolve, reject) => {
        db.get("SELECT id, username, admin_level FROM User WHERE id = ?", [userId], (err, row) => {
            if (err) return reject(err);
            resolve(row || null);
        });
    });
}

async function requireAuth(req, res, next) {
    const token = extractBearerToken(req);
    if (!token) return res.status(401).json({ error: "未提供授权 token" });

    let payload;
    try {
        payload = jwt.verify(token, JWT_SECRET);
    } catch (e) {
        return res.status(401).json({ error: "无效或已过期的 token" });
    }

    const userId = payload && payload.id;
    if (!userId) return res.status(401).json({ error: "无效或已过期的 token" });

    try {
        const sessionToken = await redis.get(`session:${userId}`);
        if (!sessionToken || sessionToken !== token) {
            return res.status(401).json({ error: "登录状态已失效，请重新登录" });
        }

        const user = await loadUserById(userId);
        if (!user) return res.status(404).json({ error: "用户不存在" });

        req.user = user;
        req.token = token;
        return next();
    } catch (err) {
        return res.status(500).json({ error: "鉴权失败", detail: err.message });
    }
}

module.exports = { requireAuth, extractBearerToken };
