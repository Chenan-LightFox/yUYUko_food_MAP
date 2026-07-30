import QRCode from 'qrcode';
import yesMarkerSrc from '../img/yes.png';
import noMarkerSrc from '../img/no.png';

const AMAP_WEB_SERVICE_KEY = '51097d0d47c2a1d341cf81b0ab82266d';
const DEFAULT_CENTER = { longitude: 113.394405, latitude: 23.016485 };
const STATIC_MAP_WIDTH = 1024;
const STATIC_MAP_HEIGHT = 576;
const POSTER_WIDTH = 1600;
const POSTER_HEIGHT = 900;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function getPlaceName(place) {
    return String(place?.name || place?.address || '未命名地点').trim();
}

function getPlaceCoordinates(place) {
    const longitude = Number(place?.longitude);
    const latitude = Number(place?.latitude);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
    return { longitude, latitude };
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
    ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
    ctx.arcTo(x, y + height, x, y, safeRadius);
    ctx.arcTo(x, y, x + width, y, safeRadius);
    ctx.closePath();
}

function wrapCanvasText(ctx, text, maxWidth, maxLines) {
    const paragraphs = String(text || '').split(/\r?\n/);
    const lines = [];

    for (const paragraph of paragraphs) {
        if (!paragraph) {
            lines.push('');
            continue;
        }

        let current = '';
        for (const character of paragraph) {
            const next = current + character;
            if (current && ctx.measureText(next).width > maxWidth) {
                lines.push(current);
                current = character;
            } else {
                current = next;
            }
        }
        if (current) lines.push(current);
    }

    if (lines.length <= maxLines) return lines;
    const visible = lines.slice(0, maxLines);
    let finalLine = visible[visible.length - 1].replace(/[，。；、,.!?！？\s]+$/g, '');
    while (finalLine && ctx.measureText(`${finalLine}…`).width > maxWidth) {
        finalLine = finalLine.slice(0, -1);
    }
    visible[visible.length - 1] = `${finalLine}…`;
    return visible;
}

function lngLatToWorldPoint(longitude, latitude, zoom) {
    const safeLatitude = clamp(latitude, -85.05112878, 85.05112878);
    const sinLatitude = Math.sin(safeLatitude * Math.PI / 180);
    // 高德静态地图在 scale=1 时仍使用 512px 瓦片尺度；
    // 这里必须与服务端底图一致，否则 Marker 位移会缩小一半。
    const scale = 512 * (2 ** zoom);
    return {
        x: ((longitude + 180) / 360) * scale,
        y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale
    };
}

function worldPointToLngLat(x, y, zoom) {
    const scale = 512 * (2 ** zoom);
    const longitude = (x / scale) * 360 - 180;
    const mercatorY = Math.PI - (2 * Math.PI * y) / scale;
    const latitude = Math.atan(Math.sinh(mercatorY)) * 180 / Math.PI;
    return { longitude, latitude };
}

function getPosterMapViewport(places) {
    const coordinates = places.map(getPlaceCoordinates).filter(Boolean);
    if (coordinates.length === 0) {
        return { ...DEFAULT_CENTER, zoom: 13 };
    }

    const normalizedPoints = coordinates.map((point) => lngLatToWorldPoint(point.longitude, point.latitude, 0));
    const minX = Math.min(...normalizedPoints.map((point) => point.x));
    const maxX = Math.max(...normalizedPoints.map((point) => point.x));
    const minY = Math.min(...normalizedPoints.map((point) => point.y));
    const maxY = Math.max(...normalizedPoints.map((point) => point.y));
    const center = worldPointToLngLat((minX + maxX) / 2, (minY + maxY) / 2, 0);

    if (coordinates.length === 1) {
        return { ...center, zoom: 16 };
    }

    let zoom = 16;
    for (; zoom >= 3; zoom -= 1) {
        const projected = coordinates.map((point) => lngLatToWorldPoint(point.longitude, point.latitude, zoom));
        const spanX = Math.max(...projected.map((point) => point.x)) - Math.min(...projected.map((point) => point.x));
        const spanY = Math.max(...projected.map((point) => point.y)) - Math.min(...projected.map((point) => point.y));
        if (spanX <= STATIC_MAP_WIDTH * 0.68 && spanY <= STATIC_MAP_HEIGHT * 0.58) break;
    }

    return { ...center, zoom: clamp(zoom, 3, 16) };
}

function loadImage(source) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('图片加载失败'));
        image.src = source;
    });
}

