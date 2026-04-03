const express = require("express");
const router = express.Router();
const { db } = require("../../db");
const requireAdmin = require("../../middleware/adminAuth");
const { logAdminAction } = require("../../utils/adminAudit");

const ALLOWED_LEVELS = new Set(["YUYUKO", "YOUMU", "KOMACHI", ""]);
const SUPER_LEVEL = "YUYUKO";

// 获取所有用户（仅Y级管理员）
router.get("/", requireAdmin("manage_users"), (req, res) => {
    db.all("SELECT id, username, avatar, admin_level, is_banned, ban_reason, ban_expires FROM User", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 修改用户权限等级（仅Y级管理员）
router.post("/set-level", requireAdmin("manage_users"), (req, res) => {
    const { userId, admin_level } = req.body;
    const actingAdminId = req.user && req.user.id;

    if (!userId || typeof admin_level !== "string")
        return res.status(400).json({ error: "缺少参数" });

    // 验证 admin_level 是否有效
    if (!ALLOWED_LEVELS.has(admin_level)) {
        return res.status(400).json({ error: "无效的 admin_level 值" });
    }

    // 不能修改自身权限
        if (Number(userId) === Number(actingAdminId)) {
            return res.status(403).json({ error: "不可操作自身管理员权限" });
        }

    db.get("SELECT id, admin_level FROM User WHERE id = ?", [userId], (err, targetUser) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!targetUser) return res.status(404).json({ error: "用户不存在" });

        const currentLevel = targetUser.admin_level || "";
        const newLevel = admin_level || ""; // 使用空字符串表示普通用户

        // 如果目标是 Y 且要被降级，则需要先检查是否会导致没有 Y
        if (currentLevel === SUPER_LEVEL && newLevel !== SUPER_LEVEL) {
            db.get("SELECT COUNT(*) as cnt FROM User WHERE admin_level = ?", [SUPER_LEVEL], (err2, row) => {
                if (err2) return res.status(500).json({ error: err2.message });
                const cnt = (row && row.cnt) || 0;
                if (cnt <= 1) {
                    return res.status(403).json({ error: "不可降级最后一位 Y 级管理员" });
                }
                // 否则允许降级操作
                db.run(
                    "UPDATE User SET admin_level = ? WHERE id = ?",
                    [newLevel === "" ? null : newLevel, userId],
                    function (err3) {
                        if (err3) return res.status(500).json({ error: err3.message });
                        console.log(`Admin ${actingAdminId} set user ${userId} admin_level => ${newLevel}`);
                        logAdminAction(actingAdminId, `set-level ${currentLevel} -> ${newLevel}`, userId, null);
                        return res.json({ success: true });
                    }
                );
            });
            return;
        }

        // 否则普通更新
        db.run(
            "UPDATE User SET admin_level = ? WHERE id = ?",
            [newLevel === "" ? null : newLevel, userId],
            function (err2) {
            if (err2) return res.status(500).json({ error: err2.message });
                console.log(`Admin ${actingAdminId} set user ${userId} admin_level => ${newLevel}`);
                logAdminAction(actingAdminId, `set-level ${currentLevel} -> ${newLevel}`, userId, null);
            res.json({ success: true });
            }
        );
    });
});

// 封禁用户（需 manage_users 权限）
router.post('/ban', requireAdmin('manage_users'), (req, res) => {
    const { userId, reason, durationDays } = req.body;
    const actingAdminId = req.user && req.user.id;
    if (!userId) return res.status(400).json({ error: '缺少 userId' });
    if (Number(userId) === Number(actingAdminId)) return res.status(403).json({ error: '不可封禁自身账号' });

    db.get('SELECT id, is_banned FROM User WHERE id = ?', [userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: '用户不存在' });
        if (row.is_banned) return res.status(400).json({ error: '用户已被封禁' });

        let banExpires = null;
        if (typeof durationDays === 'number' && durationDays > 0) {
            const dt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
            banExpires = dt.toISOString();
        }

        db.run('UPDATE User SET is_banned = 1, ban_reason = ?, ban_expires = ? WHERE id = ?', [reason || null, banExpires, userId], function(e) {
            if (e) return res.status(500).json({ error: e.message });
            logAdminAction(actingAdminId, 'ban-user', userId, JSON.stringify({ reason: reason || null, ban_expires: banExpires }));
            res.json({ success: true });
        });
    });
});

// 解除封禁（需 manage_users 权限）
router.post('/unban', requireAdmin('manage_users'), (req, res) => {
    const { userId } = req.body;
    const actingAdminId = req.user && req.user.id;
    if (!userId) return res.status(400).json({ error: '缺少 userId' });

    db.get('SELECT id, is_banned FROM User WHERE id = ?', [userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: '用户不存在' });
        if (!row.is_banned) return res.status(400).json({ error: '用户未被封禁' });

        db.run('UPDATE User SET is_banned = 0, ban_reason = NULL, ban_expires = NULL WHERE id = ?', [userId], function(e) {
            if (e) return res.status(500).json({ error: e.message });
            logAdminAction(actingAdminId, 'unban-user', userId, null);
            res.json({ success: true });
        });
    });
});

// 删除用户（仅 Y 级管理员）
router.delete("/:id", requireAdmin("manage_users"), (req, res) => {
    const targetId = req.params.id;
    const actingAdminId = req.user && req.user.id;

    if (Number(targetId) === Number(actingAdminId)) {
        return res.status(403).json({ error: "不可删除自身账号" });
    }

    db.get("SELECT id, admin_level FROM User WHERE id = ?", [targetId], (err, targetUser) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!targetUser) return res.status(404).json({ error: "用户不存在" });

        const targetLevel = targetUser.admin_level || "";
        if (targetLevel === SUPER_LEVEL) {
            // 如果要删除 Y，需要确保还有其他 Y
            db.get("SELECT COUNT(*) as cnt FROM User WHERE admin_level = ?", [SUPER_LEVEL], (err2, row) => {
                if (err2) return res.status(500).json({ error: err2.message });
                const cnt = (row && row.cnt) || 0;
                if (cnt <= 1) {
                    return res.status(403).json({ error: "不可删除最后一位 Y 级管理员" });
                }
                // 否则允许删除
                db.run("DELETE FROM User WHERE id = ?", [targetId], function (err3) {
                    if (err3) return res.status(500).json({ error: err3.message });
                    console.log(`Admin ${actingAdminId} deleted user ${targetId}`);
                    logAdminAction(actingAdminId, `delete-user`, targetId, null);
                    return res.json({ success: true });
                });
            });
            return;
        }

        // 非 Y 的直接删除
        db.run("DELETE FROM User WHERE id = ?", [targetId], function (err2) {
            if (err2) return res.status(500).json({ error: err2.message });
            console.log(`Admin ${actingAdminId} deleted user ${targetId}`);
            logAdminAction(actingAdminId, `delete-user`, targetId, null);
        res.json({ success: true });
        });
    });
});

module.exports = router;
