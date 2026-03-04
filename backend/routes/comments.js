const express = require("express");
const router = express.Router();
const { db } = require("../db");

// 获取某地点的评论
router.get("/place/:placeId", (req, res) => {
    const { placeId } = req.params;
    db.all("SELECT * FROM Comment WHERE place_id = ? ORDER BY time DESC", [placeId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 添加评论
router.post("/", (req, res) => {
    const { place_id, content, rating } = req.body;
    const userId = req.header("X-User-Id") || null;
    if (!place_id || !content) return res.status(400).json({ error: "缺少必填字段" });
    db.run("INSERT INTO Comment (place_id, user_id, content, rating) VALUES (?, ?, ?, ?)",
        [place_id, userId, content, rating || null],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            db.get("SELECT * FROM Comment WHERE id = ?", [this.lastID], (e, row) => {
                if (e) return res.status(500).json({ error: e.message });
                res.json(row);
            });
        });
});

module.exports = router;
