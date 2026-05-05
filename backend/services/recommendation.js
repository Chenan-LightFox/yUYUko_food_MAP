const REQUEST_TIMEOUT_MS = 15000;
const { logRecommendationDebug, toDebugError } = require('../utils/recommendationDebug');
const DEFAULT_RECOMMENDATION_LIMIT = 20;
const DEFAULT_AMAP_TYPES = process.env.AMAP_RECOMMENDATION_TYPES || '050000';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
const DEFAULT_DEEPSEEK_TIMEOUT_MS = (() => {
    const value = Number(process.env.DEEPSEEK_TIMEOUT_MS);
    return Number.isFinite(value) && value > 0 ? value : REQUEST_TIMEOUT_MS;
})();
const DEFAULT_AMAP_RADIUS_METERS = (() => {
    const value = Number(process.env.AMAP_RECOMMENDATION_RADIUS_METERS);
    return Number.isFinite(value) && value > 0 ? Math.min(value, 50000) : 3000;
})();
const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_DETAIL_LIMIT = 10;
const DEFAULT_SHOW_FIELDS = 'business,photos,navi';

const NEARBY_INTENT_PATTERNS = [
    /^(?:在)?(.+?)(?:附近|旁边|周边|边上|周围)(?:的)?(.+)$/,
    /^(.+?)(?:附近|旁边|周边|边上|周围)(?:想吃|想找|找|吃|有没有)?(.+)$/,
];

const SUPPORTED_MODIFIER_RULES = [
    { label: '高评分', patterns: [/高评分|评分高|高分|评分好的?|评价高|口碑好/g] },
    { label: '有特色', patterns: [/有特色|特色|有特点|招牌|必吃|值得试/g] },
    { label: '平价', patterns: [/便宜|平价|实惠|性价比高/g] },
    { label: '人气高', patterns: [/人气高|热门|火爆|网红|排队/g] },
];

const UNSUPPORTED_PREFERENCE_RULES = [
    { label: '好吃', patterns: [/好吃|好喝/g] },
    { label: '推荐', patterns: [/推荐|来点/g] },
    { label: '适合约会', patterns: [/适合约会|约会/g] },
    { label: '环境好', patterns: [/环境好|氛围好|安静/g] },
    { label: '夜宵', patterns: [/夜宵|宵夜|深夜/g] },
];

const QUERY_NOISE_PATTERNS = [
    /有什么|有啥|有没有|帮我找|帮我搜|我想吃|我想找|想吃点|想吃|想找|找一下|找|吃|求推荐|推荐一下|推荐/g,
    /^(?:的)+|(?:的)+$/g,
];

const MULTI_ANCHOR_HINT_PATTERNS = [
    /、|\/|,|，|或者|或|及|与|跟/g,
    /和[A-Za-z0-9]+/g,
    /[A-Za-z0-9]+和/g,
];

const NEARBY_HINT_PATTERN = /附近|旁边|周边|边上|周围/;

function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
}

function compareOptionalNumber(left, right, asc = true) {
    const leftValid = Number.isFinite(left);
    const rightValid = Number.isFinite(right);
    if (!leftValid && !rightValid) return 0;
    if (!leftValid) return 1;
    if (!rightValid) return -1;
    return asc ? left - right : right - left;
}

function uniqueStrings(list) {
    return Array.from(new Set((list || []).filter(Boolean)));
}

function testPattern(pattern, value) {
    pattern.lastIndex = 0;
    return pattern.test(value);
}

function replacePattern(value, pattern, replacement) {
    pattern.lastIndex = 0;
    return value.replace(pattern, replacement);
}

function haversineDistance(lat1, lng1, lat2, lng2) {
    const toRad = (value) => value * Math.PI / 180;
    const radius = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return radius * c;
}

function readString(value) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumberLike(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}

