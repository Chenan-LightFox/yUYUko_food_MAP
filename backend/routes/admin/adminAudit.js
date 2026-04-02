const express = require('express');
const router = express.Router();
const { db } = require('../../db');
const requireAdmin = require('../../middleware/adminAuth');

// 获取最近操作日志（仅需 manage_users 权限或更高级别）
router.get('/', requireAdmin('manage_users'), (req, res) => {
    // limit to latest 200
    db.all('SELECT id, admin_id, action, target_user_id, details, time FROM AdminAudit ORDER BY time DESC LIMIT 200', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

module.exports = router;
