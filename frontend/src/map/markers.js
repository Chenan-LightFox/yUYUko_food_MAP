import { isDarkMode } from '../utils/theme';

export function createMarker(map, place) {
    if (!map || !window.AMap) return null;
    const marker = new window.AMap.Marker({
        position: [place.longitude, place.latitude],
        title: place.name,
        extData: place,
        content: buildMarkerContent(place.name)
    });
    // Do not automatically setMap here as we will manage placement manually
    return marker;
}

function escapeHtml(input) {
    return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildMarkerContent(placeName) {
    const safeName = placeName ? escapeHtml(placeName) : '';
    const labelBg = isDarkMode() ? 'rgba(230,230,230,0.8)' : 'rgba(200,200,200,0.9)';
    return `
            <div style="position:relative;width:18px;height:24px;transform:translate(-50%, -100%);">
                <div style="position:absolute;left:50%;top:0;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;">
                    <div style="width:14px;height:14px;background:#3b82f6;border:2px solid #ffffff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.25);"></div>
                    <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:6px solid #3b82f6;margin-top:-1px;"></div>
                </div>
                ${safeName ? `<div style=\"position:absolute;left:50%;top:24px;transform:translateX(-50%);margin-top:4px;background:${labelBg};color:#111827;font-size:12px;line-height:16px;padding:2px 8px;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,0.08);white-space:nowrap;\">${safeName}</div>` : ''}
            </div>
    `;
}

function buildClusterContent(count) {
    const dark = isDarkMode();
    const bg = dark ? 'rgba(15,23,42,0.9)' : 'rgba(255,255,255,0.95)';
    const border = dark ? 'rgba(148,163,184,0.6)' : 'rgba(59,130,246,0.4)';
    const color = dark ? '#e2e8f0' : '#1f2937';
    return `
        <div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:${bg};border:2px solid ${border};box-shadow:0 4px 10px rgba(0,0,0,0.2);font-weight:700;font-size:13px;color:${color};">
            ${count}
        </div>
    `;
}

function getPixelPoint(map, lng, lat) {
    try {
        if (typeof map.lngLatToContainer === 'function') {
            const p = map.lngLatToContainer([lng, lat]);
            return p ? { x: p.x, y: p.y } : null;
        }
        if (typeof map.lnglatToContainer === 'function') {
            const p = map.lnglatToContainer([lng, lat]);
            return p ? { x: p.x, y: p.y } : null;
        }
        if (typeof map.lnglatToPixel === 'function') {
            const p = map.lnglatToPixel([lng, lat]);
            return p ? { x: p.x, y: p.y } : null;
        }
        if (typeof map.lngLatToPixel === 'function') {
            const p = map.lngLatToPixel([lng, lat]);
            return p ? { x: p.x, y: p.y } : null;
        }
    } catch (e) {
        return null;
    }
    return null;
}

function getLngLatFromPixel(map, x, y) {
    try {
        if (typeof map.containerToLngLat === 'function') {
            return map.containerToLngLat([x, y]);
        }
        if (typeof map.pixelToLngLat === 'function') {
            return map.pixelToLngLat([x, y]);
        }
    } catch (e) {
        return null;
    }
    return null;
}

function normalizeLngLatValue(lnglat, fallback) {
    if (!lnglat) return fallback;
    const lng = typeof lnglat.getLng === 'function' ? lnglat.getLng() : (lnglat.lng ?? lnglat[0]);
    const lat = typeof lnglat.getLat === 'function' ? lnglat.getLat() : (lnglat.lat ?? lnglat[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
        return { lng, lat };
    }
    return fallback;
}

function zoomToCluster(map, items) {
    if (!map || !items || items.length === 0) return;
    if (items.length === 1) {
        const only = items[0];
        map.setCenter([only.longitude, only.latitude]);
        map.setZoom(map.getZoom() + 2);
        return;
    }

    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    items.forEach((item) => {
        const lng = item.longitude;
        const lat = item.latitude;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
    });

    if (minLng === maxLng && minLat === maxLat) {
        map.setZoom(map.getZoom() + 2);
        return;
    }

    const dw = maxLng - minLng;
    const dh = maxLat - minLat;
    const padW = (dw / 0.8) - dw;
    const padH = (dh / 0.8) - dh;

    const bounds = new window.AMap.Bounds(
        [minLng - padW / 2, minLat - padH / 2],
        [maxLng + padW / 2, maxLat + padH / 2]
    );
    map.setBounds(bounds);
}

export function renderMarkers(map, markersRef, list, onClick) {
    // 清空旧 markers及聚类
    if (markersRef.current && markersRef.current.__cluster) {
        const clusterState = markersRef.current.__cluster;
        if (clusterState.clusterMarkers) {
            clusterState.clusterMarkers.forEach((m) => m.setMap && m.setMap(null));
        }
        if (clusterState.handlers && map && typeof map.off === 'function') {
            clusterState.handlers.forEach((h) => map.off(h.type, h.fn));
        }
    }
    if (markersRef.current && Array.isArray(markersRef.current)) {
        markersRef.current.forEach((m) => m.setMap && m.setMap(null));
    }

    markersRef.current = [];
    if (!map || !window.AMap) return [];

    const created = [];
    const points = [];
    const markerByKey = new Map();
    const markerByPlace = new Map();

    list.forEach((p, idx) => {
        const lnglat = [p.longitude, p.latitude];
        points.push({
            lnglat,
            weight: 1,
            place: p // 自定义数据
        });
        // 仍然可以创建独立的 Marker 对象以备 onClick 等需要，但这不自动添加到地图上
        const marker = createMarker(map, p);
        if (!marker) return;
        marker.on('click', () => {
            const pos = marker.getPosition();
            const lnglatObj = (pos && pos.lng != null && pos.lat != null) ? { lng: pos.lng, lat: pos.lat } : { longitude: p.longitude, latitude: p.latitude };
            onClick && onClick(p, lnglatObj);
        });
        markerByKey.set(p.id != null ? `id:${p.id}` : `idx:${idx}`, marker);
        markerByPlace.set(p, marker);
        markersRef.current.push(marker);
        created.push(marker);
    });
    const gridSize = 60;
    const renderClusters = () => {
        // 清理上一次聚类渲染
        if (markersRef.current.__cluster && markersRef.current.__cluster.clusterMarkers) {
            markersRef.current.__cluster.clusterMarkers.forEach((m) => m.setMap && m.setMap(null));
        }
        created.forEach((m) => m.setMap && m.setMap(null));

        const cells = new Map();
        for (let i = 0; i < list.length; i += 1) {
            const place = list[i];
            const lng = place.longitude;
            const lat = place.latitude;
            const pixel = getPixelPoint(map, lng, lat);
            if (!pixel) continue;
            const gx = Math.floor(pixel.x / gridSize);
            const gy = Math.floor(pixel.y / gridSize);
            const key = `${gx}_${gy}`;
            if (!cells.has(key)) {
                cells.set(key, []);
            }
            cells.get(key).push({ place, pixel });
        }

        const clusterMarkers = [];
        for (const places of cells.values()) {
            if (places.length === 1) {
                const place = places[0].place;
                const marker = markerByPlace.get(place) || markerByKey.get(place.id != null ? `id:${place.id}` : '');
                if (marker) marker.setMap(map);
                continue;
            }

            let sumLng = 0;
            let sumLat = 0;
            let sumX = 0;
            let sumY = 0;
            places.forEach((entry) => {
                const p = entry.place;
                sumLng += p.longitude;
                sumLat += p.latitude;
                sumX += entry.pixel.x;
                sumY += entry.pixel.y;
            });
            const fallbackCenter = { lng: sumLng / places.length, lat: sumLat / places.length };
            const pixelCenter = { x: sumX / places.length, y: sumY / places.length };
            const lngLatCenter = normalizeLngLatValue(getLngLatFromPixel(map, pixelCenter.x, pixelCenter.y), fallbackCenter);
            const centerLng = lngLatCenter.lng;
            const centerLat = lngLatCenter.lat;

            const clusterMarker = new window.AMap.Marker({
                position: [centerLng, centerLat],
                content: buildClusterContent(places.length),
                offset: new window.AMap.Pixel(-17, -17)
            });
            clusterMarker.on('click', () => {
                map.panTo([centerLng, centerLat]);
                const placeList = places.map((entry) => entry.place);
                setTimeout(() => zoomToCluster(map, placeList), 260);
            });
            clusterMarker.setMap(map);
            clusterMarkers.push(clusterMarker);
        }

        markersRef.current.__cluster = {
            clusterMarkers,
            handlers: markersRef.current.__cluster ? markersRef.current.__cluster.handlers : []
        };
    };

    // 初次渲染与地图交互时刷新聚类
    const handlers = [];
    if (typeof map.on === 'function') {
        const onZoomEnd = () => renderClusters();
        const onMoveEnd = () => renderClusters();
        map.on('zoomend', onZoomEnd);
        map.on('moveend', onMoveEnd);
        handlers.push({ type: 'zoomend', fn: onZoomEnd }, { type: 'moveend', fn: onMoveEnd });
    }
    markersRef.current.__cluster = { clusterMarkers: [], handlers };

    if (points.length === 0) {
        return created;
    }

    // 如果无法计算像素坐标，退回平铺
    const canProject = getPixelPoint(map, points[0].lnglat[0], points[0].lnglat[1]);
    if (!canProject) {
        created.forEach((marker) => marker.setMap(map));
        return created;
    }

    renderClusters();

    return created;
}
