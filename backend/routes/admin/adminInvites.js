const express = require("express");
const router = express.Router();
const { db } = require("../../db");
const requireAdmin = require("../../middleware/adminAuth");
const crypto = require("crypto");

function hashCode(invite) {
    return crypto.createHash("sha256").update(invite).digest("hex");
}

// 列出所有邀请码（需 manage_invites 权限）
router.get("/", requireAdmin("manage_invites"), (req, res) => {
    db.all("SELECT id, code, max_uses, current_uses, created_time FROM InviteCode ORDER BY created_time DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // 返回 code 字段（已哈希）
        res.json(rows || []);
    });
});

// 创建邀请码（需 manage_invites 权限）
router.post("/", requireAdmin("manage_invites"), (req, res) => {
    const { code, max_uses } = req.body;
    if (!code || typeof code !== 'string') return res.status(400).json({ error: "缺少 code 字段" });
    const maxUses = Number(max_uses) || 1;
    const hashed = hashCode(code);
    db.run("INSERT INTO InviteCode (code, max_uses, current_uses) VALUES (?, ?, 0)", [hashed, maxUses], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get("SELECT id, code, max_uses, current_uses, created_time FROM InviteCode WHERE id = ?", [this.lastID], (e, row) => {
            if (e) return res.status(500).json({ error: e.message });
            res.status(201).json(row);
        });
    });
});

// 删除邀请码（需 manage_invites 权限）
router.delete("/:id", requireAdmin("manage_invites"), (req, res) => {
    const id = req.params.id;
    db.get("SELECT id FROM InviteCode WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "邀请码不存在" });
        db.run("DELETE FROM InviteCode WHERE id = ?", [id], function (e) {
            if (e) return res.status(500).json({ error: e.message });
            res.json({ success: true });
        });
    });
});

module.exports = router;