async function fetchImage(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`地图加载失败（${response.status}）`);

    const contentType = String(response.headers.get('content-type') || '');
    if (!contentType.startsWith('image/')) {
        throw new Error('地图服务未返回图片');
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
        return await loadImage(objectUrl);
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

function buildStaticMapUrl(backendUrl, viewport) {
    const params = new URLSearchParams({
        location: `${viewport.longitude.toFixed(6)},${viewport.latitude.toFixed(6)}`,
        zoom: String(viewport.zoom),
        size: `${STATIC_MAP_WIDTH}*${STATIC_MAP_HEIGHT}`,
        scale: '1',
        traffic: '0',
        key: AMAP_WEB_SERVICE_KEY
    });
    const base = String(backendUrl || '').replace(/\/+$/, '');
    const endpoint = base
        ? `${base}/_AMapService/v3/staticmap`
        : 'https://restapi.amap.com/v3/staticmap';
    return `${endpoint}?${params.toString()}`;
}

function projectPlaceToPoster(place, viewport) {
    const coordinates = getPlaceCoordinates(place);
    if (!coordinates) return null;
    const centerPoint = lngLatToWorldPoint(viewport.longitude, viewport.latitude, viewport.zoom);
    const placePoint = lngLatToWorldPoint(coordinates.longitude, coordinates.latitude, viewport.zoom);
    return {
        x: POSTER_WIDTH / 2 + (placePoint.x - centerPoint.x) * (POSTER_WIDTH / STATIC_MAP_WIDTH),
        y: POSTER_HEIGHT / 2 + (placePoint.y - centerPoint.y) * (POSTER_HEIGHT / STATIC_MAP_HEIGHT)
    };
}

function drawTextWithHalo(ctx, text, x, y, maxWidth, lineWidth) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y, maxWidth);
    ctx.fillStyle = '#111111';
    ctx.fillText(text, x, y, maxWidth);
}

export async function createMapPoster({ title, description, places, backendUrl, qrValue }) {
    const canvas = document.createElement('canvas');
    canvas.width = POSTER_WIDTH;
    canvas.height = POSTER_HEIGHT;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前浏览器无法创建海报');

    const viewport = getPosterMapViewport(places);
    try {
        const mapImage = await fetchImage(buildStaticMapUrl(backendUrl, viewport));
        ctx.drawImage(mapImage, 0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    } catch (error) {
        console.error('加载高德静态地图失败', error);
        throw new Error('地图加载失败，暂时无法准确生成海报，请稍后重试');
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

    const [yesMarker, noMarker] = await Promise.all([
        loadImage(yesMarkerSrc),
        loadImage(noMarkerSrc)
    ]);
    places.forEach((place) => {
        const anchor = projectPlaceToPoster(place, viewport);
        if (!anchor) return;

        const markerImage = String(place?.category || '').includes('避雷') ? noMarker : yesMarker;
        const markerWidth = 64;
        const markerHeight = 76;
        ctx.drawImage(markerImage, anchor.x - markerWidth / 2, anchor.y - markerHeight, markerWidth, markerHeight);

        const label = getPlaceName(place);
        ctx.font = '600 21px "Microsoft YaHei", "PingFang SC", sans-serif';
        const labelWidth = Math.min(ctx.measureText(label).width + 24, 280);
        const labelX = clamp(anchor.x - labelWidth / 2, 10, POSTER_WIDTH - labelWidth - 10);
        const labelY = clamp(anchor.y + 8, 20, POSTER_HEIGHT - 48);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
        drawRoundedRect(ctx, labelX, labelY, labelWidth, 38, 7);
        ctx.fill();
        ctx.strokeStyle = 'rgba(89, 41, 67, 0.45)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#2f2030';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, labelX + 12, labelY + 20, labelWidth - 24);
        ctx.textBaseline = 'alphabetic';
    });

    ctx.font = '700 78px "Microsoft YaHei", "PingFang SC", sans-serif';
    const titleLines = wrapCanvasText(ctx, title, 950, 2);
    titleLines.forEach((line, index) => {
        drawTextWithHalo(ctx, line, 42, 92 + index * 92, 950, 13);
    });

    const descriptionText = String(description || '').trim();
    if (descriptionText) {
        ctx.font = '500 48px "Microsoft YaHei", "PingFang SC", sans-serif';
        const descriptionLines = wrapCanvasText(ctx, descriptionText, 960, 2);
        const descriptionStart = 65 + titleLines.length * 92;
        descriptionLines.forEach((line, index) => {
            drawTextWithHalo(ctx, line, 44, descriptionStart + index * 62, 960, 9);
        });
    }

    const qrDataUrl = await QRCode.toDataURL(qrValue, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 180,
        color: {
            dark: '#111111',
            light: '#ffffff'
        }
    });
    const qrImage = await loadImage(qrDataUrl);
    const qrBoxSize = 230;
    const qrBoxX = POSTER_WIDTH - qrBoxSize - 34;
    const qrBoxY = POSTER_HEIGHT - qrBoxSize - 30;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    drawRoundedRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 16);
    ctx.fill();
    ctx.drawImage(qrImage, qrBoxX + 25, qrBoxY + 16, 180, 180);
    ctx.fillStyle = '#111111';
    ctx.font = '600 18px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('扫码打开东方饭联地图', qrBoxX + qrBoxSize / 2, qrBoxY + 216);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, POSTER_WIDTH, 12);
    ctx.fillRect(0, POSTER_HEIGHT - 12, POSTER_WIDTH, 12);
    ctx.fillRect(0, 12, 12, POSTER_HEIGHT - 24);
    ctx.fillRect(POSTER_WIDTH - 12, 12, 12, POSTER_HEIGHT - 24);

    return canvas;
}
