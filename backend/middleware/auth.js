const jwt = require("jsonwebtoken");
const { db } = require("../db");
const redis = require("../redis");
const { logAdminAction } = require('../utils/adminAudit');

const JWT_SECRET = process.env.JWT_SECRET || "yuyuko_secret_key";

function extractBearerToken(req) {
    const auth = req.get("Authorization") || req.get("authorization");
    if (!auth || !auth.startsWith("Bearer ")) return null;
    return auth.slice(7).trim();
}

function maskToken(t) {
    if (!t) return '-';
    if (t.length <= 20) return t;
    return t.slice(0, 10) + '...' + t.slice(-6);
}

function loadUserById(userId) {
    return new Promise((resolve, reject) => {
        db.get("SELECT id, username, admin_level, is_banned, ban_reason, ban_expires FROM User WHERE id = ?", [userId], (err, row) => {
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

        // handle banned users: auto-unban if expired, otherwise restrict non-read methods
        if (user.is_banned) {
            let now = new Date();
            if (user.ban_expires) {
                const expires = new Date(user.ban_expires);
                if (!isNaN(expires) && expires <= now) {
                    // auto unban
                    db.run('UPDATE User SET is_banned = 0, ban_reason = NULL, ban_expires = NULL WHERE id = ?', [userId], (e) => {
                        if (e) console.error('Auto-unban failed:', e.message);
                        else {
                            try {
                                logAdminAction(null, 'auto-unban', userId, JSON.stringify({ previous_reason: user.ban_reason || null }));
                            } catch (ex) { console.error('Failed to log auto-unban', ex && ex.message); }
                        }
                    });
                    // reflect change in user object
                    user.is_banned = 0;
                    user.ban_reason = null;
                    user.ban_expires = null;
                }
            }

            if (user.is_banned) {
                // allow read-only methods
                const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
                if (!safeMethods.has(req.method)) {
                    return res.status(403).json({ error: "账号已被封禁，仅允许查看内容", reason: user.ban_reason || null });
                }
                // else continue but keep user info
            }
        }

        req.user = user;
        req.token = token;
        return next();
    } catch (err) {
        return res.status(500).json({ error: "鉴权失败", detail: err.message });
    }
}

module.exports = { requireAuth, extractBearerToken };