function readLooseNumber(value) {
    if (!value) return undefined;
    const match = String(value).match(/\d+(?:\.\d+)?/);
    if (!match) return undefined;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function readObject(value) {
    if (!value || Array.isArray(value) || typeof value !== 'object') return undefined;
    return value;
}

function readArray(value) {
    return Array.isArray(value) ? value : [];
}

function pickString(...values) {
    for (const value of values) {
        const stringValue = readString(value);
        if (stringValue) return stringValue;
    }
    return undefined;
}

function collectRuleLabels(text, rules) {
    const source = String(text || '');
    const labels = [];
    for (const rule of rules) {
        if (rule.patterns.some((pattern) => testPattern(pattern, source))) {
            labels.push(rule.label);
        }
    }
    return uniqueStrings(labels);
}

function stripRulePatterns(text, rules) {
    let value = String(text || '');
    for (const rule of rules) {
        for (const pattern of rule.patterns) {
            value = replacePattern(value, pattern, ' ');
        }
    }
    return value;
}

function stripNoisePatterns(text) {
    let value = String(text || '');
    for (const pattern of QUERY_NOISE_PATTERNS) {
        value = replacePattern(value, pattern, ' ');
    }
    return value.replace(/[，。！？、]/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasMultiAnchorHint(anchorQuery) {
    const source = String(anchorQuery || '').replace(/文和友/g, '');
    return MULTI_ANCHOR_HINT_PATTERNS.some((pattern) => testPattern(pattern, source));
}

function extractQueryDetails(fragment) {
    const original = String(fragment || '').trim();
    const modifierTokens = collectRuleLabels(original, SUPPORTED_MODIFIER_RULES);
    const unresolvedTokens = collectRuleLabels(original, UNSUPPORTED_PREFERENCE_RULES);
    let core = stripRulePatterns(original, SUPPORTED_MODIFIER_RULES);
    core = stripRulePatterns(core, UNSUPPORTED_PREFERENCE_RULES);
    core = stripNoisePatterns(core);
    core = cleanIntentFragment(core);
    core = core.replace(/^(?:的)+/, '').replace(/(?:的)+$/, '').trim();

    return {
        coreQuery: core,
        modifierTokens,
        unresolvedTokens,
    };
}

function assessParsedIntent(rawQuery, parsedIntent) {
    const result = {
        ...parsedIntent,
        modifierTokens: uniqueStrings(parsedIntent.modifierTokens || []),
        unresolvedTokens: uniqueStrings(parsedIntent.unresolvedTokens || []),
    };

    let parseCoverage = 'full';
    let parseConfidence = result.source === 'deepseek' ? 'high' : 'medium';
    const coverageReasons = [];

    if (!result.searchQuery) {
        parseCoverage = 'none';
        parseConfidence = 'low';
        coverageReasons.push('missing-core-query');
    }

    if (NEARBY_HINT_PATTERN.test(String(rawQuery || '')) && !result.anchorQuery) {
        if (parseCoverage === 'full') parseCoverage = 'partial';
        parseConfidence = 'low';
        coverageReasons.push('nearby-without-anchor');
    }

    if (result.mode === 'around-anchor' && result.anchorQuery) {
        if (hasMultiAnchorHint(result.anchorQuery)) {
            if (parseCoverage === 'full') parseCoverage = 'partial';
            parseConfidence = 'low';
            coverageReasons.push('multiple-anchor');
        }
        if (normalizeText(result.anchorQuery).length <= 3) {
            if (parseConfidence === 'high') parseConfidence = 'medium';
            else if (parseConfidence === 'medium') parseConfidence = 'low';
            coverageReasons.push('short-anchor');
        }
    }

    if (result.unresolvedTokens.length > 0) {
        if (parseCoverage === 'full') parseCoverage = 'partial';
        if (parseConfidence === 'high') parseConfidence = 'medium';
        coverageReasons.push('unresolved-preference');
    }

    if (result.modifierTokens.length > 0) {
        coverageReasons.push('modifier-second-pass');
    }

    return {
        ...result,
        parseCoverage,
        parseConfidence,
        needsSecondPass: result.modifierTokens.length > 0,
        coverageReasons: uniqueStrings(coverageReasons),
    };
}

function coverageScore(value) {
    if (value === 'full') return 2;
    if (value === 'partial') return 1;
    return 0;
}

function confidenceScore(value) {
    if (value === 'high') return 2;
    if (value === 'medium') return 1;
    return 0;
}

function shouldAttemptDeepseekFallback(ruleIntent) {
    if (!DEEPSEEK_API_KEY) return false;
    if (!ruleIntent) return true;
    if (ruleIntent.parseCoverage === 'none') return true;
    const reasons = new Set(ruleIntent.coverageReasons || []);
    return reasons.has('multiple-anchor')
        || reasons.has('nearby-without-anchor')
        || reasons.has('short-anchor');
}

function isIntentBetter(candidateIntent, baselineIntent) {
    const candidateScore = coverageScore(candidateIntent.parseCoverage) * 10 + confidenceScore(candidateIntent.parseConfidence);
    const baselineScore = coverageScore(baselineIntent.parseCoverage) * 10 + confidenceScore(baselineIntent.parseConfidence);
    if (candidateScore !== baselineScore) return candidateScore > baselineScore;

    const candidateReasonCount = uniqueStrings(candidateIntent.coverageReasons || []).length;
    const baselineReasonCount = uniqueStrings(baselineIntent.coverageReasons || []).length;
    if (candidateReasonCount !== baselineReasonCount) return candidateReasonCount < baselineReasonCount;

    const candidateUnresolved = uniqueStrings(candidateIntent.unresolvedTokens || []).length;
    const baselineUnresolved = uniqueStrings(baselineIntent.unresolvedTokens || []).length;
    return candidateUnresolved < baselineUnresolved;
}

function parseJsonObject(text) {
    if (!text) return null;
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (err) {
        // Ignore and try to extract an object payload from mixed text.
    }

    const match = String(text).match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        const parsed = JSON.parse(match[0]);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (err) {
        return null;
    }
}

async function deepseekChat(messages, opts = {}) {
    if (!DEEPSEEK_API_KEY) return '';

    const payload = {
        model: DEEPSEEK_MODEL,
        temperature: opts.temperature == null ? 0 : opts.temperature,
        max_tokens: opts.maxTokens == null ? 200 : opts.maxTokens,
        messages,
    };

    const startedAt = Date.now();

    try {
        const response = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(opts.timeoutMs || DEFAULT_DEEPSEEK_TIMEOUT_MS),
        });

        logRecommendationDebug('deepseek.http', {
            status: response.status,
            elapsedMs: Date.now() - startedAt,
            model: DEEPSEEK_MODEL,
        });

        if (!response.ok) return '';
        const data = await response.json();
        return data?.choices?.[0]?.message?.content || '';
    } catch (err) {
        logRecommendationDebug('deepseek.error', {
            elapsedMs: Date.now() - startedAt,
            error: toDebugError(err),
        });
        return '';
    }
}

function cleanIntentFragment(value) {
    return String(value || '')
        .replace(/^(?:在|想吃|想找|找|吃|有没有|有没|附近的|附近|周边的|周边|旁边的|旁边|周围的|周围|边上的|边上)+/, '')
        .replace(/[，。！？、]+$/g, '')
        .replace(/\s+/g, ' ')
        .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, '$1$2')
        .trim();
}

