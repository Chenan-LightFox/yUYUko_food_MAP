import React, { useCallback, useEffect, useState } from "react";
import MapView from "./Map";
import AdminDashboard from "./AdminDashboard";
import Settings from "./Settings";
import EditUsername from "./settings/EditUsername";
import EditPassword from "./settings/EditPassword";
import PersonalizeMap from "./settings/PersonalizeMap";
import CustomThemes from "./settings/CustomThemes";
import AuthPanel from "./components/AuthPanel";
import AuthModal from "./components/AuthModal";
import { AuthProvider } from "./AuthContext";
import BanNotice from "./components/BanNotice";
import { TipsProvider } from "./components/Tips";
import { applyDarkMode, applyThemeColor } from "./utils/theme";
import useDarkMode from './utils/useDarkMode';

function normalizeUrl(url) {
    return String(url).replace(/\/+$/, "");
}

function resolveBackendUrl() {
    if (typeof window !== "undefined") {
        const { protocol, hostname } = window.location;
        console.log(`Resolved backend URL: ${protocol}//${hostname}:2053`);

        return `${protocol}//${hostname}:2053`;
    }

    return "http://localhost:2053";
}

const BACKEND_URL = resolveBackendUrl();

function currentPathname() {
    if (typeof window === "undefined") return "/";
    return window.location.pathname || "/";
}



