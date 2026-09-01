const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const sharp = require("sharp");
const { db } = require("../db");
const redis = require("../redis");
const { requireAuth } = require("../middleware/auth");
const logger = require('../utils/logger');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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

async function persistSession(userId, token, source) {
    let timerId;
    try {
        const timeoutPromise = new Promise((resolve, reject) => {
            timerId = setTimeout(() => {
                const error = new Error('Redis session write timed out after 2000ms');
                error.code = 'REDIS_SESSION_WRITE_TIMEOUT';
                reject(error);
            }, 2000);
        });
        await Promise.race([
            redis.set(`session:${userId}`, token, "EX", JWT_EXPIRES_IN),
            timeoutPromise
        ]);
        return true;
    } catch (error) {
        logger.error('Failed to persist Redis session', {
            event: 'auth.session.persist_failed',
            source,
            userId,
            error
        });
        return false;
    } finally {
        clearTimeout(timerId);
    }
}

function logAuthRejected(req, action, reason, username) {
    logger.warn(`${action} rejected`, {
        event: `auth.${action}.rejected`,
        reason,
        username: typeof username === 'string' ? username.trim().slice(0, 64) : undefined,
        ip: req.ip
    });
}

function registrationFailure(status, reason, message) {
    const error = new Error(message);
    error.status = status;
    error.reason = reason;
    error.publicMessage = message;
    return error;
}

const registerUserTransaction = db._raw.transaction(({ username, passwordHash, inviteHash, qq, userId }) => {
    if (db._raw.prepare('SELECT id FROM User WHERE username = ?').get(username)) {
        throw registrationFailure(400, 'username_exists', '住民名已被使用');
    }

    const invite = db._raw.prepare(
        'SELECT id, max_uses, current_uses FROM InviteCode WHERE code = ?'
    ).get(inviteHash);
    if (!invite) throw registrationFailure(400, 'invalid_invite_code', '邀请码无效');
    if (invite.current_uses >= invite.max_uses) {
        throw registrationFailure(400, 'invite_code_exhausted', '邀请码已超出最大可用次数');
    }

    if (db._raw.prepare('SELECT id FROM User WHERE qq = ?').get(qq)) {
        throw registrationFailure(400, 'qq_already_bound', '该QQ号已被其他住民绑定');
    }
    if (!db._raw.prepare('SELECT id FROM QQWhitelist WHERE qq = ?').get(qq)) {
        throw registrationFailure(400, 'qq_not_whitelisted', '该QQ号不在注册白名单中，请联系管理员');
    }

    // Claim the invite within the same transaction as the user insert. The
    // conditional update also protects the limit if another writer registered
    // after the checks above.
    const claimed = db._raw.prepare(
        `UPDATE InviteCode
         SET current_uses = current_uses + 1
         WHERE id = ? AND current_uses < max_uses`
    ).run(invite.id);
    if (claimed.changes !== 1) {
        throw registrationFailure(400, 'invite_code_exhausted', '邀请码已超出最大可用次数');
    }

    db._raw.prepare(
        'INSERT INTO User (id, username, password, qq) VALUES (?, ?, ?, ?)'
    ).run(userId, username, passwordHash, qq);
    return db._raw.prepare(
        'SELECT id, username, admin_level, (avatar_blob IS NOT NULL) AS has_avatar FROM User WHERE id = ?'
    ).get(userId);
});

router.post("/register", async (req, res) => {
    const { username, password, inviteCode, qq } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string'
        || typeof inviteCode !== 'string' || !qq) {
        logAuthRejected(req, 'register', 'missing_fields', username);
        return res.status(400).json({ error: "缺少字段" });
    }
    const normalizedUsername = username.trim();
    const normalizedQq = String(qq).trim();
    if (!normalizedUsername || !password || !inviteCode.trim() || !normalizedQq) {
        logAuthRejected(req, 'register', 'missing_fields', username);
        return res.status(400).json({ error: '缺少字段' });
    }

    const userId = crypto.randomUUID();
    let row;
    try {
        row = registerUserTransaction.immediate({
            username: normalizedUsername,
            passwordHash: hashPassword(password),
            inviteHash: hashCode(inviteCode),
            qq: normalizedQq,
            userId
        });
    } catch (error) {
        if (error && error.reason) {
            logAuthRejected(req, 'register', error.reason, normalizedUsername);
            return res.status(error.status || 400).json({ error: error.publicMessage });
        }
        res.locals.unhandledError = error;
        return res.status(500).json({ error: '注册失败，请稍后重试' });
    }

    row.has_avatar = !!row.has_avatar;
    logger.addContext({ userId });
    const token = jwt.sign({ id: userId, username: normalizedUsername }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const sessionStored = await persistSession(userId, token, 'register');
    logger.info('Registration succeeded', {
        event: 'auth.register.succeeded',
        username: row.username,
        sessionStored
    });
    res.set('Cache-Control', 'no-store');
    return res.status(201).json({ user: row, token });
});

