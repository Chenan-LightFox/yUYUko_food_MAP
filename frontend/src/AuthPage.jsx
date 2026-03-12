import React, { useState } from "react";

export default function AuthPage({ backendUrl, onLoginSuccess, onClose }) {
    const [tab, setTab] = useState("login"); // "login" | "register"
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [inviteCode, setInviteCode] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e && e.preventDefault();
        setMessage("");
        if (!username || !password) return setMessage("请输入用户名和密码");
        setLoading(true);
        try {
            const res = await fetch(`${backendUrl}/users/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (res.ok) {
                if (data.user && data.token) {
                    onLoginSuccess && onLoginSuccess(data.user, data.token);
                    setMessage("登录成功");
                } else {
                    setMessage("登录成功，但未收到用户信息");
                }
            } else {
                setMessage(data.error || `登录失败：${res.status}`);
            }
        } catch (err) {
            setMessage(`网络错误：${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e && e.preventDefault();
        setMessage("");
        if (!username || !password || !inviteCode) return setMessage("请填写用户名、密码和邀请码");
        setLoading(true);
        try {
            const res = await fetch(`${backendUrl}/users/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password, inviteCode })
            });
            const data = await res.json();
            if (res.ok || res.status === 201) {
                // 注册接口会返回 { user, token }，若返回 token 则自动登录
                if (data.user && data.token) {
                    onLoginSuccess && onLoginSuccess(data.user, data.token);
                    setMessage("注册并已登录");
                } else {
                    setMessage("注册成功，请返回登录页面登录");
                    setTab("login");
                }
            } else {
                setMessage(data.error || `注册失败：${res.status}`);
            }
        } catch (err) {
            setMessage(`网络错误：${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        // reset local state to avoid leaking previous input when reopened
        setUsername("");
        setPassword("");
        setInviteCode("");
        setMessage("");
        setLoading(false);
        onClose && onClose();
    };

    return (
        <div style={{ width: 420, background: "#fff", padding: 18, borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.25)" }}>
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <button type="button" onClick={() => setTab("login")} style={{ fontWeight: tab === "login" ? "bold" : "normal" }}>登录</button>
                <button type="button" onClick={() => setTab("register")} style={{ fontWeight: tab === "register" ? "bold" : "normal" }}>注册</button>
                <div style={{ marginLeft: "auto" }}>
                    <button type="button" onClick={handleClose}>关闭</button>
                </div>
            </div>

            {tab === "login" ? (
                <form onSubmit={handleLogin}>
                    <div><input placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
                    <div style={{ marginTop: 8 }}><input type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                    <div style={{ marginTop: 12, textAlign: "right" }}>
                        <button type="submit" disabled={loading}>{loading ? "登录中..." : "登录"}</button>
                    </div>
                </form>
            ) : (
                <form onSubmit={handleRegister}>
                    <div><input placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
                    <div style={{ marginTop: 8 }}><input type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                    <div style={{ marginTop: 8 }}><input placeholder="邀请码" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} /></div>
                    <div style={{ marginTop: 12, textAlign: "right" }}>
                        <button type="submit" disabled={loading}>{loading ? "注册中..." : "注册并登录"}</button>
                    </div>
                </form>
            )}

            {message && <p style={{ marginTop: 12, color: "red" }}>{message}</p>}
        </div>
    );
}
