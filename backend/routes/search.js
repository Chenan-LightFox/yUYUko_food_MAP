const express = require('express');
const router = express.Router();
const https = require('https');
const { db } = require('../db');
const { fuzzySearch } = require('../utils/fuzzySearch'); // 模糊搜索，保留字段

const DEFAULT_NEARBY_RADIUS_METERS = 5000;
const DEFAULT_NEARBY_MIN_COUNT = 20;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
const DEFAULT_DEEPSEEK_TIMEOUT_MS = 6000;
const DEFAULT_DEEPSEEK_MIN_SCORE = 0.6;
const DEFAULT_DEEPSEEK_MAX_SUGGESTIONS = 4;
const DEFAULT_DEEPSEEK_MIN_QUERY_LENGTH = 2;
const DEFAULT_DEEPSEEK_FAR_DISTANCE_METERS = Math.max(8000, DEFAULT_NEARBY_RADIUS_METERS * 2);
const DEFAULT_AGENT_RECOMMEND_COUNT = 10;
const DEFAULT_AGENT_MAX_CANDIDATES = 1000;
const DEFAULT_AGENT_CHUNK_SIZE = 120;
const DEFAULT_AGENT_MAX_TOKENS = 260;

function normalizeText(s) {
    return (s || "").toString().trim().toLowerCase();
}

function postJson(url, payload, headers = {}, timeoutMs = DEFAULT_DEEPSEEK_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const body = JSON.stringify(payload);
        const req = https.request({
            method: 'POST',
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: `${urlObj.pathname}${urlObj.search}`,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                ...headers
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({ status: res.statusCode || 0, body: data });
            });
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error('DeepSeek request timed out'));
        });
        req.write(body);
        req.end();
    });
}

function parseJsonArray(text) {
    if (!text) return [];
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
    } catch (e) {
        // ignore parse error
    }
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
        const parsed = JSON.parse(match[0]);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

async function deepseekChat(messages, opts = {}) {
    if (!DEEPSEEK_API_KEY) return '';
    const payload = {
        model: DEEPSEEK_MODEL,
        temperature: opts.temperature == null ? 0.2 : opts.temperature,
        max_tokens: opts.maxTokens == null ? DEFAULT_AGENT_MAX_TOKENS : opts.maxTokens,
        messages
    };

    try {
        const url = `${DEEPSEEK_BASE_URL}/v1/chat/completions`;
        const { status, body } = await postJson(url, payload, {
            Authorization: `Bearer ${DEEPSEEK_API_KEY}`
        }, opts.timeoutMs || DEFAULT_DEEPSEEK_TIMEOUT_MS);
        if (status < 200 || status >= 300) return '';
        const parsed = JSON.parse(body);
        return parsed?.choices?.[0]?.message?.content || '';
    } catch (e) {
        console.warn('DeepSeek chat failed:', e.message || e);
        return '';
    }
}

async function expandQueriesWithDeepseek(query, maxSuggestions = DEFAULT_DEEPSEEK_MAX_SUGGESTIONS) {
    if (!DEEPSEEK_API_KEY) return [];
    const content = await deepseekChat([
        {
            role: 'system',
            content: 'You are a search assistant for a food map. Return a JSON array of 3 to 6 Chinese keyword phrases. Only return the JSON array.'
        },
        {
            role: 'user',
            content: `Query: ${query}`
        }
    ], { temperature: 0.2, maxTokens: 180 });

    const rawList = parseJsonArray(content);
    const originKey = normalizeText(query);
    const seen = new Set();
    const cleaned = [];
    for (const item of rawList) {
        const val = (item || '').toString().trim();
        const key = normalizeText(val);
        if (!key || key === originKey || key.length < DEFAULT_DEEPSEEK_MIN_QUERY_LENGTH) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        cleaned.push(val);
        if (cleaned.length >= maxSuggestions) break;
    }
    return cleaned;
}

