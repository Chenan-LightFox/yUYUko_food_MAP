import React, { useState, useEffect } from "react";
import MapView from "./Map";
import AuthPage from "./AuthPage";
import AdminDashboard from "./AdminDashboard";

const PORT = (typeof process !== "undefined" && process.env && process.env.REACT_APP_PORT) || 3000;
const BACKEND_URL = `http://localhost:${PORT}`;

export default function App() {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem("token"));
    const [showAuth, setShowAuth] = useState(!localStorage.getItem("token")); // 如果没有 token 默认展示登录/注册
    const [showAdmin, setShowAdmin] = useState(false);

    // 登录成功回调
    const handleLoginSuccess = (u, t) => {
        setUser(u);
        setToken(t);
        localStorage.setItem("token", t);
        setShowAuth(false);
    };

    // 注销
    const handleLogout = () => {
        setUser(null);
        setToken(null);
        localStorage.removeItem("token");
        setShowAuth(true);
        setShowAdmin(false);
    };

    useEffect(() => {
        // 如果有 token 但没有 user，就向后端请求 /users/me 获取用户信息
        if (token && !user) {
            (async () => {
                const url = `${BACKEND_URL}/users/me`;
                console.log('Attempting to fetch current user', { url, token });
                try {
                    const res = await fetch(url, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    console.log('Response status for /users/me:', res.status);
                    const text = await res.text();
                    console.log('Response body for /users/me:', text);

                    if (!res.ok) {
                        // token 无效或过期 或 路由未找到
                        setUser(null);
                        setToken(null);
                        localStorage.removeItem("token");
                        setShowAuth(true);
                        return;
                    }
                    // parse JSON
                    const data = JSON.parse(text || '{}');
                    if (data && data.user) {
                        setUser(data.user);
                    }
                } catch (e) {
                    console.error('Failed to fetch /users/me', e);
                }
            })();
        }
    }, [token, user]);

    const isAuth = !!token && !!user;
    const isAdmin = !!(user && user.admin_level);

    return (
        <div style={{ height: "100vh", position: "relative" }}>
            {/* 地图模块始终可见 */}
            <MapView userId={user ? user.id : null} backendUrl={BACKEND_URL} />

            {/* 登录/注册弹窗：只在 showAuth 为 true 时显示，允许用户关闭弹窗 */}
            {showAuth && (
                <div style={{
                    position: "absolute",
                    left: 0, top: 0, right: 0, bottom: 0,
                    background: "rgba(0,0,0,0.25)",
                    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5000
                }}>
                    <AuthPage backendUrl={BACKEND_URL} onLoginSuccess={handleLoginSuccess} onClose={() => setShowAuth(false)} />
                </div>
            )}

            {/* 登录信息及注销按钮 */}
            <div className="panel" style={{ position: "absolute", left: 12, top: 12, zIndex: 4000, padding: 8, background: "#fff", borderRadius: 6 }}>
                <strong>东方饭联地图</strong>
                <div style={{ marginTop: 8 }}>
                    {isAuth ? (
                        <div>
                            当前用户：{user.username} <button onClick={handleLogout}>注销</button>
                            {isAdmin && <button style={{ marginLeft: 8 }} onClick={() => setShowAdmin(true)}>进入管理员后台</button>}
                        </div>
                    ) : (
                        <div>
                            未登录 <button onClick={() => setShowAuth(true)}>登录 / 注册</button>
                        </div>
                    )}
                </div>
            </div>

            {/* 管理后台面板（模态层） */}
            {showAdmin && (
                <div style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', zIndex: 6000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '80%', maxHeight: '80%', overflow: 'auto', background: '#fff', padding: 16, borderRadius: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <h3 style={{ margin: 0 }}>管理员后台</h3>
                            <div>
                                <button onClick={() => setShowAdmin(false)}>关闭</button>
                            </div>
                        </div>
                        <AdminDashboard user={user} />
                    </div>
                </div>
            )}
        </div>
    );
}
