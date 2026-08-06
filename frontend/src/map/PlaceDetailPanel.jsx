import React, { useState } from 'react';
import Button from '../components/Button';
import useDarkMode from '../utils/useDarkMode';
import ScrollableView from '../components/ScrollableView';

export default function PlaceDetailPanel({ place, onClose }) {
    const dark = useDarkMode();
    const [previewImage, setPreviewImage] = useState(null);
    if (!place) return null;

    let exteriorImages = [];
    let menuImages = [];
    try { if (place.exterior_images) exteriorImages = JSON.parse(place.exterior_images); } catch (e) { }
    try { if (place.menu_images) menuImages = JSON.parse(place.menu_images); } catch (e) { }

    return (
        <>
            <div style={{
                position: 'absolute', top: 120, right: 30, width: 350, bottom: 220,
                background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)',
                borderRadius: 10, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-surface)',
                display: 'flex', flexDirection: 'column', zIndex: 5000
            }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: 18 }}>{place.name} 详情</h2>
                    <Button variant="secondary" onClick={onClose} style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: 'transparent', fontSize: 18, lineHeight: 1, color: 'var(--color-text-secondary)' }} title="关闭">×</Button>
                </div>

                <ScrollableView style={{ flex: 1, padding: '20px' }}>
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4 }}>分类</div>
                        <div>{place.category || '暂无'}</div>
                    </div>

                    <div style={{ marginBottom: 24 }}>
                        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4 }}>描述</div>
                        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{place.description || '暂无描述'}</div>
                    </div>

                    {place.per_person_cost != null && (
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4 }}>人均</div>
                            <div>¥{place.per_person_cost}</div>
                        </div>
                    )}

                    {exteriorImages.length > 0 && (
                        <div style={{ marginBottom: 24 }}>
                            <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8, color: 'var(--color-text-secondary)' }}>外观/招牌</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {exteriorImages.map((url, i) => (
                                    <img
                                        key={i}
                                        src={url}
                                        alt={`外观 ${i + 1}`}
                                        style={{ width: '100%', borderRadius: 6, display: 'block', cursor: 'zoom-in' }}
                                        loading="lazy"
                                        onClick={() => setPreviewImage(url)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {menuImages.length > 0 && (
                        <div style={{ marginBottom: 24 }}>
                            <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8, color: 'var(--color-text-secondary)' }}>菜单</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {menuImages.map((url, i) => (
                                    <img
                                        key={i}
                                        src={url}
                                        alt={`菜单 ${i + 1}`}
                                        style={{ width: '100%', borderRadius: 6, display: 'block', cursor: 'zoom-in' }}
                                        loading="lazy"
                                        onClick={() => setPreviewImage(url)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {exteriorImages.length === 0 && menuImages.length === 0 && (
                        <div style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', fontSize: 13, marginTop: 24, textAlign: 'center' }}>
                            暂无相关图片
                        </div>
                    )}
                </ScrollableView>
            </div>

            {previewImage && (
                <div
                    role="presentation"
                    onClick={() => setPreviewImage(null)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.9)',
                        zIndex: 7000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 24,
                    }}
                >
                    <button
                        type="button"
                        onClick={() => setPreviewImage(null)}
                        aria-label="关闭大图"
                        title="关闭"
                        style={{
                            position: 'absolute',
                            top: 20,
                            right: 20,
                            width: 40,
                            height: 40,
                            borderRadius: 999,
                            border: 'none',
                            background: 'rgba(255, 255, 255, 0.14)',
                            color: '#FFFFFF',
                            fontSize: 26,
                            lineHeight: '40px',
                            cursor: 'pointer',
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        ×
                    </button>
                    <img
                        src={previewImage}
                        alt="图片大图预览"
                        style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                            boxShadow: '0 16px 60px rgba(0,0,0,0.45)',
                            borderRadius: 8,
                            userSelect: 'none',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </>
    );
}