function parseNearbyIntentByRule(query) {
    const trimmed = String(query || '').trim();
    for (const pattern of NEARBY_INTENT_PATTERNS) {
        const match = trimmed.match(pattern);
        if (!match) continue;
        const anchorQuery = cleanIntentFragment(match[1]);
        const details = extractQueryDetails(match[2]);
        const nearbyQuery = cleanIntentFragment(details.coreQuery || match[2]);
        if (!anchorQuery || !nearbyQuery) continue;
        return {
            mode: 'around-anchor',
            source: 'rule',
            anchorQuery,
            searchQuery: nearbyQuery,
            rewrittenQuery: nearbyQuery,
            modifierTokens: details.modifierTokens,
            unresolvedTokens: details.unresolvedTokens,
        };
    }
    return null;
}

async function parseNearbyIntentByDeepseek(query) {
    if (!DEEPSEEK_API_KEY) return null;

    const content = await deepseekChat([
        {
            role: 'system',
            content: 'You parse Chinese map food queries. Return ONLY a JSON object with keys: mode, anchorQuery, searchQuery, rewrittenQuery. Use mode="around-anchor" only when the query clearly means finding food near a landmark, mall, scenic spot, address, or business, for example: 长沙文和友附近的炸鸡. anchorQuery should contain the landmark. searchQuery should contain the desired food or cuisine. rewrittenQuery should be the concise AMap food search query. Otherwise use mode="plain" and leave anchorQuery empty.',
        },
        {
            role: 'user',
            content: query,
        }
    ], { temperature: 0, maxTokens: 180 });

    const parsed = parseJsonObject(content);
    if (!parsed) return null;

    const mode = parsed.mode === 'around-anchor' ? 'around-anchor' : 'plain';
    const anchorQuery = cleanIntentFragment(parsed.anchorQuery);
    const details = extractQueryDetails(parsed.searchQuery || parsed.rewrittenQuery || query);
    const searchQuery = cleanIntentFragment(details.coreQuery || parsed.searchQuery || parsed.rewrittenQuery || query);
    const rewrittenQuery = cleanIntentFragment(parsed.rewrittenQuery || searchQuery || query);

    if (mode === 'around-anchor' && anchorQuery && searchQuery) {
        return {
            mode,
            source: 'deepseek',
            anchorQuery,
            searchQuery,
            rewrittenQuery,
            modifierTokens: details.modifierTokens,
            unresolvedTokens: details.unresolvedTokens,
        };
    }

    if (rewrittenQuery) {
        return {
            mode: 'plain',
            source: 'deepseek',
            anchorQuery: '',
            searchQuery: rewrittenQuery,
            rewrittenQuery,
            modifierTokens: details.modifierTokens,
            unresolvedTokens: details.unresolvedTokens,
        };
    }

    return null;
}

