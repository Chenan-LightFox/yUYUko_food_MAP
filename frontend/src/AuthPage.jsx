import React, { useCallback, useEffect, useState } from "react";

const REQUEST_TIMEOUT_MS = 12000;
const MAX_USERNAME_LENGTH = 64;
const MAX_PASSWORD_LENGTH = 128;
const MAX_INVITE_CODE_LENGTH = 64;

async function parseResponseBody(res) {
    const text = await res.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return { error: text.slice(0, 160) };
    }
}

function getFriendlyErrorMessage(status, fallback, action) {
    const serverMessage = typeof fallback === "string" ? fallback : "";
    if (serverMessage) return serverMessage;
    if (status === 400) return `${action}请求参数有误，请检查输入`;
    if (status === 401) return "用户名或密码错误";
    if (status === 403) return "当前账号无权限执行该操作";
    if (status === 404) return `${action}服务暂不可用，请稍后重试`;
    if (status === 409) return "用户名已存在";
    if (status === 429) return "请求过于频繁，请稍后再试";
    if (status >= 500) return "服务器开小差了，请稍后重试";
    return `${action}失败：${status}`;
}

async function fetchWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timerId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        window.clearTimeout(timerId);
    }
}

export default function AuthPage({ backendUrl, onLoginSuccess, onClose }) {
    const [tab, setTab] = useState("login"); // "login" | "register"
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [inviteCode, setInviteCode] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    const resetForm = useCallback(() => {
        setUsername("");
        setPassword("");
        setInviteCode("");
        setMessage("");
        setLoading(false);
    }, []);

    const handleClose = useCallback(() => {
        if (loading) return;
        resetForm();
        onClose && onClose();
    }, [loading, onClose, resetForm]);

    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                handleClose();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [handleClose]);

    const switchTab = (nextTab) => {
        if (loading) return;
        setTab(nextTab);
        setMessage("");
    };

    const handleUsernameChange = (value) => {
        if (message) setMessage("");
        setUsername(value);
    };

    const handlePasswordChange = (value) => {
        if (message) setMessage("");
        setPassword(value);
    };

    const handleInviteCodeChange = (value) => {
        if (message) setMessage("");
        setInviteCode(value);
    };

    const handleLogin = async (e) => {
        e && e.preventDefault();
        if (loading) return;
        setMessage("");
        const normalizedUsername = username.trim();
        if (!normalizedUsername || !password) return setMessage("请输入用户名和密码");
        if (normalizedUsername.length > MAX_USERNAME_LENGTH) return setMessage(`用户名不能超过 ${MAX_USERNAME_LENGTH} 个字符`);
        if (password.length > MAX_PASSWORD_LENGTH) return setMessage(`密码不能超过 ${MAX_PASSWORD_LENGTH} 个字符`);
        setLoading(true);
        try {
            const res = await fetchWithTimeout(`${backendUrl}/users/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: normalizedUsername, password })
            });
            const data = await parseResponseBody(res);
            if (res.ok) {
                if (data.user && data.token) {
                    onLoginSuccess && onLoginSuccess(data.user, data.token);
                    setMessage("登录成功");
                } else {
                    setMessage("登录成功，但未收到用户信息");
                }
            } else {
                setMessage(getFriendlyErrorMessage(res.status, data.error, "登录"));
            }
        } catch (err) {
            if (err && err.name === "AbortError") {
                setMessage("请求超时，请检查网络后重试");
            } else {
                setMessage(`网络错误：${err && err.message ? err.message : "请稍后重试"}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e && e.preventDefault();
        if (loading) return;
        setMessage("");
        const normalizedUsername = username.trim();
        const normalizedInviteCode = inviteCode.trim();
        if (!normalizedUsername || !password || !normalizedInviteCode) return setMessage("请填写用户名、密码和邀请码");
        if (normalizedUsername.length > MAX_USERNAME_LENGTH) return setMessage(`用户名不能超过 ${MAX_USERNAME_LENGTH} 个字符`);
        if (password.length > MAX_PASSWORD_LENGTH) return setMessage(`密码不能超过 ${MAX_PASSWORD_LENGTH} 个字符`);
        if (normalizedInviteCode.length > MAX_INVITE_CODE_LENGTH) return setMessage(`邀请码不能超过 ${MAX_INVITE_CODE_LENGTH} 个字符`);
        setLoading(true);
        try {
            const res = await fetchWithTimeout(`${backendUrl}/users/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: normalizedUsername, password, inviteCode: normalizedInviteCode })
            });
            const data = await parseResponseBody(res);
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
                setMessage(getFriendlyErrorMessage(res.status, data.error, "注册"));
            }
        } catch (err) {
            if (err && err.name === "AbortError") {
                setMessage("请求超时，请检查网络后重试");
            } else {
                setMessage(`网络错误：${err && err.message ? err.message : "请稍后重试"}`);
            }
        } finally {
            setLoading(false);
        }
    };
    const isSuccessMessage = message.includes("成功");

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
                width: "min(420px, calc(100vw - 32px))",
                maxHeight: "calc(100vh - 32px)",
                overflowY: "auto",
                background: "#fff",
                padding: 18,
                borderRadius: 8,
                boxShadow: "0 6px 24px rgba(0,0,0,0.25)"
            }}
        >
            <h2 id="auth-modal-title" style={{ margin: "0 0 10px 0", fontSize: 20 }}>账号登录</h2>
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <button type="button" disabled={loading} onClick={() => switchTab("login")} style={{ fontWeight: tab === "login" ? "bold" : "normal", whiteSpace: "nowrap" }}>登录</button>
                <button type="button" disabled={loading} onClick={() => switchTab("register")} style={{ fontWeight: tab === "register" ? "bold" : "normal", whiteSpace: "nowrap" }}>注册</button>
                <div style={{ marginLeft: "auto" }}>
                    <button type="button" disabled={loading} onClick={handleClose}>关闭</button>
                </div>
            </div>

            {tab === "login" ? (
                <form onSubmit={handleLogin}>
                    <div>
                        <input
                            placeholder="用户名"
                            value={username}
                            autoComplete="username"
                            maxLength={MAX_USERNAME_LENGTH}
                            onChange={(e) => handleUsernameChange(e.target.value)}
                            style={{ width: "100%", boxSizing: "border-box" }}
                        />
                    </div>
                    <div style={{ marginTop: 8 }}>
                        <input
                            type="password"
                            placeholder="密码"
                            value={password}
                            autoComplete="current-password"
                            maxLength={MAX_PASSWORD_LENGTH}
                            onChange={(e) => handlePasswordChange(e.target.value)}
                            style={{ width: "100%", boxSizing: "border-box" }}
                        />
                    </div>
                    <div style={{ marginTop: 12, textAlign: "right" }}>
                        <button type="submit" disabled={loading}>{loading ? "登录中..." : "登录"}</button>
                    </div>
                </form>
            ) : (
                <form onSubmit={handleRegister}>
                    <div>
                        <input
                            placeholder="用户名"
                            value={username}
                            autoComplete="username"
                            maxLength={MAX_USERNAME_LENGTH}
                            onChange={(e) => handleUsernameChange(e.target.value)}
                            style={{ width: "100%", boxSizing: "border-box" }}
                        />
                    </div>
                    <div style={{ marginTop: 8 }}>
                        <input
                            type="password"
                            placeholder="密码"
                            value={password}
                            autoComplete="new-password"
                            maxLength={MAX_PASSWORD_LENGTH}
                            onChange={(e) => handlePasswordChange(e.target.value)}
                            style={{ width: "100%", boxSizing: "border-box" }}
                        />
                    </div>
                    <div style={{ marginTop: 8 }}>
                        <input
                            placeholder="邀请码"
                            value={inviteCode}
                            maxLength={MAX_INVITE_CODE_LENGTH}
                            onChange={(e) => handleInviteCodeChange(e.target.value)}
                            style={{ width: "100%", boxSizing: "border-box" }}
                        />
                    </div>
                    <div style={{ marginTop: 12, textAlign: "right" }}>
                        <button type="submit" disabled={loading}>{loading ? "注册中..." : "注册并登录"}</button>
                    </div>
                </form>
            )}

            {message && (
                <p
                    role="status"
                    aria-live="polite"
                    style={{
                        marginTop: 12,
                        color: isSuccessMessage ? "#0f7a0f" : "#b00020",
                        overflowWrap: "anywhere",
                        whiteSpace: "pre-wrap"
                    }}
                >
                    {message}
                </p>
            )}
        </div>
    );
}
