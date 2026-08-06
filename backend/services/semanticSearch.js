const { db, isVectorSearchAvailable } = require('../db');
const {
    EMBEDDING_DIMENSIONS,
    createEmbedding,
    createYuyukoReason,
    hasEmbeddingConfiguration,
    hasDeepseekConfiguration
} = require('./aiClients');

const EARTH_RADIUS_KM = 6371.0088;
const MAX_VECTOR_CANDIDATES = 200;

function vectorBuffer(embedding) {
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`expected a ${EMBEDDING_DIMENSIONS}-dimension query embedding`);
    }
    const typed = new Float32Array(embedding);
    return Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
}

function semanticScore(distance) {
    const similarity = 1 - Number(distance);
    if (!Number.isFinite(similarity)) return 0;
    return Math.max(0, Math.min(1, similarity));
}

function finiteCoordinate(value, min, max) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function normalizeCenter(center) {
    if (!center || typeof center !== 'object') return null;
    const lat = finiteCoordinate(center.lat, -90, 90);
    const lng = finiteCoordinate(center.lng, -180, 180);
    return lat === null || lng === null ? null : { lat, lng };
}

function normalizeBounds(bounds) {
    if (!bounds || typeof bounds !== 'object') return null;
    const minLat = finiteCoordinate(bounds.minLat, -90, 90);
    const maxLat = finiteCoordinate(bounds.maxLat, -90, 90);
    const minLng = finiteCoordinate(bounds.minLng, -180, 180);
    const maxLng = finiteCoordinate(bounds.maxLng, -180, 180);
    if ([minLat, maxLat, minLng, maxLng].some((value) => value === null)) return null;
    if (minLat > maxLat || minLng > maxLng) return null;
    return { minLat, maxLat, minLng, maxLng };
}

function toRadians(value) {
    return value * Math.PI / 180;
}