// 非连续字符匹配
function isSubsequence(term, text) {
    if (!term) return true;
    if (!text) return false;
    let i = 0, j = 0;
    const t = term.toLowerCase();
    const s = text.toLowerCase();
    while (i < t.length && j < s.length) {
        if (t[i] === s[j]) i++;
        j++;
    }
    return i === t.length;
}

// Haversine method 计算距离(m)
function haversineDistance(lat1, lng1, lat2, lng2) {
    const toRad = (v) => v * Math.PI / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function truncateText(text, maxLen) {
    const s = (text || '').toString().trim();
    if (!maxLen || s.length <= maxLen) return s;
    return s.slice(0, maxLen) + '...';
}

function makeAgentCandidateKey(place, index) {
    if (place && place.id != null) return `id:${place.id}`;
    if (place && place.latitude != null && place.longitude != null) {
        return `geo:${place.name || 'place'}:${place.latitude}:${place.longitude}`;
    }
    return `idx:${index}`;
}

function buildAgentCandidates(places, center, maxCandidates) {
    const list = [];
    const cap = Number.isFinite(maxCandidates) && maxCandidates > 0
        ? Math.floor(maxCandidates)
        : DEFAULT_AGENT_MAX_CANDIDATES;
    for (let i = 0; i < (places || []).length && list.length < cap; i += 1) {
        const p = places[i];
        if (!p) continue;
        const key = makeAgentCandidateKey(p, i);
        let distanceMeters = undefined;
        if (center && center.lat != null && center.lng != null && p.latitude != null && p.longitude != null) {
            distanceMeters = haversineDistance(center.lat, center.lng, p.latitude, p.longitude);
        }
        list.push({
            key,
            name: (p.name || '').toString().trim(),
            category: (p.category || '').toString().trim(),
            address: (p.address || '').toString().trim(),
            description: truncateText(p.description || '', 80),
            distanceMeters,
            place: p
        });
    }
    return list;
}

function splitIntoChunks(list, chunkSize) {
    const size = Number.isFinite(chunkSize) && chunkSize > 0 ? Math.floor(chunkSize) : DEFAULT_AGENT_CHUNK_SIZE;
    const chunks = [];
    for (let i = 0; i < list.length; i += size) {
        chunks.push(list.slice(i, i + size));
    }
    return chunks;
}

async function selectAgentKeysFromCandidates(query, candidates, maxCount) {
    if (!DEEPSEEK_API_KEY || !query || !candidates.length) return [];
    const limit = Number.isFinite(maxCount) && maxCount > 0 ? Math.floor(maxCount) : DEFAULT_AGENT_RECOMMEND_COUNT;
    const payloadCandidates = candidates.map((c) => {
        const base = {
            key: c.key,
            name: c.name,
            category: c.category,
            address: c.address,
            description: c.description
        };
        if (Number.isFinite(c.distanceMeters)) {
            base.distance_m = Math.round(c.distanceMeters);
        }
        return base;
    });

    const content = await deepseekChat([
        {
            role: 'system',
            content: 'You are a location recommender. Choose the best candidates for the user query. Return a JSON array of candidate keys only. Do not return extra text.'
        },
        {
            role: 'user',
            content: `Query: ${query}\nCandidates: ${JSON.stringify(payloadCandidates)}`
        }
    ], { temperature: 0.1, maxTokens: 200 });

    const rawKeys = parseJsonArray(content);
    const allowed = new Set(candidates.map((c) => c.key));
    const selected = [];
    for (const item of rawKeys) {
        const key = (item || '').toString().trim();
        if (!key || !allowed.has(key)) continue;
        if (selected.includes(key)) continue;
        selected.push(key);
        if (selected.length >= limit) break;
    }
    return selected;
}

async function selectAgentRecommendations(query, candidates, maxCount) {
    if (!DEEPSEEK_API_KEY || !query || !candidates.length) return [];
    const limit = Number.isFinite(maxCount) && maxCount > 0 ? Math.floor(maxCount) : DEFAULT_AGENT_RECOMMEND_COUNT;
    const chunks = splitIntoChunks(candidates, DEFAULT_AGENT_CHUNK_SIZE);
    const perChunk = Math.max(1, Math.ceil(limit / Math.max(1, chunks.length)));
    const merged = [];

    for (const chunk of chunks) {
        const keys = await selectAgentKeysFromCandidates(query, chunk, perChunk);
        for (const key of keys) {
            if (!merged.includes(key)) merged.push(key);
        }
    }

    if (merged.length <= limit) return merged;

    const shortlist = candidates.filter((c) => merged.includes(c.key));
    const finalKeys = await selectAgentKeysFromCandidates(query, shortlist, limit);
    return finalKeys.length > 0 ? finalKeys : merged.slice(0, limit);
}

async function recommendPlacesWithAgent(query, places, center, opts = {}) {
    if (!DEEPSEEK_API_KEY || !query) return [];
    const maxCount = Number.isFinite(opts.maxCount) && opts.maxCount > 0
        ? Math.floor(opts.maxCount)
        : DEFAULT_AGENT_RECOMMEND_COUNT;
    const maxCandidates = Number.isFinite(opts.maxCandidates) && opts.maxCandidates > 0
        ? Math.floor(opts.maxCandidates)
        : DEFAULT_AGENT_MAX_CANDIDATES;
    const candidates = buildAgentCandidates(places, center, maxCandidates);
    if (!candidates.length) return [];
    const keys = await selectAgentRecommendations(query, candidates, maxCount);
    if (!keys.length) return [];
    const placeByKey = new Map(candidates.map((c) => [c.key, c.place]));
    const selected = [];
    for (const key of keys) {
        const place = placeByKey.get(key);
        if (place) selected.push(place);
    }
    return selected;
}

function resolveNearbyMinCount(limit, nearbyMin) {
    if (Number.isFinite(nearbyMin) && nearbyMin > 0) return Math.floor(nearbyMin);
    if (Number.isFinite(limit) && limit > 0) return Math.min(limit, DEFAULT_NEARBY_MIN_COUNT);
    return DEFAULT_NEARBY_MIN_COUNT;
}

function compareMatches(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.distance !== b.distance) return a.distance - b.distance;
    const at = a.place.created_time ? new Date(a.place.created_time).getTime() : 0;
    const bt = b.place.created_time ? new Date(b.place.created_time).getTime() : 0;
    return bt - at;
}

