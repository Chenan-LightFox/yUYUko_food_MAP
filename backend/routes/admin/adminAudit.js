const express = require('express');
const router = express.Router();
const { db } = require('../../db');
const requireAdmin = require('../../middleware/adminAuth');

// 获取最近操作日志（仅需 manage_users 权限或更高级别）
router.get('/', requireAdmin('manage_users'), (req, res) => {
    const conditions = [];
    const params = [];
    const requestId = String(req.query.request_id || '').trim();
    const userId = String(req.query.user_id || '').trim();
    const ip = String(req.query.ip || '').trim();
    if (requestId) {
        conditions.push('request_id = ?');
        params.push(requestId);
    }
    if (userId) {
        conditions.push('(admin_id = ? OR target_user_id = ?)');
        params.push(userId, userId);
    }
    if (ip) {
        conditions.push('ip = ?');
        params.push(ip);
    }
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(parsedLimit) ? Math.max(1, Math.min(500, parsedLimit)) : 200;
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT id, admin_id, action, target_user_id, details, ip, request_id, time
                 FROM AdminAudit ${where}
                 ORDER BY time DESC, id DESC
                 LIMIT ?`;
    db.all(sql, [...params, limit], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

module.exports = router;
