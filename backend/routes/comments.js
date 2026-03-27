const express = require("express");
const router = express.Router();
const { db } = require("../db");
const { requireAuth } = require("../middleware/auth");

// 获取某地点的评论
router.get("/place/:placeId", (req, res) => {
    const { placeId } = req.params;
    db.all("SELECT * FROM Comment WHERE place_id = ? ORDER BY time DESC", [placeId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 添加评论
router.post("/", requireAuth, (req, res) => {
    const { place_id, content, rating } = req.body;
    if (!place_id || !content) return res.status(400).json({ error: "缺少必填字段" });
    db.get("SELECT id FROM Place WHERE id = ?", [place_id], (placeErr, place) => {
        if (placeErr) return res.status(500).json({ error: placeErr.message });
        if (!place) return res.status(404).json({ error: "地点不存在" });

        db.run("INSERT INTO Comment (place_id, user_id, content, rating) VALUES (?, ?, ?, ?)",
            [place_id, req.user.id, content, rating || null],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                db.get("SELECT * FROM Comment WHERE id = ?", [this.lastID], (e, row) => {
                    if (e) return res.status(500).json({ error: e.message });
                    res.json(row);
                });
            });
    });
});

module.exports = router;
