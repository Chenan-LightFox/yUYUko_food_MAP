const express = require('express');
const router = express.Router();
const { fuzzySearch } = require('../utils/fuzzySearch');

// TODO: 添加搜索逻辑
async function getAllPlaces() {
    // ...
}

// GET /places/search?q=关键字&limit=50 返回匹配的地点数组

router.get('/places/search', async (req, res) => {
    try {
        const q = req.query.q || "";
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;

        const places = await getAllPlaces(); // 替换为你的实现
        const matched = fuzzySearch(places, q, { limit });
        res.json(matched);
    } catch (err) {
        console.error("places search error:", err);
        res.status(500).json({ error: err.message || "internal error" });
    }
});

module.exports = router;