async function parseSearchIntent(query) {
    const fallbackDetails = extractQueryDetails(query);
    const ruleFirstIntent = assessParsedIntent(query, parseNearbyIntentByRule(query) || {
        mode: 'plain',
        source: 'raw',
        anchorQuery: '',
        searchQuery: cleanIntentFragment(fallbackDetails.coreQuery || String(query || '').trim()),
        rewrittenQuery: cleanIntentFragment(fallbackDetails.coreQuery || String(query || '').trim()),
        modifierTokens: fallbackDetails.modifierTokens,
        unresolvedTokens: fallbackDetails.unresolvedTokens,
    });

    let result = {
        ...ruleFirstIntent,
        ruleFirstIntent,
        fallbackUsed: false,
        fallbackSource: null,
    };

    if (shouldAttemptDeepseekFallback(ruleFirstIntent)) {
        const deepseekResult = await parseNearbyIntentByDeepseek(query);
        if (deepseekResult) {
            const deepseekIntent = assessParsedIntent(query, deepseekResult);
            if (isIntentBetter(deepseekIntent, ruleFirstIntent)) {
                result = {
                    ...deepseekIntent,
                    ruleFirstIntent,
                    fallbackUsed: true,
                    fallbackSource: 'deepseek',
                };
            }
        }
    }

    logRecommendationDebug('query.parse', {
        rawQuery: query,
        source: result.source,
        mode: result.mode,
        anchorQuery: result.anchorQuery || null,
        searchQuery: result.searchQuery || null,
        modifierTokens: result.modifierTokens,
        unresolvedTokens: result.unresolvedTokens,
        parseCoverage: result.parseCoverage,
        parseConfidence: result.parseConfidence,
        needsSecondPass: result.needsSecondPass,
        coverageReasons: result.coverageReasons,
        fallbackUsed: result.fallbackUsed,
        fallbackSource: result.fallbackSource,
        ruleFirstSource: ruleFirstIntent.source,
        ruleFirstCoverage: ruleFirstIntent.parseCoverage,
        ruleFirstConfidence: ruleFirstIntent.parseConfidence,
        ruleFirstReasons: ruleFirstIntent.coverageReasons,
        ruleFirstUnresolvedTokens: ruleFirstIntent.unresolvedTokens,
        deepseekEnabled: Boolean(DEEPSEEK_API_KEY),
    });

    return result;
}

function resolveAmapServiceKey() {
    return process.env.AMAP_WEB_SERVICE_KEY || process.env.AMAP_KEY || '';
}

async function fetchJson(url, meta = {}) {
    const startedAt = Date.now();
    const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    logRecommendationDebug('provider.http', {
        action: meta.action || 'unknown',
        url: `${url.origin}${url.pathname}`,
        query: meta.query || null,
        center: meta.center || null,
        sortBy: meta.sortBy || null,
        ids: meta.ids || null,
        status: response.status,
        elapsedMs: Date.now() - startedAt,
    });

    if (!response.ok) {
        throw new Error(`AMap request failed: HTTP ${response.status} ${response.statusText}`);
    }

    return await response.json();
}

function assertAmapSuccess(response, action) {
    if (response && response.status === '1') return;
    throw new Error(`${action}失败: ${response?.info || '未知错误'} (${response?.infocode || '无 infocode'})`);
}

async function searchAround({ key, query, center, radiusMeters, sortBy }) {
    const url = new URL('https://restapi.amap.com/v5/place/around');
    url.searchParams.set('key', key);
    url.searchParams.set('location', `${center.lng},${center.lat}`);
    url.searchParams.set('radius', String(radiusMeters));
    url.searchParams.set('types', DEFAULT_AMAP_TYPES);
    url.searchParams.set('sortrule', sortBy === 'distance' ? 'distance' : 'weight');
    url.searchParams.set('page_size', String(DEFAULT_PAGE_SIZE));
    url.searchParams.set('page_num', '1');
    url.searchParams.set('show_fields', DEFAULT_SHOW_FIELDS);
    url.searchParams.set('output', 'json');
    if (query) url.searchParams.set('keywords', query);

    const response = await fetchJson(url, {
        action: 'amap.searchAround',
        query,
        center,
        sortBy,
    });
    assertAmapSuccess(response, '高德周边搜索');
    logRecommendationDebug('provider.result', {
        action: 'amap.searchAround',
        query,
        count: Number(response.count || (Array.isArray(response.pois) ? response.pois.length : 0)),
        info: response.info || null,
    });
    return response;
}

async function searchText({ key, query, types = DEFAULT_AMAP_TYPES, pageSize = DEFAULT_PAGE_SIZE, showFields = DEFAULT_SHOW_FIELDS, action = 'amap.searchText' }) {
    const url = new URL('https://restapi.amap.com/v5/place/text');
    url.searchParams.set('key', key);
    if (types) url.searchParams.set('types', types);
    url.searchParams.set('page_size', String(pageSize));
    url.searchParams.set('page_num', '1');
    url.searchParams.set('show_fields', showFields);
    url.searchParams.set('output', 'json');
    url.searchParams.set('keywords', query);

    const response = await fetchJson(url, {
        action,
        query,
    });
    assertAmapSuccess(response, '高德关键字搜索');
    logRecommendationDebug('provider.result', {
        action,
        query,
        count: Number(response.count || (Array.isArray(response.pois) ? response.pois.length : 0)),
        info: response.info || null,
    });
    return response;
}

