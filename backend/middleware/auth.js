const jwt = require("jsonwebtoken");
const { db } = require("../db");
const redis = require("../redis");
const { logAdminAction } = require('../utils/adminAudit');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || "yuyuko_secret_key";

function extractBearerToken(req) {
    const auth = req.get("Authorization") || req.get("authorization");
    if (!auth || !auth.startsWith("Bearer ")) return null;
    return auth.slice(7).trim();
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

async function requireAuth(req, res, next) {
    const token = extractBearerToken(req);
    if (!token) {
        logger.warn('Authentication rejected', {
            event: 'security.auth.rejected',
            reason: 'missing_token',
            method: req.method,
            path: req.path
        });
        return res.status(401).json({ error: "未提供授权 token" });
    }

    let payload;
    try {
        payload = jwt.verify(token, JWT_SECRET);
    } catch (e) {
        logger.warn('Authentication rejected', {
            event: 'security.auth.rejected',
            reason: e && e.name === 'TokenExpiredError' ? 'expired_token' : 'invalid_token',
            method: req.method,
            path: req.path
        });
        return res.status(401).json({ error: "无效或已过期的 token" });
    }

    const userId = payload && payload.id;
    if (!userId) {
        logger.warn('Authentication rejected', {
            event: 'security.auth.rejected',
            reason: 'token_missing_user_id',
            method: req.method,
            path: req.path
        });
        return res.status(401).json({ error: "无效或已过期的 token" });
    }

    try {
        let sessionToken;
        if (!redis.isReady()) {
            // Do not wait for ioredis's offline queue on every authenticated
            // request. During an outage, immediately use verified JWT claims.
            logger.warn('Redis is not ready; using JWT-only authentication', {
                event: 'auth.session.redis_unavailable',
                userId
            });
        } else {
            try {
                sessionToken = await redis.get(`session:${userId}`);
            } catch (redisErr) {
                // Redis 暂时不可用时不要踢掉所有用户，容忍短暂故障
                logger.error('Redis session lookup failed; falling back to JWT-only authentication', {
                    event: 'auth.session.lookup_failed',
                    userId,
                    error: redisErr
                });
                // 继续往下走：仅验证 JWT 签名，不做 session 级注销检查
            }
        }
        if (sessionToken !== undefined && (!sessionToken || sessionToken !== token)) {
            logger.warn('Authentication rejected', {
                event: 'security.auth.rejected',
                reason: 'session_mismatch',
                userId,
                method: req.method,
                path: req.path
            });
            return res.status(401).json({ error: "登录状态已失效，请重新登录" });
        }

        const user = await loadUserById(userId);
        if (!user) {
            logger.warn('Authentication rejected', {
                event: 'security.auth.rejected',
                reason: 'user_not_found',
                userId,
                method: req.method,
                path: req.path
            });
            return res.status(404).json({ error: "用户不存在" });
        }

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
                    logger.warn('Banned user write request rejected', {
                        event: 'security.auth.rejected',
                        reason: 'user_banned',
                        userId,
                        method: req.method,
                        path: req.path
                    });
                    return res.status(403).json({ error: "账号已被封禁，仅允许查看内容", reason: user.ban_reason || null });
                }
                // else continue but keep user info
            }
        }

        req.user = user;
        req.token = token;
        return next();
    } catch (err) {
        logger.error('Authentication middleware failed', {
            event: 'security.auth.error',
            userId,
            method: req.method,
            path: req.path,
            error: err
        });
        return res.status(500).json({ error: "鉴权失败", detail: err.message });
    }
}

module.exports = { requireAuth, extractBearerToken };
