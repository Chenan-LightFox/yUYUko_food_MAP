const express = require("express");
const router = express.Router();
const { db } = require("../../db");
const requireAdmin = require("../../middleware/adminAuth");
const { insertAdminAction } = require('../../utils/adminAudit');

const deleteCommentTransaction = db._raw.transaction(({ id, actingAdminId }) => {
    const row = db._raw.prepare('SELECT id, user_id FROM Comment WHERE id = ?').get(id);
    if (!row) return false;
    db._raw.prepare('DELETE FROM Comment WHERE id = ?').run(id);
    insertAdminAction(
        actingAdminId,
        'delete-comment',
        row.user_id || null,
        JSON.stringify({ comment_id: row.id })
    );
    return true;
});

// 列出所有评论（需 manage_comments 权限）
router.get("/", requireAdmin("manage_comments"), (req, res) => {
    db.all("SELECT * FROM Comment ORDER BY time DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// 删除指定评论（需 manage_comments 权限）
router.delete("/:id", requireAdmin("manage_comments"), (req, res) => {
    const id = req.params.id;
    try {
        const deleted = deleteCommentTransaction.immediate({ id, actingAdminId: req.user && req.user.id });
        if (!deleted) return res.status(404).json({ error: '评论不存在' });
        return res.json({ success: true });
    } catch (error) {
        res.locals.unhandledError = error;
        return res.status(500).json({ error: '评论删除失败，请稍后重试' });
    }
});

module.exports = router;
