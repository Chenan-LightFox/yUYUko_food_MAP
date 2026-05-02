const express = require('express');
const router = express.Router();
const { db } = require('../../db');
const requireAdmin = require('../../middleware/adminAuth');
const { logAdminAction } = require('../../utils/adminAudit');

const NOTICE_COLOR_KEYS = new Set(['blue', 'green', 'amber', 'rose', 'slate']);

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
        db._raw.exec('BEGIN');
        db._raw.prepare('UPDATE SiteNotice SET is_active = 0 WHERE is_active = 1').run();
        const info = db._raw.prepare(
            'INSERT INTO SiteNotice (title, content, color_key, created_by, is_active) VALUES (?, ?, ?, ?, 1)'
        ).run(title, content, colorKey, actingAdminId || null);
        db._raw.exec('COMMIT');

        logAdminAction(actingAdminId, 'publish-notice', info.lastInsertRowid, JSON.stringify({ title, color_key: colorKey }));
        return res.json({ success: true, id: info.lastInsertRowid });
    } catch (err) {
        try {
            db._raw.exec('ROLLBACK');
        } catch (rollbackErr) {
            console.warn('Rollback failed after notice publish error:', rollbackErr.message);
        }
        return res.status(500).json({ error: err.message });
    }
});

router.delete('/current', requireAdmin('manage_announcements'), (req, res) => {
    const actingAdminId = req.user && req.user.id;

    try {
        const current = db._raw.prepare('SELECT id, title FROM SiteNotice WHERE is_active = 1 ORDER BY created_time DESC, id DESC LIMIT 1').get();
        if (!current) {
            return res.json({ success: true, cleared: false });
        }

        db._raw.exec('BEGIN');
        db._raw.prepare('UPDATE SiteNotice SET is_active = 0 WHERE is_active = 1').run();
        db._raw.exec('COMMIT');

        logAdminAction(actingAdminId, 'clear-notice', current.id, JSON.stringify({ title: current.title }));
        return res.json({ success: true, cleared: true });
    } catch (err) {
        try {
            db._raw.exec('ROLLBACK');
        } catch (rollbackErr) {
            console.warn('Rollback failed after notice clear error:', rollbackErr.message);
        }
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;