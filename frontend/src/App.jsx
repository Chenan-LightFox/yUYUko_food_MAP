import React, { useState, useEffect } from "react";
import MapView from "./Map";
import AuthPage from "./AuthPage";

const PORT = (typeof process !== "undefined" && process.env && process.env.REACT_APP_PORT) || 3000;
const BACKEND_URL = `http://localhost:${PORT}`;

export default function App() {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem("token"));
    const [showAuth, setShowAuth] = useState(!localStorage.getItem("token")); // 如果没有 token 默认展示登录/注册

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
    };

    useEffect(() => {
        // TODO: 自动检查 token 有效性，拉取用户信息，若后端提供 /users/me 可在此自动校验 token 并 setUser
    }, [token]);

    const isAuth = !!token && !!user;

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
                        </div>
                    ) : (
                        <div>
                            未登录 <button onClick={() => setShowAuth(true)}>登录 / 注册</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