function scoreAnchorCandidate(poi, anchorQuery, currentCenter, index) {
    const term = normalizeText(anchorQuery);
    const name = normalizeText(poi.name);
    const address = normalizeText(poi.address);

    let score = Math.max(0, 5 - index);
    if (name === term) score += 100;
    else if (name.includes(term)) score += 80;
    else if (term.includes(name) && name.length >= 2) score += 50;
    if (address && address.includes(term)) score += 20;

    let distanceFromCurrentCenter;
    if (currentCenter && Number.isFinite(currentCenter.lat) && Number.isFinite(currentCenter.lng) && Number.isFinite(poi.latitude) && Number.isFinite(poi.longitude)) {
        distanceFromCurrentCenter = haversineDistance(currentCenter.lat, currentCenter.lng, poi.latitude, poi.longitude);
        if (distanceFromCurrentCenter < 5000) score += 20;
        else if (distanceFromCurrentCenter < 20000) score += 10;
    }

    return {
        ...poi,
        anchorScore: score,
        distanceFromCurrentCenter,
    };
}

async function resolveAnchorPoi({ key, anchorQuery, currentCenter }) {
    const response = await searchText({
        key,
        query: anchorQuery,
        types: '',
        pageSize: 5,
        showFields: 'business,navi',
        action: 'amap.resolveAnchorText',
    });
    const searchPois = Array.isArray(response.pois) ? response.pois : [];
    const normalizedPois = searchPois
        .map(normalizePoi)
        .filter((poi) => poi.id && poi.name && Number.isFinite(poi.longitude) && Number.isFinite(poi.latitude));

    const resolved = normalizedPois
        .map((poi, index) => scoreAnchorCandidate(poi, anchorQuery, currentCenter, index))
        .sort((left, right) => {
            if (left.anchorScore !== right.anchorScore) return right.anchorScore - left.anchorScore;
            return compareOptionalNumber(left.distanceFromCurrentCenter, right.distanceFromCurrentCenter, true);
        })[0] || null;

    logRecommendationDebug('anchor.resolve', {
        anchorQuery,
        resolved: resolved ? {
            id: resolved.id,
            name: resolved.name,
            address: resolved.address,
            latitude: resolved.latitude,
            longitude: resolved.longitude,
        } : null,
        candidateCount: normalizedPois.length,
    });

    return resolved;
}

async function fetchPoiDetails({ key, ids }) {
    if (!ids.length) return [];

    const url = new URL('https://restapi.amap.com/v5/place/detail');
    url.searchParams.set('key', key);
    url.searchParams.set('id', ids.join('|'));
    url.searchParams.set('show_fields', DEFAULT_SHOW_FIELDS);
    url.searchParams.set('output', 'json');

    const response = await fetchJson(url, {
        action: 'amap.fetchPoiDetails',
        ids,
    });
    assertAmapSuccess(response, '高德详情查询');
    logRecommendationDebug('provider.result', {
        action: 'amap.fetchPoiDetails',
        ids,
        count: Array.isArray(response.pois) ? response.pois.length : 0,
        info: response.info || null,
    });
    return response.pois || [];
}

function mergePoiData(basePoi, detailPoi) {
    if (!detailPoi) return basePoi;
    const merged = {
        ...basePoi,
        ...detailPoi,
    };

    const baseBusiness = readObject(basePoi.business) || {};
    const detailBusiness = readObject(detailPoi.business) || {};
    merged.business = {
        ...baseBusiness,
        ...detailBusiness,
    };

    if (basePoi.distance !== undefined) {
        merged.distance = basePoi.distance;
    }

    if (basePoi.photos !== undefined || detailPoi.photos !== undefined) {
        merged.photos = detailPoi.photos !== undefined ? detailPoi.photos : basePoi.photos;
    }

    return merged;
}

function parseLocation(location) {
    const raw = String(location || '');
    if (!raw.includes(',')) return { longitude: undefined, latitude: undefined };
    const [lngRaw, latRaw] = raw.split(',');
    return {
        longitude: readNumberLike(lngRaw),
        latitude: readNumberLike(latRaw),
    };
}

function normalizePoi(poi) {
    const business = readObject(poi.business) || {};
    const photos = readArray(poi.photos)
        .map((item) => readObject(item))
        .filter(Boolean);
    const { longitude, latitude } = parseLocation(readString(poi.location));

    return {
        id: readString(poi.id) || '',
        name: readString(poi.name) || '',
        adname: readString(poi.adname),
        type: readString(poi.type),
        typecode: readString(poi.typecode),
        address: readString(poi.address),
        location: readString(poi.location),
        longitude,
        latitude,
        distanceMeters: readNumberLike(poi.distance),
        rating: pickString(business.rating, poi.rating),
        cost: pickString(business.cost, poi.cost),
        tag: pickString(business.tag, poi.tag),
        atag: pickString(poi.atag),
        businessArea: pickString(business.business_area, poi.business_area),
        opentimeToday: pickString(business.opentime_today, poi.opentime_today),
        opentimeWeek: pickString(business.opentime_week, poi.opentime_week),
        tel: pickString(business.tel, poi.tel),
        photoCount: photos.length,
        firstPhotoUrl: pickString(photos[0] && photos[0].url),
    };
}

