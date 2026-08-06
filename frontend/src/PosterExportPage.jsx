import React, { useEffect, useMemo, useRef, useState } from 'react';
import Button from './components/Button';
import TextArea from './components/TextArea';
import TextInput from './components/TextInput';
import MapView from './Map';
import { useTips } from './components/Tips';
import useDarkMode from './utils/useDarkMode';
import { createMapPoster } from './utils/posterCanvas';

function pageStyle(dark) {
    return {
        minHeight: 'var(--app-height, 100vh)',
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

function getPlaceKey(place) {
    if (place?.id !== undefined && place?.id !== null && String(place.id) !== '') {
        return `id:${place.id}`;
    }

    const longitude = Number(place?.longitude);
    const latitude = Number(place?.latitude);
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
        return `coord:${longitude.toFixed(6)},${latitude.toFixed(6)}`;
    }

    return `name:${String(place?.name || place?.address || '').trim()}`;
}

function getPlaceName(place) {
    return String(place?.name || place?.address || '未命名地点').trim();
}

function downloadCanvas(canvas, filename) {
    return new Promise((resolve, reject) => {
        const triggerDownload = (url, shouldRevoke) => {
            const link = document.createElement('a');
            link.download = filename;
            link.href = url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            if (shouldRevoke) window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            resolve();
        };

        if (typeof canvas.toBlob !== 'function') {
            try {
                triggerDownload(canvas.toDataURL('image/png'), false);
            } catch (error) {
                reject(error);
            }
            return;
        }

        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('海报生成失败'));
                return;
            }
            triggerDownload(URL.createObjectURL(blob), true);
        }, 'image/png');
    });
}

