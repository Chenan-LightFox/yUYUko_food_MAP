import React, { useEffect, useState } from 'react';
import PageTemplate from '../components/PageTemplate';
import Button from '../components/Button';
import { useTips } from '../components/Tips';

export default function PersonalizeMap({ user, onBack, backendUrl, token, onUpdateUser }) {
    const [style, setStyle] = useState('standard');
    const [lat, setLat] = useState('');
    const [lng, setLng] = useState('');
    const [zoom, setZoom] = useState('');
    const [loading, setLoading] = useState(false);

    const showTip = useTips();

    useEffect(() => {
        let settings = null;
        if (user && user.map_settings) settings = user.map_settings;
        else {
            try {
                const raw = localStorage.getItem('map_settings');
                if (raw) settings = JSON.parse(raw);
            } catch (e) { settings = null; }
        }

        if (settings) {
            if (settings.style) setStyle(settings.style);
            if (settings.center && typeof settings.center === 'object') {
                if (typeof settings.center.lat !== 'undefined') setLat(String(settings.center.lat));
                if (typeof settings.center.lng !== 'undefined') setLng(String(settings.center.lng));
            }
            if (typeof settings.zoom !== 'undefined') setZoom(String(settings.zoom));
        }
    }, [user]);

    const handleSave = async () => {
        // 支持部分填写：若填写了经纬度需要同时填写经度和纬度；缩放等级可选
        const latStr = (lat || '').trim();
        const lngStr = (lng || '').trim();
        const zoomStr = (zoom || '').trim();

        if ((latStr && !lngStr) || (!latStr && lngStr)) {
            showTip('请同时填写纬度和经度，或都留空');
            return;
        }

        let center = null;
        if (latStr && lngStr) {
            const centerLat = parseFloat(latStr);
            const centerLng = parseFloat(lngStr);
            if (isNaN(centerLat) || isNaN(centerLng)) { showTip('请输入有效的经纬度'); return; }
            center = { lat: centerLat, lng: centerLng };
        }

        let z = null;
        if (zoomStr) {
            const parsedZ = parseInt(zoomStr, 10);
            if (isNaN(parsedZ)) { showTip('请输入有效的缩放等级'); return; }
            z = parsedZ;
        }

        // 合并已有设置（来自 user 或 localStorage），只覆盖用户输入的字段
        let existing = null;
        if (user && user.map_settings) existing = user.map_settings;
        else {
            try {
                const raw = localStorage.getItem('map_settings');
                if (raw) existing = JSON.parse(raw);
            } catch (e) { existing = null; }
        }

        const mapSettings = { ...(existing || {}), style };
        if (center) {
            mapSettings.center = center;
        } else {
            delete mapSettings.center;
        }

        if (z !== null) {
            mapSettings.zoom = z;
        } else {
            delete mapSettings.zoom;
        }

        setLoading(true);
        try {
            if (backendUrl && token) {
                const res = await fetch(`${backendUrl}/users/me/settings`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ map_settings: mapSettings })
                });

                const text = await res.text();
                let data = null;
                try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }

                if (!res.ok) {
                    const errMsg = (data && data.error) ? data.error : (text ? (text.trim().startsWith('<') ? `服务器返回错误（HTTP ${res.status}）` : text) : '保存失败');
                    showTip(errMsg);
                    setLoading(false);
                    return;
                }

                if (data && data.user) {
                    if (typeof onUpdateUser === 'function') onUpdateUser(data.user, token);
                }

                localStorage.setItem('map_settings', JSON.stringify(mapSettings));
                if (typeof onBack === 'function') onBack();
                showTip('个性化地图已保存');
            } else {
                localStorage.setItem('map_settings', JSON.stringify(mapSettings));
                showTip('已保存到本地（未登录）');
                if (typeof onBack === 'function') onBack();
            }
        } catch (e) {
            showTip(e.message || '保存失败');
        } finally {
            setLoading(false);
        }
    };

    return (
        <PageTemplate breadcrumb={[{ label: '设置', onClick: onBack }, { label: '个性化地图' }]}>
            <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
                <label style={{ display: 'block', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>地图样式</div>
                    <select value={style} onChange={(e) => setStyle(e.target.value)} style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', borderRadius: 4, border: '1px solid #d1d5db' }}>
                        <option value="standard">标准</option>
                        <option value="satellite" disabled>卫星</option>
                        <option value="terrain" disabled>街景</option>
                    </select>
                </label>

                <label style={{ display: 'block', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>默认中心纬度 (lat)</div>
                    <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="23.016485" style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', borderRadius: 4, border: '1px solid #d1d5db' }} />
                </label>

                <label style={{ display: 'block', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>默认中心经度 (lng)</div>
                    <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="113.394405" style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', borderRadius: 4, border: '1px solid #d1d5db' }} />
                </label>

                <label style={{ display: 'block', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>默认缩放等级</div>
                    <input value={zoom} onChange={(e) => setZoom(e.target.value)} placeholder="24" style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', borderRadius: 4, border: '1px solid #d1d5db' }} />
                </label>

                <div style={{ display: 'flex', gap: 8 }}>
                    <Button type="submit" disabled={loading} style={{ padding: '8px 12px' }}>{loading ? '保存中...' : '保存'}</Button>
                    <Button type="button" onClick={() => { if (typeof onBack === 'function') onBack(); }} style={{ padding: '8px 12px' }}>取消</Button>
                </div>
            </form>
        </PageTemplate>
    );
}
