const { db, isVectorSearchAvailable } = require('../db');
const {
    EMBEDDING_DIMENSIONS,
    createEmbedding,
    createYuyukoReason,
    hasEmbeddingConfiguration,
    hasDeepseekConfiguration
} = require('./aiClients');

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

function localYuyukoReason(query, match) {
    const place = match.place;
    const price = Number(place.per_person_cost);
    const priceText = Number.isFinite(price) && price > 0 ? `人均约 ${Math.round(price)} 元，` : '';
    const categoryText = place.category ? `它的「${String(place.category).slice(0, 30)}」分类` : '它的特色';
    return `幽幽子觉得「${place.name}」很合适～${priceText}${categoryText}和你的“${String(query).slice(0, 36)}”颇有缘分，先去尝尝看吧。`;
}

function publicPlace(row) {
    const place = { ...row };
    delete place.distance;
    return place;
}

async function searchSemanticPlaces(query, { limit = 5 } = {}) {
    if (!isVectorSearchAvailable()) throw new Error('sqlite-vec is unavailable');
    if (!hasEmbeddingConfiguration()) throw new Error('SILICONFLOW_API_KEY is not configured');
    const safeLimit = Math.max(1, Math.min(10, Number.parseInt(limit, 10) || 5));
    const embedding = await createEmbedding(`检索与这段用餐需求最匹配的地点：${query}`);
    const rows = db._raw.prepare(`WITH nearest AS (
            SELECT place_id, distance
            FROM place_vectors
            WHERE embedding MATCH ? AND k = ?
        )
        SELECT p.*, u.username AS creator_name, uu.username AS updated_by_name, nearest.distance
        FROM nearest
        JOIN Place p ON p.id = nearest.place_id
        LEFT JOIN User u ON p.creator_id = u.id
        LEFT JOIN User uu ON p.updated_by = uu.id
        ORDER BY nearest.distance`).all(vectorBuffer(embedding), safeLimit);

    const matches = rows.map((row) => ({
        place: publicPlace(row),
        score: semanticScore(row.distance),
        distance: Number(row.distance)
    }));
    if (!matches.length) {
        return { status: 'index_empty', recommendation: null, matches: [] };
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
            match_percent: Math.round(matches[0].score * 100),
            reason,
            reason_source: reasonSource
        },
        matches
    };
}

module.exports = { searchSemanticPlaces };
