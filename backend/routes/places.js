const express = require("express");
const router = express.Router();
const { db } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { hasPermission } = require("../utils/adminPermissions");

// 列出所有地点
router.get("/", (req, res) => {
    db.all("SELECT * FROM Place ORDER BY created_time DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 按 bounds 查询范围内地点
router.get("/nearby", (req, res) => {
    const { minLng, minLat, maxLng, maxLat } = req.query;
    if (![minLng, minLat, maxLng, maxLat].every(Boolean)) return res.status(400).json({ error: "缺少范围参数" });
    const sql = `SELECT * FROM Place WHERE longitude BETWEEN ? AND ? AND latitude BETWEEN ? AND ?`;
    db.all(sql, [minLng, maxLng, minLat, maxLat], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 添加地点
router.post("/", requireAuth, (req, res) => {
    const { name, description, latitude, longitude, category } = req.body;
    const creatorId = req.user.id;
    if (!name || !latitude || !longitude) return res.status(400).json({ error: "缺少必填字段" });

    const sql = `INSERT INTO Place (name, description, latitude, longitude, category, creator_id) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(sql, [name, description || "", latitude, longitude, category || "", creatorId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get("SELECT * FROM Place WHERE id = ?", [this.lastID], (e, row) => {
            if (e) return res.status(500).json({ error: e.message });
            res.json(row);
        });
    });
});

// 删除地点（仅创建者或管理员）
router.delete("/:id", requireAuth, (req, res) => {
    const id = req.params.id;
    db.get("SELECT * FROM Place WHERE id = ?", [id], (err, place) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!place) return res.status(404).json({ error: "地点不存在" });
        const isCreator = String(place.creator_id) === String(req.user.id);
        const canManagePlaces = hasPermission(req.user, "manage_places");
        if (!isCreator && !canManagePlaces) {
            return res.status(403).json({ error: "没有权限删除" });
        }
        db.run("DELETE FROM Place WHERE id = ?", [id], function (e) {
            if (e) return res.status(500).json({ error: e.message });
            res.json({ success: true });
        });
    });
});

module.exports = router;
