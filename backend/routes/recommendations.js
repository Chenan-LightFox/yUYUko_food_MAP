const express = require('express');
const router = express.Router();
const { searchRecommendations } = require('../services/recommendation');
const { logRecommendationDebug, toDebugError } = require('../utils/recommendationDebug');
const { logRecommendationSearch } = require('../utils/recommendationSearchLog');
const { optionalAuth } = require('../middleware/auth');

router.get('/search', optionalAuth, async (req, res) => {
    const startedAt = Date.now();
    try {
        const q = String(req.query.q || '');
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
        const centerLat = req.query.centerLat ? parseFloat(req.query.centerLat) : undefined;
        const centerLng = req.query.centerLng ? parseFloat(req.query.centerLng) : undefined;
        const center = Number.isFinite(centerLat) && Number.isFinite(centerLng)
            ? { lat: centerLat, lng: centerLng }
            : undefined;
        const sortBy = req.query.sortBy === 'distance' ? 'distance' : 'relevance';

        logRecommendationDebug('request.in', {
            method: req.method,
            path: req.originalUrl,
            ip: req.ip,
            q,
            limit,
            sortBy,
            center,
            searchSource: req.get('x-search-source') || null,
            searchSessionId: req.get('x-search-session') || null,
            userId: req.user?.id || null,
            userAgent: req.get('user-agent') || '',
        });

        const data = await searchRecommendations({
            q,
            limit,
            center,
            sortBy,
        });

        logRecommendationSearch({
            req,
            rawQuery: q,
            requestedSortBy: sortBy,
            elapsedMs: Date.now() - startedAt,
            result: data,
        });

        logRecommendationDebug('request.out', {
            status: 200,
            elapsedMs: Date.now() - startedAt,
            q,
            limit,
            sortBy,
            provider: data?.normalizedIntent?.provider || null,
            mode: data?.normalizedIntent?.mode || null,
            candidateCount: Array.isArray(data?.candidates) ? data.candidates.length : 0,
            firstCandidate: data?.candidates?.[0]?.name || null,
            debug: data?.debug || null,
        });
        res.json(data);
    } catch (err) {
        console.error('recommendation search error:', err);
        logRecommendationDebug('request.error', {
            status: 500,
            elapsedMs: Date.now() - startedAt,
            error: toDebugError(err),
        });
        res.status(500).json({ error: err.message || 'internal error' });
    }
});

module.exports = router;