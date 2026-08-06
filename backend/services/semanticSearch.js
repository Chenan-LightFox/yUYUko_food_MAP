const { db, isVectorSearchAvailable } = require('../db');
const {
    EMBEDDING_DIMENSIONS,
    createEmbedding,
    expandSearchIntent,
    createYuyukoReasons,
    hasEmbeddingConfiguration,
    hasDeepseekConfiguration
} = require('./aiClients');

const EARTH_RADIUS_KM = 6371.0088;
const MAX_VECTOR_CANDIDATES = 200;
const configuredMinimumSemanticScore = Number.parseFloat(process.env.AI_SEARCH_MIN_SEMANTIC_SCORE);
const MIN_SEMANTIC_SCORE = Number.isFinite(configuredMinimumSemanticScore)
    ? Math.max(0, Math.min(1, configuredMinimumSemanticScore))
    : 0.6;
const configuredExpandedIntentScore = Number.parseFloat(process.env.AI_EXPANDED_INTENT_MIN_SEMANTIC_SCORE);
const EXPANDED_INTENT_MIN_SEMANTIC_SCORE = Number.isFinite(configuredExpandedIntentScore)
    ? Math.max(0, Math.min(MIN_SEMANTIC_SCORE, configuredExpandedIntentScore))
    : Math.min(MIN_SEMANTIC_SCORE, 0.55);
const configuredPlaceDetailWeight = Number.parseFloat(process.env.AI_PLACE_DETAIL_WEIGHT);
const PLACE_DETAIL_WEIGHT = Number.isFinite(configuredPlaceDetailWeight)
    ? Math.max(0, Math.min(0.5, configuredPlaceDetailWeight))
    : 0.25;

function buildEmbeddingQuery(query, intentExpansion = null) {
    const original = String(query || '').trim();
    const retrievalText = String(intentExpansion?.retrieval_text || '').trim();
    const expanded = intentExpansion?.needs_expansion === true
        && retrievalText
        && retrievalText !== original;
    const intentHint = expanded ? `\nDeepSeek 标准化检索意图：${retrievalText}` : '';
    return {
        text: `检索任务：从地点库中找出最符合用户用餐需求的地点。\n用户原始需求：${original}${intentHint}`,
        minimumSemanticScore: expanded ? EXPANDED_INTENT_MIN_SEMANTIC_SCORE : MIN_SEMANTIC_SCORE,
        expanded,
        expansion_source: expanded ? String(intentExpansion?.source || 'deepseek') : 'original'
    };
}

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

