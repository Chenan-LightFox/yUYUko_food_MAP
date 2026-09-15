import React, { useEffect, useRef, useState } from 'react';
import Button from '../components/Button';
import { fetchRandomPlace } from './api';
import { normalizeLngLat } from './utils';
import { Exposure, eventId, request } from '../journey/feedback';

export default function RandomFoodPanel({ mapRef, backendUrl, token, isNarrow, placement, onClose, onSelectPlace, feedback }) {
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const centerRef = useRef(null);
    const recentRef = useRef([]);
    const requestRef = useRef(null);
    const closeRef = useRef(null);
    const pendingDrawRef = useRef(null);

    const draw = async (reset = false) => {
        if (requestRef.current) return;
        const center = reset ? normalizeLngLat(mapRef.current?.getCenter?.()) : centerRef.current;
        if (!center) {
            setError('地图尚未就绪，请稍后重试');
            return;
        }
        if (reset) {
            pendingDrawRef.current = null;
            centerRef.current = { lat: center.lat, lng: center.lng };
            recentRef.current = [];
        }
        const controller = new AbortController();
        if (result?.place) feedback?.record('next', 'random', result.place.id, { decision_id: result.decision_id || null });
        requestRef.current = controller;
        setBusy(true);
        setError('');
        setResult(null);
        try {
            let data;
            if (feedback?.consent?.feedback && token) {
                // A failed network attempt can be retried without drawing a different restaurant.
                pendingDrawRef.current ||= { draw_id: eventId(), center: centerRef.current, exclude_ids: [...recentRef.current] };
                data = await request(backendUrl, token, '/api/community/draw', { method: 'POST', signal: controller.signal,
                    body: JSON.stringify({ ...pendingDrawRef.current, consent_version: feedback.consent.version }) });
            } else data = await fetchRandomPlace(backendUrl, centerRef.current, recentRef.current, { signal: controller.signal, token });
            if (requestRef.current !== controller) return;
            pendingDrawRef.current = null;
            setResult(data);
            if (data.place) recentRef.current = [...recentRef.current, data.place.id].slice(-2);
        } catch (err) {
            if (requestRef.current === controller && err.name !== 'AbortError') {
                setError(err.message || '随机推荐加载失败，请稍后重试');
            }
        } finally {
            if (requestRef.current === controller) {
                requestRef.current = null;
                setBusy(false);
            }
        }
    };

    useEffect(() => {
        const previousFocus = document.activeElement;
        closeRef.current?.focus();
        draw(true);
        return () => {
            requestRef.current?.abort();
            requestRef.current = null;
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, [backendUrl, mapRef, token]);

    const place = result?.place;
    const distance = result?.distanceKm;
    const secondaryStyle = { background: 'transparent', color: 'var(--color-text-primary)', minHeight: 40 };

    return (
        <section role="dialog" aria-labelledby="random-food-title" aria-busy={busy}
            onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}
            style={{
                position: 'absolute', zIndex: 2300,
                ...(isNarrow ? { left: 12, right: 12, bottom: 184 } : { top: 72, [placement || 'left']: 64, width: 320 }),
                maxHeight: isNarrow ? 'calc(100% - 260px)' : 'calc(100% - 100px)', overflowY: 'auto',
                padding: 16, boxSizing: 'border-box', borderRadius: 'var(--radius-md)',
                background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-surface)'
            }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <h3 id="random-food-title" style={{ margin: 0, fontSize: 18 }}>今天吃什么？</h3>
                <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭随机美食"
                    style={{ ...secondaryStyle, border: 'none', cursor: 'pointer', minWidth: 40, fontSize: 22 }}>×</button>
            </div>
            <p style={{ margin: '4px 0 16px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                从本轮地图中心 5km 内，为你挑一家。
            </p>
            <div aria-live="polite" aria-atomic="true">
                {busy && <p role="status">正在挑选附近的美食…</p>}
                {error && <p role="alert">{error}</p>}
                {result && !place && <p>{result.message}</p>}
                {place && <Exposure feedback={feedback} placeId={place.id} surface="random" rank={0} decisionId={result.decision_id}>
                    {result.personalized && <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        已参考你的收藏、导航和分享偏好，也留一点机会尝鲜。
                    </p>}
                    <h4 style={{ margin: '0 0 8px', fontSize: 20, overflowWrap: 'anywhere' }}>{place.name}</h4>
                    <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' }}>
                        {place.category || '未分类'} · 距本轮中心 {distance < 1 ? `${Math.round(distance * 1000)} 米` : `${distance.toFixed(1)} 公里`}
                        {Number(place.per_person_cost) > 0 && ` · 人均 ¥${place.per_person_cost}`}
                    </p>
                    {place.description && <p style={{ fontSize: 14, lineHeight: 1.6, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{place.description}</p>}
                    <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>附近有 {result.candidateCount} 家可选，换一家会避开最近两次推荐。</p>
                </Exposure>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                {place && <Button disabled={busy} style={{ flex: 1, minHeight: 40 }}
                    onClick={() => { feedback?.record('click', 'random', place.id, { decision_id: result.decision_id || null }); onSelectPlace(place); onClose(); }}>查看地点</Button>}
                <Button disabled={busy} style={{ ...secondaryStyle, flex: 1 }} onClick={() => draw(!centerRef.current)}>
                    {busy ? '挑选中…' : place ? '再换一家' : '再试一次'}
                </Button>
            </div>
            <Button disabled={busy} full style={{ ...secondaryStyle, marginTop: 8 }} onClick={() => draw(true)}>
                按当前地图中心重新抽取
            </Button>
        </section>
    );
}
