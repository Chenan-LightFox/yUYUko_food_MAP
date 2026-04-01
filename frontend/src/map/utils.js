export const DEFAULT_CENTER = [113.394405, 23.016485];
export const DEFAULT_ZOOM = 24;
export const MAP_VIEW_STORAGE_KEY = "yuyuko.map.lastView.v1";
export const MAP_VIEW_SAVE_DEBOUNCE_MS = 450;
export const MIN_CENTER_SAVE_DISTANCE_METERS = 30;
export const MIN_ZOOM_SAVE_DELTA = 0.2;
export const LOCATE_ME_MIN_ZOOM = 18;

export function isLocalhost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function canUseLocationInCurrentContext() {
    if (typeof window === "undefined") return false;
    const { protocol, hostname } = window.location;
    return window.isSecureContext || protocol === "https:" || isLocalhost(hostname);
}

export function getLocationErrorMessage(errorLike) {
    const info = String(errorLike?.info || "");
    const message = String(errorLike?.message || "");
    const detail = `${info} ${message}`.trim().toUpperCase();

    if (detail.includes("PERMISSION_DENIED") || detail.includes("PERMISSION") || detail.includes("DENIED")) {
        return "定位权限被拒绝，请在浏览器中允许访问位置信息后重试。";
    }
    if (detail.includes("TIME_OUT") || detail.includes("TIMEOUT")) {
        return "定位超时，请检查网络或稍后重试。";
    }
    if (detail.includes("POSITION_UNAVAILABLE") || detail.includes("UNAVAILABLE")) {
        return "暂时无法获取当前位置，请确认设备定位服务已开启。";
    }
    if (detail.includes("SECURE") || detail.includes("HTTPS") || detail.includes("INSECURE")) {
        return "定位功能仅在 HTTPS 或 localhost 环境下可用。";
    }
    if (message) {
        return `定位失败：${message}`;
    }
    return "定位失败，请稍后重试。";
}

export function normalizeLngLat(center) {
    if (!center) return null;
    const lng = typeof center.getLng === "function"
        ? center.getLng()
        : (center.lng ?? (center.lnglat && center.lnglat.lng));
    const lat = typeof center.getLat === "function"
        ? center.getLat()
        : (center.lat ?? (center.latlng && center.latlng.lat));
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return { lng, lat };
}

export function haversineDistanceMeters(a, b) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const earthRadius = 6371000;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
    return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

export function readSavedMapView() {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(MAP_VIEW_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const lng = Number(parsed.lng);
        const lat = Number(parsed.lat);
        const zoom = Number(parsed.zoom);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return {
            lng,
            lat,
            zoom: Number.isFinite(zoom) ? zoom : DEFAULT_ZOOM
        };
    } catch (e) {
        console.warn("读取上次地图视野失败，使用默认值", e);
        return null;
    }
}

export function shouldPersistMapView(prevView, nextView) {
    if (!prevView) return true;
    const zoomDelta = Math.abs((prevView.zoom || 0) - (nextView.zoom || 0));
    if (zoomDelta >= MIN_ZOOM_SAVE_DELTA) return true;
    return haversineDistanceMeters(prevView, nextView) >= MIN_CENTER_SAVE_DISTANCE_METERS;
}
