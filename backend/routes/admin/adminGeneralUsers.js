const express = require("express");
const router = express.Router();
const { db } = require("../../db");
const requireAdmin = require("../../middleware/adminAuth");

// 列出所有普通用户（需 manage_users_general 权限）
router.get("/", requireAdmin("manage_users_general"), (req, res) => {
    db.all("SELECT id, username, avatar FROM User WHERE admin_level IS NULL OR admin_level = '' ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// 删除普通用户（需 manage_users_general 权限）
router.delete("/:id", requireAdmin("manage_users_general"), (req, res) => {
    const id = req.params.id;
    db.get("SELECT id, admin_level FROM User WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "用户不存在" });
        if (row.admin_level) return res.status(403).json({ error: "不能删除管理员账号" });
        db.run("DELETE FROM User WHERE id = ?", [id], function(e) {
            if (e) return res.status(500).json({ error: e.message });
            res.json({ success: true });
        });
    });
});

module.exports = router;
