import React from 'react';
import Button from '../components/Button';
import useDarkMode from '../utils/useDarkMode';

export default function PlaceDetailPanel({ place, onClose }) {
    const dark = useDarkMode();
    if (!place) return null;

    let exteriorImages = [];
    let menuImages = [];
    try { if (place.exterior_images) exteriorImages = JSON.parse(place.exterior_images); } catch (e) { }
    try { if (place.menu_images) menuImages = JSON.parse(place.menu_images); } catch (e) { }

    return (
        <div style={{
            position: 'absolute', top: 120, right: 30, width: 350, bottom: 220,
            background: dark ? '#0f172a' : '#fff', color: dark ? '#f8fafc' : '#333',
            borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex', flexDirection: 'column', zIndex: 1000
        }}>
            <style>{`
                .detail-scroll::-webkit-scrollbar { width: 6px; }
                .detail-scroll::-webkit-scrollbar-track { background: transparent; }
                .detail-scroll::-webkit-scrollbar-thumb { background: ${dark ? '#475569' : '#cbd5e1'}; border-radius: 4px; }
                .detail-scroll::-webkit-scrollbar-thumb:hover { background: ${dark ? '#64748b' : '#94a3b8'}; }
            `}</style>

            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>{place.name} 详情</h2>
                <Button variant="secondary" onClick={onClose} style={{ padding: '4px 8px', color: dark ? '#e5e7eb' : undefined }}>关闭</Button>
            </div>

            <div className="detail-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: dark ? '#94a3b8' : '#64748b', marginBottom: 4 }}>分类</div>
                    <div>{place.category || '暂无'}</div>
                </div>

                <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 13, color: dark ? '#94a3b8' : '#64748b', marginBottom: 4 }}>描述</div>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{place.description || '暂无描述'}</div>
                </div>

                {exteriorImages.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                        <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8, color: dark ? '#cbd5e1' : '#475569' }}>外观/招牌</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {exteriorImages.map((url, i) => (
                                <img key={i} src={url} alt={`外观 ${i + 1}`} style={{ width: '100%', borderRadius: 6, display: 'block' }} loading="lazy" />
                            ))}
                        </div>
                    </div>
                )}

                {menuImages.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                        <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8, color: dark ? '#cbd5e1' : '#475569' }}>菜单</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {menuImages.map((url, i) => (
                                <img key={i} src={url} alt={`菜单 ${i + 1}`} style={{ width: '100%', borderRadius: 6, display: 'block' }} loading="lazy" />
                            ))}
                        </div>
                    </div>
                )}

                {exteriorImages.length === 0 && menuImages.length === 0 && (
                    <div style={{ color: dark ? '#64748b' : '#94a3b8', fontStyle: 'italic', fontSize: 13, marginTop: 24, textAlign: 'center' }}>
                        暂无相关图片
                    </div>
                )}
            </div>
        </div>
    );
}