function distanceToScore(distanceMeters) {
    if (!Number.isFinite(distanceMeters)) return 0;
    if (distanceMeters <= 500) return 22;
    if (distanceMeters <= 1000) return 18;
    if (distanceMeters <= 2000) return 14;
    if (distanceMeters <= 3000) return 10;
    if (distanceMeters <= 5000) return 6;
    return 2;
}

function completenessScore(poi) {
    let score = 0;
    if (poi.rating) score += 6;
    if (poi.cost) score += 5;
    if (poi.tag) score += 5;
    if (poi.opentimeToday) score += 4;
    if (poi.photoCount > 0) score += 3;
    return score;
}

function computeModifierScore(poi, modifierTokens = []) {
    const tokens = new Set(modifierTokens || []);
    const breakdown = {};
    let total = 0;

    if (tokens.has('高评分')) {
        const bonus = Number.isFinite(poi.ratingValue)
            ? Math.max(0, Math.round((poi.ratingValue - 3.5) * 16))
            : 0;
        breakdown.highRating = bonus;
        total += bonus;
    }

    if (tokens.has('有特色')) {
        const bonus = (poi.tag ? 10 : 0) + (poi.atag ? 6 : 0) + (poi.photoCount > 0 ? 3 : 0);
        breakdown.signature = bonus;
        total += bonus;
    }

    if (tokens.has('平价')) {
        let bonus = 0;
        if (Number.isFinite(poi.costValue)) {
            if (poi.costValue <= 30) bonus = 12;
            else if (poi.costValue <= 60) bonus = 8;
            else if (poi.costValue <= 90) bonus = 3;
        }
        breakdown.budget = bonus;
        total += bonus;
    }

    if (tokens.has('人气高')) {
        const bonus = (Number.isFinite(poi.ratingValue) && poi.ratingValue >= 4.2 ? 8 : 0) + (poi.photoCount >= 3 ? 4 : 0);
        breakdown.popular = bonus;
        total += bonus;
    }

    return {
        total,
        breakdown,
    };
}

function keywordMatchScore(poi, query) {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return { score: 0, matchedFields: [] };

    const matchedFields = [];
    let score = 0;
    const name = normalizeText(poi.name);
    const atag = normalizeText(poi.atag);
    const type = normalizeText(poi.type);
    const tag = normalizeText(poi.tag);
    const address = normalizeText(poi.address);

    if (name.includes(normalizedQuery)) {
        matchedFields.push('name');
        score += 80;
    }
    if (atag && atag.includes(normalizedQuery)) {
        matchedFields.push('atag');
        score += 55;
    }
    if (type && type.includes(normalizedQuery)) {
        matchedFields.push('type');
        score += 40;
    }
    if (tag && tag.includes(normalizedQuery)) {
        matchedFields.push('tag');
        score += 30;
    }
    if (address && address.includes(normalizedQuery)) {
        matchedFields.push('address');
        score += 10;
    }

    return { score, matchedFields };
}

function formatDistance(distanceMeters) {
    if (!Number.isFinite(distanceMeters)) return '';
    if (distanceMeters < 1000) return `${Math.round(distanceMeters)}米`;
    return `${(distanceMeters / 1000).toFixed(1)}公里`;
}

function buildExplanation(poi, matchedFields, context = {}) {
    const parts = [];
    if (matchedFields.includes('name')) parts.push('名称命中');
    else if (matchedFields.includes('atag') || matchedFields.includes('type')) parts.push('分类命中');
    if (matchedFields.includes('tag')) parts.push('特色标签命中');
    if (Number.isFinite(poi.ratingValue)) parts.push(`评分 ${poi.ratingValue.toFixed(1)}`);
    if (Number.isFinite(poi.costValue)) parts.push(`人均 ${Math.round(poi.costValue)} 元`);
    const prettyDistance = formatDistance(poi.distanceMeters);
    if (prettyDistance) parts.push(`距当前位置 ${prettyDistance}`);
    if (context.anchorName) parts.push(`近 ${context.anchorName}`);
    if ((context.modifierTokens || []).includes('高评分') && Number.isFinite(poi.ratingValue)) parts.push('满足高评分偏好');
    if ((context.modifierTokens || []).includes('有特色') && (poi.tag || poi.atag)) parts.push('满足特色偏好');
    if (poi.opentimeToday) parts.push('带营业时间');
    return parts.join(' · ') || '来自高德搜索结果';
}

