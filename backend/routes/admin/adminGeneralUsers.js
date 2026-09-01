const express = require("express");
const router = express.Router();
const { db } = require("../../db");
const requireAdmin = require("../../middleware/adminAuth");
const { insertAdminAction } = require('../../utils/adminAudit');

const deleteGeneralUserTransaction = db._raw.transaction(({ id, actingAdminId }) => {
    const row = db._raw.prepare('SELECT id, admin_level FROM User WHERE id = ?').get(id);
    if (!row) return { status: 'missing' };
    if (row.admin_level) return { status: 'admin' };
    db._raw.prepare('DELETE FROM User WHERE id = ?').run(id);
    insertAdminAction(actingAdminId, 'delete-user', id, JSON.stringify({ source: 'general-users' }));
    return { status: 'deleted' };
});

// 列出所有普通用户（需 manage_users_general 权限）
router.get("/", requireAdmin("manage_users_general"), (req, res) => {
    db.all("SELECT id, username, avatar, qq, (avatar_blob IS NOT NULL) AS has_avatar FROM User WHERE admin_level IS NULL OR admin_level = '' ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        rows.forEach(r => r.has_avatar = !!r.has_avatar);
        res.json(rows || []);
    });
});

// 删除普通用户（需 manage_users_general 权限）
router.delete("/:id", requireAdmin("manage_users_general"), (req, res) => {
    const id = req.params.id;
    try {
        const result = deleteGeneralUserTransaction.immediate({ id, actingAdminId: req.user && req.user.id });
        if (result.status === 'missing') return res.status(404).json({ error: '用户不存在' });
        if (result.status === 'admin') return res.status(403).json({ error: '不能删除管理员账号' });
        return res.json({ success: true });
    } catch (error) {
        res.locals.unhandledError = error;
        return res.status(500).json({ error: '用户删除失败，请稍后重试' });
    }
});

module.exports = router;