function haversineDistanceKm(a, b) {
    const pointA = normalizeCenter(a);
    const pointB = normalizeCenter(b);
    if (!pointA || !pointB) return null;
    const latDelta = toRadians(pointB.lat - pointA.lat);
    const lngDelta = toRadians(pointB.lng - pointA.lng);
    const latA = toRadians(pointA.lat);
    const latB = toRadians(pointB.lat);
    const h = Math.sin(latDelta / 2) ** 2
        + Math.cos(latA) * Math.cos(latB) * Math.sin(lngDelta / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function isInsideBounds(point, bounds) {
    if (!point || !bounds) return false;
    return point.lat >= bounds.minLat && point.lat <= bounds.maxLat
        && point.lng >= bounds.minLng && point.lng <= bounds.maxLng;
}

function viewportRadiusKm(center, bounds) {
    if (!center || !bounds) return null;
    const corners = [
        { lat: bounds.minLat, lng: bounds.minLng },
        { lat: bounds.minLat, lng: bounds.maxLng },
        { lat: bounds.maxLat, lng: bounds.minLng },
        { lat: bounds.maxLat, lng: bounds.maxLng }
    ];
    return Math.max(...corners.map((corner) => haversineDistanceKm(center, corner) || 0));
}

function publicPlace(row) {
    const place = { ...row };
    delete place.vector_distance;
    return place;
}

function rankSemanticRows(rows, { center, bounds, limit = 5 } = {}) {
    const safeCenter = normalizeCenter(center);
    const safeBounds = normalizeBounds(bounds);
    const safeLimit = Math.max(1, Math.min(10, Number.parseInt(limit, 10) || 5));
    const viewRadius = viewportRadiusKm(safeCenter, safeBounds);
    const nearbyRadiusKm = safeCenter
        ? (viewRadius === null ? 25 : Math.max(5, Math.min(60, viewRadius * 2)))
        : null;

    const candidates = rows.map((row) => {
        const semantic = semanticScore(row.vector_distance);
        const placePoint = normalizeCenter({ lat: row.latitude, lng: row.longitude });
        const distanceKm = safeCenter && placePoint ? haversineDistanceKm(safeCenter, placePoint) : null;
        const inView = Boolean(safeBounds && placePoint && isInsideBounds(placePoint, safeBounds));
        const proximityScale = Math.max(1, viewRadius || 5);
        const proximity = distanceKm === null ? 0 : 1 / (1 + (distanceKm / proximityScale) ** 1.35);
        const combinedScore = safeCenter
            ? Math.max(0, Math.min(1, semantic * 0.78 + proximity * 0.17 + (inView ? 0.05 : 0)))
            : semantic;
        return {
            place: publicPlace(row),
            score: combinedScore,
            semantic_score: semantic,
            vector_distance: Number(row.vector_distance),
            distance_km: distanceKm === null ? null : Number(distanceKm.toFixed(3)),
            in_view: inView
        };
    });

    // When map context is available, never jump to a remote city just because its
    // wording is a little closer. Candidates must be visible or reasonably near
    // the current viewport; an empty local pool is better than a misleading card.
    const eligible = safeCenter
        ? candidates.filter((candidate) => candidate.in_view
            || (candidate.distance_km !== null && candidate.distance_km <= nearbyRadiusKm))
        : candidates;

    return eligible
        .sort((a, b) => b.score - a.score
            || b.semantic_score - a.semantic_score
            || (a.distance_km ?? Number.POSITIVE_INFINITY) - (b.distance_km ?? Number.POSITIVE_INFINITY))
        .slice(0, safeLimit);
}

function localYuyukoReason(query, match) {
    const place = match.place;
    const price = Number(place.per_person_cost);
    const priceText = Number.isFinite(price) && price > 0 ? `人均约 ${Math.round(price)} 元，` : '';
    const categoryText = place.category ? `它的「${String(place.category).slice(0, 30)}」分类` : '它的特色';
    const distanceText = Number.isFinite(match.distance_km)
        ? `距离当前地图中心约 ${match.distance_km < 1 ? `${Math.round(match.distance_km * 1000)} 米` : `${match.distance_km.toFixed(1)} 公里`}，`
        : '';
    return `幽幽子觉得「${place.name}」很合适～${distanceText}${priceText}${categoryText}和你的“${String(query).slice(0, 36)}”颇有缘分，先去尝尝看吧。`;
}

async function searchSemanticPlaces(query, { limit = 5, center = null, bounds = null } = {}) {
    if (!isVectorSearchAvailable()) throw new Error('sqlite-vec is unavailable');
    if (!hasEmbeddingConfiguration()) throw new Error('SILICONFLOW_API_KEY is not configured');
    const safeLimit = Math.max(1, Math.min(10, Number.parseInt(limit, 10) || 5));
    const embedding = await createEmbedding(`检索与这段用餐需求最匹配的地点：${query}`);
    const candidateLimit = Math.max(100, Math.min(MAX_VECTOR_CANDIDATES, safeLimit * 40));
    const rows = db._raw.prepare(`WITH nearest AS (
            SELECT place_id, distance
            FROM place_vectors
            WHERE embedding MATCH ? AND k = ?
        )
        SELECT p.*, u.username AS creator_name, uu.username AS updated_by_name,
               nearest.distance AS vector_distance
        FROM nearest
        JOIN Place p ON p.id = nearest.place_id
        LEFT JOIN User u ON p.creator_id = u.id
        LEFT JOIN User uu ON p.updated_by = uu.id
        ORDER BY nearest.distance`).all(vectorBuffer(embedding), candidateLimit);

    const matches = rankSemanticRows(rows, { center, bounds, limit: safeLimit });
    if (!matches.length) {
        return {
            status: rows.length ? 'no_nearby_match' : 'index_empty',
            recommendation: null,
            matches: []
        };
    }

    let reason = '';
    let reasonSource = 'fallback';
    try {
        reason = await createYuyukoReason(query, matches);
        if (reason) reasonSource = 'deepseek';
    } catch (error) {
        console.warn('DeepSeek recommendation failed:', error.message);
    }
    if (!reason) reason = localYuyukoReason(query, matches[0]);

    return {
        status: hasDeepseekConfiguration() && reasonSource === 'deepseek' ? 'ok' : 'partial',
        recommendation: {
            place: matches[0].place,
            score: matches[0].score,
            semantic_score: matches[0].semantic_score,
            match_percent: Math.round(matches[0].score * 100),
            distance_km: matches[0].distance_km,
            in_view: matches[0].in_view,
            reason,
            reason_source: reasonSource
        },
        matches
    };
}

module.exports = {
    searchSemanticPlaces,
    haversineDistanceKm,
    normalizeCenter,
    normalizeBounds,
    rankSemanticRows
};