function buildCandidate(poi, index, query, context = {}) {
    const ratingValue = readLooseNumber(poi.rating);
    const costValue = readLooseNumber(poi.cost);
    const apiOrderScore = Math.max(0, DEFAULT_PAGE_SIZE - index);
    const keywordMatch = keywordMatchScore(poi, query);
    const ratingScore = Number.isFinite(ratingValue) ? ratingValue * 8 : 0;
    const distanceScore = distanceToScore(poi.distanceMeters);
    const metadataScore = completenessScore(poi);
    const modifierScore = computeModifierScore({ ...poi, ratingValue, costValue }, context.modifierTokens);
    const totalScore = apiOrderScore + keywordMatch.score + ratingScore + distanceScore + metadataScore + modifierScore.total;

    return {
        id: poi.id,
        source: 'amap-poi',
        sourceLabel: '高德搜索',
        name: poi.name,
        description: poi.tag || poi.businessArea || poi.type || '',
        category: poi.atag || poi.type || '餐饮服务',
        latitude: poi.latitude,
        longitude: poi.longitude,
        address: poi.address || '',
        tag: poi.tag || '',
        businessArea: poi.businessArea || '',
        rating: poi.rating || null,
        ratingValue,
        cost: poi.cost || null,
        costValue,
        photoCount: poi.photoCount || 0,
        opentimeToday: poi.opentimeToday || null,
        firstPhotoUrl: poi.firstPhotoUrl || null,
        distanceMeters: poi.distanceMeters,
        score: totalScore,
        scoreBreakdown: {
            apiOrder: apiOrderScore,
            keywordMatch: keywordMatch.score,
            rating: ratingScore,
            distance: distanceScore,
            metadata: metadataScore,
            modifier: modifierScore.total,
            modifierBreakdown: modifierScore.breakdown,
            total: totalScore,
            matchedFields: keywordMatch.matchedFields,
        },
        explanation: buildExplanation({ ...poi, ratingValue, costValue }, keywordMatch.matchedFields, context),
    };
}

function compareCandidates(left, right, sortBy) {
    if (sortBy === 'distance') {
        const distanceCompare = compareOptionalNumber(left.distanceMeters, right.distanceMeters, true);
        if (distanceCompare !== 0) return distanceCompare;
    }

    const scoreCompare = compareOptionalNumber(left.score, right.score, false);
    if (scoreCompare !== 0) return scoreCompare;

    const ratingCompare = compareOptionalNumber(left.ratingValue, right.ratingValue, false);
    if (ratingCompare !== 0) return ratingCompare;

    return String(left.name || '').localeCompare(String(right.name || ''), 'zh-Hans-CN');
}

