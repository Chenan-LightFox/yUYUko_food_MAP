const express = require('express');
const { performance } = require('perf_hooks');
const { db } = require('../db');
const {
    searchSemanticPlaces,
    haversineDistanceKm,
    normalizeCenter,
    normalizeBounds
} = require('../services/semanticSearch');

const router = express.Router();
const AI_QUERY_MAX_LENGTH = 300;
const AI_RATE_WINDOW_MS = 60 * 1000;
const AI_RATE_LIMIT = Math.max(1, Number.parseInt(process.env.AI_SEARCH_RATE_LIMIT, 10) || 12);
const aiRateBuckets = new Map();

function parseLimit(rawValue, fallback = 50, max = 100) {
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, max);
}

function fastSearch(query, limit) {
    const sql = `SELECT p.*, u.username AS creator_name, uu.username AS updated_by_name
                 FROM Place p
                 LEFT JOIN User u ON p.creator_id = u.id
                 LEFT JOIN User uu ON p.updated_by = uu.id
                 WHERE instr(lower(COALESCE(p.name, '')), lower(?)) > 0
                    OR instr(lower(COALESCE(p.category, '')), lower(?)) > 0
                    OR instr(lower(COALESCE(p.description, '')), lower(?)) > 0
                 ORDER BY CASE
                    WHEN lower(trim(COALESCE(p.name, ''))) = lower(?) THEN 0
                    WHEN instr(lower(COALESCE(p.name, '')), lower(?)) > 0 THEN 1
                    WHEN instr(lower(COALESCE(p.category, '')), lower(?)) > 0 THEN 2
                    ELSE 3
                 END,
                 p.created_time DESC
                 LIMIT ?`;
    return db._raw.prepare(sql).all(query, query, query, query, query, query, limit);
}

function sendFastSearch(req, res) {
    const query = String(req.query.q || '').trim().slice(0, AI_QUERY_MAX_LENGTH);
    if (!query) return res.json([]);
    const startedAt = performance.now();
    const center = normalizeCenter({ lat: req.query.lat, lng: req.query.lng });
    const rows = fastSearch(query, parseLimit(req.query.limit)).map((row) => {
        if (!center) return row;
        const distanceKm = haversineDistanceKm(center, {
            lat: row.latitude,
            lng: row.longitude
        });
        return {
            ...row,
            distance_km: distanceKm === null ? null : Number(distanceKm.toFixed(3))
        };
    });
    const duration = performance.now() - startedAt;
    res.set('Server-Timing', `sqlite;dur=${duration.toFixed(1)}`);
    res.set('Cache-Control', 'no-store');
    return res.json(rows);
}

function consumeAiRateLimit(req) {
    const now = Date.now();
    if (aiRateBuckets.size > 1000) {
        for (const [bucketKey, bucket] of aiRateBuckets) {
            if (now - bucket.startedAt >= AI_RATE_WINDOW_MS) aiRateBuckets.delete(bucketKey);
        }
    }
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const previous = aiRateBuckets.get(key);
    if (!previous || now - previous.startedAt >= AI_RATE_WINDOW_MS) {
        aiRateBuckets.set(key, { startedAt: now, count: 1 });
        return true;
    }
    previous.count += 1;
    return previous.count <= AI_RATE_LIMIT;
}

// Request A: direct SQLite substring matching. This route never calls an AI service.
router.get('/places/search/fast', sendFastSearch);

// Backward-compatible alias used by older clients and live suggestions.
router.get('/places/search', sendFastSearch);

// Request B: embedding -> sqlite-vec KNN -> DeepSeek Yuyuko recommendation.
router.post('/places/search/ai', async (req, res) => {
    const query = String(req.body?.q || '').trim();
    if (!query) return res.status(400).json({ error: '搜索内容不能为空' });
    if (query.length > AI_QUERY_MAX_LENGTH) {
        return res.status(400).json({ error: `搜索内容不能超过 ${AI_QUERY_MAX_LENGTH} 个字符` });
    }
    if (!consumeAiRateLimit(req)) {
        return res.status(429).json({ error: '幽幽子正在认真品尝，请稍后再问一次吧' });
    }

    try {
        const center = normalizeCenter(req.body?.center);
        const bounds = normalizeBounds(req.body?.bounds);
        const result = await searchSemanticPlaces(query, {
            limit: parseLimit(req.body?.limit, 5, 10),
            center,
            bounds
        });
        return res.json(result);
    } catch (error) {
        console.warn('AI place search unavailable:', error.message);
        return res.status(503).json({
            status: 'unavailable',
            recommendation: null,
            matches: [],
            error: '幽幽子的语义搜索暂时不可用，基础搜索仍可正常使用'
        });
    }
});

module.exports = router;
