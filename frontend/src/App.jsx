import React, { useState, useEffect } from "react";
import MapView from "./Map";
import AuthPage from "./AuthPage";

const PORT = (typeof process !== "undefined" && process.env && process.env.REACT_APP_PORT) || 3000;
console.log("REACT_APP_PORT =", typeof process !== "undefined" ? process.env.REACT_APP_PORT : undefined, "→ 使用 PORT =", PORT);

const BACKEND_URL = `http://localhost:${PORT}`;

export default function App() {
    const [userId] = useState(864); // 临时模拟当前用户 id
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem("token"));
    const [showAuth, setShowAuth] = useState(false);

    // 登录成功
    const handleLoginSuccess = (u, t) => {
        setUser(u);
        setToken(t);
        localStorage.setItem("token", t);
        setShowAuth(false);
    };

    // 检查是否已登录
    const isAuth = !!token && !!user;

    // 提示并跳转登录
    const requireAuth = () => {
        alert("请先登录/注册才可进行此操作！");
        setShowAuth(true);
    };

    useEffect(() => {
        // TODO: 自动检查 token 有效性，拉取用户信息
    }, [token]);

    if (!token || !user) {
        return <AuthPage backendUrl={BACKEND_URL}
            onLoginSuccess={(u, t) => { setUser(u); setToken(t); }} />;
    }

    // 已登录的主界面
    return (
        <div style={{ height: "100vh", position: "relative" }}>
            {/* 地图模块始终可见 */}
            <MapView userId={user ? user.id : null} backendUrl={backendUrl}
                onAddPlace={handleAddPlace}
                onComment={handleComment}
            />

            {/* 只在需要时展示登录/注册界面 */}
            {showAuth && (
                <div style={{
                    position: "absolute",
                    left: 0, top: 0, right: 0, bottom: 0,
                    background: "rgba(0,0,0,0.25)",
                    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5000
                }}>
                    <AuthPage backendUrl={backendUrl} onLoginSuccess={handleLoginSuccess} />
                </div>
            )}

            {/* 登录信息及注销按钮 */}
            <div className="panel">
                <strong>东方饭联地图</strong>
                {
                    isAuthenticated ?
                        (<div>
                            当前用户：{user.username} <button onClick={() => {
                                setUser(null); setToken(null); localStorage.removeItem("token");
                            }}>注销</button>
                        </div>)
                        :
                        (<div>未登录</div>)
                }
            </div>
        </div>
    );
}
