const express = require("express");
const router = express.Router();
const { db } = require("../../db");
const requireAdmin = require("../../middleware/adminAuth");

// 获取所有用户（仅Y级管理员）
router.get("/", requireAdmin("manage_users"), (req, res) => {
    db.all("SELECT id, username, avatar, admin_level FROM User", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 修改用户权限等级（仅Y级管理员）
router.post("/set-level", requireAdmin("manage_users"), (req, res) => {
    const { userId, admin_level } = req.body;
    const actingAdminId = req.user.id;

    if (!userId || typeof admin_level !== "string")
        return res.status(400).json({ error: "缺少参数" });

    db.get("SELECT admin_level FROM User WHERE id = ?", [userId], (err, targetUser) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!targetUser) return res.status(404).json({ error: "用户不存在" });

        // 1. 不允许更改自己权限
        if (Number(userId) === Number(actingAdminId)) {
            return res.status(403).json({ error: "不可操作自身管理员权限" });
        }

        // 2. 不允许降级其他Y级管理员（即Y级管理员不能将Y级降级为较低等级）
        if (targetUser.admin_level === "A" && admin_level !== "A") {
            return res.status(403).json({ error: "不可降级其他Y级管理员" });
        }

        // 执行权限修改
        db.run("UPDATE User SET admin_level = ? WHERE id = ?", [admin_level, userId], function (err2) {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ success: true });
        });
    });
});

// 删除用户（仅A级管理员）
router.delete("/:id", requireAdmin("manage_users"), (req, res) => {
    db.run("DELETE FROM User WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

module.exports = router;