async function searchRecommendations(opts = {}) {
    const startedAt = Date.now();
    const query = String(opts.q || '').trim();
    const requestedSortBy = opts.sortBy === 'distance' ? 'distance' : 'relevance';
    const limit = Number.isFinite(opts.limit) && opts.limit > 0
        ? Math.min(Math.floor(opts.limit), 50)
        : DEFAULT_RECOMMENDATION_LIMIT;
    const center = opts.center && Number.isFinite(opts.center.lat) && Number.isFinite(opts.center.lng)
        ? { lat: Number(opts.center.lat), lng: Number(opts.center.lng) }
        : null;
    const actualSortBy = requestedSortBy === 'distance' && !center ? 'relevance' : requestedSortBy;

    if (!query) {
        logRecommendationDebug('pipeline.empty-query', {
            requestedSortBy,
            actualSortBy,
            center,
            limit,
        });
        return {
            normalizedIntent: {
                rawQuery: query,
                query,
                provider: 'amap-web-service',
                mode: center ? 'around' : 'text',
                center,
                radiusMeters: center ? DEFAULT_AMAP_RADIUS_METERS : null,
                sortBy: actualSortBy,
                requestedSortBy,
                limit,
            },
            missingFields: ['query'],
            followUpQuestions: [],
            candidates: [],
            analysis: null,
            answer: null,
            debug: {
                searchReturned: 0,
                detailReturned: 0,
                fallbackApplied: actualSortBy !== requestedSortBy,
            },
        };
    }

    const key = resolveAmapServiceKey();
    if (!key) {
        throw new Error('AMAP_WEB_SERVICE_KEY is missing for recommendation search');
    }

    const parsedIntent = await parseSearchIntent(query);
    const finalIntent = {
        ...parsedIntent,
        modifierTokens: [...(parsedIntent.modifierTokens || [])],
        unresolvedTokens: [...(parsedIntent.unresolvedTokens || [])],
        coverageReasons: [...(parsedIntent.coverageReasons || [])],
        ruleFirstIntent: parsedIntent.ruleFirstIntent ? {
            ...parsedIntent.ruleFirstIntent,
            modifierTokens: [...(parsedIntent.ruleFirstIntent.modifierTokens || [])],
            unresolvedTokens: [...(parsedIntent.ruleFirstIntent.unresolvedTokens || [])],
            coverageReasons: [...(parsedIntent.ruleFirstIntent.coverageReasons || [])],
        } : null,
    };
    const effectiveQuery = parsedIntent.searchQuery || query;
    let effectiveCenter = center;
    let mode = center ? 'around' : 'text';
    let anchorPoi = null;

    if (parsedIntent.mode === 'around-anchor' && parsedIntent.anchorQuery) {
        anchorPoi = await resolveAnchorPoi({
            key,
            anchorQuery: parsedIntent.anchorQuery,
            currentCenter: center,
        });
        if (anchorPoi) {
            effectiveCenter = { lat: anchorPoi.latitude, lng: anchorPoi.longitude };
            mode = 'around-anchor';
        } else {
            if (finalIntent.parseCoverage === 'full') finalIntent.parseCoverage = 'partial';
            finalIntent.parseConfidence = 'low';
            finalIntent.coverageReasons = uniqueStrings([...finalIntent.coverageReasons, 'anchor-unresolved']);
        }
    }

    try {
        const searchResponse = effectiveCenter
            ? await searchAround({ key, query: effectiveQuery, center: effectiveCenter, radiusMeters: DEFAULT_AMAP_RADIUS_METERS, sortBy: actualSortBy })
            : await searchText({ key, query: effectiveQuery });
        const searchPois = Array.isArray(searchResponse.pois) ? searchResponse.pois : [];
        const detailIds = searchPois
            .map((poi) => readString(poi.id))
            .filter(Boolean)
            .slice(0, DEFAULT_DETAIL_LIMIT);
        const detailPois = await fetchPoiDetails({ key, ids: detailIds });
        const detailMap = new Map(detailPois
            .map((poi) => [readString(poi.id), poi])
            .filter(([id]) => Boolean(id)));

        const normalizedPois = searchPois
            .map((poi) => mergePoiData(poi, detailMap.get(readString(poi.id))))
            .map(normalizePoi)
            .filter((poi) => poi.id && poi.name && Number.isFinite(poi.longitude) && Number.isFinite(poi.latitude));

        const candidates = normalizedPois
            .map((poi, index) => buildCandidate(poi, index, effectiveQuery, {
                anchorName: anchorPoi?.name || '',
                modifierTokens: finalIntent.modifierTokens,
            }))
            .sort((left, right) => compareCandidates(left, right, actualSortBy))
            .slice(0, limit);

        logRecommendationDebug('pipeline.done', {
            query,
            effectiveQuery,
            mode,
            requestedSortBy,
            actualSortBy,
            limit,
            center: effectiveCenter,
            anchorQuery: parsedIntent.anchorQuery || null,
            anchorName: anchorPoi?.name || null,
            modifierTokens: finalIntent.modifierTokens,
            unresolvedTokens: finalIntent.unresolvedTokens,
            parseCoverage: finalIntent.parseCoverage,
            parseConfidence: finalIntent.parseConfidence,
            searchReported: Number(searchResponse.count || searchPois.length),
            searchReturned: searchPois.length,
            detailReturned: detailPois.length,
            candidateCount: candidates.length,
            firstCandidate: candidates[0]?.name || null,
            elapsedMs: Date.now() - startedAt,
        });

        return {
            normalizedIntent: {
                rawQuery: query,
                query: effectiveQuery,
                provider: 'amap-web-service',
                mode,
                center: effectiveCenter,
                requestedCenter: center,
                radiusMeters: effectiveCenter ? DEFAULT_AMAP_RADIUS_METERS : null,
                sortBy: actualSortBy,
                requestedSortBy,
                limit,
                parseSource: finalIntent.source,
                parseCoverage: finalIntent.parseCoverage,
                parseConfidence: finalIntent.parseConfidence,
                fallbackUsed: !!finalIntent.fallbackUsed,
                fallbackSource: finalIntent.fallbackSource || null,
                needsSecondPass: finalIntent.needsSecondPass,
                modifierTokens: finalIntent.modifierTokens,
                unresolvedTokens: finalIntent.unresolvedTokens,
                coverageReasons: finalIntent.coverageReasons,
                ruleFirstIntent: finalIntent.ruleFirstIntent,
                anchorQuery: finalIntent.anchorQuery || null,
                anchor: anchorPoi ? {
                    id: anchorPoi.id,
                    name: anchorPoi.name,
                    address: anchorPoi.address,
                    latitude: anchorPoi.latitude,
                    longitude: anchorPoi.longitude,
                } : null,
            },
            missingFields: [],
            followUpQuestions: [],
            candidates,
            analysis: null,
            answer: null,
            debug: {
                searchReported: Number(searchResponse.count || searchPois.length),
                searchReturned: searchPois.length,
                detailReturned: detailPois.length,
                fallbackApplied: actualSortBy !== requestedSortBy,
                deepseekEnabled: Boolean(DEEPSEEK_API_KEY),
                parsedIntent: finalIntent,
            },
        };
    } catch (err) {
        logRecommendationDebug('pipeline.error', {
            query,
            effectiveQuery,
            mode,
            requestedSortBy,
            actualSortBy,
            center: effectiveCenter,
            anchorQuery: parsedIntent.anchorQuery || null,
            limit,
            elapsedMs: Date.now() - startedAt,
            error: toDebugError(err),
        });
        throw err;
    }
}

module.exports = {
    searchRecommendations,
};