function isRecommendationDebugEnabled() {
    return /^(1|true|yes|on)$/i.test(String(process.env.DEBUG_RECOMMENDATION_REQUESTS || ''));
}

function safeStringify(value) {
    try {
        return JSON.stringify(value);
    } catch (err) {
        return JSON.stringify({ error: err.message || String(err) });
    }
}

function logRecommendationDebug(event, payload) {
    if (!isRecommendationDebugEnabled()) return;
    const stamp = new Date().toISOString();
    console.log(`[recommendation][${stamp}][${event}] ${safeStringify(payload)}`);
}

function toDebugError(err) {
    return {
        message: err?.message || String(err),
        stack: err?.stack || null,
    };
}

module.exports = {
    isRecommendationDebugEnabled,
    logRecommendationDebug,
    toDebugError,
};