const express = require('express');
const { db } = require('../db');
const {
    distanceToRoute,
    isAllowedAmapUrl,
    normalizeCoordinate,
    parseAmapRouteUrl
} = require('../utils/alongRoute');

const router = express.Router();
const MAX_SHARE_URL_LENGTH = 4096;
const MAX_ROUTE_POINTS = 800;
const MAX_ROUTE_OPTIONS = 6;
const MAX_TOTAL_ROUTE_POINTS = 2400;
const MAX_REDIRECTS = 6;
const FETCH_TIMEOUT_MS = 10000;

function normalizeShareUrl(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed || trimmed.length > MAX_SHARE_URL_LENGTH) return null;
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const url = new URL(withScheme);
        return isAllowedAmapUrl(url) ? url : null;
    } catch (error) {
        return null;
    }
}

async function resolveAmapRoute(value) {
    let current = normalizeShareUrl(value);
    if (!current) {
        const error = new Error('请输入有效的高德地图分享链接');
        error.status = 400;
        throw error;
    }

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
        const parsed = parseAmapRouteUrl(current);
        if (parsed) return parsed;
        if (redirectCount === MAX_REDIRECTS) break;

        let response;
        try {
            response = await fetch(current, {
                method: 'GET',
                redirect: 'manual',
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                headers: {
                    'User-Agent': 'yUYUko-food-map/2.0 route-link-resolver',
                    Accept: 'text/html,application/xhtml+xml'
                }
            });
        } catch (fetchError) {
            const error = new Error('高德分享链接暂时无法访问，请稍后重试');
            error.status = 502;
            throw error;
        }

        const location = response.headers.get('location');
        if (response.body && typeof response.body.cancel === 'function') {
            response.body.cancel().catch(() => {});
        }
        if (!location || response.status < 300 || response.status >= 400) break;

        const next = new URL(location, current);
        if (!isAllowedAmapUrl(next)) {
            const error = new Error('分享链接跳转到了非高德站点，已停止解析');
            error.status = 400;
            throw error;
        }
        current = next;
    }

    const error = new Error('没有从该分享链接中识别出行程起点和终点');
    error.status = 422;
    throw error;
}

function normalizePath(value) {
    if (!Array.isArray(value) || value.length < 2 || value.length > MAX_ROUTE_POINTS) return null;
    const result = [];
    for (const item of value) {
        const point = Array.isArray(item)
            ? normalizeCoordinate(item[0], item[1])
            : normalizeCoordinate(item && item.lng, item && item.lat);
        if (!point) return null;
        const previous = result[result.length - 1];
        if (!previous || previous.lng !== point.lng || previous.lat !== point.lat) result.push(point);
    }
    return result.length >= 2 ? result : null;
}

function normalizePaths(body) {
    const candidates = Array.isArray(body && body.paths) ? body.paths : [body && body.path];
    if (candidates.length < 1 || candidates.length > MAX_ROUTE_OPTIONS) return null;
    const paths = candidates.map(normalizePath);
    if (paths.some((path) => !path)) return null;
    const totalPoints = paths.reduce((sum, path) => sum + path.length, 0);
    return totalPoints <= MAX_TOTAL_ROUTE_POINTS ? paths : null;
}

function normalizeQuery(value) {
    return String(value || '')
        .trim()
        .slice(0, 80)
        .replace(/^(我|我们)?(现在|今天|今晚|中午|晚上)?(想要|想|要)?(吃点|喝点|吃|喝|来点|找点)\s*/u, '')
        .replace(/[的呀啊吧]$/u, '')
        .trim()
        .toLocaleLowerCase('zh-CN');
}

function getQueryTerms(value) {
    const normalized = normalizeQuery(value);
    if (!normalized) return [];
    const spaced = normalized.split(/[\s,，、/]+/u).filter(Boolean);
    return spaced.length > 1 ? spaced : [normalized];
}

function textMatchesPlace(place, terms) {
    if (!terms.length) return true;
    const searchable = [place.name, place.category, place.description]
        .map((value) => String(value || '').toLocaleLowerCase('zh-CN'))
        .join('\n');
    return terms.every((term) => searchable.includes(term));
}

