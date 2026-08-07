import React, { useEffect, useMemo, useRef, useState } from 'react';
import Button from './components/Button';
import TextInput from './components/TextInput';
import TextArea from './components/TextArea';
import JsonTable from './components/JsonTable';
import { createDinner, deleteDinner, fetchDinnerById, fetchDinners } from './map/api';
import { useTips } from './components/Tips';
import useDarkMode from './utils/useDarkMode';
import MapView from './Map';
import Tooltip from './components/Tooltip';
import ScrollableView from './components/ScrollableView';

function formatDateTime(value) {
    if (!value) return '时间待定';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('zh-CN', { hour12: false });
}

function normalizeInputDateTime(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day}T${hh}:${mm}`;
}

function buildShareUrl(id, backendUrl) {
    const normalizedBackend = String(backendUrl || '').replace(/\/+$/, '');
    // Use backend share endpoint so crawlers and direct opens always hit an existing HTML route with OG tags.
    if (normalizedBackend) {
        return `${normalizedBackend}/dinners/${id}/share`;
    }

    const path = `/dinners/${id}/share`;
    if (typeof window === 'undefined' || !window.location || !window.location.origin) {
        return path;
    }
    return `${window.location.origin}${path}`;
}

function pageStyle(dark) {
    return {
        height: '100%',
        minHeight: 0,
        background: 'var(--color-bg-base)',
        color: 'var(--color-text-primary)',
        padding: 20,
        boxSizing: 'border-box'
    };
}

function cardStyle(dark) {
    return {
        borderRadius: 10,
        border: '1px solid var(--color-border)',
        background: 'var(--color-bg-surface)',
        boxShadow: '0 8px 24px var(--color-glow)',
        padding: 20
    };
}

function containerStyle() {
    return {
        maxWidth: 960,
        margin: '0 auto'
    };
}

function titleRowStyle() {
    return {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
        marginTop: 50
    };
}

function captionStyle(dark) {
    return {
        marginBottom: 14,
        color: 'var(--color-text-secondary)',
        fontSize: 16
    };
}

export function DinnerListPage({ backendUrl, onGoCreate, onOpenDetail, onGoHome }) {
    const dark = useDarkMode();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [items, setItems] = useState([]);

    const sortedItems = useMemo(() => {
        return [...items].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    }, [items]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError('');
            try {
                const data = await fetchDinners(backendUrl);
                if (!cancelled) setItems(Array.isArray(data) ? data : []);
            } catch (e) {
                if (!cancelled) setError(e.message || '加载失败');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [backendUrl]);

    return (
        <ScrollableView as="main" style={pageStyle(dark)}>
            <div style={containerStyle()}>
                <div style={titleRowStyle()}>
                    <h2 style={{ margin: 0 }}>聚餐活动</h2>
                </div>

                <div style={cardStyle(dark)}>
                    <p style={{ marginTop: 0, color: 'var(--color-text-secondary)' }}>支持发起、访问、分享的活动页，方便直接约人。</p>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                        <Button onClick={onGoCreate} style={{ border: 0 }}>发起聚餐</Button>
                    </div>

                    {loading && <div>正在加载活动...</div>}
                    {!!error && <div style={{ color: 'var(--color-danger)' }}>{error}</div>}
                    {!loading && !error && sortedItems.length === 0 && (
                        <div style={{ color: 'var(--color-text-secondary)' }}>还没有聚餐活动，来发起第一场吧。</div>
                    )}

                    {!loading && !error && sortedItems.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {sortedItems.map((item) => (
                                <div key={item.id} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: 14, background: 'var(--color-bg-overlay)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <strong style={{ fontSize: 18 }}>{item.title}</strong>
                                        <Button onClick={() => onOpenDetail(item.id)} style={{ padding: '6px 12px', border: 0 }}>查看详情</Button>
                                    </div>
                                    <div style={{ marginTop: 8, color: 'var(--color-text-secondary)' }}>
                                        {formatDateTime(item.start_time)} · {item.place_name}
                                    </div>
                                    <div style={{ marginTop: 4, fontSize: 13, color: 'var(--color-text-muted)' }}>
                                        状态：{item.status || 'open'} · 发起人：{item.creator_name || '匿名'}
                                    </div>
                                    <div style={{ marginTop: 6, color: 'var(--color-text-primary)' }}>{item.description || '暂无活动说明'}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </ScrollableView>
    );
}

export function DinnerCreatePage({ backendUrl, token, isAuth, onCreated, onRequireAuth, onBack, onMapPickerOpenChange }) {
    const dark = useDarkMode();
    const dateInputRef = useRef(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [placeName, setPlaceName] = useState('');
    const [startTime, setStartTime] = useState('');
    const [maxParticipants, setMaxParticipants] = useState('');
    const [contactInfo, setContactInfo] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [pickerOpen, setPickerOpen] = useState(false);

    useEffect(() => {
        if (typeof onMapPickerOpenChange === 'function') {
            onMapPickerOpenChange(pickerOpen);
        }
    }, [pickerOpen, onMapPickerOpenChange]);

    useEffect(() => {
        if (!pickerOpen) return;
        const onKey = (e) => {
            if (e.key === 'Escape') setPickerOpen(false);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [pickerOpen]);

    useEffect(() => {
        return () => {
            if (typeof onMapPickerOpenChange === 'function') onMapPickerOpenChange(false);
        };
    }, [onMapPickerOpenChange]);

    const submit = async (e) => {
        e.preventDefault();
        if (!isAuth || !token) {
            onRequireAuth && onRequireAuth();
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            const payload = {
                title,
                description,
                place_name: placeName,
                start_time: startTime,
                max_participants: maxParticipants ? Number(maxParticipants) : null,
                contact_info: contactInfo
            };
            const created = await createDinner(backendUrl, token, payload);
            onCreated && onCreated(created);
        } catch (err) {
            setError(err.message || '创建失败');
        } finally {
            setSubmitting(false);
        }
    };

    const openDatePicker = () => {
        const input = dateInputRef.current;
        if (!input) return;
        if (typeof input.showPicker === 'function') {
            input.showPicker();
            return;
        }
        input.focus();
    };

    return (
        <ScrollableView as="main" style={pageStyle(dark)}>
            <div style={containerStyle()}>
                <div style={titleRowStyle()}>
                    <h2 style={{ margin: 0 }}>发起聚餐</h2>
                </div>

                <div style={cardStyle(dark)}>
                    <p style={{ marginTop: 0, color: 'var(--color-text-secondary)' }}>创建后会生成独立可分享链接</p>
                    <style>{`
                        .dinner-datetime-input::-webkit-calendar-picker-indicator {
                            opacity: 0;
                        }
                        .dinner-datetime-input::-webkit-inner-spin-button,
                        .dinner-datetime-input::-webkit-clear-button {
                            display: none;
                        }
                    `}</style>
                    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="活动标题（例如：周六晚东方同好局）" required maxLength={120} />
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <TextInput
                                value={placeName}
                                onChange={(e) => setPlaceName(e.target.value)}
                                placeholder="聚餐地点"
                                required
                                maxLength={120}
                                style={{ flex: 1 }}
                            />
                            <Tooltip text="从地图选择地点" placement="top">
                                <Button
                                    onClick={() => setPickerOpen(true)}
                                    style={{ width: 44, height: 44, padding: 0, borderRadius: '50%', border: 0 }}
                                    aria-label="从地图选择地点"
                                    type="button"
                                >
                                    <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 24 }}>location_on</span>
                                </Button>
                            </Tooltip>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <TextInput
                                ref={dateInputRef}
                                className="dinner-datetime-input"
                                type="datetime-local"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                                required
                                style={{ flex: 1 }}
                            />
                            <Tooltip text="选择日期时间" placement="top">
                                <Button
                                    onClick={openDatePicker}
                                    type="button"
                                    aria-label="选择日期时间"
                                    style={{ width: 44, height: 44, padding: 0, borderRadius: '50%', border: 0 }}
                                >
                                    <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 24 }}>calendar_month</span>
                                </Button>
                            </Tooltip>
                        </div>
                        <TextInput type="number" min={2} max={1000} value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} placeholder="人数上限（可选）" />
                        <TextInput value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} placeholder="联系方式（可选）" maxLength={200} />
                        <TextArea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="活动说明（可选）"
                            maxLength={1200}
                            rows={5}
                            style={{
                                borderRadius: 12,
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-bg-overlay)',
                                color: 'var(--color-text-primary)',
                                padding: 12
                            }}
                        />

                        {!!error && <div style={{ color: 'var(--color-danger)' }}>{error}</div>}

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <Button type="submit" disabled={submitting} style={{ border: 0 }}>{submitting ? '正在创建...' : '创建聚餐活动'}</Button>
                        </div>
                    </form>
                </div>
            </div>

            {pickerOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 3500, background: 'var(--color-bg-base)' }}>
                    <MapView
                        backendUrl={backendUrl}
                        token={token}
                        isAuthenticated={isAuth}
                        onRequireAuth={onRequireAuth}
                        onOpenDinnerCreate={() => { }}
                        onOpenDinners={() => { }}
                        pickerMode
                        onPickPlace={(place) => {
                            const picked = (place && (place.name || place.address)) ? (place.name || place.address) : '';
                            if (picked) setPlaceName(picked);
                            setPickerOpen(false);
                        }}
                        onPickerClose={() => setPickerOpen(false)}
                    />
                </div>
            )}
        </ScrollableView>
    );
}

export function DinnerDetailPage({ backendUrl, dinnerId, token, currentUserId, isAdmin, onBackList, onGoHome }) {
    const dark = useDarkMode();
    const showTip = useTips();
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState('');
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError('');
            try {
                const data = await fetchDinnerById(backendUrl, dinnerId);
                if (!cancelled) setItem(data);
            } catch (e) {
                if (!cancelled) setError(e.message || '加载失败');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [backendUrl, dinnerId]);

    const shareUrl = item ? buildShareUrl(item.id, backendUrl) : '';
    const ogImageUrl = item ? `${String(backendUrl).replace(/\/+$/, '')}/dinners/${item.id}/og-image` : '';
    const canDelete = !!(item && token && ((currentUserId && String(item.creator_id) === String(currentUserId)) || isAdmin));

    const copyLink = async () => {
        if (!shareUrl) return;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied('分享链接已复制');
        } catch (e) {
            setCopied('复制失败，请手动复制');
        }
    };

    const handleDelete = async () => {
        if (!item || !token || !canDelete || deleting) return;
        const ok = window.confirm('确认删除本次聚餐活动吗？删除后不可恢复。');
        if (!ok) return;
        setDeleting(true);
        try {
            await deleteDinner(backendUrl, token, item.id);
            showTip('聚餐活动删除成功');
            onBackList && onBackList();
        } catch (e) {
            const msg = (e && e.message) ? e.message : '未知错误';
            showTip(`删除聚餐失败：${msg}`);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <ScrollableView as="main" style={pageStyle(dark)}>
            <div style={containerStyle()}>
                <div style={titleRowStyle()}>
                    <h2 style={{ margin: 0 }}>聚餐详情</h2>
                </div>

                <div style={cardStyle(dark)}>
                    {loading && <div>正在加载聚餐详情...</div>}
                    {!!error && <div style={{ color: 'var(--color-danger)' }}>{error}</div>}
                    {!loading && !error && item && (
                        <>
                            <h2 style={{ marginTop: 0 }}>{item.title}</h2>
                            <p style={{ color: 'var(--color-text-secondary)' }}>
                                {formatDateTime(item.start_time)} · {item.place_name}
                            </p>
                            <p style={{ marginBottom: 10 }}>{item.description || '暂无活动说明'}</p>
                            <p style={{ marginTop: 0, color: 'var(--color-text-secondary)' }}>
                                发起人：{item.creator_name || '匿名'}
                                {item.max_participants ? ` · 人数上限：${item.max_participants}` : ''}
                                {item.contact_info ? ` · 联系方式：${item.contact_info}` : ''}
                            </p>
                            <p style={{ marginTop: 0, color: 'var(--color-text-secondary)' }}>
                                活动ID：{item.id} · 状态：{item.status || '开放中'}
                            </p>
                            <p style={{ marginTop: 0, color: 'var(--color-text-secondary)' }}>
                                创建时间：{formatDateTime(item.created_time)} · 更新时间：{formatDateTime(item.updated_time)}
                            </p>

                            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-bg-overlay)' }}>
                                <div style={{ fontWeight: 700, marginBottom: 6 }}>可分享链接（含 OG 卡片）</div>
                                <div style={{ wordBreak: 'break-all', color: 'var(--color-text-primary)' }}>{shareUrl}</div>
                                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--color-text-secondary)' }}>可在支持预览的平台展示聚餐活动卡片，而非普通地点页。</div>
                                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                                    <Button onClick={copyLink} style={{ border: 0 }}>复制分享链接</Button>
                                    <a href={shareUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                                        <Button style={{ border: 0 }}>打开分享页</Button>
                                    </a>
                                    {canDelete && (
                                        <Button onClick={handleDelete} disabled={deleting} style={{ background: 'var(--color-danger)', color: 'var(--color-on-emphasis)', border: 0 }}>
                                            {deleting ? '删除中...' : '删除此次聚餐'}
                                        </Button>
                                    )}
                                </div>
                                {!!copied && <div style={{ marginTop: 8, color: 'var(--color-success)' }}>{copied}</div>}
                            </div>

                            <div style={{ marginTop: 14 }}>
                                <div style={{ fontWeight: 700, marginBottom: 8 }}>OG 卡片预览图</div>
                                <img src={ogImageUrl} alt="聚餐活动 OG 卡片" style={{ width: '100%', borderRadius: 12, border: 0 }} />
                            </div>

                            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                                <Button onClick={onBackList} style={{ border: 0 }}>返回活动列表</Button>
                                <Button onClick={onGoHome} style={{ border: 0 }}>返回地图</Button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </ScrollableView>
    );
}

export function parseDinnerIdFromPath(pathname) {
    const m = String(pathname || '').match(/^\/dinners\/(\d+)(?:\/)?$/);
    return m ? Number(m[1]) : null;
}

export function isDinnerPath(pathname) {
    return /^\/dinners(?:\/new|\/\d+)?\/?$/.test(String(pathname || ''));
}

export function normalizeDinnerCreateDefaultTime() {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    return normalizeInputDateTime(now.toISOString());
}