function mergeMatchesByPlace(matches) {
    const map = new Map();
    for (const m of matches) {
        const p = m.place || {};
        const key = p.id != null
            ? `id:${p.id}`
            : `geo:${p.name || ''}:${p.latitude || ''}:${p.longitude || ''}`;
        const existing = map.get(key);
        if (!existing || compareMatches(m, existing) < 0) {
            map.set(key, m);
        }
    }
    return Array.from(map.values());
}

function getMatchQuality(matched, center) {
    let bestScore = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const m of matched) {
        if (Number.isFinite(m.score) && m.score > bestScore) bestScore = m.score;
        if (center && Number.isFinite(m.distance) && m.distance < nearestDistance) {
            nearestDistance = m.distance;
        }
    }
    return {
        count: matched.length,
        bestScore,
        nearestDistance
    };
}

function shouldFallbackToDeepseek(term, matched, center) {
    const q = (term || '').toString().trim();
    if (!q || q.length < DEFAULT_DEEPSEEK_MIN_QUERY_LENGTH) return false;
    if (!DEEPSEEK_API_KEY) return false;
    if (!matched.length) return true;
    const quality = getMatchQuality(matched, center);
    if (quality.bestScore < DEFAULT_DEEPSEEK_MIN_SCORE) return true;
    if (center && Number.isFinite(quality.nearestDistance) && quality.nearestDistance > DEFAULT_DEEPSEEK_FAR_DISTANCE_METERS) {
        return true;
    }
    return false;
}

