import React, { useCallback, useEffect, useState } from "react";
import TextInput from './components/TextInput';
import ScrollableView from './components/ScrollableView';

const REQUEST_TIMEOUT_MS = 12000;
const MAX_USERNAME_LENGTH = 64;
const MAX_PASSWORD_LENGTH = 128;
const MAX_INVITE_CODE_LENGTH = 64;
const UI_COLORS = {
    panelBackground: "#ffffff",
    textStrong: "#1f2328",
    textMuted: "#57606a",
    border: "#d0d7de",
    tabGroupBackground: "#f6f8fa",
    tabActiveBackground: "#e7f1ff",
    tabActiveBorder: "#8cb4ff",
    tabActiveText: "#0a3069",
    primaryAction: "#1f6feb",
    primaryActionBorder: "#1558b0",
    primaryActionDisabled: "#8fb7f2",
    inputBackground: "#fbfdff",
    successText: "#0f7a0f",
    successBackground: "#edf9ed",
    errorText: "#b00020",
    errorBackground: "#fff1f3"
};

function getTabButtonStyle(isActive, disabled) {
    return {
        border: `1px solid ${isActive ? UI_COLORS.tabActiveBorder : "transparent"}`,
        background: isActive ? UI_COLORS.tabActiveBackground : "transparent",
        color: isActive ? UI_COLORS.tabActiveText : UI_COLORS.textMuted,
        borderRadius: 8,
        padding: "7px 14px",
        lineHeight: 1.2,
        fontWeight: isActive ? 700 : 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.7 : 1
    };
}

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
    const [qq, setQq] = useState("");
    const [inviteCode, setInviteCode] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    const resetForm = useCallback(() => {
        setUsername("");
        setPassword("");
        setQq("");
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

    const handleQqChange = (value) => {
        if (message) setMessage("");
        setQq(value);
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
        const normalizedQq = qq.trim();
        const normalizedInviteCode = inviteCode.trim();
        if (!normalizedUsername || !password || !normalizedInviteCode || !normalizedQq) return setMessage("请填写用户名、密码、QQ号和邀请码");
        if (normalizedUsername.length > MAX_USERNAME_LENGTH) return setMessage(`用户名不能超过 ${MAX_USERNAME_LENGTH} 个字符`);
        if (password.length > MAX_PASSWORD_LENGTH) return setMessage(`密码不能超过 ${MAX_PASSWORD_LENGTH} 个字符`);
        if (normalizedQq.length > 20) return setMessage(`QQ号不能超过 20 个字符`);
        if (normalizedInviteCode.length > MAX_INVITE_CODE_LENGTH) return setMessage(`邀请码不能超过 ${MAX_INVITE_CODE_LENGTH} 个字符`);
        setLoading(true);
        try {
            const res = await fetchWithTimeout(`${backendUrl}/users/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: normalizedUsername, password, qq: normalizedQq, inviteCode: normalizedInviteCode })
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
    const modeText = tab === "login" ? "登录已有账号" : "注册新账号";
    const modeHint = tab === "login" ? "输入账号密码后登录" : "填写邀请码后创建账号并自动登录";
    const submitButtonText = tab === "login"
        ? (loading ? "登录中..." : "登录账号")
        : (loading ? "注册中..." : "注册并登录");
    const inputStyle = {
        width: "100%",
        boxSizing: "border-box",
        padding: "9px 10px",
        borderRadius: 8,
        border: `1px solid ${UI_COLORS.border}`,
        background: UI_COLORS.inputBackground
    };
    const labelStyle = {
        display: "block",
        marginBottom: 6,
        fontSize: 13,
        color: UI_COLORS.textMuted
    };

    return (
        <ScrollableView
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
                width: "min(420px, calc(100vw - 32px))",
                maxHeight: "calc(var(--app-height, 100vh) - 32px)",
                overflowY: "auto",
                background: UI_COLORS.panelBackground,
                padding: 18,
                borderRadius: 8,
                boxShadow: "0 6px 24px rgba(0,0,0,0.25)"
            }}
        >
            <h2 id="auth-modal-title" style={{ margin: "0 0 10px 0", fontSize: 20, color: UI_COLORS.textStrong }}>账号登录</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <div style={{ display: "inline-flex", gap: 4, padding: 4, borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, background: UI_COLORS.tabGroupBackground }}>
                    <button
                        type="button"
                        aria-pressed={tab === "login"}
                        disabled={loading}
                        onClick={() => switchTab("login")}
                        style={getTabButtonStyle(tab === "login", loading)}
                    >
                        登录
                    </button>
                    <button
                        type="button"
                        aria-pressed={tab === "register"}
                        disabled={loading}
                        onClick={() => switchTab("register")}
                        style={getTabButtonStyle(tab === "register", loading)}
                    >
                        注册
                    </button>
                </div>
                <div style={{ marginLeft: "auto" }}>
                    <button
                        type="button"
                        disabled={loading}
                        onClick={handleClose}
                        style={{ border: `1px solid ${UI_COLORS.border}`, borderRadius: 8, padding: "7px 10px", color: UI_COLORS.textMuted, background: UI_COLORS.panelBackground }}
                    >
                        关闭
                    </button>
                </div>
            </div>

            <p style={{ margin: "0 0 12px 0", fontSize: 13, color: UI_COLORS.textMuted }}>
                当前操作：<strong style={{ color: UI_COLORS.textStrong }}>{modeText}</strong>。{modeHint}
            </p>

            {tab === "login" ? (
                <form onSubmit={handleLogin}>
                    <div>
                        <label htmlFor="auth-username" style={labelStyle}>用户名</label>
                        <TextInput
                            id="auth-username"
                            placeholder="请输入用户名"
                            value={username}
                            autoComplete="username"
                            maxLength={MAX_USERNAME_LENGTH}
                            onChange={(e) => handleUsernameChange(e.target.value)}
                            style={{ width: '100%' }}
                        />
                    </div>
                    <div style={{ marginTop: 10 }}>
                        <label htmlFor="auth-password-login" style={labelStyle}>密码</label>
                        <TextInput
                            id="auth-password-login"
                            type="password"
                            placeholder="请输入密码"
                            value={password}
                            autoComplete="current-password"
                            maxLength={MAX_PASSWORD_LENGTH}
                            onChange={(e) => handlePasswordChange(e.target.value)}
                            style={{ width: '100%' }}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: "100%",
                            marginTop: 14,
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: `1px solid ${loading ? UI_COLORS.primaryActionDisabled : UI_COLORS.primaryActionBorder}`,
                            background: loading ? UI_COLORS.primaryActionDisabled : UI_COLORS.primaryAction,
                            color: "#fff",
                            fontWeight: 700,
                            letterSpacing: "0.02em",
                            cursor: loading ? "not-allowed" : "pointer"
                        }}
                    >
                        {submitButtonText}
                    </button>
                </form>
            ) : (
                <form onSubmit={handleRegister}>
                    <div>
                        <label htmlFor="auth-username-register" style={labelStyle}>用户名</label>
                        <TextInput
                            id="auth-username-register"
                            placeholder="请输入用户名"
                            value={username}
                            autoComplete="username"
                            maxLength={MAX_USERNAME_LENGTH}
                            onChange={(e) => handleUsernameChange(e.target.value)}
                            style={{ width: '100%' }}
                        />
                    </div>
                    <div style={{ marginTop: 10 }}>
                        <label htmlFor="auth-password-register" style={labelStyle}>密码</label>
                        <TextInput
                            id="auth-password-register"
                            type="password"
                            placeholder="设置一个登录密码"
                            value={password}
                            autoComplete="new-password"
                            maxLength={MAX_PASSWORD_LENGTH}
                            onChange={(e) => handlePasswordChange(e.target.value)}
                            style={{ width: '100%' }}
                        />
                    </div>
                    <div style={{ marginTop: 10 }}>
                        <label htmlFor="auth-qq-register" style={labelStyle}>QQ号</label>
                        <TextInput
                            id="auth-qq-register"
                            type="text"
                            placeholder="请输入QQ号"
                            value={qq}
                            maxLength={20}
                            onChange={(e) => handleQqChange(e.target.value)}
                            style={{ width: '100%' }}
                        />
                    </div>
                    <div style={{ marginTop: 10 }}>
                        <label htmlFor="auth-invite-code" style={labelStyle}>邀请码</label>
                        <TextInput
                            id="auth-invite-code"
                            placeholder="请输入邀请码"
                            value={inviteCode}
                            maxLength={MAX_INVITE_CODE_LENGTH}
                            onChange={(e) => handleInviteCodeChange(e.target.value)}
                            aria-describedby="auth-invite-note"
                            style={{ width: '100%' }}
                        />
                        <div id="auth-invite-note" style={{ marginTop: 4, fontSize: 12, color: UI_COLORS.textMuted }}>
                            邀请码请向管理员或群友索取
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: "100%",
                            marginTop: 14,
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: `1px solid ${loading ? UI_COLORS.primaryActionDisabled : UI_COLORS.primaryActionBorder}`,
                            background: loading ? UI_COLORS.primaryActionDisabled : UI_COLORS.primaryAction,
                            color: "#fff",
                            fontWeight: 700,
                            letterSpacing: "0.02em",
                            cursor: loading ? "not-allowed" : "pointer"
                        }}
                    >
                        {submitButtonText}
                    </button>
                </form>
            )}

            {message && (
                <p
                    role="status"
                    aria-live="polite"
                    style={{
                        marginTop: 12,
                        padding: "9px 11px",
                        borderRadius: 8,
                        border: `1px solid ${isSuccessMessage ? "#bfe5bf" : "#ffc7cf"}`,
                        color: isSuccessMessage ? UI_COLORS.successText : UI_COLORS.errorText,
                        background: isSuccessMessage ? UI_COLORS.successBackground : UI_COLORS.errorBackground,
                        overflowWrap: "anywhere",
                        whiteSpace: "pre-wrap"
                    }}
                >
                    {message}
                </p>
            )}
        </ScrollableView>
    );
}