export default function PosterExportPage({ backendUrl, token, isAuth, onRequireAuth, onMapPickerOpenChange }) {
    const dark = useDarkMode();
    const showTip = useTips();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [selectedPlaces, setSelectedPlaces] = useState([]);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState('');
    const [previewCanvas, setPreviewCanvas] = useState(null);
    const [previewKey, setPreviewKey] = useState('');
    const [previewing, setPreviewing] = useState(false);
    const [previewError, setPreviewError] = useState('');
    const [previewRetryKey, setPreviewRetryKey] = useState(0);
    const previewCanvasRef = useRef(null);
    const previewRequestRef = useRef(0);

    const selectedKeys = useMemo(() => new Set(selectedPlaces.map(getPlaceKey)), [selectedPlaces]);
    const posterQrValue = typeof window !== 'undefined' && window.location?.origin
        ? `${window.location.origin}/`
        : 'https://dinnerparty.cc/';
    const posterInputKey = useMemo(() => JSON.stringify({
        title: title.trim(),
        description: description.trim(),
        backendUrl,
        qrValue: posterQrValue,
        places: selectedPlaces.map((place) => ({
            key: getPlaceKey(place),
            name: getPlaceName(place),
            category: place?.category || '',
            longitude: place?.longitude,
            latitude: place?.latitude
        }))
    }), [title, description, selectedPlaces, backendUrl, posterQrValue]);
    const previewReady = !!previewCanvas && previewKey === posterInputKey;

    useEffect(() => {
        if (typeof onMapPickerOpenChange === 'function') {
            onMapPickerOpenChange(pickerOpen);
        }
    }, [pickerOpen, onMapPickerOpenChange]);

    useEffect(() => {
        if (!pickerOpen) return undefined;
        const onKeyDown = (event) => {
            if (event.key === 'Escape') setPickerOpen(false);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [pickerOpen]);

    useEffect(() => {
        return () => {
            if (typeof onMapPickerOpenChange === 'function') onMapPickerOpenChange(false);
        };
    }, [onMapPickerOpenChange]);

    useEffect(() => {
        const normalizedTitle = title.trim();
        const requestId = previewRequestRef.current + 1;
        previewRequestRef.current = requestId;

        if (!normalizedTitle || selectedPlaces.length === 0) {
            setPreviewCanvas(null);
            setPreviewKey('');
            setPreviewing(false);
            setPreviewError('');
            return undefined;
        }

        setPreviewing(true);
        setPreviewError('');
        const timer = window.setTimeout(async () => {
            try {
                const canvas = await createMapPoster({
                    title: normalizedTitle,
                    description: description.trim(),
                    places: selectedPlaces,
                    backendUrl,
                    qrValue: posterQrValue
                });
                if (previewRequestRef.current !== requestId) return;
                setPreviewCanvas(canvas);
                setPreviewKey(posterInputKey);
            } catch (previewGenerationError) {
                if (previewRequestRef.current !== requestId) return;
                setPreviewCanvas(null);
                setPreviewKey('');
                setPreviewError(previewGenerationError?.message || '海报预览生成失败，请稍后重试');
            } finally {
                if (previewRequestRef.current === requestId) setPreviewing(false);
            }
        }, 500);

        return () => window.clearTimeout(timer);
    }, [posterInputKey, previewRetryKey, title, description, selectedPlaces, backendUrl, posterQrValue]);

    useEffect(() => {
        const visibleCanvas = previewCanvasRef.current;
        if (!visibleCanvas || !previewCanvas) return;
        const context = visibleCanvas.getContext('2d');
        if (!context) return;
        context.clearRect(0, 0, visibleCanvas.width, visibleCanvas.height);
        context.drawImage(previewCanvas, 0, 0, visibleCanvas.width, visibleCanvas.height);
    }, [previewCanvas]);

    const addSelectedPlace = (place) => {
        const key = getPlaceKey(place);
        if (!key || selectedKeys.has(key)) {
            showTip && showTip('这个地点已经在海报中了');
            return;
        }
        if (!Number.isFinite(Number(place?.longitude)) || !Number.isFinite(Number(place?.latitude))) {
            showTip && showTip('这个地点缺少坐标，无法加入海报');
            return;
        }
        setSelectedPlaces((items) => [...items, place]);
        showTip && showTip(`已选择：${getPlaceName(place)}`);
    };

    const removeSelectedPlace = (place) => {
        const key = getPlaceKey(place);
        setSelectedPlaces((items) => items.filter((item) => getPlaceKey(item) !== key));
    };

    const exportPoster = async () => {
        const normalizedTitle = title.trim();
        if (!normalizedTitle) {
            setError('请先填写海报标题');
            return;
        }
        if (selectedPlaces.length === 0) {
            setError('请至少选择一个地点');
            return;
        }
        if (!previewReady) {
            setError('请等待海报预览生成完成');
            return;
        }

        setExporting(true);
        setError('');
        try {
            const safeTitle = normalizedTitle.replace(/[\\/:*?"<>|]/g, '-').slice(0, 40) || '地点海报';
            await downloadCanvas(previewCanvas, `${safeTitle}.png`);
            showTip && showTip('海报已导出');
        } catch (exportError) {
            setError(exportError?.message || '海报导出失败，请稍后重试');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div style={pageStyle(dark)}>
            <div style={{ maxWidth: 960, margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, marginTop: 50 }}>
                    <h2 style={{ margin: 0 }}>导出地点海报</h2>
                </div>

                <div style={cardStyle(dark)}>
                    <p style={{ marginTop: 0, color: 'var(--color-text-secondary)' }}>
                        选择多个地点，生成一张可直接分享的高清 PNG 海报
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <label htmlFor="poster-title" style={{ fontSize: 16, fontWeight: 600 }}>
                                    海报标题（必填）
                                </label>
                                <TextInput
                                    id="poster-title"
                                    value={title}
                                    onChange={(event) => setTitle(event.target.value)}
                                    maxLength={60}
                                    required
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <label htmlFor="poster-description" style={{ fontSize: 16, fontWeight: 600 }}>
                                    海报简介（可选）
                                </label>
                                <TextArea
                                    id="poster-description"
                                    value={description}
                                    onChange={(event) => setDescription(event.target.value)}
                                    maxLength={240}
                                    rows={5}
                                    style={{
                                        borderRadius: 12,
                                        border: '1px solid var(--color-border)',
                                        background: 'var(--color-bg-overlay)',
                                        color: 'var(--color-text-primary)',
                                        padding: 12
                                    }}
                                />
                            </div>
                        </div>

                        <section aria-labelledby="poster-place-heading" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <h3 id="poster-place-heading" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>选择地点</h3>
                                <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                                    已选择 {selectedPlaces.length} 个
                                </span>
                            </div>

                            <div style={{
                                border: '1px solid var(--color-border)',
                                borderRadius: 12,
                                overflow: 'hidden',
                                background: 'var(--color-bg-surface)'
                            }}>
                                {selectedPlaces.length === 0 ? (
                                    <div style={{ padding: '22px 14px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                                        还没有选择地点
                                    </div>
                                ) : (
                                    selectedPlaces.map((place, index) => (
                                        <div
                                            key={getPlaceKey(place)}
                                            style={{
                                                padding: '11px 14px',
                                                display: 'flex',
                                                gap: 12,
                                                alignItems: 'center',
                                                borderBottom: index < selectedPlaces.length - 1 ? '1px solid var(--color-border)' : 'none'
                                            }}
                                        >
                                            <span style={{
                                                width: 28,
                                                height: 28,
                                                borderRadius: '50%',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                                background: 'var(--theme-primary)',
                                                color: '#2B2533',
                                                fontSize: 12,
                                                fontWeight: 700
                                            }}>
                                                {index + 1}
                                            </span>
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getPlaceName(place)}</div>
                                                <div style={{ marginTop: 2, color: 'var(--color-text-secondary)', fontSize: 12 }}>
                                                    {place?.category || '未分类'}
                                                    {place?.per_person_cost !== undefined && place?.per_person_cost !== null ? ` · 人均 ¥${place.per_person_cost}` : ''}
                                                </div>
                                            </div>
                                            <Button
                                                type="button"
                                                onClick={() => removeSelectedPlace(place)}
                                                aria-label={`移除${getPlaceName(place)}`}
                                                style={{ padding: '5px 9px', background: 'transparent', color: 'var(--color-danger)', border: '1px solid var(--color-danger)' }}
                                            >
                                                移除
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div>
                                <Button type="button" onClick={() => setPickerOpen(true)} style={{ border: 0 }}>
                                    前往地图选择
                                </Button>
                            </div>
                        </section>

                        <section aria-labelledby="poster-preview-heading" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <h3 id="poster-preview-heading" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>海报预览</h3>
                                <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                                    {previewing ? '正在更新' : previewReady ? '预览已生成' : '等待生成'}
                                </span>
                            </div>

                            <div style={{
                                border: '1px solid var(--color-border)',
                                borderRadius: 12,
                                overflow: 'hidden',
                                background: 'var(--color-bg-surface)'
                            }}>
                                <div style={{
                                    position: 'relative',
                                    aspectRatio: '16 / 9',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'hidden',
                                    background: 'var(--color-bg-overlay)'
                                }}>
                                    {previewCanvas ? (
                                        <canvas
                                            ref={previewCanvasRef}
                                            width={1600}
                                            height={900}
                                            aria-label="地点海报预览"
                                            style={{ display: 'block', width: '100%', height: 'auto' }}
                                        />
                                    ) : (
                                        <div style={{
                                            padding: 24,
                                            textAlign: 'center',
                                            color: 'var(--color-text-secondary)',
                                            fontSize: 14
                                        }}>
                                            {previewError ? '暂时无法显示预览' : '填写标题并选择地点后，将在这里生成海报预览'}
                                        </div>
                                    )}

                                    {previewing && (
                                        <div
                                            role="status"
                                            style={{
                                                position: 'absolute',
                                                inset: 0,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: 'rgba(15, 23, 42, 0.58)',
                                                color: '#fff',
                                                fontSize: 14
                                            }}
                                        >
                                            正在生成海报预览...
                                        </div>
                                    )}
                                </div>

                                {!!previewError && (
                                    <div style={{
                                        padding: '10px 14px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 12,
                                        color: 'var(--color-danger)',
                                        fontSize: 13
                                    }}>
                                        <span>{previewError}</span>
                                        <Button
                                            type="button"
                                            onClick={() => setPreviewRetryKey((value) => value + 1)}
                                            style={{ flexShrink: 0, background: 'transparent', color: 'var(--color-danger)' }}
                                        >
                                            重试
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </section>

                        {!!error && <div role="alert" style={{ color: 'var(--color-danger)' }}>{error}</div>}

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <Button
                                type="button"
                                onClick={exportPoster}
                                disabled={exporting || previewing || !previewReady}
                                style={{ border: 0 }}
                            >
                                {exporting ? '正在导出...' : previewing ? '正在生成预览...' : '导出海报'}
                            </Button>
                        </div>
                    </div>
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
                        pickerContext="poster"
                        pickedPlaces={selectedPlaces}
                        onPickPlace={addSelectedPlace}
                        onRemovePickedPlace={removeSelectedPlace}
                        onPickerClose={() => setPickerOpen(false)}
                    />
                </div>
            )}
        </div>
    );
}