function buildMatchesFromRows(rows, term, center) {
    const matched = [];
    const t = normalizeText(term);
    if (!t) return matched;

    for (const p of rows) {
        const name = normalizeText(p.name || '');
        const category = normalizeText(p.category || '');
        const description = normalizeText(p.description || '');

        const nameContains = name.indexOf(t) !== -1;
        const categoryContains = category.indexOf(t) !== -1;
        const descContains = description.indexOf(t) !== -1;
        const nameSubseq = isSubsequence(t, name);

        if (!nameContains && !nameSubseq && !categoryContains && !descContains) continue;

        let rank = 99;
        let score = 0;
        if (nameContains) {
            rank = 0;
            score = 1;
        } else if (nameSubseq) {
            rank = 1;
            score = 0.7;
        } else if (categoryContains) {
            rank = 2;
            score = 0.5;
        } else if (descContains) {
            rank = 3;
            score = 0.4;
        }

        let distance = Number.POSITIVE_INFINITY;
        if (center && center.lat != null && center.lng != null && p.latitude != null && p.longitude != null) {
            distance = haversineDistance(center.lat, center.lng, p.latitude, p.longitude);
        }

        matched.push({
            place: p,
            rank,
            distance,
            score
        });
    }

    return matched;
}

function prioritizeNearbyMatches(matched, opts = {}) {
    const { center, limit, nearbyRadius, nearbyMin } = opts;
    if (!center || center.lat == null || center.lng == null) return matched;

    const radius = Number.isFinite(nearbyRadius) && nearbyRadius > 0
        ? nearbyRadius
        : DEFAULT_NEARBY_RADIUS_METERS;
    if (!Number.isFinite(radius) || radius <= 0) return matched;

    const minCount = resolveNearbyMinCount(limit, nearbyMin);
    const inRadius = matched.filter((m) => Number.isFinite(m.distance) && m.distance <= radius);
    if (inRadius.length >= minCount) return inRadius;

    const outRadius = matched.filter((m) => !Number.isFinite(m.distance) || m.distance > radius);
    return [...inRadius, ...outRadius];
}

