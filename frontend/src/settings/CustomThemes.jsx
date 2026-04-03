import React, { useEffect, useState } from 'react';
import PageTemplate from '../components/PageTemplate';
import Button from '../components/Button';
import { useTips } from '../components/Tips';
import { applyDarkMode } from '../utils/theme';
import useDarkMode from '../hooks/useDarkMode';

export default function CustomThemes({ user, onBack, backendUrl, token, onUpdateUser }) {
    const [darkMode, setDarkMode] = useState(false);
    const [loading, setLoading] = useState(false);
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
    }, [user]);

    const persistDarkMode = async (value) => {
        setLoading(true);
        const existing = (user && user.map_settings) ? user.map_settings : (() => {
            try { const raw = localStorage.getItem('map_settings'); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
        })();

        const payload = { ...(existing || {}), dark_mode: !!value };

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
        </PageTemplate>
    );
}
