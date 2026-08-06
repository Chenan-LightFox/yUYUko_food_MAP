const { createHash } = require('crypto');
const { db, isVectorSearchAvailable } = require('../db');
const {
    EMBEDDING_DIMENSIONS,
    createEmbedding,
    createEmbeddings,
    hasEmbeddingConfiguration
} = require('./aiClients');

const DEFAULT_BATCH_SIZE = 20;
const activeSyncs = new Map();

function clampInteger(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

function priceDescription(cost) {
    const amount = Number(cost);
    if (!Number.isFinite(amount) || amount <= 0) return '未提供';
    if (amount <= 30) return `约 ${Math.round(amount)} 元（平价/性价比）`;
    if (amount <= 80) return `约 ${Math.round(amount)} 元（适中）`;
    return `约 ${Math.round(amount)} 元（较高）`;
}

function formulatePlaceText(place) {
    return [
        `[店名]: ${String(place?.name || '未命名').trim()}`,
        `[分类]: ${String(place?.category || '未分类').trim()}`,
        `[人均消费]: ${priceDescription(place?.per_person_cost)}`,
        `[特色描述]: ${String(place?.description || '暂无描述').replace(/\s+/g, ' ').trim()}`
    ].join('\n');
}

function semanticFingerprint(place) {
    return createHash('sha256').update(formulatePlaceText(place)).digest('hex');
}

function vectorBuffer(embedding) {
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`expected a ${EMBEDDING_DIMENSIONS}-dimension embedding`);
    }
    const typed = new Float32Array(embedding);
    return Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
}

function vectorPlaceId(placeId) {
    try {
        return BigInt(placeId);
    } catch (_) {
        throw new Error(`invalid place id: ${placeId}`);
    }
}

function getPlace(placeId) {
    return db._raw.prepare('SELECT * FROM Place WHERE id = ?').get(placeId);
}

function markVectorPending(placeId) {
    db._raw.prepare('UPDATE Place SET has_vector = 0 WHERE id = ?').run(placeId);
}

function persistVector(placeId, embedding) {
    const transaction = db._raw.transaction(() => {
        const id = vectorPlaceId(placeId);
        db._raw.prepare('DELETE FROM place_vectors WHERE place_id = ?').run(id);
        db._raw.prepare('INSERT INTO place_vectors(place_id, embedding) VALUES (?, ?)')
            .run(id, vectorBuffer(embedding));
        db._raw.prepare(`UPDATE Place
                         SET has_vector = 1, vector_updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?`).run(placeId);
    });
    transaction();
}

async function syncPlaceVector(placeId) {
    if (!isVectorSearchAvailable()) throw new Error('sqlite-vec is unavailable');
    if (!hasEmbeddingConfiguration()) throw new Error('SILICONFLOW_API_KEY is not configured');

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const place = getPlace(placeId);
        if (!place) {
            deletePlaceVector(placeId);
            return { status: 'deleted', placeId: Number(placeId) };
        }
        const beforeFingerprint = semanticFingerprint(place);
        markVectorPending(placeId);
        const embedding = await createEmbedding(formulatePlaceText(place));
        const current = getPlace(placeId);
        if (!current) {
            deletePlaceVector(placeId);
            return { status: 'deleted', placeId: Number(placeId) };
        }
        if (semanticFingerprint(current) !== beforeFingerprint) continue;
        persistVector(placeId, embedding);
        return { status: 'updated', placeId: Number(placeId) };
    }

    markVectorPending(placeId);
    throw new Error('place changed repeatedly while its vector was being generated');
}

function queuePlaceVectorSync(placeId) {
    const key = String(placeId);
    if (activeSyncs.has(key)) return activeSyncs.get(key);
    const job = syncPlaceVector(placeId)
        .catch((error) => {
            try { markVectorPending(placeId); } catch (_) { }
            console.warn(`Vector sync failed for place ${placeId}:`, error.message);
            return { status: 'failed', placeId: Number(placeId) };
        })
        .finally(() => activeSyncs.delete(key));
    activeSyncs.set(key, job);
    return job;
}

function deletePlaceVector(placeId) {
    if (!isVectorSearchAvailable()) return;
    db._raw.prepare('DELETE FROM place_vectors WHERE place_id = ?').run(vectorPlaceId(placeId));
}

function getPendingPlaces(limit = DEFAULT_BATCH_SIZE) {
    const safeLimit = clampInteger(limit, DEFAULT_BATCH_SIZE, 1, 50);
    return db._raw.prepare(`SELECT * FROM Place
                            WHERE COALESCE(has_vector, 0) = 0
                            ORDER BY COALESCE(vector_updated_at, created_time), id
                            LIMIT ?`).all(safeLimit);
}

async function backfillPendingBatch(limit = DEFAULT_BATCH_SIZE) {
    if (!isVectorSearchAvailable()) throw new Error('sqlite-vec is unavailable');
    const places = getPendingPlaces(limit);
    if (!places.length) return { attempted: 0, updated: 0 };
    if (!hasEmbeddingConfiguration()) throw new Error('SILICONFLOW_API_KEY is not configured');

    const fingerprints = places.map(semanticFingerprint);
    const embeddings = await createEmbeddings(places.map(formulatePlaceText));
    let updated = 0;
    for (let index = 0; index < places.length; index += 1) {
        const current = getPlace(places[index].id);
        if (!current || semanticFingerprint(current) !== fingerprints[index]) continue;
        persistVector(current.id, embeddings[index]);
        updated += 1;
    }
    return { attempted: places.length, updated };
}

async function backfillAllPending({ batchSize = DEFAULT_BATCH_SIZE } = {}) {
    const safeBatchSize = clampInteger(batchSize, DEFAULT_BATCH_SIZE, 1, 50);
    let attempted = 0;
    let updated = 0;
    while (true) {
        const result = await backfillPendingBatch(safeBatchSize);
        attempted += result.attempted;
        updated += result.updated;
        if (result.attempted === 0 || result.updated === 0) break;
    }
    return { attempted, updated };
}

function startVectorRetryWorker() {
    if (!isVectorSearchAvailable() || !hasEmbeddingConfiguration()) return null;
    if (String(process.env.VECTOR_AUTO_BACKFILL || 'true').toLowerCase() === 'false') return null;
    const intervalMs = clampInteger(process.env.VECTOR_RETRY_INTERVAL_MS, 10 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000);
    let running = false;
    const run = async () => {
        if (running) return;
        running = true;
        try {
            const result = await backfillPendingBatch(clampInteger(process.env.VECTOR_BATCH_SIZE, DEFAULT_BATCH_SIZE, 1, 50));
            if (result.updated > 0) console.log(`Vector retry worker updated ${result.updated} place(s).`);
        } catch (error) {
            console.warn('Vector retry worker failed:', error.message);
        } finally {
            running = false;
        }
    };
    const initialTimer = setTimeout(run, 5000);
    const interval = setInterval(run, intervalMs);
    initialTimer.unref?.();
    interval.unref?.();
    return interval;
}

module.exports = {
    formulatePlaceText,
    syncPlaceVector,
    queuePlaceVectorSync,
    deletePlaceVector,
    backfillPendingBatch,
    backfillAllPending,
    startVectorRetryWorker
};