async function getAllPlaces(opts = {}) {
    const q = (opts.q || "").toString().trim();
    const term = normalizeText(q);
    const center = opts.center; // { lat, lng } 或 undefined
    const limit = Number.isInteger(opts.limit) ? opts.limit : undefined;
    const nearbyRadius = opts.nearbyRadius != null ? Number(opts.nearbyRadius) : undefined;
    const nearbyMin = opts.nearbyMin != null ? Number(opts.nearbyMin) : undefined;
    const allowDeepseek = opts.allowDeepseek !== false;
    const agentRecommend = opts.agentRecommend !== false;
    const agentRecommendOnly = opts.agentRecommendOnly !== false;
    const agentRecommendCount = Number.isFinite(opts.agentRecommendCount) ? Math.floor(opts.agentRecommendCount) : undefined;
    const agentMaxCandidates = Number.isFinite(opts.agentMaxCandidates) ? Math.floor(opts.agentMaxCandidates) : undefined;

    // 获取所有地点数据（附带创建者和最后修改者姓名）
    const rows = await new Promise((resolve, reject) => {
        const sql = `SELECT p.*, u.username AS creator_name, uu.username AS updated_by_name
                     FROM Place p
                     LEFT JOIN User u ON p.creator_id = u.id
                     LEFT JOIN User uu ON p.updated_by = uu.id`;
        db.all(sql, [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });

    // 如果没有关键字，则按距离或按创建时间降序返回
    if (!term) {
        let list = rows.slice();
        if (center && center.lat != null && center.lng != null) {
            list.forEach(p => {
                p.__distance = haversineDistance(center.lat, center.lng, p.latitude, p.longitude);
            });
            list.sort((a, b) => a.__distance - b.__distance);
        } else {
            // 按 created_time 降序（若不存在则保持原序）
            list.sort((a, b) => {
                if (!a.created_time && !b.created_time) return 0;
                if (!a.created_time) return 1;
                if (!b.created_time) return -1;
                return new Date(b.created_time) - new Date(a.created_time);
            });
        }
        if (limit) return list.slice(0, limit);
        return list;
    }

    // 有关键字的情况：分组并排序
    let matched = buildMatchesFromRows(rows, term, center);
    matched.sort(compareMatches);

    let prioritized = prioritizeNearbyMatches(matched, { center, limit, nearbyRadius, nearbyMin });
    let results = prioritized.map(m => m.place);

    if (allowDeepseek && shouldFallbackToDeepseek(term, matched, center)) {
        const suggestions = await expandQueriesWithDeepseek(q);
        if (suggestions.length > 0) {
            const extraMatches = [];
            for (const suggestion of suggestions) {
                const altMatched = buildMatchesFromRows(rows, suggestion, center);
                extraMatches.push(...altMatched);
            }
            const mergedExtra = mergeMatchesByPlace(extraMatches);
            mergedExtra.sort(compareMatches);
            const extraPrioritized = prioritizeNearbyMatches(mergedExtra, { center, limit, nearbyRadius, nearbyMin });
            const extraResults = extraPrioritized.map(m => m.place);
            const seen = new Set();
            const combined = [];
            for (const p of [...extraResults, ...results]) {
                const key = p.id != null
                    ? `id:${p.id}`
                    : `geo:${p.name || ''}:${p.latitude || ''}:${p.longitude || ''}`;
                if (seen.has(key)) continue;
                seen.add(key);
                combined.push(p);
            }
            results = combined;
        }
    }

    if (agentRecommend) {
        const recommended = await recommendPlacesWithAgent(q, results, center, {
            maxCount: agentRecommendCount,
            maxCandidates: agentMaxCandidates
        });
        if (recommended.length > 0) {
            if (agentRecommendOnly) {
                results = recommended;
            } else {
                const seen = new Set();
                const merged = [];
                for (const p of recommended) {
                    const key = p.id != null
                        ? `id:${p.id}`
                        : `geo:${p.name || ''}:${p.latitude || ''}:${p.longitude || ''}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    merged.push(p);
                }
                for (const p of results) {
                    const key = p.id != null
                        ? `id:${p.id}`
                        : `geo:${p.name || ''}:${p.latitude || ''}:${p.longitude || ''}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    merged.push(p);
                }
                results = merged;
            }
        }
    }

    if (limit) return results.slice(0, limit);
    return results;
}

// GET /places/search?q=关键字&limit=50&centerLat=...&centerLng=...&nearbyRadius=2000&nearbyMin=20&agentRecommend=1&agentRecommendOnly=1
router.get('/places/search', async (req, res) => {
    try {
        const q = req.query.q || "";
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
        const centerLat = req.query.centerLat ? parseFloat(req.query.centerLat) : undefined;
        const centerLng = req.query.centerLng ? parseFloat(req.query.centerLng) : undefined;
        const center = (centerLat != null && centerLng != null) ? { lat: centerLat, lng: centerLng } : undefined;
        const nearbyRadius = req.query.nearbyRadius ? parseFloat(req.query.nearbyRadius) : undefined;
        const nearbyMin = req.query.nearbyMin ? parseInt(req.query.nearbyMin, 10) : undefined;
        const agentRecommend = req.query.agentRecommend ? req.query.agentRecommend !== '0' : undefined;
        const agentRecommendOnly = req.query.agentRecommendOnly ? req.query.agentRecommendOnly !== '0' : undefined;
        const agentRecommendCount = req.query.agentRecommendCount ? parseInt(req.query.agentRecommendCount, 10) : undefined;
        const agentMaxCandidates = req.query.agentMaxCandidates ? parseInt(req.query.agentMaxCandidates, 10) : undefined;

        const places = await getAllPlaces({
            q,
            center,
            limit,
            nearbyRadius,
            nearbyMin,
            agentRecommend,
            agentRecommendOnly,
            agentRecommendCount,
            agentMaxCandidates
        });
        res.json(places);
    } catch (err) {
        console.error("places search error:", err);
        res.status(500).json({ error: err.message || "internal error" });
    }
});

module.exports = router;
