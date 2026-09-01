const express = require('express');
const router = express.Router();
const { db } = require('../../db');
const requireAdmin = require('../../middleware/adminAuth');
const { insertAdminAction } = require('../../utils/adminAudit');

const NOTICE_COLOR_KEYS = new Set(['blue', 'green', 'amber', 'rose', 'slate']);

const publishNoticeTransaction = db._raw.transaction(({ title, content, colorKey, actingAdminId }) => {
    db._raw.prepare('UPDATE SiteNotice SET is_active = 0 WHERE is_active = 1').run();
    const info = db._raw.prepare(
        'INSERT INTO SiteNotice (title, content, color_key, created_by, is_active) VALUES (?, ?, ?, ?, 1)'
    ).run(title, content, colorKey, actingAdminId || null);
    insertAdminAction(
        actingAdminId,
        'publish-notice',
        null,
        JSON.stringify({ notice_id: Number(info.lastInsertRowid), title, color_key: colorKey })
    );
    return info.lastInsertRowid;
});

const clearNoticeTransaction = db._raw.transaction(({ actingAdminId }) => {
    const current = db._raw.prepare(
        'SELECT id, title FROM SiteNotice WHERE is_active = 1 ORDER BY created_time DESC, id DESC LIMIT 1'
    ).get();
    if (!current) return null;
    db._raw.prepare('UPDATE SiteNotice SET is_active = 0 WHERE is_active = 1').run();
    insertAdminAction(
        actingAdminId,
        'clear-notice',
        null,
        JSON.stringify({ notice_id: current.id, title: current.title })
    );
    return current;
});

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

router.get('/', requireAdmin('manage_announcements'), (req, res) => {
    db.all(
        'SELECT id, title, content, color_key, created_by, is_active, created_time FROM SiteNotice ORDER BY created_time DESC, id DESC LIMIT 20',
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

router.post('/', requireAdmin('manage_announcements'), (req, res) => {
    const title = normalizeString(req.body && req.body.title);
    const content = normalizeString(req.body && req.body.content);
    const colorKey = normalizeString(req.body && req.body.color_key).toLowerCase();
    const actingAdminId = req.user && req.user.id;

    if (!title || !content) {
        return res.status(400).json({ error: '公告标题和内容不能为空' });
    }
    if (title.length > 80) {
        return res.status(400).json({ error: '公告标题不能超过 80 个字符' });
    }
    if (content.length > 1000) {
        return res.status(400).json({ error: '公告内容不能超过 1000 个字符' });
    }
    if (!NOTICE_COLOR_KEYS.has(colorKey)) {
        return res.status(400).json({ error: '无效的公告背景颜色' });
    }

    try {
        const id = publishNoticeTransaction.immediate({ title, content, colorKey, actingAdminId });
        return res.json({ success: true, id });
    } catch (err) {
        res.locals.unhandledError = err;
        return res.status(500).json({ error: '公告发布失败，请稍后重试' });
    }
});

router.delete('/current', requireAdmin('manage_announcements'), (req, res) => {
    const actingAdminId = req.user && req.user.id;

    try {
        const current = clearNoticeTransaction.immediate({ actingAdminId });
        if (!current) {
            return res.json({ success: true, cleared: false });
        }
        return res.json({ success: true, cleared: true });
    } catch (err) {
        res.locals.unhandledError = err;
        return res.status(500).json({ error: '公告清除失败，请稍后重试' });
    }
});

module.exports = router;
