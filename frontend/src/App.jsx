import React, { useCallback, useEffect, useState } from "react";
import MapView from "./Map";
import AdminDashboard from "./AdminDashboard";
import Settings from "./Settings";
import EditUsername from "./settings/EditUsername";
import EditPassword from "./settings/EditPassword";
import AuthPanel from "./components/AuthPanel";
import AuthModal from "./components/AuthModal";
import { AuthProvider } from "./AuthContext";
import BanNotice from "./components/BanNotice";
import { TipsProvider } from "./components/Tips";

function normalizeUrl(url) {
    return String(url).replace(/\/+$/, "");
}

function resolveBackendUrl() {
    const env = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : {};
    const explicitUrl = env.VITE_BACKEND_URL && String(env.VITE_BACKEND_URL).trim();
    if (explicitUrl) return normalizeUrl(explicitUrl);

    if (typeof window !== "undefined") {
        const { protocol, hostname } = window.location;
        // 本地开发默认连本机后端；线上默认同主机 3000 端口。
        if (hostname === "localhost" || hostname === "127.0.0.1") {
            return "http://localhost:3000";
        }
        return `${protocol}//${hostname}:3000`;
    }

    return "http://localhost:3000";
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
        clearAuthState();
        goPath("/");
    }, [token, clearAuthState, goPath]);

    useEffect(() => {
        const onPopstate = () => setPathname(currentPathname());
        window.addEventListener("popstate", onPopstate);
        return () => window.removeEventListener("popstate", onPopstate);
    }, []);

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
    const showSettingsAny = typeof pathname === 'string' && pathname.startsWith("/settings");

    const authValue = {
        token,
        setToken: (t) => { setToken(t); try { localStorage.setItem('token', t); } catch (e) { } },
        user,
        setUser,
        onRequireAuth: handleRequireAuth
    };

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
                            <div style={{ minHeight: "var(--app-height, 100vh)", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
                                onOpenEditUsername={() => goPath('/settings/username')}
                                onOpenEditPassword={() => goPath('/settings/password')}
                            />
                        ) : (
                            <div style={{ minHeight: "var(--app-height, 100vh)", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
                            <div style={{ minHeight: "var(--app-height, 100vh)", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
