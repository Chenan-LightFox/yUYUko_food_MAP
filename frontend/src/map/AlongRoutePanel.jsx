import React, { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../components/Button';
import ScrollableView from '../components/ScrollableView';
import { fetchCategories, resolveAmapShareRoute, searchPlacesAlongRoute } from './api';
import { clearAmapRoute, drawAmapRoutes, planAmapRoutes } from './alongRoute';

const MODE_OPTIONS = [
    { value: 'driving', label: '驾车', icon: 'directions_car' },
    { value: 'transit', label: '公交', icon: 'directions_bus' },
    { value: 'walking', label: '步行', icon: 'directions_walk' },
    { value: 'riding', label: '骑行', icon: 'directions_bike' }
];

function formatDistance(value) {
    const distance = Number(value);
    if (!Number.isFinite(distance)) return '';
    return distance >= 1000 ? `${(distance / 1000).toFixed(distance >= 10000 ? 0 : 1)} 公里` : `${Math.round(distance)} 米`;
}

function formatDuration(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `约 ${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `约 ${hours} 小时${rest ? ` ${rest} 分` : ''}`;
}

export default function AlongRoutePanel({
    open,
    onClose,
    mapRef,
    backendUrl,
    customThemeColor,
    customThemeSecondary,
    isNarrow,
    placement = 'left',
    mapReady,
    onResults,
    onSelectPlace
}) {
    const [shareUrl, setShareUrl] = useState('');
    const [resolvedUrl, setResolvedUrl] = useState('');
    const [trip, setTrip] = useState(null);
    const [mode, setMode] = useState('driving');
    const [query, setQuery] = useState('');
    const [categories, setCategories] = useState([]);
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [corridorMeters, setCorridorMeters] = useState(1000);
    const [results, setResults] = useState([]);
    const [routeSummary, setRouteSummary] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const overlaysRef = useRef([]);
    const requestRef = useRef(null);
    const wasOpenRef = useRef(false);

    const clearRoute = () => {
        clearAmapRoute(mapRef.current, overlaysRef.current);
        overlaysRef.current = [];
    };

    useEffect(() => {
        if (!open) return undefined;
        let active = true;
        fetchCategories(backendUrl)
            .then((items) => { if (active) setCategories(items); })
            .catch(() => { if (active) setCategories([]); });
        return () => { active = false; };
    }, [open, backendUrl]);

    useEffect(() => {
        if (open) {
            wasOpenRef.current = true;
            return;
        }
        if (!wasOpenRef.current) return;
        wasOpenRef.current = false;
        requestRef.current?.abort();
        requestRef.current = null;
        clearRoute();
        setBusy(false);
        setResults([]);
        setRouteSummary(null);
        onResults?.(null);
    }, [open]);

    useEffect(() => () => {
        requestRef.current?.abort();
        clearRoute();
    }, []);

    useEffect(() => {
        overlaysRef.current.forEach((overlay) => {
            if (typeof overlay?.setOptions === 'function' && overlay.CLASS_NAME === 'AMap.Polyline') {
                overlay.setOptions({ strokeColor: customThemeColor });
            }
        });
    }, [customThemeColor]);

    const visibleCategories = useMemo(() => {
        return categories
            .slice()
            .sort((left, right) => Number(!!right.is_common) - Number(!!left.is_common))
            .slice(0, 40);
    }, [categories]);

    const closePanel = () => {
        wasOpenRef.current = false;
        requestRef.current?.abort();
        requestRef.current = null;
        clearRoute();
        setBusy(false);
        setResults([]);
        setRouteSummary(null);
        setError('');
        onResults?.(null);
        onClose?.();
    };

    const toggleCategory = (name) => {
        setSelectedCategories((current) => current.includes(name)
            ? current.filter((item) => item !== name)
            : [...current, name]);
    };

    const handleSubmit = async (event) => {
        event?.preventDefault();
        const normalizedUrl = shareUrl.trim();
        if (!normalizedUrl) {
            setError('请先粘贴高德地图的行程分享链接');
            return;
        }
        if (!mapReady || !mapRef.current) {
            setError('地图还没有准备好，请稍候再试');
            return;
        }

        requestRef.current?.abort();
        const controller = new AbortController();
        requestRef.current = controller;
        setBusy(true);
        setError('');
        try {
            let effectiveTrip = trip;
            let effectiveMode = mode;
            if (!effectiveTrip || resolvedUrl !== normalizedUrl) {
                effectiveTrip = await resolveAmapShareRoute(backendUrl, normalizedUrl, { signal: controller.signal });
                effectiveMode = effectiveTrip.mode || 'driving';
                setTrip(effectiveTrip);
                setMode(effectiveMode);
                setResolvedUrl(normalizedUrl);
            }

            clearRoute();
            const planned = await planAmapRoutes({
                origin: effectiveTrip.origin,
                destination: effectiveTrip.destination,
                waypoints: effectiveTrip.waypoints,
                mode: effectiveMode
            });
            if (controller.signal.aborted) return;
            overlaysRef.current = drawAmapRoutes(mapRef.current, planned.routes, customThemeColor, customThemeSecondary);

            const response = await searchPlacesAlongRoute(backendUrl, {
                paths: planned.routes.map((route) => route.searchPath.map((point) => [point.lng, point.lat])),
                query,
                categories: selectedCategories,
                corridor_meters: corridorMeters,
                limit: 60
            }, { signal: controller.signal });
            if (controller.signal.aborted) return;

            const nextResults = Array.isArray(response.places) ? response.places : [];
            setResults(nextResults);
            setRouteSummary({ routes: planned.routes });
            onResults?.(nextResults);
        } catch (submitError) {
            if (submitError?.name !== 'AbortError') {
                setError(submitError?.message || '查找顺路地点失败');
                setResults([]);
                onResults?.([]);
            }
        } finally {
            if (requestRef.current === controller) {
                requestRef.current = null;
                setBusy(false);
            }
        }
    };

    if (!open) return null;

    const fieldStyle = {
        width: '100%',
        boxSizing: 'border-box',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--color-bg-overlay)',
        color: 'var(--color-text-primary)',
        padding: '10px 11px',
        outline: 'none',
        fontSize: 14
    };
    const tripName = (point, fallback) => point?.name || fallback;

    return (
        <section
            aria-label="顺路吃"
            style={{
                position: 'absolute',
                ...(isNarrow
                    ? { left: 10, right: 10, top: 10, bottom: 76 }
                    : { [placement]: 12, top: 68, bottom: 42, width: 370 }),
                zIndex: 3600,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                background: 'color-mix(in srgb, var(--color-bg-surface) 96%, transparent)',
                color: 'var(--color-text-primary)',
                boxShadow: 'var(--shadow-surface)',
                backdropFilter: 'blur(12px)'
            }}
        >
            <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--color-border)' }}>
                <span className="material-symbols-outlined" style={{ color: customThemeColor, fontSize: 24 }}>route</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{ margin: 0, fontSize: 17 }}>顺路吃</h2>
                    <div style={{ marginTop: 2, color: 'var(--color-text-secondary)', fontSize: 11 }}>沿高德行程找饭联已收录地点</div>
                </div>
                <Button type="button" onClick={closePanel} aria-label="关闭顺路吃" style={{ border: 0, background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 20, padding: '2px 7px' }}>×</Button>
            </header>

            <ScrollableView style={{ flex: 1 }}>
                <form onSubmit={handleSubmit} style={{ padding: 14 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>高德行程分享</label>
                    <input
                        type="text"
                        value={shareUrl}
                        onChange={(event) => {
                            setShareUrl(event.target.value);
                            if (event.target.value.trim() !== resolvedUrl) setTrip(null);
                        }}
                        placeholder="粘贴 surl.amap.com/..."
                        autoComplete="off"
                        style={fieldStyle}
                    />
                    <div style={{ marginTop: 5, color: 'var(--color-text-muted)', fontSize: 11, lineHeight: 1.45 }}>
                        只读取链接里的起点、终点和出行方式，不会读取高德账号信息。
                    </div>

                    {trip && (
                        <div style={{ marginTop: 10, padding: '9px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-overlay)', fontSize: 12, lineHeight: 1.55 }}>
                            <strong>{tripName(trip.origin, '行程起点')}</strong>
                            <span className="material-symbols-outlined" style={{ verticalAlign: 'middle', margin: '0 5px', fontSize: 16, color: customThemeColor }}>arrow_forward</span>
                            <strong>{tripName(trip.destination, '行程终点')}</strong>
                            {trip.waypoints?.length > 0 && (
                                <span style={{ marginLeft: 6, color: 'var(--color-text-secondary)' }}>· 含 {trip.waypoints.length} 个途经点</span>
                            )}
                        </div>
                    )}

                    <div style={{ marginTop: 13, fontSize: 12, fontWeight: 700 }}>出行方式</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 7 }}>
                        {MODE_OPTIONS.map((option) => {
                            const selected = mode === option.value;
                            return (
                                <Button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setMode(option.value)}
                                    aria-pressed={selected}
                                    style={{
                                        padding: '7px 3px',
                                        minWidth: 0,
                                        borderRadius: 'var(--radius-sm)',
                                        border: `1px solid ${selected ? customThemeColor : 'var(--color-border)'}`,
                                        background: selected ? 'color-mix(in srgb, var(--theme-primary) 14%, var(--color-bg-surface))' : 'var(--color-bg-surface)',
                                        color: selected ? customThemeColor : 'var(--color-text-secondary)',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                        fontSize: 11
                                    }}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 19 }}>{option.icon}</span>
                                    {option.label}
                                </Button>
                            );
                        })}
                    </div>

                    <label style={{ display: 'block', marginTop: 13, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>想吃什么（可不填）</label>
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="例如：火锅、想吃辣的、奶茶"
                        style={fieldStyle}
                    />

                    {visibleCategories.length > 0 && (
                        <>
                            <div style={{ marginTop: 13, fontSize: 12, fontWeight: 700 }}>标签（可多选）</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
                                {visibleCategories.map((category) => {
                                    const selected = selectedCategories.includes(category.name);
                                    return (
                                        <Button
                                            type="button"
                                            key={category.id || category.name}
                                            onClick={() => toggleCategory(category.name)}
                                            aria-pressed={selected}
                                            style={{
                                                borderRadius: 'var(--radius-full)',
                                                border: `1px solid ${selected ? customThemeColor : 'var(--color-border)'}`,
                                                background: selected ? customThemeColor : 'var(--color-bg-surface)',
                                                color: selected ? '#fff' : 'var(--color-text-secondary)',
                                                padding: '5px 9px',
                                                fontSize: 11
                                            }}
                                        >
                                            {category.name}
                                        </Button>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    <label style={{ display: 'block', marginTop: 13, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>离路线最远</label>
                    <select value={corridorMeters} onChange={(event) => setCorridorMeters(Number(event.target.value))} style={fieldStyle}>
                        <option value={500}>500 米 · 尽量不绕路</option>
                        <option value={1000}>1 公里 · 推荐</option>
                        <option value={2000}>2 公里 · 多看看</option>
                        <option value={3000}>3 公里 · 不怕绕路</option>
                    </select>

                    {error && (
                        <div role="alert" style={{ marginTop: 10, padding: '9px 10px', borderRadius: 'var(--radius-sm)', background: 'color-mix(in srgb, var(--color-danger) 10%, var(--color-bg-surface))', color: 'var(--color-danger)', fontSize: 12, lineHeight: 1.45 }}>
                            {error}
                        </div>
                    )}

                    <Button
                        type="submit"
                        disabled={busy || !mapReady}
                        style={{
                            width: '100%', marginTop: 13, padding: '10px 12px', border: 0,
                            borderRadius: 'var(--radius-sm)', background: customThemeColor, color: '#fff',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                            fontWeight: 700, opacity: busy || !mapReady ? 0.65 : 1
                        }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{busy ? 'progress_activity' : 'restaurant'}</span>
                        {busy ? '正在沿途觅食…' : (results.length ? '按新条件再找一次' : '找顺路吃的')}
                    </Button>
                </form>

                {routeSummary && (
                    <div style={{ padding: '11px 14px', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-overlay)', fontSize: 12 }}>
                        <strong>沿行程找到 {results.length} 个地点</strong>
                        <span style={{ marginLeft: 7, color: 'var(--color-text-secondary)' }}>
                            高德返回 {routeSummary.routes.length} 条方案，已全部纳入
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                            {routeSummary.routes.map((route) => (
                                <span key={route.index} style={{ padding: '3px 7px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)', fontSize: 10 }}>
                                    方案 {route.index + 1}{route.distance ? ` · ${formatDistance(route.distance)}` : ''}{route.duration ? ` · ${formatDuration(route.duration)}` : ''}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {routeSummary && results.length === 0 && !busy && (
                    <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
                        这条路线附近暂时没有匹配的饭联地点。可以放宽距离、清空标签，或换一种想吃的东西。
                    </div>
                )}

                {results.map((place, index) => (
                    <Button
                        type="button"
                        key={place.id}
                        onClick={() => onSelectPlace?.(place)}
                        style={{
                            width: '100%', boxSizing: 'border-box', border: 0, borderBottom: '1px solid var(--color-border)',
                            borderRadius: 0, background: 'transparent', color: 'var(--color-text-primary)',
                            padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left'
                        }}
                    >
                        <span style={{
                            width: 24, height: 24, flexShrink: 0, borderRadius: '50%', background: customThemeColor,
                            color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700
                        }}>{index + 1}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{place.name}</span>
                            <span style={{ display: 'block', marginTop: 3, color: 'var(--color-text-secondary)', fontSize: 11, lineHeight: 1.45 }}>
                                {[place.category, place.per_person_cost ? `人均约 ${place.per_person_cost} 元` : '', `离路线 ${formatDistance(place.distance_to_route)}`].filter(Boolean).join(' · ')}
                            </span>
                            <span style={{ display: 'block', marginTop: 2, color: 'var(--color-text-muted)', fontSize: 11 }}>
                                {(place.route_matches || []).map((match) => `方案 ${match.route_index + 1} 相距 ${formatDistance(match.distance_to_route)}`).join(' · ') || '路线经过'}
                            </span>
                        </span>
                        <span className="material-symbols-outlined" style={{ color: customThemeColor, fontSize: 20 }}>location_on</span>
                    </Button>
                ))}
            </ScrollableView>
        </section>
    );
}
