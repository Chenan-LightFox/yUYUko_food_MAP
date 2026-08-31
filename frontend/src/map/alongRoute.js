function normalizePoint(value) {
    if (!value) return null;
    const lng = Number(value.lng ?? value.longitude ?? value.getLng?.() ?? value[0]);
    const lat = Number(value.lat ?? value.latitude ?? value.getLat?.() ?? value[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return { lng, lat };
}

function appendPart(parts, value) {
    if (!Array.isArray(value)) return false;
    const normalized = value.map(normalizePoint).filter(Boolean);
    if (normalized.length < 2) return false;
    parts.push(normalized);
    return true;
}

function collectPathParts(value, parts, seen = new Set(), depth = 0) {
    if (!value || depth > 10 || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);

    if (appendPart(parts, value.path)) return;
    const preferredKeys = ['steps', 'rides', 'segments', 'walking', 'bus', 'buslines', 'railway', 'taxi'];
    preferredKeys.forEach((key) => collectPathParts(value[key], parts, seen, depth + 1));

    if (Array.isArray(value)) {
        value.forEach((item) => collectPathParts(item, parts, seen, depth + 1));
    }
}

function joinPathParts(parts, origin, destination) {
    const joined = [];
    const append = (point) => {
        const previous = joined[joined.length - 1];
        if (!previous || Math.abs(previous.lng - point.lng) > 1e-7 || Math.abs(previous.lat - point.lat) > 1e-7) {
            joined.push(point);
        }
    };
    append(origin);
    parts.forEach((part) => part.forEach(append));
    append(destination);
    return joined;
}

function getRouteOptions(result, mode) {
    const options = mode === 'transit' ? result?.plans : result?.routes;
    if (Array.isArray(options) && options.length) return options.slice(0, 6);
    const fallback = mode === 'transit' ? result?.routes : result?.plans;
    return Array.isArray(fallback) ? fallback.slice(0, 6) : [];
}

function loadAmapPlugin(name) {
    return new Promise((resolve, reject) => {
        if (!window.AMap) {
            reject(new Error('地图尚未就绪'));
            return;
        }
        const timer = window.setTimeout(() => reject(new Error('高德路线服务加载超时')), 15000);
        window.AMap.plugin(name, () => {
            window.clearTimeout(timer);
            resolve();
        });
    });
}

async function findCity(point) {
    try {
        await loadAmapPlugin('AMap.Geocoder');
        return await new Promise((resolve) => {
            const geocoder = new window.AMap.Geocoder({ radius: 1000, extensions: 'base' });
            const timer = window.setTimeout(() => resolve('全国'), 8000);
            geocoder.getAddress([point.lng, point.lat], (status, result) => {
                window.clearTimeout(timer);
                const component = result?.regeocode?.addressComponent || {};
                const city = Array.isArray(component.city) ? component.province : (component.city || component.province);
                resolve(city || '全国');
            });
        });
    } catch (error) {
        return '全国';
    }
}

function createRouteService(mode, city) {
    if (mode === 'transit') {
        return new window.AMap.Transfer({
            city,
            policy: window.AMap.TransferPolicy?.LEAST_TIME ?? 0,
            nightflag: true,
            extensions: 'all'
        });
    }
    if (mode === 'walking') return new window.AMap.Walking({});
    if (mode === 'riding') return new window.AMap.Riding({ policy: 0 });
    return new window.AMap.Driving({
        policy: window.AMap.DrivingPolicy?.LEAST_TIME ?? 0,
        extensions: 'all',
        ferry: 1
    });
}

export function sampleRoutePath(path, maxPoints = 700) {
    if (!Array.isArray(path) || path.length <= maxPoints) return path || [];

    const referenceLat = path.reduce((sum, point) => sum + point.lat, 0) / path.length;
    const cosLat = Math.cos(referenceLat * Math.PI / 180);
    const projected = path.map((point) => ({
        x: point.lng * 111320 * cosLat,
        y: point.lat * 110574
    }));
    const simplify = (tolerance) => {
        const keep = new Uint8Array(path.length);
        keep[0] = 1;
        keep[path.length - 1] = 1;
        const stack = [[0, path.length - 1]];
        const toleranceSquared = tolerance * tolerance;
        while (stack.length) {
            const [startIndex, endIndex] = stack.pop();
            const start = projected[startIndex];
            const end = projected[endIndex];
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const lengthSquared = dx * dx + dy * dy;
            let bestIndex = -1;
            let bestDistanceSquared = toleranceSquared;
            for (let index = startIndex + 1; index < endIndex; index += 1) {
                const point = projected[index];
                const t = lengthSquared > 0
                    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
                    : 0;
                const offsetX = point.x - (start.x + t * dx);
                const offsetY = point.y - (start.y + t * dy);
                const distanceSquared = offsetX * offsetX + offsetY * offsetY;
                if (distanceSquared > bestDistanceSquared) {
                    bestDistanceSquared = distanceSquared;
                    bestIndex = index;
                }
            }
            if (bestIndex > 0) {
                keep[bestIndex] = 1;
                stack.push([startIndex, bestIndex], [bestIndex, endIndex]);
            }
        }
        return path.filter((_, index) => keep[index]);
    };

    let high = 2;
    let simplified = simplify(high);
    while (simplified.length > maxPoints && high < 50000) {
        high *= 2;
        simplified = simplify(high);
    }
    let low = 0;
    for (let attempt = 0; attempt < 18; attempt += 1) {
        const middle = (low + high) / 2;
        const candidate = simplify(middle);
        if (candidate.length > maxPoints) low = middle;
        else {
            high = middle;
            simplified = candidate;
        }
    }
    return simplified;
}

export async function planAmapRoutes({ origin, destination, waypoints = [], mode }) {
    const normalizedOrigin = normalizePoint(origin);
    const normalizedDestination = normalizePoint(destination);
    if (!normalizedOrigin || !normalizedDestination) throw new Error('行程起点或终点坐标无效');

    const pluginByMode = {
        driving: 'AMap.Driving',
        transit: 'AMap.Transfer',
        walking: 'AMap.Walking',
        riding: 'AMap.Riding'
    };
    const effectiveMode = pluginByMode[mode] ? mode : 'driving';
    await loadAmapPlugin(pluginByMode[effectiveMode]);
    const city = effectiveMode === 'transit' ? await findCity(normalizedOrigin) : '';
    const service = createRouteService(effectiveMode, city);

    const result = await new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('高德路线规划超时，请重试')), 20000);
        const callback = (status, response) => {
            window.clearTimeout(timer);
            if (status === 'complete') resolve(response);
            else if (status === 'no_data') reject(new Error('高德没有找到这两个地点之间的路线'));
            else reject(new Error(`高德路线规划失败${response?.info ? `：${response.info}` : ''}`));
        };
        const normalizedWaypoints = Array.isArray(waypoints)
            ? waypoints.map(normalizePoint).filter(Boolean).slice(0, 16)
            : [];
        const start = new window.AMap.LngLat(normalizedOrigin.lng, normalizedOrigin.lat);
        const end = new window.AMap.LngLat(normalizedDestination.lng, normalizedDestination.lat);
        if (effectiveMode === 'driving' && normalizedWaypoints.length) {
            service.search(start, end, {
                waypoints: normalizedWaypoints.map((point) => new window.AMap.LngLat(point.lng, point.lat))
            }, callback);
        } else {
            service.search(start, end, callback);
        }
    });

    const options = getRouteOptions(result, effectiveMode);
    const routes = options.map((option) => {
        const parts = [];
        collectPathParts(option, parts);
        if (!parts.length) return null;
        const path = joinPathParts(parts, normalizedOrigin, normalizedDestination);
        return {
            path,
            searchPath: sampleRoutePath(path, 380),
            distance: Number(option.distance || option.route?.distance || 0) || null,
            duration: Number(option.time || option.duration || option.route?.time || 0) || null
        };
    }).filter((route) => route && route.path.length >= 2)
        .map((route, index) => ({ ...route, index }));
    if (!routes.length) throw new Error('没有从高德结果中取得路线轨迹');

    return {
        routes,
        city,
        service
    };
}

