import React, { useState, useEffect } from "react";
import MapView from "./Map";
import AdminDashboard from "./AdminDashboard";
import Modal from './components/Modal';
import Button from './components/Button';
import AuthPanel from './components/AuthPanel';
import AuthModal from './components/AuthModal';

const HOST = "8.210.201.2";
const PORT = (typeof process !== "undefined" && process.env && process.env.REACT_APP_PORT) || 3000;
const BACKEND_URL = `http://${HOST}:${PORT}`;

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
                try {
                    const res = await fetch(url, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (!res.ok) {
                        setUser(null);
                        setToken(null);
                        localStorage.removeItem("token");
                        setShowAuth(true);
                        return;
                    }
                    const data = await res.json();
                    if (data && data.user) setUser(data.user);
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

            {/* 登录信息面板/按钮 */}
            <AuthPanel user={user} isAuth={isAuth} isAdmin={isAdmin} onLogout={handleLogout} onOpenAuth={() => setShowAuth(true)} onOpenAdmin={() => setShowAdmin(true)} />

            {/* 登录/注册弹窗 */}
            {showAuth && (
                <AuthModal backendUrl={BACKEND_URL} onLoginSuccess={handleLoginSuccess} onClose={() => setShowAuth(false)} />
            )}

            {/* 管理后台面板（模态层） */}
            {showAdmin && (
                <Modal title="管理员后台" onClose={() => setShowAdmin(false)}>
                    <AdminDashboard user={user} />
                </Modal>
            )}
        </div>
    );
}