function categoriesMatchPlace(place, selectedCategories) {
    if (!selectedCategories.length) return true;
    const placeCategories = String(place.category || '')
        .split(/[,，]/u)
        .map((item) => item.trim().toLocaleLowerCase('zh-CN'))
        .filter(Boolean);
    return selectedCategories.some((category) => placeCategories.includes(category.toLocaleLowerCase('zh-CN')));
}

router.post('/resolve', async (req, res) => {
    try {
        const route = await resolveAmapRoute(req.body && req.body.url);
        res.json(route);
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message || '行程解析失败' });
    }
});

router.post('/search', (req, res) => {
    const paths = normalizePaths(req.body);
    if (!paths) return res.status(400).json({ error: '路线坐标无效、方案过多或轨迹过长' });

    const corridorMeters = Math.max(200, Math.min(5000, Number(req.body.corridor_meters) || 1000));
    const limit = Math.max(1, Math.min(100, Number(req.body.limit) || 60));
    const queryTerms = getQueryTerms(req.body.query);
    const categories = Array.isArray(req.body.categories)
        ? req.body.categories.map((value) => String(value || '').trim().slice(0, 32)).filter(Boolean).slice(0, 12)
        : [];

    const allPoints = paths.flat();
    const lngValues = allPoints.map((point) => point.lng);
    const latValues = allPoints.map((point) => point.lat);
    const averageLat = latValues.reduce((sum, value) => sum + value, 0) / latValues.length;
    const latPadding = corridorMeters / 110574;
    const lngPadding = corridorMeters / Math.max(20000, 111320 * Math.cos(averageLat * Math.PI / 180));
    const bounds = {
        minLng: Math.min(...lngValues) - lngPadding,
        maxLng: Math.max(...lngValues) + lngPadding,
        minLat: Math.min(...latValues) - latPadding,
        maxLat: Math.max(...latValues) + latPadding
    };

    const sql = `SELECT p.*, u.username AS creator_name, uu.username AS updated_by_name
                 FROM Place p
                 LEFT JOIN User u ON p.creator_id = u.id
                 LEFT JOIN User uu ON p.updated_by = uu.id
                 WHERE p.longitude BETWEEN ? AND ? AND p.latitude BETWEEN ? AND ?`;
    db.all(sql, [bounds.minLng, bounds.maxLng, bounds.minLat, bounds.maxLat], (error, rows) => {
        if (error) return res.status(500).json({ error: error.message });

        const explicitlyRequestsWarning = categories.some((item) => item.includes('避雷'))
            || queryTerms.some((item) => item.includes('避雷'));
        const matches = (rows || [])
            .filter((place) => explicitlyRequestsWarning || !String(place.category || '').includes('避雷'))
            .filter((place) => textMatchesPlace(place, queryTerms))
            .filter((place) => categoriesMatchPlace(place, categories))
            .map((place) => {
                const point = { lng: Number(place.longitude), lat: Number(place.latitude) };
                const routeMatches = paths.map((path, routeIndex) => {
                    const routePosition = distanceToRoute(point, path);
                    return {
                        route_index: routeIndex,
                        distance_to_route: Math.round(routePosition.distance),
                        route_distance_from_start: Math.round(routePosition.along),
                        route_progress: Number(routePosition.progress.toFixed(4))
                    };
                }).filter((match) => match.distance_to_route <= corridorMeters);
                const nearestMatch = routeMatches.reduce((best, match) => (
                    !best || match.distance_to_route < best.distance_to_route ? match : best
                ), null);
                return {
                    ...place,
                    distance_to_route: nearestMatch ? nearestMatch.distance_to_route : null,
                    route_distance_from_start: nearestMatch ? nearestMatch.route_distance_from_start : null,
                    route_progress: nearestMatch ? nearestMatch.route_progress : null,
                    route_matches: routeMatches
                };
            })
            .filter((place) => place.route_matches.length > 0)
            .sort((left, right) => (
                left.route_matches[0].route_index - right.route_matches[0].route_index
                || left.route_matches[0].route_distance_from_start - right.route_matches[0].route_distance_from_start
                || left.distance_to_route - right.distance_to_route
            ))
            .slice(0, limit);

        return res.json({
            places: matches,
            meta: {
                count: matches.length,
                route_count: paths.length,
                corridor_meters: corridorMeters,
                truncated: matches.length >= limit
            }
        });
    });
});

module.exports = router;
module.exports.resolveAmapRoute = resolveAmapRoute;
