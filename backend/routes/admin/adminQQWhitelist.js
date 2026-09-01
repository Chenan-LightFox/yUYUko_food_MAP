const express = require("express");
const router = express.Router();
const { db } = require("../../db");
const requireAdmin = require("../../middleware/adminAuth");
const { insertAdminAction } = require("../../utils/adminAudit");

const addWhitelistTransaction = db._raw.transaction(({ qqList, actingAdminId }) => {
    const added = [];
    const skipped = [];
    const insert = db._raw.prepare('INSERT OR IGNORE INTO QQWhitelist (qq) VALUES (?)');
    for (const qqNum of qqList) {
        if (!/^\d{5,15}$/.test(qqNum)) {
            skipped.push({ qq: qqNum, reason: '格式无效' });
            continue;
        }
        const info = insert.run(qqNum);
        if (info.changes === 1) added.push(qqNum);
        else skipped.push({ qq: qqNum, reason: '已存在' });
    }
    insertAdminAction(
        actingAdminId,
        'manage-qq-whitelist',
        null,
        JSON.stringify({ added_count: added.length, skipped_count: skipped.length })
    );
    return { added, skipped };
});

const deleteWhitelistTransaction = db._raw.transaction(({ id, actingAdminId }) => {
    const row = db._raw.prepare('SELECT id FROM QQWhitelist WHERE id = ?').get(id);
    if (!row) return false;
    db._raw.prepare('DELETE FROM QQWhitelist WHERE id = ?').run(id);
    insertAdminAction(
        actingAdminId,
        'delete-qq-whitelist',
        null,
        JSON.stringify({ whitelist_id: row.id })
    );
    return true;
});

// 列出所有白名单QQ号
router.get("/", requireAdmin("manage_invites"), (req, res) => {
    db.all("SELECT id, qq, created_time FROM QQWhitelist ORDER BY created_time DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// 添加白名单QQ号（支持单个或批量）
router.post("/", requireAdmin("manage_invites"), (req, res) => {
    const { qq } = req.body;
    // 支持逗号、换行、空格分隔的批量导入
    const qqList = String(qq || "").split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (qqList.length === 0) return res.status(400).json({ error: "缺少 qq 字段" });

    try {
        const result = addWhitelistTransaction.immediate({ qqList, actingAdminId: req.user && req.user.id });
        return res.json(result);
    } catch (error) {
        res.locals.unhandledError = error;
        return res.status(500).json({ error: '白名单更新失败，请稍后重试' });
    }
});

// 删除白名单QQ号
router.delete("/:id", requireAdmin("manage_invites"), (req, res) => {
    const id = req.params.id;
    try {
        const deleted = deleteWhitelistTransaction.immediate({ id, actingAdminId: req.user && req.user.id });
        if (!deleted) return res.status(404).json({ error: '白名单记录不存在' });
        return res.json({ success: true });
    } catch (error) {
        res.locals.unhandledError = error;
        return res.status(500).json({ error: '白名单删除失败，请稍后重试' });
    }
});

module.exports = router;
