import React, { useEffect, useState } from 'react';
import PageTemplate from '../components/PageTemplate';
import Button from '../components/Button';
import TextInput from '../components/TextInput';
import SelectInput from '../components/SelectInput';
import { useTips } from '../components/Tips';
import { applyDarkMode, applyThemeColor } from '../utils/theme';
import useDarkMode from '../utils/useDarkMode';

const STYLE_OPTIONS = [
    { id: 'amap://styles/dark', name: '暗黑（默认）' },
    { id: 'amap://styles/darkblue', name: '深蓝' },
    { id: 'amap://styles/grey', name: '灰色' },
    { id: 'amap://styles/default', name: '默认' },
    { id: 'amap://styles/light', name: '浅色' },
    { id: 'amap://styles/normal', name: '标准' },
    { id: 'amap://styles/default', name: '默认' }
];

export default function CustomThemes({ user, onBack, backendUrl, token, onUpdateUser }) {
    const [darkMode, setDarkMode] = useState(false);
    const [darkMapStyle, setDarkMapStyle] = useState('amap://styles/dark');
    const [lightMapStyle, setLightMapStyle] = useState('amap://styles/normal');
    const [loading, setLoading] = useState(false);
    const [themeColor, setThemeColor] = useState('#002fa7');
    const showTip = useTips();
    const dark = useDarkMode();

    useEffect(() => {
        let settings = null;
        if (user && user.map_settings) settings = user.map_settings;
        else {
            try {
                const raw = localStorage.getItem('map_settings');
                if (raw) settings = JSON.parse(raw);
            } catch (e) { settings = null; }
        }

        if (settings && typeof settings.dark_mode !== 'undefined') {
            setDarkMode(!!settings.dark_mode);
        }
        if (settings && typeof settings.map_style_dark !== 'undefined') {
            setDarkMapStyle(settings.map_style_dark || 'amap://styles/dark');
        }
        if (settings && typeof settings.map_style_light !== 'undefined') {
            setLightMapStyle(settings.map_style_light || 'amap://styles/normal');
        }
        if (settings && typeof settings.theme_color !== 'undefined') {
            setThemeColor(settings.theme_color || '#002fa7');
            try { applyThemeColor(settings.theme_color || '#002fa7'); } catch (e) { }
        }
    }, [user]);

    const DARK_STYLE_IDS = ['amap://styles/dark', 'amap://styles/darkblue', 'amap://styles/grey', 'amap://styles/night'];
    // 允许在浅色偏好中也选择“夜间（随昼夜变化）”样式
    const LIGHT_STYLE_IDS = ['amap://styles/light', 'amap://styles/normal', 'amap://styles/default', 'amap://styles/night'];

    const persistDarkMode = async (value) => {
        setLoading(true);
        const existing = (user && user.map_settings) ? user.map_settings : (() => {
            try { const raw = localStorage.getItem('map_settings'); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
        })();

        const payload = { ...(existing || {}), dark_mode: !!value };

        // ensure local copy so refresh recovers setting even if backend doesn't persist immediately
        try { window.localStorage.setItem('map_settings', JSON.stringify(payload)); } catch (e) { /* ignore */ }

        try {
            if (backendUrl && token) {
                const res = await fetch(`${backendUrl}/users/me/settings`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ map_settings: payload })
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
                    try {
                        const ms = data.user.map_settings || null;
                        if (ms && typeof ms.dark_mode !== 'undefined') setDarkMode(!!ms.dark_mode);
                    } catch (e) { /* ignore */ }
                    showTip('已保存设置');
                }
            } else {
                localStorage.setItem('map_settings', JSON.stringify(payload));
                setDarkMode(!!value);
                showTip('已保存到本地（未登录）');
            }
        } catch (e) {
            showTip(e.message || '保存失败');
        } finally {
            setLoading(false);
        }
    };

    const persistThemeColor = async (value) => {
        setLoading(true);
        const existing = (user && user.map_settings) ? user.map_settings : (() => {
            try { const raw = localStorage.getItem('map_settings'); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
        })();

        const payload = { ...(existing || {}) };
        payload.theme_color = value || '';
        try { window.localStorage.setItem('map_settings', JSON.stringify(payload)); } catch (e) { /* ignore */ }
        try {
            if (backendUrl && token) {
                const res = await fetch(`${backendUrl}/users/me/settings`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ map_settings: payload })
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
                    try {
                        const ms = data.user.map_settings || null;
                        if (ms && typeof ms.theme_color !== 'undefined') setThemeColor(ms.theme_color || '#002fa7');
                    } catch (e) { /* ignore */ }
                    try { applyThemeColor(value || '#002fa7'); } catch (e) { }
                    showTip('已保存设置');
                }
            } else {
                localStorage.setItem('map_settings', JSON.stringify(payload));
                setThemeColor(value || '#002fa7');
                try { applyThemeColor(value || '#002fa7'); } catch (e) { }
                showTip('已保存到本地（未登录）');
            }
        } catch (e) {
            showTip(e.message || '保存失败');
        } finally {
            setLoading(false);
        }
    };

    const persistMapStyle = async (which, value) => {
        // which: 'map_style_dark' | 'map_style_light'
        setLoading(true);
        const existing = (user && user.map_settings) ? user.map_settings : (() => {
            try { const raw = localStorage.getItem('map_settings'); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
        })();

        const payload = { ...(existing || {}) };
        payload[which] = value || '';
        // always write local copy so refresh recovers selection even if server-side isn't ready
        try { window.localStorage.setItem('map_settings', JSON.stringify(payload)); } catch (e) { /* ignore */ }
        try {
            if (backendUrl && token) {
                const res = await fetch(`${backendUrl}/users/me/settings`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ map_settings: payload })
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
                    try {
                        const ms = data.user.map_settings || null;
                        if (ms && typeof ms.map_style_dark !== 'undefined') setDarkMapStyle(ms.map_style_dark || '');
                        if (ms && typeof ms.map_style_light !== 'undefined') setLightMapStyle(ms.map_style_light || '');
                    } catch (e) { /* ignore */ }
                    showTip('已保存设置');
                }
            } else {
                localStorage.setItem('map_settings', JSON.stringify(payload));
                if (which === 'map_style_dark') setDarkMapStyle(value || '');
                if (which === 'map_style_light') setLightMapStyle(value || '');
                showTip('已保存到本地（未登录）');
            }
            // dispatch event so map can pick up immediately
            try {
                const detail = { map_style_dark: payload.map_style_dark || '', map_style_light: payload.map_style_light || '' };
                document.dispatchEvent(new CustomEvent('mapstylechange', { detail }));
            } catch (e) { /* ignore */ }
        } catch (e) {
            showTip(e.message || '保存失败');
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = (e) => {
        const val = !!e.target.checked;
        setDarkMode(val);
        // apply immediately to UI so user sees feedback even when not logged in yet
        try { applyDarkMode(val); } catch (ex) { /* ignore */ }
        persistDarkMode(val);
    };

    return (
        <PageTemplate breadcrumb={[{ label: '设置', onClick: onBack }, { label: '个性化主题' }]}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: dark ? '#e5e7eb' : 'inherit' }}>暗黑模式</div>
                        <div style={{ color: dark ? '#9ca3af' : '#6b7280', fontSize: 13 }}>开启后界面将使用暗色主题</div>
                    </div>
                    <div>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 12, cursor: loading ? 'not-allowed' : 'pointer' }}>
                            <div style={{ position: 'relative', width: 56, height: 30 }}>
                                <input
                                    type="checkbox"
                                    checked={darkMode}
                                    onChange={handleToggle}
                                    disabled={loading}
                                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, margin: 0, cursor: loading ? 'not-allowed' : 'pointer' }}
                                />
                                <div style={{
                                    width: '100%',
                                    height: '100%',
                                    background: darkMode ? '#374151' : '#e5e7eb',
                                    borderRadius: 9999,
                                    transition: 'background .18s'
                                }} />
                                <div style={{
                                    position: 'absolute',
                                    top: 3,
                                    left: darkMode ? 29 : 3,
                                    width: 24,
                                    height: 24,
                                    borderRadius: '50%',
                                    background: '#fff',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                                    transition: 'left .18s'
                                }} />
                            </div>
                            <span style={{ color: dark ? '#e5e7eb' : '#6b7280' }}>{darkMode ? '已启用' : '未启用'}</span>
                        </label>
                    </div>
                </div>
            </div>
            <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: dark ? '#e5e7eb' : 'inherit' }}>主题颜色</div>
                <div style={{ color: dark ? '#9ca3af' : '#6b7280', fontSize: 13, marginTop: 6 }}>自定义页面主色（用于地图按钮与头像外圈）</div>

                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input
                        type="color"
                        value={themeColor}
                        onChange={(e) => setThemeColor(e.target.value)}
                        disabled={loading}
                        style={{
                            width: 56,
                            height: 36,
                            borderRadius: 6,
                            border: dark ? '1px solid #334155' : '1px solid #d1d5db',
                            background: dark ? '#07101a' : '#fff',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            padding: 6,
                            boxSizing: 'border-box',
                            outline: 'none'
                        }}
                    />

                    <TextInput
                        value={themeColor}
                        onChange={(e) => setThemeColor(e.target.value)}
                        style={{ width: 160 }}
                    />

                    <Button
                        onClick={() => persistThemeColor(themeColor)}
                        disabled={loading}
                        style={{
                            background: themeColor,
                            color: '#fff',
                            border: 'none',
                            padding: '8px 12px',
                            borderRadius: 6,
                            boxShadow: dark ? '0 4px 12px rgba(0,0,0,0.6)' : `0 4px 12px rgba(0,47,167,0.2)`,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.6 : 1
                        }}
                    >
                        保存
                    </Button>
                </div>
            </div>
            <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: dark ? '#e5e7eb' : 'inherit' }}>地图样式</div>
                <div style={{ color: dark ? '#9ca3af' : '#6b7280', fontSize: 13, marginTop: 6 }}>为当前主题选择地图样式（选择后将保存到服务器或本地）。</div>

                <div style={{ marginTop: 12, minWidth: 260 }}>
                    <div style={{ fontSize: 13, color: dark ? '#e5e7eb' : 'inherit', marginBottom: 6 }}>{darkMode ? '暗色样式（当前）' : '亮色样式（当前）'}</div>
                    {(() => {
                        const options = STYLE_OPTIONS.filter(s => darkMode ? DARK_STYLE_IDS.includes(s.id) : LIGHT_STYLE_IDS.includes(s.id));
                        const value = darkMode ? darkMapStyle : lightMapStyle;
                        return (
                            <SelectInput value={value} onChange={(e) => persistMapStyle(darkMode ? 'map_style_dark' : 'map_style_light', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 6 }}>
                                {options.map(s => (
                                    <option key={s.id || s.name} value={s.id}>{s.name}</option>
                                ))}
                            </SelectInput>
                        );
                    })()}
                </div>
            </div>
        </PageTemplate>
    );
}
