const AMAP_HOST_PATTERN = /(^|\.)amap\.com$/i;

function isAllowedAmapUrl(value) {
    try {
        const url = value instanceof URL ? value : new URL(String(value));
        return (url.protocol === 'https:' || url.protocol === 'http:')
            && !url.username
            && !url.password
            && AMAP_HOST_PATTERN.test(url.hostname);
    } catch (error) {
        return false;
    }
}

function decodeJsonParam(value) {
    if (!value) return null;
    let current = String(value);
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            return JSON.parse(current);
        } catch (error) {
            try {
                const decoded = decodeURIComponent(current);
                if (decoded === current) return null;
                current = decoded;
            } catch (decodeError) {
                return null;
            }
        }
    }
    return null;
}

function normalizeCoordinate(lngValue, latValue, name = '') {
    if (lngValue == null || latValue == null || String(lngValue).trim() === '' || String(latValue).trim() === '') return null;
    const lng = Number(lngValue);
    const lat = Number(latValue);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
    return {
        lng: Number(lng.toFixed(6)),
        lat: Number(lat.toFixed(6)),
        name: String(name || '').trim().slice(0, 120)
    };
}

function parsePosition(value) {
    if (!value) return null;
    const parts = String(value).split(',');
    if (parts.length < 2) return null;
    return normalizeCoordinate(parts[0], parts[1], parts.slice(2).join(','));
}

function detectMode(url) {
    const directMode = String(url.searchParams.get('mode') || '').toLowerCase();
    if (['car', 'drive', 'driving'].includes(directMode)) return 'driving';
    if (['bus', 'transit'].includes(directMode)) return 'transit';
    if (['walk', 'walking'].includes(directMode)) return 'walking';
    if (['ride', 'riding', 'bike', 'cycling'].includes(directMode)) return 'riding';

    const commonBiz = decodeJsonParam(url.searchParams.get('commonBizInfo')) || {};
    const source = String(commonBiz.share_from || commonBiz.shareFrom || '').toLowerCase();
    if (source.includes('bus')) return 'transit';
    if (source.includes('walk') || source.includes('foot')) return 'walking';
    if (source.includes('ride') || source.includes('bike')) return 'riding';
    if (source.includes('car') || source.includes('drive') || source.includes('navi')) return 'driving';

    const mobileType = url.searchParams.get('t');
    if (mobileType === '1') return 'transit';
    if (mobileType === '2') return 'walking';
    if (mobileType === '3') return 'riding';
    return 'driving';
}

function parseWaypoints(url) {
    const direct = parsePosition(url.searchParams.get('via'));
    if (direct) return [direct];

    const longitudes = String(url.searchParams.get('vialons') || '').split('|').filter(Boolean);
    const latitudes = String(url.searchParams.get('vialats') || '').split('|').filter(Boolean);
    const names = String(url.searchParams.get('vianames') || '').split('|');
    if (!longitudes.length || longitudes.length !== latitudes.length) return [];
    return longitudes
        .slice(0, 16)
        .map((lng, index) => normalizeCoordinate(lng, latitudes[index], names[index]))
        .filter(Boolean);
}

function parseAmapRouteUrl(value) {
    let url;
    try {
        url = value instanceof URL ? value : new URL(String(value));
    } catch (error) {
        return null;
    }
    if (!isAllowedAmapUrl(url)) return null;

    let origin = parsePosition(url.searchParams.get('from') || url.searchParams.get('start'));
    let destination = parsePosition(url.searchParams.get('to') || url.searchParams.get('dest'));
    if (destination && !destination.name && url.searchParams.get('destName')) {
        destination.name = String(url.searchParams.get('destName')).trim().slice(0, 120);
    }

    if (!origin || !destination) {
        origin = normalizeCoordinate(
            url.searchParams.get('slon'),
            url.searchParams.get('slat'),
            url.searchParams.get('sname')
        );
        destination = normalizeCoordinate(
            url.searchParams.get('dlon'),
            url.searchParams.get('dlat'),
            url.searchParams.get('dname')
        );
    }

    if (!origin || !destination) {
        const routeParts = String(url.searchParams.get('r') || '').split(',');
        if (routeParts.length >= 6) {
            // The amap.com share-page `r` value uses lat,lng,name for both ends.
            origin = normalizeCoordinate(routeParts[1], routeParts[0], routeParts[2]);
            destination = normalizeCoordinate(routeParts[4], routeParts[3], routeParts[5]);
        }
    }

    if (!origin || !destination) return null;
    return {
        origin,
        destination,
        mode: detectMode(url),
        waypoints: parseWaypoints(url)
    };
}

function projectPoint(point, referenceLat) {
    const radians = referenceLat * Math.PI / 180;
    return {
        x: point.lng * 111320 * Math.cos(radians),
        y: point.lat * 110574
    };
}

function distanceToRoute(point, path) {
    const referenceLat = point.lat;
    const projectedPoint = projectPoint(point, referenceLat);
    const projectedPath = path.map((item) => projectPoint(item, referenceLat));
    const cumulative = [0];
    for (let index = 1; index < projectedPath.length; index += 1) {
        const dx = projectedPath[index].x - projectedPath[index - 1].x;
        const dy = projectedPath[index].y - projectedPath[index - 1].y;
        cumulative.push(cumulative[index - 1] + Math.hypot(dx, dy));
    }

    let bestDistance = Number.POSITIVE_INFINITY;
    let bestAlong = 0;
    for (let index = 0; index < projectedPath.length - 1; index += 1) {
        const start = projectedPath[index];
        const end = projectedPath[index + 1];
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared > 0
            ? Math.max(0, Math.min(1, ((projectedPoint.x - start.x) * dx + (projectedPoint.y - start.y) * dy) / lengthSquared))
            : 0;
        const nearestX = start.x + t * dx;
        const nearestY = start.y + t * dy;
        const distance = Math.hypot(projectedPoint.x - nearestX, projectedPoint.y - nearestY);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestAlong = cumulative[index] + t * Math.sqrt(lengthSquared);
        }
    }

    const total = cumulative[cumulative.length - 1] || 0;
    return {
        distance: bestDistance,
        along: bestAlong,
        progress: total > 0 ? bestAlong / total : 0,
        routeLength: total
    };
}

module.exports = {
    distanceToRoute,
    isAllowedAmapUrl,
    normalizeCoordinate,
    parseAmapRouteUrl
};
