import React, { forwardRef, useEffect, useRef, useState } from 'react';
import Button from './Button';
import defaultAvatar from '../img/default.png';
import useDarkMode from '../utils/useDarkMode';
import { pickContrastTextColor, DEFAULT_PRIMARY, DEFAULT_DARK_PRIMARY, isDarkMode } from '../utils/theme';
import Tooltip from './Tooltip';

const AuthPanel = forwardRef(function AuthPanel({ user, isAuth, isAdmin, onLogout, onOpenAuth, onOpenAdmin, onOpenSettings, onOpenDinners, onOpenPosterExport, onGoHome, pathname, backendUrl, interactionDisabled = false }, ref) {
    const [open, setOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [isNarrow, setIsNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 500);
    const rootRef = useRef(null);
    const [themeColor, setThemeColor] = useState(() => isDarkMode() ? DEFAULT_DARK_PRIMARY : DEFAULT_PRIMARY);

    const dark = useDarkMode();
    const menuTextColor = 'var(--color-text-primary)';

    useEffect(() => {
        if (!open && !moreOpen) return;
        const onDocClick = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) {
                setOpen(false);
                setMoreOpen(false);
            }
        };
        const onKey = (e) => {
            if (e.key === 'Escape') {
                setOpen(false);
                setMoreOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('touchstart', onDocClick, { passive: true });
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('touchstart', onDocClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open, moreOpen]);

    useEffect(() => {
        if (interactionDisabled) {
            setOpen(false);
            setMoreOpen(false);
        }
    }, [interactionDisabled]);

    useEffect(() => {
        const onResize = () => setIsNarrow(window.innerWidth <= 500);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
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
            else setThemeColor(isDarkMode() ? DEFAULT_DARK_PRIMARY : DEFAULT_PRIMARY);
        } catch (e) { }
    }, [user]);

    useEffect(() => {
        const onThemeChange = (e) => {
            try {
                const detail = (e && e.detail) ? e.detail : null;
                if (detail) {
                    if (typeof detail.color !== 'undefined') {
                        setThemeColor(detail.color || (isDarkMode() ? DEFAULT_DARK_PRIMARY : DEFAULT_PRIMARY));
                    }
                    // Dark mode toggled — may need to switch default
                    if (typeof detail.dark !== 'undefined' && (!detail.color || detail.color === '')) {
                        setThemeColor(isDarkMode() ? DEFAULT_DARK_PRIMARY : DEFAULT_PRIMARY);
                    }
                }
            } catch (err) { }
        };
        window.addEventListener('themechange', onThemeChange);
        return () => window.removeEventListener('themechange', onThemeChange);
    }, []);

    const handleAvatarClick = () => {
        if (interactionDisabled) return;
        if (!isAuth) {
            onOpenAuth && onOpenAuth();
            return;
        }
        setMoreOpen(false);
        setOpen((value) => !value);
    };

    const handleMoreClick = () => {
        if (interactionDisabled) return;
        setOpen(false);
        setMoreOpen((value) => !value);
    };

    const currentPath = typeof pathname !== 'undefined' ? pathname : (typeof window !== 'undefined' ? window.location.pathname : '');
    const isOnAdmin = currentPath === '/admin';
    const isOnSettings = typeof currentPath === 'string' && currentPath.startsWith('/settings');
    const isOnDinners = typeof currentPath === 'string' && currentPath.startsWith('/dinners');
    const isOnPosterExport = currentPath === '/posters/new';
    const divider = <div style={{ height: 1, background: 'var(--color-border)' }} />;

    return (
        <div
            ref={(node) => {
                rootRef.current = node;
                if (typeof ref === 'function') {
                    ref(node);
                } else if (ref) {
                    ref.current = node;
                }
            }}
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
                style={{
                    width: 50,
                    height: 50,
                    borderRadius: '50%',
                    background: themeColor,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: interactionDisabled ? 'default' : 'pointer',
                    boxShadow: '0 2px 10px var(--color-glow)',
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
                    <span style={{ fontWeight: 700, color: pickContrastTextColor(themeColor) }}>登录</span>
                )}
            </div>

            {/* 下拉菜单 */}
            {open && isAuth && user && (
                <div
                    role="menu"
                    aria-label="用户菜单"
                    style={{
                        position: 'absolute',
                        left: 12,
                        top: 64,
                        minWidth: 200,
                        background: 'var(--color-bg-surface)',
                        borderRadius: 8,
                        boxShadow: 'var(--shadow-surface)',
                        padding: 8,
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)'
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        <div style={{ padding: '4px 10px 8px' }}>
                            <div style={{ fontSize: 20, fontWeight: 700 }}>东方饭联地图</div>
                            <div style={{ marginTop: 6, fontSize: 14, overflowWrap: 'anywhere' }}>当前用户：{user.username}</div>
                        </div>
                        {divider}
                        <Button themeAware variant="menu" full onClick={() => { setOpen(false); if (isOnSettings) { onGoHome && onGoHome(); } else { onOpenSettings && onOpenSettings(); } }} style={{ color: menuTextColor }}>
                            {isOnSettings ? '返回地图' : '设置'}
                        </Button>
                        {divider}
                        <Button themeAware variant="menu" full onClick={() => { setOpen(false); onLogout && onLogout(); }} style={{ color: 'var(--color-danger)' }}>
                            注销
                        </Button>
                    </div>
                </div>
            )}

            {!interactionDisabled && (
                <div style={{ position: 'fixed', left: 16, bottom: isNarrow ? 68 : 12 }}>
                    <Tooltip text="更多功能" placement="top">
                        <Button
                            onClick={handleMoreClick}
                            aria-haspopup="true"
                            aria-expanded={moreOpen}
                            style={{
                                width: 64,
                                height: 64,
                                padding: 0,
                                borderRadius: '50%',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: themeColor,
                                color: '#FFFFFF',
                                border: 'none',
                                boxShadow: '0 4px 12px var(--color-glow)',
                                cursor: 'pointer'
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 36 }}>menu</span>
                        </Button>
                    </Tooltip>
                </div>
            )}

            {moreOpen && !interactionDisabled && (
                <div
                    role="menu"
                    style={{
                        position: 'fixed',
                        left: 16,
                        bottom: isNarrow ? 144 : 88,
                        minWidth: 180,
                        background: 'var(--color-bg-surface)',
                        borderRadius: 8,
                        boxShadow: 'var(--shadow-surface)',
                        padding: 8,
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)'
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {isAuth && (isAdmin || isOnAdmin) && (
                            <>
                                <Button themeAware variant="menu" full onClick={() => { setMoreOpen(false); if (isOnAdmin) { onGoHome && onGoHome(); } else { onOpenAdmin && onOpenAdmin(); } }} style={{ color: menuTextColor }}>
                                    {isOnAdmin ? '返回地图' : '管理后台'}
                                </Button>
                                {divider}
                            </>
                        )}
                        <Button themeAware variant="menu" full onClick={() => { setMoreOpen(false); if (isOnDinners) { onGoHome && onGoHome(); } else { onOpenDinners && onOpenDinners(); } }} style={{ color: menuTextColor }}>
                            {isOnDinners ? '返回地图' : '聚餐活动 (beta)'}
                        </Button>
                        {isAuth && (
                            <>
                                {divider}
                                <Button themeAware variant="menu" full onClick={() => { setMoreOpen(false); if (isOnPosterExport) { onGoHome && onGoHome(); } else { onOpenPosterExport && onOpenPosterExport(); } }} style={{ color: menuTextColor }}>
                                    {isOnPosterExport ? '返回地图' : '导出海报 (beta)'}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
});

export default AuthPanel;
