import { isDarkMode } from '../utils/theme';
import { haversineDistanceMeters } from './utils';
import yesIcon from '../img/yes.png';
import noIcon from '../img/no.png';
import unionIcon from '../img/union.png';

// yes.png/no.png: 500×(~594) → displayed 36×~43, bottom-center offset = (-18, -43)
// AMap.Marker offset 接受 [x, y] 数组格式
const INDIVIDUAL_OFFSET = [-18, -43];
// union.png: 700×1020 → displayed 36×~52, bottom-center offset = (-18, -52)
const CLUSTER_OFFSET = [-18, -52];

export function createMarker(map, place) {
    if (!map || !window.AMap) return null;
    const category = place.category || '';
    const marker = new window.AMap.Marker({
        position: [place.longitude, place.latitude],
        title: place.name,
        extData: place,
        content: buildMarkerContent(place.name, category),
        offset: INDIVIDUAL_OFFSET,
        zIndex: 110
    });
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

function buildMarkerContent(placeName, category) {
    const isThunder = category && String(category).includes('避雷');
    const iconSrc = isThunder ? noIcon : yesIcon;
    return `
        <div style="position:relative;width:36px;height:43px;overflow:visible;pointer-events:none;">
            <img src="${iconSrc}" style="display:block;width:36px;height:43px;" draggable="false" />
        </div>
    `;
}

// Build label HTML for overlay rendering
export function buildLabelHtml(name, category) {
    const safeName = name ? escapeHtml(name) : '';
    if (!safeName) return '';
    const isThunder = category && String(category).includes('避雷');
    const thunderStyle = isThunder ? 'border-left-color:var(--color-danger);' : '';
    return `<div style="display:inline-block;background:var(--color-bg-surface);color:var(--color-text-primary);font-size:12px;line-height:16px;padding:2px 8px 2px 6px;border-radius:2px;border:1px solid var(--theme-primary);border-left:5px solid var(--theme-primary);${thunderStyle}white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.15);pointer-events:none;">${safeName}</div>`;
}

function buildClusterContent(count) {
    return `
        <div style="position:relative;width:36px;height:52px;overflow:visible;">
            <img src="${unionIcon}" style="display:block;width:36px;height:52px;position:relative;z-index:1;" draggable="false" />
            <div style="position:absolute;left:54%;top:30%;transform:translate(-50%, -50%);z-index:2;font-weight:600;font-size:20px;color:#000000;pointer-events:none;line-height:1;">${count}</div>
        </div>
    `;
}

const MIN_CLUSTER_ZOOM = 10;
const MAX_CLUSTER_ZOOM = 18;

// 地理网格剪枝用像素阈值（须大于包围盒对角线 √(48² + 65²) ≈ 81px，确保不漏检）
const PRUNE_PIXEL_THRESHOLD = 100;
// 独立标记包围盒：图标 36×43 + 标签居中在下 ≈ 48×65（锚点在图标底部中央，offset [-18,-43]）
const INDIV_MARKER_HALF_W = 24; // 包围盒半宽：max(18, 标签半宽≈24)
const INDIV_MARKER_H = 65;      // 包围盒全高：图标43 + 间距2 + 标签~20
// 聚类标记包围盒：union.png 36×52
const CLUSTER_ICON_W = 36;
const CLUSTER_ICON_H = 52;

/**
 * 根据当前缩放级别动态计算聚类半径（米）。
 * 将标记点的视觉像素尺寸转换为对应缩放级别下的地理距离，
 * 确保两个标记点在地图上的图标或文字有重叠时就会被聚类在一起。
 */
function getClusterRadius(map) {
    if (!map) return 0;
    const zoom = map.getZoom();
    if (!Number.isFinite(zoom) || zoom < MIN_CLUSTER_ZOOM) return 5000;
    if (zoom > MAX_CLUSTER_ZOOM) return 0;

    // 获取当前视图中心纬度用于分辨率计算
    const center = map.getCenter();
    const lat = (center && Number.isFinite(center.lat)) ? center.lat : 30;
    // Web Mercator 分辨率：每像素对应多少米
    const metersPerPixel = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
    return metersPerPixel * PRUNE_PIXEL_THRESHOLD;
}

class UnionFind {
    constructor(n) {
        this.parent = new Array(n);
        this.rank = new Array(n).fill(0);
        for (let i = 0; i < n; i++) this.parent[i] = i;
    }
    find(x) {
        if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
        return this.parent[x];
    }
    union(x, y) {
        const px = this.find(x);
        const py = this.find(y);
        if (px === py) return;
        if (this.rank[px] < this.rank[py]) this.parent[px] = py;
        else if (this.rank[px] > this.rank[py]) this.parent[py] = px;
        else { this.parent[py] = px; this.rank[px]++; }
    }
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

export function renderMarkers(map, markersRef, list, onClick, opts) {
    const onIndividualIds = opts && opts.onIndividualIds;
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
    const renderClusters = () => {
        // 清理上一次聚类渲染
        if (markersRef.current.__cluster && markersRef.current.__cluster.clusterMarkers) {
            markersRef.current.__cluster.clusterMarkers.forEach((m) => m.setMap && m.setMap(null));
        }
        created.forEach((m) => m.setMap && m.setMap(null));

        const radius = getClusterRadius(map);

        // 缩放级别超出聚类范围时，直接显示全部独立标记
        if (radius <= 0) {
            created.forEach((m) => m.setMap(map));
            if (onIndividualIds) {
                const ids = new Set();
                list.forEach(p => { if (p.id != null) ids.add(p.id); });
                onIndividualIds(ids);
            }
            markersRef.current.__cluster = {
                clusterMarkers: [],
                handlers: markersRef.current.__cluster ? markersRef.current.__cluster.handlers : []
            };
            return;
        }

        const n = list.length;
        if (n === 0) {
            markersRef.current.__cluster = {
                clusterMarkers: [],
                handlers: markersRef.current.__cluster ? markersRef.current.__cluster.handlers : []
            };
            return;
        }

        const uf = new UnionFind(n);

        // 地理网格空间索引，仅比较相邻格内的点对
        const cellSizeDeg = radius / 111320;
        const grid = new Map();

        for (let i = 0; i < n; i++) {
            const p = list[i];
            const cx = Math.floor(p.longitude / cellSizeDeg);
            const cy = Math.floor(p.latitude / cellSizeDeg);
            const key = `${cx}_${cy}`;
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key).push({ index: i });
        }

        for (const [key, cellItems] of grid) {
            const [cx, cy] = key.split('_').map(Number);
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const neighborKey = `${cx + dx}_${cy + dy}`;
                    const neighborItems = grid.get(neighborKey);
                    if (!neighborItems) continue;
                    for (const a of cellItems) {
                        for (const b of neighborItems) {
                            if (a.index >= b.index) continue;
                            const pa = list[a.index];
                            const pb = list[b.index];
                            // 优先用像素包围盒重叠判断（精确检查图标+文字是否重叠）
                            const pixA = getPixelPoint(map, pa.longitude, pa.latitude);
                            const pixB = getPixelPoint(map, pb.longitude, pb.latitude);
                            if (pixA && pixB) {
                                const dx = Math.abs(pixA.x - pixB.x);
                                const dy = Math.abs(pixA.y - pixB.y);
                                // 独立标记包围盒 ~48×65，重叠条件：|dx| < 48 && |dy| < 65
                                if (dx < INDIV_MARKER_HALF_W * 2 && dy < INDIV_MARKER_H) {
                                    uf.union(a.index, b.index);
                                }
                            } else {
                                // 像素坐标获取失败（标记在视口外）用地理距离兜底
                                const dist = haversineDistanceMeters(
                                    { lat: pa.latitude, lng: pa.longitude },
                                    { lat: pb.latitude, lng: pb.longitude }
                                );
                                if (dist <= radius) {
                                    uf.union(a.index, b.index);
                                }
                            }
                        }
                    }
                }
            }
        }

        // 按连通分量分组
        const groups = new Map();
        for (let i = 0; i < n; i++) {
            const root = uf.find(i);
            if (!groups.has(root)) groups.set(root, []);
            groups.get(root).push(list[i]);
        }

        // 第二轮合并：检查各组聚类标记（36×52）是否视觉重叠，若重叠则合并
        // 防止 Union-Find 传递链把不相邻的聚类点强行并到一起
        const groupEntries = [];
        for (const groupPlaces of groups.values()) {
            const sumLng = groupPlaces.reduce((s, p) => s + p.longitude, 0);
            const sumLat = groupPlaces.reduce((s, p) => s + p.latitude, 0);
            const centroidLng = sumLng / groupPlaces.length;
            const centroidLat = sumLat / groupPlaces.length;
            const pixelPos = getPixelPoint(map, centroidLng, centroidLat);
            groupEntries.push({ places: groupPlaces, centroidLng, centroidLat, pixelPos });
        }

        const groupUF = new UnionFind(groupEntries.length);
        for (let i = 0; i < groupEntries.length; i++) {
            const pi = groupEntries[i].pixelPos;
            if (!pi) continue;
            for (let j = i + 1; j < groupEntries.length; j++) {
                const pj = groupEntries[j].pixelPos;
                if (!pj) continue;
                const dx = Math.abs(pi.x - pj.x);
                const dy = Math.abs(pi.y - pj.y);
                // 两个聚类标记重叠条件：|dx| < 36 && |dy| < 52
                if (dx < CLUSTER_ICON_W && dy < CLUSTER_ICON_H) {
                    groupUF.union(i, j);
                }
            }
        }

        const mergedGroups = new Map();
        for (let i = 0; i < groupEntries.length; i++) {
            const root = groupUF.find(i);
            if (!mergedGroups.has(root)) mergedGroups.set(root, []);
            mergedGroups.get(root).push(...groupEntries[i].places);
        }

        const clusterMarkers = [];
        const individualIds = new Set();
        for (const groupPlaces of mergedGroups.values()) {
            if (groupPlaces.length === 1) {
                const place = groupPlaces[0];
                if (place.id != null) individualIds.add(place.id);
                const marker = markerByPlace.get(place) || markerByKey.get(place.id != null ? `id:${place.id}` : '');
                if (marker) marker.setMap(map);
                continue;
            }

            const sumLng = groupPlaces.reduce((s, p) => s + p.longitude, 0);
            const sumLat = groupPlaces.reduce((s, p) => s + p.latitude, 0);
            const centerLng = sumLng / groupPlaces.length;
            const centerLat = sumLat / groupPlaces.length;

            const clusterMarker = new window.AMap.Marker({
                position: [centerLng, centerLat],
                content: buildClusterContent(groupPlaces.length),
                offset: CLUSTER_OFFSET,
                zIndex: 200
            });
            clusterMarker.on('click', () => {
                map.panTo([centerLng, centerLat]);
                setTimeout(() => zoomToCluster(map, groupPlaces), 260);
            });
            clusterMarker.setMap(map);
            clusterMarkers.push(clusterMarker);
        }

        markersRef.current.__cluster = {
            clusterMarkers,
            handlers: markersRef.current.__cluster ? markersRef.current.__cluster.handlers : []
        };
        if (onIndividualIds) onIndividualIds(individualIds);
    };

    // 仅在缩放变化时刷新聚类（地理距离不随平移改变，无需在 moveend 重算）
    const handlers = [];
    if (typeof map.on === 'function') {
        const onZoomEnd = () => renderClusters();
        map.on('zoomend', onZoomEnd);
        handlers.push({ type: 'zoomend', fn: onZoomEnd });
    }
    markersRef.current.__cluster = { clusterMarkers: [], handlers };

    if (points.length === 0) {
        return created;
    }

    renderClusters();

    return created;
}
