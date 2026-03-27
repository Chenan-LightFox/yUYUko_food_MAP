import React, { useCallback, useEffect, useState } from "react";
import MapView from "./Map";
import AdminDashboard from "./AdminDashboard";
import AuthPanel from "./components/AuthPanel";
import AuthModal from "./components/AuthModal";

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
        localStorage.removeItem("token");
        setShowAuth(true);
    }, []);

    const handleLoginSuccess = (u, t) => {
        setUser(u);
        setToken(t);
        localStorage.setItem("token", t);
        setShowAuth(false);
    };

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

    useEffect(() => {
        // 如果有 token 但没有 user，就向后端请求 /users/me 获取用户信息
        if (!token || user) return;

        (async () => {
            const url = `${BACKEND_URL}/users/me`;
            try {
                const res = await fetch(url, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!res.ok) {
                    clearAuthState();
                    return;
                }
                const data = await res.json();
                if (data && data.user) setUser(data.user);
            } catch (e) {
                console.error("Failed to fetch /users/me", { url, error: e });
            }
        })();
    }, [token, user, clearAuthState]);

    useEffect(() => {
        // 限定本阶段只支持两个页面路径
        if (pathname !== "/" && pathname !== "/admin") {
            goPath("/");
        }
    }, [pathname, goPath]);

    useEffect(() => {
        // 未登录访问 /admin 时，回首页并拉起登录框
        if (pathname === "/admin" && !token) {
            setShowAuth(true);
            goPath("/");
        }
    }, [pathname, token, goPath]);

    const isAuth = !!token && !!user;
    const isAdmin = !!(user && user.admin_level);
    const showAdminPage = pathname === "/admin" && !!token;

    return (
        <div style={{ height: "var(--app-height, 100vh)", position: "relative" }}>
            {!showAdminPage && <MapView userId={user ? user.id : null} backendUrl={BACKEND_URL} />}

            {showAdminPage && (
                user ? (
                    <AdminDashboard user={user} onBackHome={() => goPath("/")} onLogout={handleLogout} />
                ) : (
                    <div style={{ minHeight: "var(--app-height, 100vh)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        正在验证登录状态...
                    </div>
                )
            )}

            {pathname === "/" && (
                <AuthPanel
                    user={user}
                    isAuth={isAuth}
                    isAdmin={isAdmin}
                    onLogout={handleLogout}
                    onOpenAuth={() => setShowAuth(true)}
                    onOpenAdmin={() => goPath("/admin")}
                />
            )}

            {showAuth && (
                <AuthModal
                    backendUrl={BACKEND_URL}
                    onLoginSuccess={handleLoginSuccess}
                    onClose={() => setShowAuth(false)}
                />
            )}
        </div>
    );
}
