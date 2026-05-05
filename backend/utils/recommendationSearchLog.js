const crypto = require('crypto');
const { db } = require('../db');

function trimString(value, maxLength = 255) {
    if (value == null) return null;
    const text = String(value).trim();
    return text ? text.slice(0, maxLength) : null;
}

function stringifyJson(value) {
    if (value == null) return null;
    if (Array.isArray(value) && value.length === 0) return null;
    try {
        return JSON.stringify(value);
    } catch (err) {
        return null;
    }
}

function readPointValue(point, key) {
    const value = point && point[key];
    return Number.isFinite(value) ? value : null;
}

function readClientIpHash(req) {
    const forwarded = trimString(req.get('x-forwarded-for'), 256);
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : trimString(req.ip, 128);
    if (!clientIp) return null;
    return crypto.createHash('sha256').update(clientIp).digest('hex');
}

function buildRuleParseSnapshot(parsedIntent) {
    const ruleFirstIntent = parsedIntent && parsedIntent.ruleFirstIntent;
    if (!ruleFirstIntent) return null;
    return stringifyJson({
        source: ruleFirstIntent.source || null,
        mode: ruleFirstIntent.mode || null,
        anchorQuery: ruleFirstIntent.anchorQuery || null,
        searchQuery: ruleFirstIntent.searchQuery || null,
        parseCoverage: ruleFirstIntent.parseCoverage || null,
        parseConfidence: ruleFirstIntent.parseConfidence || null,
        modifierTokens: ruleFirstIntent.modifierTokens || [],
        unresolvedTokens: ruleFirstIntent.unresolvedTokens || [],
        coverageReasons: ruleFirstIntent.coverageReasons || [],
    });
}

function logRecommendationSearch({ req, rawQuery, requestedSortBy, elapsedMs, result }) {
    const query = trimString(rawQuery, 500);
    if (!query) return;

    const normalizedIntent = result && result.normalizedIntent ? result.normalizedIntent : {};
    const debug = result && result.debug ? result.debug : {};
    const parsedIntent = debug && debug.parsedIntent ? debug.parsedIntent : {};
    const candidates = Array.isArray(result && result.candidates) ? result.candidates : [];

    try {
        db.run(
            `INSERT INTO RecommendationSearchLog (
                search_session_id,
                user_id,
                search_source,
                raw_query,
                normalized_query,
                parse_source,
                parse_mode,
                parse_coverage,
                parse_confidence,
                needs_second_pass,
                modifier_tokens,
                unresolved_tokens,
                coverage_reasons,
                anchor_query,
                anchor_name,
                requested_sort_by,
                actual_sort_by,
                requested_center_lat,
                requested_center_lng,
                resolved_center_lat,
                resolved_center_lng,
                provider,
                provider_result_count,
                candidate_count,
                first_candidate_id,
                first_candidate_name,
                fallback_used,
                rule_parse_snapshot,
                ip_hash,
                user_agent,
                elapsed_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                trimString(req.get('x-search-session'), 128),
                trimString(req.user && req.user.id, 64),
                trimString(req.get('x-search-source'), 32) || 'unknown',
                query,
                trimString(normalizedIntent.query || parsedIntent.searchQuery, 255),
                trimString(normalizedIntent.parseSource || parsedIntent.source, 32),
                trimString(normalizedIntent.mode || parsedIntent.mode, 32),
                trimString(normalizedIntent.parseCoverage || parsedIntent.parseCoverage, 16),
                trimString(normalizedIntent.parseConfidence || parsedIntent.parseConfidence, 16),
                normalizedIntent.needsSecondPass || parsedIntent.needsSecondPass ? 1 : 0,
                stringifyJson(normalizedIntent.modifierTokens || parsedIntent.modifierTokens || []),
                stringifyJson(normalizedIntent.unresolvedTokens || parsedIntent.unresolvedTokens || []),
                stringifyJson(normalizedIntent.coverageReasons || parsedIntent.coverageReasons || []),
                trimString(normalizedIntent.anchorQuery || parsedIntent.anchorQuery, 255),
                trimString(normalizedIntent.anchor && normalizedIntent.anchor.name, 255),
                trimString(requestedSortBy, 16),
                trimString(normalizedIntent.sortBy, 16),
                readPointValue(normalizedIntent.requestedCenter, 'lat'),
                readPointValue(normalizedIntent.requestedCenter, 'lng'),
                readPointValue(normalizedIntent.center, 'lat'),
                readPointValue(normalizedIntent.center, 'lng'),
                trimString(normalizedIntent.provider, 64),
                Number.isFinite(debug.searchReported) ? debug.searchReported : null,
                candidates.length,
                trimString(candidates[0] && candidates[0].id, 64),
                trimString(candidates[0] && candidates[0].name, 255),
                parsedIntent.fallbackUsed ? 1 : 0,
                buildRuleParseSnapshot(parsedIntent),
                readClientIpHash(req),
                trimString(req.get('user-agent'), 512),
                Number.isFinite(elapsedMs) ? elapsedMs : null,
            ],
            (err) => {
                if (err) console.error('Failed to write recommendation search log:', err.message);
            }
        );
    } catch (err) {
        console.error('Exception when writing recommendation search log:', err && err.message);
    }
}

module.exports = {
    logRecommendationSearch,
};