import React, { useState } from "react";

export default function Register({ backendUrl }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [inviteCode, setInviteCode] = useState("");
    const [message, setMessage] = useState("");

    const handleRegister = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${backendUrl}/users/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password, inviteCode }),
            });
            const data = await res.json();
            if (data.error) {
                setMessage(`注册失败：${data.error}`);
            } else {
                setMessage(`用户注册成功！用户名：${data.user.username}`);
            }
        } catch (err) {
            setMessage(`网络错误：${err.message}`);
        }
    };

    return (
        <form onSubmit={handleRegister}>
            <input
                type="text"
                placeholder="用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
            />
            <br/>
            <input
                type="password"
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            />
            <br/>
            <input
                type="text"
                placeholder="邀请码"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
            />
            <br/>
            <button type="submit">注册</button>
            {message && <p>{message}</p>}
        </form>
    );
}