function placeDetailCompleteness(place) {
    const rawDescription = String(place?.description || '').replace(/\s+/g, ' ').trim();
    const description = /^(暂无描述|无描述|未提供|无|[-—]+)$/i.test(rawDescription) ? '' : rawDescription;
    const descriptionLength = Array.from(description).length;
    const descriptionScore = descriptionLength >= 80 ? 1
        : descriptionLength >= 40 ? 0.8
            : descriptionLength >= 16 ? 0.5
                : descriptionLength > 0 ? 0.2 : 0;

    const genericCategories = new Set(['其他', '未分类', '餐厅', '美食', '其他美食', '地点']);
    const categories = String(place?.category || '')
        .split(/[,，/、|]+/)
        .map((value) => value.trim())
        .filter(Boolean);
    const categoryScore = categories.some((category) => !genericCategories.has(category)) ? 1 : 0;
    const price = Number(place?.per_person_cost);
    const priceScore = Number.isFinite(price) && price > 0 ? 1 : 0;

    return Number((descriptionScore * 0.7 + categoryScore * 0.2 + priceScore * 0.1).toFixed(3));
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

function rankSemanticRows(rows, { center, bounds, limit = 5, minimumSemanticScore = MIN_SEMANTIC_SCORE } = {}) {
    const safeCenter = normalizeCenter(center);
    const safeBounds = normalizeBounds(bounds);
    const safeLimit = Math.max(1, Math.min(10, Number.parseInt(limit, 10) || 5));
    const safeMinimumSemanticScore = Number.isFinite(Number(minimumSemanticScore))
        ? Math.max(0, Math.min(1, Number(minimumSemanticScore)))
        : MIN_SEMANTIC_SCORE;
    const viewRadius = viewportRadiusKm(safeCenter, safeBounds);
    const nearbyRadiusKm = safeCenter
        ? (viewRadius === null ? 25 : Math.max(5, Math.min(60, viewRadius * 2)))
        : null;

    const candidates = rows.filter((row) => !String(row.category || '').includes('避雷')).map((row) => {
        const semantic = semanticScore(row.vector_distance);
        const detailCompleteness = placeDetailCompleteness(row);
        const detailAdjustedSemantic = semantic * (1 - PLACE_DETAIL_WEIGHT + PLACE_DETAIL_WEIGHT * detailCompleteness);
        const placePoint = normalizeCenter({ lat: row.latitude, lng: row.longitude });
        const distanceKm = safeCenter && placePoint ? haversineDistanceKm(safeCenter, placePoint) : null;
        const inView = Boolean(safeBounds && placePoint && isInsideBounds(placePoint, safeBounds));
        const proximityScale = Math.max(1, viewRadius || 5);
        const proximity = distanceKm === null ? 0 : 1 / (1 + (distanceKm / proximityScale) ** 1.35);
        return {
            place: publicPlace(row),
            score: detailAdjustedSemantic,
            semantic_score: semantic,
            detail_completeness: detailCompleteness,
            detail_adjusted_score: detailAdjustedSemantic,
            vector_distance: Number(row.vector_distance),
            distance_km: distanceKm === null ? null : Number(distanceKm.toFixed(3)),
            in_view: inView,
            proximity_score: proximity
        };
    }).filter((candidate) => candidate.semantic_score >= safeMinimumSemanticScore);

    const inViewCandidates = candidates.filter((candidate) => candidate.in_view);
    let eligible = candidates;
    if (safeCenter && inViewCandidates.length) {
        // Once a relevant place is visible, screen position must not compete with
        // meaning: every in-view candidate is ranked by semantic score alone.
        eligible = inViewCandidates.map((candidate) => ({
            ...candidate,
            score: candidate.detail_adjusted_score
        }));
    } else if (safeCenter) {
        // Only when the viewport contains no suitable result do we look just
        // outside it, with a deliberately light proximity influence.
        eligible = candidates
            .filter((candidate) => candidate.distance_km !== null && candidate.distance_km <= nearbyRadiusKm)
            .map((candidate) => ({
                ...candidate,
                score: Math.max(0, Math.min(1,
                    candidate.detail_adjusted_score * 0.88 + candidate.proximity_score * 0.12
                ))
            }));
    }

    return eligible
        .sort((a, b) => b.score - a.score
            || b.semantic_score - a.semantic_score
            || (a.distance_km ?? Number.POSITIVE_INFINITY) - (b.distance_km ?? Number.POSITIVE_INFINITY))
        .slice(0, safeLimit)
        .map(({ proximity_score, detail_adjusted_score, ...candidate }) => candidate);
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

function reasonMatchesPlace(reason, placeName, otherPlaceNames = []) {
    const text = String(reason || '').trim();
    const name = String(placeName || '').trim();
    if (!text || !name || !text.includes(name)) return false;
    return !(Array.isArray(otherPlaceNames) ? otherPlaceNames : []).some((otherName) => {
        const normalized = String(otherName || '').trim();
        return normalized && normalized !== name && text.includes(normalized);
    });
}

async function searchSemanticPlaces(query, { limit = 5, center = null, bounds = null } = {}) {
    if (!isVectorSearchAvailable()) throw new Error('sqlite-vec is unavailable');
    if (!hasEmbeddingConfiguration()) throw new Error('SILICONFLOW_API_KEY is not configured');
    const safeLimit = Math.max(1, Math.min(10, Number.parseInt(limit, 10) || 5));
    const intentExpansion = await expandSearchIntent(query);
    const queryProfile = buildEmbeddingQuery(query, intentExpansion);
    const embedding = await createEmbedding(queryProfile.text);
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
        WHERE instr(COALESCE(p.category, ''), '避雷') = 0
        ORDER BY nearest.distance`).all(vectorBuffer(embedding), candidateLimit);

    const matches = rankSemanticRows(rows, {
        center,
        bounds,
        limit: safeLimit,
        minimumSemanticScore: queryProfile.minimumSemanticScore
    });
    if (!matches.length) {
        const hasRelevantCandidate = rows.some((row) => semanticScore(row.vector_distance) >= queryProfile.minimumSemanticScore);
        return {
            status: !rows.length ? 'index_empty' : (hasRelevantCandidate ? 'no_nearby_match' : 'no_relevant_match'),
            recommendation: null,
            recommendations: [],
            matches: []
        };
    }

    const selectedMatches = matches.slice(0, 3);
    let generatedReasons = selectedMatches.map(() => '');
    try {
        generatedReasons = await createYuyukoReasons(query, selectedMatches);
    } catch (error) {
        console.warn('DeepSeek recommendations failed:', error.message);
    }

    let deepseekReasonCount = 0;
    const selectedNames = selectedMatches.map((match) => String(match.place.name || '').trim());
    const recommendations = selectedMatches.map((match, index) => {
        let reason = String(generatedReasons[index] || '').trim();
        let reasonSource = 'fallback';
        const otherNames = selectedNames.filter((_, otherIndex) => otherIndex !== index);
        if (reason && reasonMatchesPlace(reason, selectedNames[index], otherNames)) {
            reasonSource = 'deepseek';
            deepseekReasonCount += 1;
        } else {
            if (reason) {
                console.warn(`DeepSeek recommendation mismatched ${selectedNames[index]}; using local fallback`);
            }
            reason = localYuyukoReason(query, match);
        }
        return {
            place: match.place,
            score: match.score,
            semantic_score: match.semantic_score,
            detail_completeness: match.detail_completeness,
            match_percent: Math.round(match.score * 100),
            distance_km: match.distance_km,
            in_view: match.in_view,
            reason,
            reason_source: reasonSource
        };
    });

    return {
        status: hasDeepseekConfiguration() && deepseekReasonCount === recommendations.length ? 'ok' : 'partial',
        recommendation: recommendations[0] || null,
        recommendations,
        matches
    };
}

module.exports = {
    searchSemanticPlaces,
    haversineDistanceKm,
    normalizeCenter,
    normalizeBounds,
    rankSemanticRows,
    MIN_SEMANTIC_SCORE,
    PLACE_DETAIL_WEIGHT,
    placeDetailCompleteness,
    reasonMatchesPlace,
    buildEmbeddingQuery
};
