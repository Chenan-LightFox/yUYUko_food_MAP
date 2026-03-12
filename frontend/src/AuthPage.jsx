import React, { useState } from "react";

export default function AuthPage({ backendUrl, onLoginSuccess }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [isRegister, setIsRegister] = useState(false);
    const [msg, setMsg] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        const url = isRegister
            ? `${backendUrl}/users/register`
            : `${backendUrl}/users/login`;
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            const data = await res.json();
            if (data.error) {
                setMsg("错误：" + data.error);
            } else {
                setMsg(isRegister ? "注册成功！" : "登录成功！");
                // 可存储 token 到 localStorage 并回调更新登录状态
                localStorage.setItem("token", data.token);
                onLoginSuccess && onLoginSuccess(data.user, data.token);
            }
        } catch (e) {
            setMsg("网络错误：" + e.message);
        }
    };

    return (
        <div>
            <h3>{isRegister ? "注册" : "登录"}</h3>
            <form onSubmit={handleSubmit}>
                <input
                    placeholder="用户名"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                /><br />
                <input
                    type="password"
                    placeholder="密码"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                /><br />
                <button type="submit">{isRegister ? "注册" : "登录"}</button>
                <button type="button" onClick={() => { setIsRegister(v => !v); setMsg(""); }}>
                    {isRegister ? "切换到登录" : "切换到注册"}
                </button>
            </form>
            {msg && <div>{msg}</div>}
        </div>
    );
}