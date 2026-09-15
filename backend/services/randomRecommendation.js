const { haversineDistanceKm, placeDetailCompleteness } = require('./semanticSearch');
const { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } = require('./aiClients');
const { ALGORITHM_VERSION } = require('./userPreferenceService');

const RADIUS_KM = 5;
const MIN_CANDIDATES = 5;
const EMPTY_MESSAGE = '附近好像没有结果，换个地方试试吧';
const MAX_PERSONALIZATION = 0.8;

function normalizedVector(values) {
    if (!values || values.length !== EMBEDDING_DIMENSIONS) return null;
    let squaredNorm = 0;
    for (const value of values) {
        if (!Number.isFinite(value)) return null;
        squaredNorm += value * value;
    }
    const norm = Math.sqrt(squaredNorm);
    return Number.isFinite(norm) && norm > 1e-12 ? Array.from(values, (value) => value / norm) : null;
}

function readPlaceVector(blob) {
    if (!Buffer.isBuffer(blob) || blob.length !== EMBEDDING_DIMENSIONS * 4) return null;
    return normalizedVector(Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => blob.readFloatLE(index * 4)));
}

function personalizeCandidates(database, candidates, preference) {
    const fallback = { candidates, personalized: false };
    if (!candidates.length || preference?.status !== 'ready'
        || preference.model !== EMBEDDING_MODEL || preference.dimensions !== EMBEDDING_DIMENSIONS
        || preference.algorithm_version !== ALGORITHM_VERSION) return fallback;
    const userVector = normalizedVector(preference.vector);
    const vectorCount = Number(preference.vector_place_count);
    const sourceCount = Number(preference.source_place_count);
    if (!userVector || !Number.isFinite(vectorCount) || !Number.isFinite(sourceCount)
        || vectorCount <= 0 || sourceCount < vectorCount) return fallback;

    // Sparse profiles and incomplete vector coverage have less influence. At
    // least 20% of the original distribution remains available for discovery.
    const strength = MAX_PERSONALIZATION * Math.min(1, vectorCount / 5) * (vectorCount / sourceCount);
    const readVector = database.prepare(`SELECT v.embedding FROM place_vectors v
        JOIN Place p ON p.id = v.place_id WHERE v.place_id = ? AND p.has_vector = 1`);
    let hasPositiveMatch = false;
    const preferred = candidates.map((candidate) => {
        const vector = readPlaceVector(readVector.get(BigInt(candidate.place.id))?.embedding);
        let similarity = 0;
        if (vector) {
            similarity = Math.max(0, Math.min(1, vector.reduce((sum, value, index) => sum + value * userVector[index], 0)));
            if (similarity > 0) hasPositiveMatch = true;
        }
        return candidate.weight * Math.exp(4 * similarity);
    });
    if (!hasPositiveMatch) return fallback;
    const baseTotal = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
    const preferenceTotal = preferred.reduce((sum, weight) => sum + weight, 0);
    return {
        personalized: true,
        candidates: candidates.map((candidate, index) => ({
            ...candidate,
            weight: (1 - strength) * candidate.weight + strength * preferred[index] / preferenceTotal * baseTotal
        }))
    };
}

function recommendationWeight(place, distanceKm) {
    const completeness = placeDetailCompleteness(place);
    const favorites = Math.max(0, Number(place.favorite_count) || 0);
    return 1 + 1 / (1 + distanceKm / 2)
        + 0.3 * completeness + 0.4 * favorites / (favorites + 5);
}

function nearbyCandidates(database, center) {
    // A spherical bounding box first, then exact great-circle distance. At the
    // poles or across the date line, latitude alone is a safe coarse filter.
    const angularRadius = RADIUS_KM / 6371.0088;
    const latDelta = angularRadius * 180 / Math.PI;
    const minLat = Math.max(-90, center.lat - latDelta);
    const maxLat = Math.min(90, center.lat + latDelta);
    const params = [minLat, maxLat];
    let longitudeFilter = '';
    if (minLat > -90 && maxLat < 90) {
        const lngDelta = Math.asin(Math.min(1, Math.sin(angularRadius)
            / Math.cos(center.lat * Math.PI / 180))) * 180 / Math.PI;
        if (center.lng - lngDelta >= -180 && center.lng + lngDelta <= 180) {
            longitudeFilter = ' AND p.longitude BETWEEN ? AND ?';
            params.push(center.lng - lngDelta, center.lng + lngDelta);
        }
    }
    const rows = database.prepare(`SELECT p.*, u.username AS creator_name, uu.username AS updated_by_name,
        (SELECT COUNT(DISTINCT f.user_id) FROM Favorite f WHERE f.place_id = p.id) AS favorite_count
        FROM Place p
        LEFT JOIN User u ON p.creator_id = u.id
        LEFT JOIN User uu ON p.updated_by = uu.id
        WHERE p.latitude BETWEEN ? AND ?${longitudeFilter}
        AND instr(COALESCE(p.category, ''), '避雷') = 0`).all(...params);
    return rows.flatMap((place) => {
        const distanceKm = haversineDistanceKm(center, { lat: place.latitude, lng: place.longitude });
        if (distanceKm === null || distanceKm > RADIUS_KM) return [];
        return [{ place, distanceKm, weight: recommendationWeight(place, distanceKm) }];
    });
}

function drawRecommendation(candidates, excludedIds = [], random = Math.random, personalize = null, onDecision = null) {
    // The minimum is checked BEFORE applying the short-term repeat cooldown.
    if (candidates.length < MIN_CANDIDATES) {
        return { place: null, candidateCount: candidates.length, message: EMPTY_MESSAGE };
    }
    const excluded = new Set(excludedIds.slice(-2));
    const remaining = candidates.filter(({ place }) => !excluded.has(place.id));
    // Mix distributions after cooldown filtering, preserving the exploration
    // floor within the set that can actually be drawn.
    const selection = personalize ? personalize(remaining) : { candidates: remaining, personalized: false };
    const eligible = selection.candidates;
    const total = eligible.reduce((sum, candidate) => sum + candidate.weight, 0);
    let ticket = random() * total;
    let selected = eligible[eligible.length - 1];
    for (const candidate of eligible) {
        ticket -= candidate.weight;
        if (ticket < 0) {
            selected = candidate;
            break;
        }
    }
    if (onDecision) onDecision({ selected_probability: selected.weight / total,
        candidates: eligible.map(c => ({ place_id: c.place.id, probability: c.weight / total })),
        eligible_count: eligible.length, algorithm: 'random-mixture-v1', personalized: selection.personalized });
    return { place: selected.place, distanceKm: selected.distanceKm, candidateCount: candidates.length, personalized: selection.personalized };
}

module.exports = { recommendationWeight, nearbyCandidates, drawRecommendation, personalizeCandidates, EMPTY_MESSAGE };
