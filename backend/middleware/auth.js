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
        db.get("SELECT id, username, admin_level, is_banned, ban_reason, ban_expires, map_settings, (avatar_blob IS NOT NULL) AS has_avatar FROM User WHERE id = ?", [userId], (err, row) => {
            if (err) return reject(err);
            if (row && row.map_settings) {
                try {
                    row.map_settings = JSON.parse(row.map_settings);
                } catch (e) {
                    // ignore parse errors and keep raw string
                }
            }
            if (row) {
                row.has_avatar = !!row.has_avatar;
            }
            resolve(row || null);
        });
    });
}

async function authenticateToken(token) {
    let payload;
    try {
        payload = jwt.verify(token, JWT_SECRET);
    } catch (e) {
        const error = new Error("无效或已过期的 token");
        error.status = 401;
        throw error;
    }

    const userId = payload && payload.id;
    if (!userId) {
        const error = new Error("无效或已过期的 token");
        error.status = 401;
        throw error;
    }

    const sessionToken = await redis.get(`session:${userId}`);
    if (!sessionToken || sessionToken !== token) {
        const error = new Error("登录状态已失效，请重新登录");
        error.status = 401;
        throw error;
    }

    const user = await loadUserById(userId);
    if (!user) {
        const error = new Error("用户不存在");
        error.status = 404;
        throw error;
    }

    if (user.is_banned) {
        const now = new Date();
        if (user.ban_expires) {
            const expires = new Date(user.ban_expires);
            if (!isNaN(expires) && expires <= now) {
                db.run('UPDATE User SET is_banned = 0, ban_reason = NULL, ban_expires = NULL WHERE id = ?', [userId], (e) => {
                    if (e) console.error('Auto-unban failed:', e.message);
                    else {
                        try {
                            logAdminAction(null, 'auto-unban', userId, JSON.stringify({ previous_reason: user.ban_reason || null }));
                        } catch (ex) {
                            console.error('Failed to log auto-unban', ex && ex.message);
                        }
                    }
                });
                user.is_banned = 0;
                user.ban_reason = null;
                user.ban_expires = null;
            }
        }
    }

    return user;
}

async function requireAuth(req, res, next) {
    const token = extractBearerToken(req);
    if (!token) return res.status(401).json({ error: "未提供授权 token" });

    try {
        const user = await authenticateToken(token);

        if (user.is_banned) {
            const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
            if (!safeMethods.has(req.method)) {
                return res.status(403).json({ error: "账号已被封禁，仅允许查看内容", reason: user.ban_reason || null });
            }
        }

        req.user = user;
        req.token = token;
        return next();
    } catch (err) {
        const status = Number.isFinite(err && err.status) ? err.status : 500;
        const error = status === 500 ? "鉴权失败" : err.message;
        return res.status(status).json({ error, detail: status === 500 ? err.message : undefined });
    }
}

async function optionalAuth(req, res, next) {
    const token = extractBearerToken(req);
    if (!token) return next();

    try {
        req.user = await authenticateToken(token);
        req.token = token;
    } catch (err) {
        req.authError = err;
    }

    return next();
}

module.exports = { requireAuth, optionalAuth, extractBearerToken };
