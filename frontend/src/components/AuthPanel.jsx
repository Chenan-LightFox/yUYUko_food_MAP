import React, { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Button from './Button';
import defaultAvatar from '../img/default.png';
import { DEFAULT_DARK_PRIMARY, DEFAULT_PRIMARY, isDarkMode, pickContrastTextColor } from '../utils/theme';
import useMediaQuery from '../utils/useMediaQuery';

const AuthPanel = forwardRef(function AuthPanel({ user, isAuth, isAdmin, onLogout, onOpenAuth, onOpenAdmin, onOpenSettings, onOpenDinners, onOpenPosterExport, onGoHome, onMenuOpenChange, pathname, backendUrl, interactionDisabled = false }, forwardedRef) {
    const [userOpen, setUserOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [showUsername, setShowUsername] = useState(true);
    const [showTitle, setShowTitle] = useState(true);
    const [themeColor, setThemeColor] = useState(() => isDarkMode() ? DEFAULT_DARK_PRIMARY : DEFAULT_PRIMARY);
    const isMobile = useMediaQuery('(max-width: 640px)');
    const rootRef = useRef(null);
    const userAnchorRef = useRef(null);
    const expandedUserProbeRef = useRef(null);

    useLayoutEffect(() => {
        const openMenu = isMobile ? null : (moreOpen ? 'more' : (isAuth && userOpen ? 'user' : null));
        onMenuOpenChange?.(openMenu);
    }, [isMobile, isAuth, userOpen, moreOpen, onMenuOpenChange]);

    const assignRef = (node) => {
        rootRef.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
    };

    useEffect(() => {
        if (!userOpen && !moreOpen) return;
        const closeMenus = (event) => {
            if (event.type === 'keydown' && event.key !== 'Escape') return;
            if (event.type !== 'keydown' && rootRef.current?.contains(event.target)) return;
            setUserOpen(false);
            setMoreOpen(false);
        };
        document.addEventListener('mousedown', closeMenus);
        document.addEventListener('keydown', closeMenus);
        return () => {
            document.removeEventListener('mousedown', closeMenus);
            document.removeEventListener('keydown', closeMenus);
        };
    }, [userOpen, moreOpen]);

    useEffect(() => {
        if (interactionDisabled) {
            setUserOpen(false);
            setMoreOpen(false);
        }
    }, [interactionDisabled]);

    useLayoutEffect(() => {
        if (isMobile || pathname !== '/') {
            setShowUsername(true);
            setShowTitle(true);
            return undefined;
        }

        let active = true;

        const getVisibleSearchBar = () => Array.from(document.querySelectorAll('[data-map-search-bar]')).find((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });

        const updateCollisions = () => {
            if (!active) return;
            const searchBar = getVisibleSearchBar();
            if (!searchBar) {
                setShowUsername(true);
                setShowTitle(true);
                return;
            }

            const searchRect = searchBar.getBoundingClientRect();
            const userAnchorRect = userAnchorRef.current?.getBoundingClientRect();
            const expandedUserRect = expandedUserProbeRef.current?.getBoundingClientRect();

            const usernameWouldCollide = !!(
                isAuth &&
                userAnchorRect &&
                expandedUserRect &&
                userAnchorRect.left + expandedUserRect.width >= searchRect.left
            );
            setShowUsername(!usernameWouldCollide);

            const userControlRight = userAnchorRect && expandedUserRect
                ? userAnchorRect.left + (usernameWouldCollide ? 44 : expandedUserRect.width)
                : null;
            const userControlGap = userControlRight == null
                ? Number.POSITIVE_INFINITY
                : searchRect.left - userControlRight;
            setShowTitle(!(isAuth && userControlGap < 120));
        };

        updateCollisions();
        window.addEventListener('resize', updateCollisions);

        const searchBar = getVisibleSearchBar();
        const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(updateCollisions) : null;
        [rootRef.current, searchBar, expandedUserProbeRef.current].forEach((element) => {
            if (element) resizeObserver?.observe(element);
        });

        document.fonts?.ready?.then(updateCollisions).catch(() => {});

        return () => {
            active = false;
            window.removeEventListener('resize', updateCollisions);
            resizeObserver?.disconnect();
        };
    }, [isMobile, isAuth, pathname, user?.username]);

    useEffect(() => {
        const resolveColor = () => {
            let color = user?.map_settings?.theme_color || '';
            if (!color) {
                try { color = JSON.parse(window.localStorage.getItem('map_settings') || '{}').theme_color || ''; } catch (e) { }
            }
            setThemeColor(color || (isDarkMode() ? DEFAULT_DARK_PRIMARY : DEFAULT_PRIMARY));
        };
        resolveColor();
        const onThemeChange = (event) => setThemeColor(event?.detail?.color || (isDarkMode() ? DEFAULT_DARK_PRIMARY : DEFAULT_PRIMARY));
        window.addEventListener('themechange', onThemeChange);
        return () => window.removeEventListener('themechange', onThemeChange);
    }, [user]);

    if (isMobile) return <div ref={assignRef} style={{ display: 'none' }} />;

    const currentPath = pathname || window.location.pathname;
    const isOnAdmin = currentPath === '/admin';
    const isOnSettings = currentPath.startsWith('/settings');
    const isOnDinners = currentPath.startsWith('/dinners');
    const isOnPosterExport = currentPath === '/posters/new';
    const divider = <div style={{ height: 1, background: 'var(--color-border)' }} />;
    const menuStyle = {
        position: 'absolute',
        top: 52,
        right: 0,
        minWidth: 210,
        padding: 8,
        borderRadius: 10,
        border: '1px solid var(--color-border)',
        background: 'var(--color-bg-surface)',
        color: 'var(--color-text-primary)',
        boxShadow: 'var(--shadow-surface)'
    };

    return (
        <header
            ref={assignRef}
            style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: 64,
                zIndex: 1800,
                padding: '0 8px',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                background: 'color-mix(in srgb, var(--color-bg-surface) 92%, transparent)',
                borderBottom: '1px solid var(--color-border)',
                boxShadow: '0 4px 18px rgba(18, 16, 22, 0.08)',
                backdropFilter: 'blur(14px)'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!isAuth && (
                    <Button
                        onClick={onOpenAuth}
                        disabled={interactionDisabled}
                        style={{ minHeight: 38, padding: '7px 13px', borderRadius: 999, background: themeColor, color: pickContrastTextColor(themeColor), fontWeight: 750 }}
                    >
                        登录
                    </Button>
                )}
                {isAuth && user && (
                    <div ref={userAnchorRef} style={{ position: 'relative' }}>
                        <Button
                            onClick={() => {
                                if (interactionDisabled) return;
                                setUserOpen((value) => !value);
                                setMoreOpen(false);
                            }}
                            aria-label="打开用户菜单"
                            aria-expanded={userOpen}
                            style={{
                                maxWidth: 180,
                                width: showUsername ? 'auto' : 44,
                                height: 44,
                                padding: showUsername ? '3px 11px 3px 3px' : 3,
                                borderRadius: 999,
                                border: `2px solid ${themeColor}`,
                                background: 'var(--color-bg-surface)',
                                color: 'var(--color-text-primary)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: showUsername ? 'flex-start' : 'center',
                                gap: 7
                            }}
                        >
                            <img src={user.has_avatar ? `${backendUrl}/users/${user.id}/avatar?t=${Date.now()}` : (user.avatar || defaultAvatar)} alt={user.username || '头像'} style={{ width: 32, height: 32, flexShrink: 0, borderRadius: '50%', objectFit: 'cover' }} />
                            {showUsername && <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>{user.username}</span>}
                        </Button>

                        <div ref={expandedUserProbeRef} aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, visibility: 'hidden', pointerEvents: 'none' }}>
                            <Button tabIndex={-1} style={{ maxWidth: 180, height: 44, padding: '3px 11px 3px 3px', borderRadius: 999, border: `2px solid ${themeColor}`, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                                <span style={{ width: 32, height: 32, flexShrink: 0 }} />
                                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>{user.username}</span>
                            </Button>
                        </div>

                        {userOpen && (
                            <div role="menu" aria-label="用户菜单" style={{ ...menuStyle, left: 0, right: 'auto' }}>
                                <div style={{ padding: '6px 10px 10px' }}>
                                    <div style={{ fontWeight: 750, overflowWrap: 'anywhere' }}>{user.username}</div>
                                    <div style={{ marginTop: 3, fontSize: 12, color: 'var(--color-text-secondary)' }}>已登录</div>
                                </div>
                                {divider}
                                <Button themeAware variant="menu" full onClick={() => { setUserOpen(false); isOnSettings ? onGoHome?.() : onOpenSettings?.(); }}>{isOnSettings ? '返回地图' : '账号与地图设置'}</Button>
                                {divider}
                                <Button themeAware variant="menu" full onClick={() => { setUserOpen(false); onLogout?.(); }} style={{ color: 'var(--color-danger)' }}>退出登录</Button>
                            </div>
                        )}
                    </div>
                )}
                {showTitle && (
                    <Button
                        onClick={onGoHome}
                        style={{ border: 0, background: 'transparent', color: 'var(--color-text-primary)', padding: '8px', textAlign: 'left' }}
                    >
                        <span style={{ display: 'block', fontSize: 17, fontWeight: 800, lineHeight: 1.1 }}>东方饭联地图</span>
                    </Button>
                )}
            </div>

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button
                    onClick={() => { if (!interactionDisabled) { setMoreOpen((value) => !value); setUserOpen(false); } }}
                    aria-haspopup="menu"
                    aria-expanded={moreOpen}
                    style={{ width: 44, height: 44, fontSize: 14, padding: 0, borderRadius: '50%', border: '1px solid var(--color-border)', background: 'var(--color-bg-overlay)', color: 'var(--color-text-primary)' }}
                >
                    <span className="material-symbols-outlined">more_horiz</span>
                </Button>
                {moreOpen && (
                    <div role="menu" aria-label="更多功能" style={{ ...menuStyle, right: 0 }}>
                        {isAuth && (
                            <Button themeAware variant="menu" full onClick={() => { setMoreOpen(false); isOnDinners ? onGoHome?.() : onOpenDinners?.(); }}>
                                {isOnDinners ? '返回地图' : '聚餐活动 (beta)'}
                            </Button>
                        )}
                        {divider}
                        {isAuth && (isAdmin || isOnAdmin) && (
                            <>
                                <Button themeAware variant="menu" full onClick={() => { setMoreOpen(false); isOnAdmin ? onGoHome?.() : onOpenAdmin?.(); }}>{isOnAdmin ? '返回地图' : '管理后台'}</Button>
                                {divider}
                            </>
                        )}
                        {isAuth && (
                            <>
                                <Button themeAware variant="menu" full onClick={() => { setMoreOpen(false); isOnPosterExport ? onGoHome?.() : onOpenPosterExport?.(); }}>{isOnPosterExport ? '返回地图' : '导出海报 (beta)'}</Button>
                                {divider}
                            </>
                        )}
                        <div style={{ padding: '9px 12px', fontSize: 13 }}>
                            <div style={{ fontWeight: 700 }}>关于东方饭联地图</div>
                            <div style={{ marginTop: 4, color: 'var(--color-text-secondary)' }}>版本 v2.0.0</div>
                        </div>
                    </div>
                )}
            </div>
        </header>
    );
});

export default AuthPanel;
