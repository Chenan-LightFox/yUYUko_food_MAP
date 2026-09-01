const express = require("express");
const router = express.Router();
const { db } = require("../../db");
const requireAdmin = require("../../middleware/adminAuth");
const crypto = require("crypto");
const { insertAdminAction } = require("../../utils/adminAudit");

function hashCode(invite) {
    return crypto.createHash("sha256").update(invite).digest("hex");
}

const createInviteTransaction = db._raw.transaction(({ hashed, maxUses, actingAdminId }) => {
    const info = db._raw.prepare(
        'INSERT INTO InviteCode (code, max_uses, current_uses) VALUES (?, ?, 0)'
    ).run(hashed, maxUses);
    const row = db._raw.prepare(
        'SELECT id, code, max_uses, current_uses, created_time FROM InviteCode WHERE id = ?'
    ).get(info.lastInsertRowid);
    insertAdminAction(
        actingAdminId,
        'create-invite',
        null,
        JSON.stringify({ invite_id: row.id, max_uses: row.max_uses })
    );
    return row;
});

const deleteInviteTransaction = db._raw.transaction(({ id, actingAdminId }) => {
    const row = db._raw.prepare(
        'SELECT id, max_uses, current_uses FROM InviteCode WHERE id = ?'
    ).get(id);
    if (!row) return false;
    db._raw.prepare('DELETE FROM InviteCode WHERE id = ?').run(id);
    insertAdminAction(
        actingAdminId,
        'delete-invite',
        null,
        JSON.stringify({ invite_id: row.id, max_uses: row.max_uses, current_uses: row.current_uses })
    );
    return true;
});

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
    try {
        const row = createInviteTransaction.immediate({
            hashed,
            maxUses,
            actingAdminId: req.user && req.user.id
        });
        return res.status(201).json(row);
    } catch (error) {
        res.locals.unhandledError = error;
        return res.status(500).json({ error: '邀请码创建失败，请稍后重试' });
    }
});

// 删除邀请码（需 manage_invites 权限）
router.delete("/:id", requireAdmin("manage_invites"), (req, res) => {
    const id = req.params.id;
    try {
        const deleted = deleteInviteTransaction.immediate({ id, actingAdminId: req.user && req.user.id });
        if (!deleted) return res.status(404).json({ error: '邀请码不存在' });
        return res.json({ success: true });
    } catch (error) {
        res.locals.unhandledError = error;
        return res.status(500).json({ error: '邀请码删除失败，请稍后重试' });
    }
});

module.exports = router;