// 用户登录，返回 token

router.post("/login", (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        logAuthRejected(req, 'login', 'missing_fields', username);
        return res.status(400).json({ error: "缺少字段" });
    }

    const hashed = hashPassword(password);
    db.get("SELECT id, username, admin_level, (avatar_blob IS NOT NULL) AS has_avatar FROM User WHERE username = ? AND password = ?", [username, hashed], async (err, row) => {
        if (err) {
            res.locals.unhandledError = err;
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            logAuthRejected(req, 'login', 'invalid_credentials', username);
            return res.status(401).json({ error: "住民名或通行密码错误" });
        }

        row.has_avatar = !!row.has_avatar;
        logger.addContext({ userId: row.id });
        const token = jwt.sign({ id: row.id, username: row.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        // 必须先完成 Redis 会话写入，再把 token 返回浏览器。否则登录后的
        // /users/me、收藏等并发请求可能在会话写入前到达并收到 401。
        const sessionStored = await persistSession(row.id, token, 'login');

        logger.info('Login succeeded', {
            event: 'auth.login.succeeded',
            userId: row.id,
            username: row.username,
            ip: req.ip,
            sessionStored
        });
        res.set('Cache-Control', 'no-store');
        res.json({ user: row, token });
    });
});

// 获取当前用户信息（JWT + Redis session 一致性校验）
router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
});

// 更新当前用户信息（允许修改 username）
router.patch('/me', requireAuth, (req, res) => {
    const { username } = req.body || {};
    if (!username || typeof username !== 'string') return res.status(400).json({ error: '缺少或无效的 username 字段' });
    const newName = username.trim();
    if (newName.length < 1 || newName.length > 64) return res.status(400).json({ error: '住民名长度应为 1-64 个字符' });

    // 检查是否被占用
    db.get('SELECT id FROM User WHERE username = ?', [newName], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row && row.id !== req.user.id) return res.status(400).json({ error: '住民名已被使用' });

        db.run('UPDATE User SET username = ? WHERE id = ?', [newName, req.user.id], function (e) {
            if (e) return res.status(500).json({ error: e.message });

            // 生成新的 token 并更新 redis session
            const token = jwt.sign({ id: req.user.id, username: newName }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
            redis.set(`session:${req.user.id}`, token, 'EX', JWT_EXPIRES_IN, (redisErr) => {
                if (redisErr) console.error('Failed to update redis session after username change:', redisErr && redisErr.message);
                // 返回更新后的用户信息
                db.get('SELECT id, username, admin_level, (avatar_blob IS NOT NULL) AS has_avatar FROM User WHERE id = ?', [req.user.id], (err2, updated) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    if (updated) updated.has_avatar = !!updated.has_avatar;
                    return res.json({ user: updated, token });
                });
            });
        });
    });
});

// 修改当前用户密码，需要提供当前密码和新密码
router.patch('/me/password', requireAuth, (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ error: '缺少字段' });
    if (typeof newPassword !== 'string' || newPassword.length < 6) return res.status(400).json({ error: '新通行密码长度至少 6 位' });

    // 读取当前存储的密码（已加密）
    db.get('SELECT password FROM User WHERE id = ?', [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: '住民不存在' });

        const currentHash = hashPassword(currentPassword);
        if (row.password !== currentHash) return res.status(401).json({ error: '当前通行密码错误' });

        const newHash = hashPassword(newPassword);
        db.run('UPDATE User SET password = ? WHERE id = ?', [newHash, req.user.id], function (e) {
            if (e) return res.status(500).json({ error: e.message });

            // 生成新的 token 并刷新 redis session
            const token = jwt.sign({ id: req.user.id, username: req.user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
            redis.set(`session:${req.user.id}`, token, 'EX', JWT_EXPIRES_IN, (redisErr) => {
                if (redisErr) console.error('Failed to update redis session after password change:', redisErr && redisErr.message);
                db.get('SELECT id, username, admin_level, (avatar_blob IS NOT NULL) AS has_avatar FROM User WHERE id = ?', [req.user.id], (err2, updated) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    if (updated) updated.has_avatar = !!updated.has_avatar;
                    return res.json({ user: updated, token });
                });
            });
        });
    });
});

