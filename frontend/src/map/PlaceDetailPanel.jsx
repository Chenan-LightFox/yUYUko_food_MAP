import React, { useRef, useState } from 'react';
import Button from '../components/Button';
import ScrollableView from '../components/ScrollableView';
import useMediaQuery from '../utils/useMediaQuery';

function parseImages(value) {
    if (Array.isArray(value)) return value;
    try { return value ? JSON.parse(value) : []; } catch (e) { return []; }
}

export default function PlaceDetailPanel({ place, onClose, onNavigate }) {
    const isMobile = useMediaQuery('(max-width: 640px)');
    const [previewImage, setPreviewImage] = useState(null);
    const [sheetOffset, setSheetOffset] = useState(0);
    const [dragging, setDragging] = useState(false);
    const dragStartRef = useRef(null);
    const dragOffsetRef = useRef(0);
    if (!place) return null;

    const exteriorImages = parseImages(place.exterior_images);
    const menuImages = parseImages(place.menu_images);

    const onDragStart = (event) => {
        if (!isMobile) return;
        dragStartRef.current = { y: event.clientY, offset: sheetOffset };
        setDragging(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const onDragMove = (event) => {
        if (!dragStartRef.current) return;
        const nextOffset = Math.max(0, dragStartRef.current.offset + event.clientY - dragStartRef.current.y);
        dragOffsetRef.current = nextOffset;
        setSheetOffset(nextOffset);
    };
    const onDragEnd = () => {
        if (!dragStartRef.current) return;
        dragStartRef.current = null;
        setDragging(false);
        if (dragOffsetRef.current > 110) onClose?.();
        else {
            dragOffsetRef.current = 0;
            setSheetOffset(0);
        }
    };

    const panelStyle = isMobile ? {
        position: 'absolute', left: 0, right: 0, bottom: 0,
        height: 'min(72vh, 620px)', maxHeight: 'calc(var(--app-height, 100vh) - 72px)',
        borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
        transform: `translateY(${sheetOffset}px)`,
        transition: dragging ? 'none' : 'transform 180ms ease-out'
    } : {
        position: 'absolute', top: 80, right: 20, width: 350, bottom: 24,
        borderRadius: 12
    };

    const renderImageGroup = (title, images) => images.length > 0 && (
        <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--color-text-secondary)' }}>{title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {images.map((url, index) => (
                    <img
                        key={`${url}-${index}`}
                        src={url}
                        alt={`${title} ${index + 1}`}
                        style={{ width: '100%', borderRadius: 8, display: 'block', cursor: 'zoom-in' }}
                        loading="lazy"
                        onClick={() => setPreviewImage(url)}
                    />
                ))}
            </div>
        </div>
    );

    return (
        <>
            <section
                aria-label={`${place.name} 详情`}
                style={{
                    ...panelStyle,
                    background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-surface)',
                    display: 'flex', flexDirection: 'column', zIndex: 5000, boxSizing: 'border-box', overflow: 'hidden'
                }}
            >
                <div
                    onPointerDown={onDragStart}
                    onPointerMove={onDragMove}
                    onPointerUp={onDragEnd}
                    onPointerCancel={onDragEnd}
                    style={{ padding: isMobile ? '8px 16px 14px' : '16px 20px', borderBottom: '1px solid var(--color-border)', touchAction: 'none', cursor: isMobile ? 'grab' : 'default' }}
                >
                    {isMobile && <div aria-hidden="true" style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--color-border)', margin: '0 auto 10px' }} />}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                            <h2 style={{ margin: 0, fontSize: 18, overflowWrap: 'anywhere' }}>{place.name}</h2>
                            <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 8, color: 'var(--color-text-secondary)', fontSize: 13 }}>
                                <span>{place.category || '未分类'}</span>
                                {place.per_person_cost != null && <span>人均 ¥{place.per_person_cost}</span>}
                            </div>
                        </div>
                        <Button variant="secondary" onClick={onClose} aria-label="关闭详情" style={{ flexShrink: 0, width: 36, height: 36, padding: 0, borderRadius: 999, border: 'none', background: 'var(--color-bg-overlay)', fontSize: 20, color: 'var(--color-text-secondary)' }}>×</Button>
                    </div>
                    {onNavigate && (
                        <Button
                            themeAware
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => onNavigate(place)}
                            style={{ width: isMobile ? '100%' : 'auto', marginTop: 12, minHeight: 42, padding: '8px 16px', fontWeight: 700 }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 19, verticalAlign: 'middle', marginRight: 5 }}>navigation</span>
                            导航到这里
                        </Button>
                    )}
                </div>

                <ScrollableView style={{ flex: 1, minHeight: 0, padding: isMobile ? '16px' : '20px', paddingBottom: isMobile ? 'calc(20px + env(safe-area-inset-bottom))' : 20 }}>
                    <div style={{ marginBottom: 24 }}>
                        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4 }}>描述</div>
                        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{place.description || '暂无描述'}</div>
                    </div>
                    {renderImageGroup('外观 / 招牌', exteriorImages)}
                    {renderImageGroup('菜单', menuImages)}
                    {exteriorImages.length === 0 && menuImages.length === 0 && (
                        <div style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', fontSize: 13, marginTop: 24, textAlign: 'center' }}>暂无相关图片</div>
                    )}
                </ScrollableView>
            </section>

            {previewImage && (
                <div role="presentation" onClick={() => setPreviewImage(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.9)', zIndex: 7000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <button type="button" onClick={() => setPreviewImage(null)} aria-label="关闭大图" style={{ position: 'absolute', top: 20, right: 20, width: 44, height: 44, borderRadius: 999, border: 'none', background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: 26, cursor: 'pointer' }}>×</button>
                    <img src={previewImage} alt="图片大图预览" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, userSelect: 'none' }} onClick={(event) => event.stopPropagation()} />
                </div>
            )}
        </>
    );
}