export function drawAmapRoutes(map, routes, primaryColor, secondaryColor) {
    if (!map || !window.AMap || !Array.isArray(routes) || routes.length === 0) return [];
    const overlays = [];
    const palette = [primaryColor, secondaryColor || '#8D6EBA', '#E58C45', '#468AC9', '#6BA66F', '#B65C82'];
    routes.slice().reverse().forEach((route) => {
        const routeIndex = Number(route.index) || 0;
        const polyline = new window.AMap.Polyline({
            path: route.path.map((point) => [point.lng, point.lat]),
            strokeColor: palette[routeIndex % palette.length],
            strokeWeight: routeIndex === 0 ? 7 : 5,
            strokeOpacity: routeIndex === 0 ? 0.9 : 0.64,
            strokeStyle: routeIndex === 0 ? 'solid' : 'dashed',
            lineJoin: 'round',
            lineCap: 'round',
            showDir: routeIndex === 0,
            zIndex: 90 - routeIndex
        });
        polyline.__alongRouteIndex = routeIndex;
        map.add(polyline);
        overlays.push(polyline);
    });

    const primaryPath = routes[0].path;
    const endpointContent = (label) => `<div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${primaryColor};color:#fff;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25);font-size:12px;font-weight:700">${label}</div>`;
    const startMarker = new window.AMap.Marker({
        position: [primaryPath[0].lng, primaryPath[0].lat],
        content: endpointContent('起'),
        offset: [-14, -14],
        zIndex: 120
    });
    const last = primaryPath[primaryPath.length - 1];
    const endMarker = new window.AMap.Marker({
        position: [last.lng, last.lat],
        content: endpointContent('终'),
        offset: [-14, -14],
        zIndex: 120
    });
    map.add([startMarker, endMarker]);
    overlays.push(startMarker, endMarker);
    try { map.setFitView(overlays, false, [64, 64, 84, 64]); } catch (error) { /* best effort */ }
    return overlays;
}

// Backward-compatible helpers for callers that only have one route.
export async function planAmapRoute(options) {
    const planned = await planAmapRoutes(options);
    return { ...planned.routes[0], city: planned.city, service: planned.service };
}

export function drawAmapRoute(map, path, color) {
    return drawAmapRoutes(map, [{ index: 0, path }], color, color);
}

export function clearAmapRoute(map, overlays) {
    if (!map || !Array.isArray(overlays) || overlays.length === 0) return;
    try { map.remove(overlays); } catch (error) {
        overlays.forEach((overlay) => overlay?.setMap?.(null));
    }
}