export default function App() {
    const [pathname, setPathname] = useState(currentPathname());
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem("token"));
    const [showAuth, setShowAuth] = useState(!localStorage.getItem("token"));

    const goPath = useCallback((path) => {
        if (typeof window === "undefined") return;
        if (window.location.pathname === path) {
            setPathname(path);
            return;
        }
        window.history.pushState({}, "", path);
        setPathname(path);
    }, []);

    const clearAuthState = useCallback(() => {
        setUser(null);
        setToken(null);
        try { localStorage.removeItem("token"); } catch (e) { }
        setShowAuth(true);
    }, []);

    const handleLoginSuccess = (u, t) => {
        setUser(u);
        setToken(t);
        try { localStorage.setItem("token", t); } catch (e) { }
        setShowAuth(false);
    };

    const handleRequireAuth = useCallback(() => {
        // Open login modal but do not navigate away from current path so user can login in-place
        setShowAuth(true);
    }, []);

    const handleLogout = useCallback(async () => {
        if (token) {
            try {
                await fetch(`${BACKEND_URL}/users/logout`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` }
                });
            } catch (e) {
                console.warn("调用 /users/logout 失败，继续清理本地登录态", e);
            }
        }
        // clear auth state and also reset UI theme and map style to defaults
        try {
            // remove any persisted map settings so logged-out view uses defaults
            try { localStorage.removeItem('map_settings'); } catch (e) { }
            // ensure dark mode off and theme color cleared
            try { applyDarkMode(false); } catch (e) { }
            try { applyThemeColor(''); } catch (e) { }
            // inform map to apply light default style
            try { document.dispatchEvent(new CustomEvent('mapstylechange', { detail: { map_style_light: 'amap://styles/normal' } })); } catch (e) { }
        } catch (e) { /* ignore */ }
        clearAuthState();
        goPath("/");
    }, [token, clearAuthState, goPath]);

    useEffect(() => {
        // On mount, apply localStorage fallback theme if present
        try {
            const raw = localStorage.getItem('map_settings');
            if (raw) {
                const ms = JSON.parse(raw);
                if (ms && typeof ms.dark_mode !== 'undefined') applyDarkMode(!!ms.dark_mode);
                // Only apply saved theme color on mount when:
                // - there is a token (likely the user's own settings), OR
                // - the saved settings explicitly enable dark_mode, OR
                // - the page is already in dark mode (so a theme color makes sense).
                try {
                    const pageIsDark = document && document.documentElement && document.documentElement.getAttribute('data-theme') === 'dark';
                    const shouldApplyThemeColor = !!token || !!(ms && ms.dark_mode) || pageIsDark;
                    if (ms && typeof ms.theme_color !== 'undefined' && shouldApplyThemeColor && ms.theme_color) applyThemeColor(ms.theme_color);
                } catch (e) { /* ignore */ }
            }
        } catch (e) { }

        const onPopstate = () => setPathname(currentPathname());
        window.addEventListener("popstate", onPopstate);
        return () => window.removeEventListener("popstate", onPopstate);
    }, []);

    // Apply dark mode when user or their map_settings change
    useEffect(() => {
        try {
            if (user && user.map_settings) {
                if (typeof user.map_settings.dark_mode !== 'undefined') applyDarkMode(!!user.map_settings.dark_mode);
                if (typeof user.map_settings.theme_color !== 'undefined') applyThemeColor(user.map_settings.theme_color || '');
                return;
            }

            // fallback to localStorage when no user-specific setting
            const raw = localStorage.getItem('map_settings');
            if (raw) {
                const ms = JSON.parse(raw);
                if (ms && typeof ms.dark_mode !== 'undefined') applyDarkMode(!!ms.dark_mode);
                if (ms && typeof ms.theme_color !== 'undefined') applyThemeColor(ms.theme_color || '');
                return;
            }

            // default: remove dark mode
            applyDarkMode(false);
        } catch (e) { /* ignore */ }
    }, [user]);

    useEffect(() => {
        if (typeof document === "undefined" || typeof window === "undefined") return;

        const root = document.documentElement;
        const updateViewportHeight = () => {
            const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
            root.style.setProperty("--app-height", `${Math.round(viewportHeight)}px`);
        };

        updateViewportHeight();

        const visualViewport = window.visualViewport;
        window.addEventListener("resize", updateViewportHeight);
        window.addEventListener("orientationchange", updateViewportHeight);
        if (visualViewport) {
            visualViewport.addEventListener("resize", updateViewportHeight);
        }

        return () => {
            window.removeEventListener("resize", updateViewportHeight);
            window.removeEventListener("orientationchange", updateViewportHeight);
            if (visualViewport) {
                visualViewport.removeEventListener("resize", updateViewportHeight);
            }
        };
    }, []);

    // Sync token across tabs and refresh user when token changes
    useEffect(() => {
        const onStorage = (e) => {
            if (!e) return;
            if (e.key === 'token') {
                const newToken = e.newValue;
                setToken(newToken);
                if (!newToken) {
                    // logged out in another tab
                    setUser(null);
                    setShowAuth(true);
                    // reset theme & map style when user logged out in another tab
                    try { applyDarkMode(false); } catch (err) { }
                    try { applyThemeColor(''); } catch (err) { }
                    try { document.dispatchEvent(new CustomEvent('mapstylechange', { detail: { map_style_light: 'amap://styles/normal' } })); } catch (err) { }
                    if (pathname === '/admin') goPath('/');
                    return;
                }
                // fetch /users/me to refresh user info
                (async () => {
                    try {
                        const res = await fetch(`${BACKEND_URL}/users/me`, { headers: { Authorization: `Bearer ${newToken}` } });
                        if (!res.ok) {
                            setUser(null);
                            setShowAuth(true);
                            return;
                        }
                        const data = await res.json();
                        if (data && data.user) setUser(data.user);
                    } catch (err) {
                        console.warn('Failed to refresh user after storage token change', err);
                        setUser(null);
                        setShowAuth(true);
                    }
                })();
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [goPath, pathname]);

    useEffect(() => {
        // If we get a token but no user (e.g., on page load), try to fetch /users/me
        if (!token || user) return;
        (async () => {
            try {
                const res = await fetch(`${BACKEND_URL}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok) {
                    // invalid token, clear
                    clearAuthState();
                    return;
                }
                const data = await res.json();
                if (data && data.user) setUser(data.user);
            } catch (e) {
                console.error("Failed to fetch /users/me", { url: `${BACKEND_URL}/users/me`, error: e });
                clearAuthState();
            }
        })();
    }, [token, user, clearAuthState]);

    useEffect(() => {
        // 限定本阶段只支持若干页面路径（允许 /, /admin, /settings/*）
        if (pathname !== "/" && pathname !== "/admin" && !pathname.startsWith("/settings")) {
            goPath("/");
        }
    }, [pathname, goPath]);

    useEffect(() => {
        // 未登录访问 /admin 或任何 /settings 子路径时，弹出登录对话框但不强制跳回首页，以便用户在页面内登录
        if ((pathname === "/admin" || pathname.startsWith("/settings")) && !token) {
            setShowAuth(true);
            // do not navigate away; allow login modal to appear over these pages
        }
    }, [pathname, token]);

    const isAuth = !!token && !!user;
    const isAdmin = !!(user && user.admin_level);
    const showAdminPage = pathname === "/admin" && !!token;
    const showSettingsBase = pathname === "/settings";
    const showSettingsEdit = pathname === "/settings/username";
    const showSettingsPassword = pathname === "/settings/password";
    const showSettingsPersonalize = pathname === "/settings/personalize";
    const showSettingsThemes = pathname === "/settings/themes";
    const showSettingsAny = typeof pathname === 'string' && pathname.startsWith("/settings");

    const authValue = {
        token,
        setToken: (t) => { setToken(t); try { localStorage.setItem('token', t); } catch (e) { } },
        user,
        setUser,
        onRequireAuth: handleRequireAuth
    };

    const dark = useDarkMode();
    const placeholderStyle = { minHeight: "var(--app-height, 100vh)", display: "flex", alignItems: "center", justifyContent: "center", color: dark ? '#e5e7eb' : 'inherit', background: dark ? '#0b1220' : undefined };

    return (
        <AuthProvider value={authValue}>
            <TipsProvider>
                <div style={{ height: "var(--app-height, 100vh)", position: "relative" }}>
                    <BanNotice />
                    {!showAdminPage && !showSettingsAny && (
                        <MapView
                            backendUrl={BACKEND_URL}
                            token={token}
                            isAuthenticated={isAuth}
                            onRequireAuth={() => setShowAuth(true)}
                        />
                    )}

                    {showAdminPage && (
                        user ? (
                            <AdminDashboard
                                user={user}
                                token={token}
                                backendUrl={BACKEND_URL}
                                onBackHome={() => goPath("/")}
                                onLogout={handleLogout}
                                onRequireAuth={handleRequireAuth}
                            />
                        ) : (
                            <div style={placeholderStyle}>
                                正在验证登录状态...
                            </div>
                        )
                    )}

                    {showSettingsBase && (
                        user ? (
                            <Settings
                                user={user}
                                onBack={() => goPath("/")}
                                backendUrl={BACKEND_URL}
                                token={token}
                                onUpdateUser={handleLoginSuccess}
                                onLogout={handleLogout}
                                onOpenEditUsername={() => goPath('/settings/username')}
                                onOpenEditPassword={() => goPath('/settings/password')}
                                onOpenPersonalize={() => goPath('/settings/personalize')}
                                onOpenThemes={() => goPath('/settings/themes')}
                            />
                        ) : (
                            <div style={placeholderStyle}>
                                正在验证登录状态...
                            </div>
                        )
                    )}

                    {showSettingsPassword && (
                        user ? (
                            <EditPassword
                                user={user}
                                onBack={() => goPath('/settings')}
                                backendUrl={BACKEND_URL}
                                token={token}
                                onUpdateUser={handleLoginSuccess}
                            />
                        ) : (
                            <div style={placeholderStyle}>
                                正在验证登录状态...
                            </div>
                        )
                    )}

                    {showSettingsPersonalize && (
                        user ? (
                            <PersonalizeMap
                                user={user}
                                onBack={() => goPath('/settings')}
                                backendUrl={BACKEND_URL}
                                token={token}
                                onUpdateUser={handleLoginSuccess}
                            />
                        ) : (
                            <div style={placeholderStyle}>
                                正在验证登录状态...
                            </div>
                        )
                    )}

                    {showSettingsThemes && (
                        user ? (
                            <CustomThemes
                                user={user}
                                onBack={() => goPath('/settings')}
                                backendUrl={BACKEND_URL}
                                token={token}
                                onUpdateUser={handleLoginSuccess}
                            />
                        ) : (
                            <div style={placeholderStyle}>
                                正在验证登录状态...
                            </div>
                        )
                    )}

                    {showSettingsEdit && (
                        user ? (
                            <EditUsername
                                user={user}
                                onBack={() => goPath('/settings')}
                                backendUrl={BACKEND_URL}
                                token={token}
                                onUpdateUser={handleLoginSuccess}
                            />
                        ) : (
                            <div style={{ minHeight: "var(--app-height, 100vh)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                正在验证登录状态...
                            </div>
                        )
                    )}

                    <AuthPanel
                        user={user}
                        isAuth={isAuth}
                        isAdmin={isAdmin}
                        onLogout={handleLogout}
                        onOpenAuth={() => setShowAuth(true)}
                        onOpenAdmin={() => goPath("/admin")}
                        onOpenSettings={() => goPath("/settings")}
                        onGoHome={() => goPath("/")}
                        pathname={pathname}
                    />

                    {showAuth && (
                        <AuthModal
                            backendUrl={BACKEND_URL}
                            onLoginSuccess={(u, t) => { handleLoginSuccess(u, t); }}
                            onClose={() => setShowAuth(false)}
                        />
                    )}
                </div>
            </TipsProvider>
        </AuthProvider>
    );
}