// 更新当前用户的个性化设置（例如地图设置）
router.patch('/me/settings', requireAuth, (req, res) => {
    const { map_settings } = req.body || {};
    if (typeof map_settings === 'undefined') return res.status(400).json({ error: '缺少 map_settings 字段' });

    let payload = null;
    try {
        payload = typeof map_settings === 'string' ? map_settings : JSON.stringify(map_settings);
    } catch (e) {
        return res.status(400).json({ error: 'map_settings 必须是可序列化的 JSON' });
    }

    db.run('UPDATE User SET map_settings = ? WHERE id = ?', [payload, req.user.id], function (e) {
        if (e) return res.status(500).json({ error: e.message });

        db.get('SELECT id, username, admin_level, map_settings, (avatar_blob IS NOT NULL) AS has_avatar FROM User WHERE id = ?', [req.user.id], (err2, updated) => {
            if (err2) return res.status(500).json({ error: err2.message });
            if (updated) updated.has_avatar = !!updated.has_avatar;
            if (updated && updated.map_settings) {
                try { updated.map_settings = JSON.parse(updated.map_settings); } catch (ex) { /* ignore */ }
            }
            return res.json({ user: updated });
        });
    });
});

// 上传当前用户头像
router.put('/me/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '未上传文件' });

    try {
        const buffer = await sharp(req.file.buffer)
            .resize(200, 200, { fit: 'cover' })
            .webp({ quality: 80 })
            .toBuffer();

        db.run('UPDATE User SET avatar_blob = ? WHERE id = ?', [buffer, req.user.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });

            db.get('SELECT id, username, admin_level, (avatar_blob IS NOT NULL) AS has_avatar FROM User WHERE id = ?', [req.user.id], (err2, updated) => {
                if (err2) return res.status(500).json({ error: err2.message });
                if (updated) updated.has_avatar = !!updated.has_avatar;
                res.json({ success: true, user: updated });
            });
        });
    } catch (e) {
        return res.status(500).json({ error: '图片处理失败', detail: e.message });
    }
});

// 获取指定用户的头像
router.get('/:id/avatar', (req, res) => {
    db.get('SELECT avatar_blob FROM User WHERE id = ?', [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row || !row.avatar_blob) {
            return res.status(404).json({ error: '未找到头像' });
        }
        res.set('Content-Type', 'image/webp');
        res.set('Cache-Control', 'public, max-age=86400'); // 缓存一天
        res.send(row.avatar_blob);
    });
});

// 退出登录，清理当前会话
router.post('/logout', requireAuth, async (req, res) => {
    try {
        await redis.del(`session:${req.user.id}`);
        logger.info('Logout succeeded', {
            event: 'auth.logout.succeeded',
            userId: req.user.id
        });
        return res.json({ success: true });
    } catch (e) {
        res.locals.unhandledError = e;
        return res.status(500).json({ error: "暂离幻想乡失败", detail: e.message });
    }
});

// 删除当前用户账号（本人操作），同时清理会话
router.delete('/me', requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
        // 清理 Redis 会话
        try {
            await redis.del(`session:${userId}`);
        } catch (e) {
            // 忽略 redis 删除错误，但记录日志
            console.warn('Failed to delete redis session for user on account delete:', e && e.message);
        }

        // 删除用户记录
        db.run('DELETE FROM User WHERE id = ?', [userId], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            logger.warn('User account deleted', {
                event: 'auth.account.deleted',
                userId
            });
            return res.json({ success: true });
        });
    } catch (e) {
        return res.status(500).json({ error: '住民档案删除失败', detail: e.message });
    }
});

module.exports = router;
