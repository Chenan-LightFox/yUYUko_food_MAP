const express = require("express");
const router = express.Router();
const { db } = require("../../db");
const requireAdmin = require("../../middleware/adminAuth");

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
    db.get("SELECT id FROM Comment WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "评论不存在" });
        db.run("DELETE FROM Comment WHERE id = ?", [id], function(e) {
            if (e) return res.status(500).json({ error: e.message });
            res.json({ success: true });
        });
    });
});

module.exports = router;
