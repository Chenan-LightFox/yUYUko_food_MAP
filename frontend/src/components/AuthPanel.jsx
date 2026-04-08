import React, { useEffect, useRef, useState } from 'react';
import Button from './Button';
import Tooltip from './Tooltip';
import defaultAvatar from '../img/default.png';
import useDarkMode from '../utils/useDarkMode';

export default function AuthPanel({ user, isAuth, isAdmin, onLogout, onOpenAuth, onOpenAdmin, onOpenSettings, onGoHome, pathname, backendUrl }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const menuRef = useRef(null);
    const closeTimerRef = useRef(null);
    const DEFAULT_THEME_COLOR = '#002fa7';
    const [themeColor, setThemeColor] = useState(DEFAULT_THEME_COLOR);

    const dark = useDarkMode();
    const menuTextColor = dark ? '#e5e7eb' : 'inherit';

    const isTouchDevice = typeof window !== 'undefined' && (('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0));

    useEffect(() => {
        if (!open) return;
        const onDocClick = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        const onKey = (e) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('touchstart', onDocClick, { passive: true });
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('touchstart', onDocClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    useEffect(() => {
        return () => {
            if (closeTimerRef.current) {
                clearTimeout(closeTimerRef.current);
                closeTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        try {
            let color = null;
            if (user && user.map_settings) color = user.map_settings.theme_color || null;
            if (!color) {
                try {
                    const raw = window.localStorage.getItem('map_settings');
                    if (raw) {
                        const ms = JSON.parse(raw);
                        if (ms && ms.theme_color) color = ms.theme_color;
                    }
                } catch (e) { }
            }
            if (color) setThemeColor(color);
            else setThemeColor(DEFAULT_THEME_COLOR);
        } catch (e) { }
    }, [user]);

    useEffect(() => {
        const onThemeChange = (e) => {
            try {
                const detail = (e && e.detail) ? e.detail : null;
                if (detail && typeof detail.color !== 'undefined') {
                    setThemeColor(detail.color || DEFAULT_THEME_COLOR);
                }
            } catch (err) { }
        };
        window.addEventListener('themechange', onThemeChange);
        return () => window.removeEventListener('themechange', onThemeChange);
    }, []);

    const scheduleClose = (delay = 150) => {
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        closeTimerRef.current = setTimeout(() => {
            closeTimerRef.current = null;
            setOpen(false);
        }, delay);
    };

    const cancelScheduledClose = () => {
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    };

    const handleAvatarClick = (e) => {
        if (!isAuth) {
            onOpenAuth && onOpenAuth();
            return;
        }
        if (isTouchDevice) {
            setOpen((v) => !v);
        } else {
            setOpen(true);
        }
    };

    const handleAvatarMouseEnter = () => {
        if (!isTouchDevice && isAuth) {
            cancelScheduledClose();
            setOpen(true);
        }
    };
    const handleAvatarMouseLeave = () => {
        if (!isTouchDevice && isAuth) {
            scheduleClose();
        }
    };
    const handleMenuMouseEnter = () => {
        if (!isTouchDevice && isAuth) {
            cancelScheduledClose();
            setOpen(true);
        }
    };
    const handleMenuMouseLeave = () => {
        if (!isTouchDevice && isAuth) {
            scheduleClose();
        }
    };

    const initials = (name) => {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
        return (parts[0].slice(0, 1) + parts[1].slice(0, 1)).toUpperCase();
    };

    const currentPath = typeof pathname !== 'undefined' ? pathname : (typeof window !== 'undefined' ? window.location.pathname : '');
    const isOnAdmin = currentPath === '/admin';
    const isOnSettings = typeof currentPath === 'string' && currentPath.startsWith('/settings');

    return (
        <div
            ref={rootRef}
            style={{
                position: 'absolute',
                left: 12,
                top: 12,
                zIndex: 4000,
                display: 'flex',
                alignItems: 'center',
                gap: 8
            }}
        >
            <div
                role="button"
                aria-haspopup="true"
                aria-expanded={open}
                onClick={handleAvatarClick}
                onMouseEnter={handleAvatarMouseEnter}
                onMouseLeave={handleAvatarMouseLeave}
                style={{
                    width: 50,
                    height: 50,
                    borderRadius: '50%',
                    background: themeColor,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: dark ? '0 1px 3px rgba(0,0,0,0.6)' : '0 1px 3px rgba(0,0,0,0.15)',
                    overflow: 'hidden',
                    border: `3px solid ${themeColor}`,
                    boxSizing: 'border-box'
                }}
            >
                {isAuth && user ? (
                    <img
                        src={user.has_avatar ? `${backendUrl}/users/${user.id}/avatar?t=${Date.now()}` : (user.avatar || defaultAvatar)}
                        alt={user.username || 'avatar'}
                        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                    />
                ) : (
                    <span style={{ fontWeight: 700, color: '#f2f2f2' }}>登录</span>
                )}
            </div>

            {/* 下拉菜单 */}
            {open && (
                <div
                    ref={menuRef}
                    role="menu"
                    aria-label="用户菜单"
                    onMouseEnter={handleMenuMouseEnter}
                    onMouseLeave={handleMenuMouseLeave}
                    style={{
                        position: 'absolute',
                        left: 12,
                        top: 64,
                        minWidth: 200,
                        background: dark ? '#0b1220' : '#fff',
                        borderRadius: 8,
                        boxShadow: dark ? '0 6px 24px rgba(0,0,0,0.6)' : '0 6px 24px rgba(0,0,0,0.15)',
                        padding: 12,
                        border: dark ? '1px solid #1f2937' : '1px solid rgba(16,24,40,0.06)',
                        color: dark ? '#e5e7eb' : 'inherit'
                    }}
                >
                    {isAuth && user ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: 20, fontWeight: 700 }}>{'东方饭联地图'}</div>

                            <div style={{ fontSize: 14 }}>
                                <Tooltip text={`用户ID：${user.id}`} placement="top">{user.username}</Tooltip>
                            </div>
                            <div style={{ fontSize: 12, color: dark ? '#9ca3af' : '#666' }}>{user.admin_level ? `管理员：${user.admin_level}` : '普通用户'}</div>

                            <div style={{ paddingLeft: 10, paddingRight: 10, paddingBottom: 2, background: dark ? '#1f2937' : '#a2a2a2', margin: 0 }} />

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                {(isAdmin || isOnAdmin) && (
                                    <Button variant="menu" full onClick={() => { setOpen(false); if (isOnAdmin) { onGoHome && onGoHome(); } else { onOpenAdmin && onOpenAdmin(); } }} style={{ color: menuTextColor }}>
                                        {isOnAdmin ? '返回地图' : '管理后台'}
                                    </Button>
                                )}
                                {(isAdmin || isOnAdmin) && (
                                    <div style={{ paddingLeft: 10, paddingRight: 10, paddingBottom: 1, background: dark ? '#1f2937' : '#a2a2a2', margin: 0 }} />
                                )}

                                <Button variant="menu" full onClick={() => { setOpen(false); if (isOnSettings) { onGoHome && onGoHome(); } else { onOpenSettings && onOpenSettings(); } }} style={{ color: menuTextColor }}>
                                    {isOnSettings ? '返回地图' : '设置'}
                                </Button>

                                <div style={{ paddingLeft: 10, paddingRight: 10, paddingBottom: 1, background: dark ? '#1f2937' : '#a2a2a2', margin: 0 }} />
                                <Button variant="menu" full onClick={() => { setOpen(false); onLogout && onLogout(); }} style={{ color: dark ? '#ff8a93' : '#b00020' }}>
                                    注销
                                </Button>
                            </div>
                            <div style={{ paddingLeft: 10, paddingRight: 10, paddingBottom: 2, background: dark ? '#1f2937' : '#a2a2a2', margin: 0 }} />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                            <div style={{ paddingLeft: 10, paddingRight: 10, paddingBottom: 2, background: dark ? '#1f2937' : '#a2a2a2', margin: 0 }} />
                            <Button variant="menu" full onClick={() => { setOpen(false); onOpenAuth && onOpenAuth(); }}>登录 / 注册</Button>
                            <div style={{ paddingLeft: 10, paddingRight: 10, paddingBottom: 2, background: dark ? '#1f2937' : '#a2a2a2', margin: 0 }} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
