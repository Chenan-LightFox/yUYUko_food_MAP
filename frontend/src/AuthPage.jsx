import React, { useCallback, useEffect, useRef, useState } from "react";
import TextInput from './components/TextInput';
import ScrollableView from './components/ScrollableView';
import Button from './components/Button';
import qrcodeImg from './img/qrcode.png';
import useDarkMode from './utils/useDarkMode';
import { getThemeColor, getThemeSecondary, colorToRgba, darkenColor } from './utils/theme';

const REQUEST_TIMEOUT_MS = 12000;
const MAX_USERNAME_LENGTH = 64;
const MAX_PASSWORD_LENGTH = 128;
const MAX_INVITE_CODE_LENGTH = 64;

function getStaticColors(dark) {
    return {
        panelBackground: 'var(--color-bg-surface)',
        textStrong: 'var(--color-text-primary)',
        textMuted: 'var(--color-text-secondary)',
        border: 'var(--color-border)',
        tabGroupBackground: 'var(--color-bg-overlay)',
        inputBackground: 'var(--color-bg-overlay)',
        successText: 'var(--color-success)',
        successBackground: dark ? 'rgba(92, 214, 152, 0.12)' : 'rgba(61, 153, 112, 0.10)',
        errorText: 'var(--color-danger)',
        errorBackground: dark ? 'rgba(255, 107, 107, 0.12)' : 'rgba(217, 83, 79, 0.10)'
    };
}

function getThemeUIColors(themeColor) {
    const primary = themeColor || '#E2789F';
    const secondary = getThemeSecondary() || primary;
    const primaryBorder = darkenColor(primary, 0.18);
    const primaryDisabled = colorToRgba(primary, 0.5);
    const tabActiveBg = colorToRgba(secondary, 0.15);
    const tabActiveBorder = colorToRgba(secondary, 0.4);
    const tabActiveText = primary;
    return {
        primaryAction: primary,
        primaryActionBorder: primaryBorder,
        primaryActionDisabled: primaryDisabled,
        tabActiveBackground: tabActiveBg,
        tabActiveBorder: tabActiveBorder,
        tabActiveText: tabActiveText
    };
}

function getTabButtonStyle(isActive, disabled, uiColors) {
    return {
        border: `1px solid ${isActive ? uiColors.tabActiveBorder : "transparent"}`,
        background: isActive ? uiColors.tabActiveBackground : "transparent",
        color: isActive ? uiColors.tabActiveText : uiColors.textMuted,
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

function createRequestState() {
    return {
        controller: typeof AbortController !== "undefined" ? new AbortController() : null,
        cancelled: false,
        timedOut: false
    };
}

function formBody(fields) {
    return Object.entries(fields)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join("&");
}

async function fetchResponseWithTimeout(url, options, request, timeoutMs = REQUEST_TIMEOUT_MS) {
    let timerId;
    const timeoutPromise = new Promise((resolve, reject) => {
        timerId = window.setTimeout(() => {
            request.timedOut = true;
            if (request.controller) request.controller.abort();
            const error = new Error("Request timed out");
            error.name = "RequestTimeoutError";
            reject(error);
        }, timeoutMs);
    });

    const requestOptions = request.controller
        ? { ...options, signal: request.controller.signal }
        : options;

    try {
        return await Promise.race([
            (async () => {
                const response = await fetch(url, requestOptions);
                const data = await parseResponseBody(response);
                return { response, data };
            })(),
            timeoutPromise
        ]);
    } finally {
        window.clearTimeout(timerId);
    }
}

export default function AuthPage({ backendUrl, onLoginSuccess, onClose }) {
    const [tab, setTab] = useState("login"); // "login" | "register"
    const [registerStep, setRegisterStep] = useState("qrcode"); // "qrcode" | "form"
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [qq, setQq] = useState("");
    const [inviteCode, setInviteCode] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const [slowConnection, setSlowConnection] = useState(false);
    const activeRequestRef = useRef(null);
    const slowTimerRef = useRef(null);
    const closingRef = useRef(false);

    const clearSlowTimer = useCallback(() => {
        if (slowTimerRef.current) {
            window.clearTimeout(slowTimerRef.current);
            slowTimerRef.current = null;
        }
    }, []);

    const startRequest = useCallback(() => {
        const request = createRequestState();
        activeRequestRef.current = request;
        closingRef.current = false;
        setLoading(true);
        setSlowConnection(false);
        clearSlowTimer();
        slowTimerRef.current = window.setTimeout(() => setSlowConnection(true), 4000);
        return request;
    }, [clearSlowTimer]);

    const finishRequest = useCallback((request) => {
        if (activeRequestRef.current !== request) return;
        activeRequestRef.current = null;
        clearSlowTimer();
        setLoading(false);
        setSlowConnection(false);
    }, [clearSlowTimer]);

    const cancelRequest = useCallback((showCancelledMessage = true) => {
        const request = activeRequestRef.current;
        activeRequestRef.current = null;
        if (request) {
            request.cancelled = true;
            if (request.controller) request.controller.abort();
        }
        clearSlowTimer();
        setLoading(false);
        setSlowConnection(false);
        if (showCancelledMessage) setMessage("请求已取消，可以重新提交");
    }, [clearSlowTimer]);

    const resetForm = useCallback(() => {
        setUsername("");
        setPassword("");
        setConfirmPassword("");
        setShowPassword(false);
        setQq("");
        setInviteCode("");
        setMessage("");
        setLoading(false);
        setSlowConnection(false);
        setRegisterStep("qrcode");
    }, []);

    const handleClose = useCallback(() => {
        closingRef.current = true;
        cancelRequest(false);
        resetForm();
        onClose && onClose();
    }, [cancelRequest, onClose, resetForm]);

    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                handleClose();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            closingRef.current = true;
            const request = activeRequestRef.current;
            activeRequestRef.current = null;
            if (request) {
                request.cancelled = true;
                if (request.controller) request.controller.abort();
            }
            clearSlowTimer();
        };
    }, [clearSlowTimer, handleClose]);

    const switchTab = (nextTab) => {
        if (loading) return;
        setTab(nextTab);
        setRegisterStep("qrcode");
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

    const handleConfirmPasswordChange = (value) => {
        if (message) setMessage("");
        setConfirmPassword(value);
    };

    const togglePasswordVisibility = () => {
        setShowPassword((prev) => !prev);
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
        const request = startRequest();
        try {
            const { response: res, data } = await fetchResponseWithTimeout(`${backendUrl}/users/login`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
                body: formBody({ username: normalizedUsername, password })
            }, request);
            if (request.cancelled || activeRequestRef.current !== request) return;
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
            if (closingRef.current) return;
            if (request.cancelled) return;
            if (request.timedOut || (err && err.name === "RequestTimeoutError")) {
                setMessage("请求超时，请检查网络后重试");
            } else if (err && err.name === "AbortError") {
                setMessage("请求已取消，可以重新提交");
            } else {
                setMessage(`网络错误：${err && err.message ? err.message : "请稍后重试"}`);
            }
        } finally {
            finishRequest(request);
        }
    };

    const handleRegister = async (e) => {
        e && e.preventDefault();
        if (loading) return;
        setMessage("");
        const normalizedUsername = username.trim();
        const normalizedQq = qq.trim();
        const normalizedInviteCode = inviteCode.trim();
        if (!normalizedUsername || !password || !confirmPassword || !normalizedInviteCode || !normalizedQq) return setMessage("请填写用户名、密码、QQ号和邀请码");
        if (normalizedUsername.length > MAX_USERNAME_LENGTH) return setMessage(`用户名不能超过 ${MAX_USERNAME_LENGTH} 个字符`);
        if (password.length > MAX_PASSWORD_LENGTH) return setMessage(`密码不能超过 ${MAX_PASSWORD_LENGTH} 个字符`);
        if (password !== confirmPassword) return setMessage("两次输入的密码不一致");
        if (normalizedQq.length > 20) return setMessage(`QQ号不能超过 20 个字符`);
        if (normalizedInviteCode.length > MAX_INVITE_CODE_LENGTH) return setMessage(`邀请码不能超过 ${MAX_INVITE_CODE_LENGTH} 个字符`);
        const request = startRequest();
        try {
            const { response: res, data } = await fetchResponseWithTimeout(`${backendUrl}/users/register`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
                body: formBody({ username: normalizedUsername, password, qq: normalizedQq, inviteCode: normalizedInviteCode })
            }, request);
            if (request.cancelled || activeRequestRef.current !== request) return;
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
            if (closingRef.current) return;
            if (request.cancelled) return;
            if (request.timedOut || (err && err.name === "RequestTimeoutError")) {
                setMessage("请求超时，请检查网络后重试");
            } else if (err && err.name === "AbortError") {
                setMessage("请求已取消，可以重新提交");
            } else {
                setMessage(`网络错误：${err && err.message ? err.message : "请稍后重试"}`);
            }
        } finally {
            finishRequest(request);
        }
    };
    const dark = useDarkMode();
    const themeColor = getThemeColor();
    const uiColors = { ...getStaticColors(dark), ...getThemeUIColors(themeColor) };

    const isSuccessMessage = message.includes("成功");
    const modeText = tab === "login" ? "登录已有账号" : "注册新账号";
    const modeHint = tab === "login"
        ? "输入账号密码后登录"
        : registerStep === "qrcode"
            ? "请先扫描二维码加入QQ群获取邀请码"
            : "填写邀请码后创建账号并自动登录";
    const submitButtonText = tab === "login"
        ? (loading ? "登录中..." : "登录账号")
        : (loading ? "注册中..." : "注册并登录");
    const inputStyle = {
        width: "100%",
        boxSizing: "border-box",
        padding: "9px 10px",
        borderRadius: 8,
        border: `1px solid ${uiColors.border}`,
        background: uiColors.inputBackground
    };
    const labelStyle = {
        display: "block",
        marginBottom: 6,
        fontSize: 13,
        color: uiColors.textMuted
    };

    return (
        <ScrollableView
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
                width: "min(420px, calc(100vw - 32px))",
                boxSizing: "border-box",
                maxHeight: "calc(var(--app-height, 100vh) - 32px)",
                overflowY: "auto",
                background: uiColors.panelBackground,
                padding: 18,
                borderRadius: 8,
                boxShadow: "0 6px 24px rgba(0,0,0,0.25)"
            }}
        >
            <h2 id="auth-modal-title" style={{ margin: "0 0 10px 0", fontSize: 20, color: uiColors.textStrong }}>账号登录</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <div style={{ display: "inline-flex", gap: 4, padding: 4, borderRadius: 10, border: `1px solid ${uiColors.border}`, background: uiColors.tabGroupBackground }}>
                    <Button
                        type="button"
                        aria-pressed={tab === "login"}
                        disabled={loading}
                        onClick={() => switchTab("login")}
                        style={getTabButtonStyle(tab === "login", loading, uiColors)}
                    >
                        登录
                    </Button>
                    <Button
                        type="button"
                        aria-pressed={tab === "register"}
                        disabled={loading}
                        onClick={() => switchTab("register")}
                        style={getTabButtonStyle(tab === "register", loading, uiColors)}
                    >
                        注册
                    </Button>
                </div>
                <div style={{ marginLeft: "auto" }}>
                    <Button
                        type="button"
                        onClick={handleClose}
                        style={{ border: `1px solid ${uiColors.border}`, borderRadius: 8, padding: "7px 10px" }}
                    >
                        {loading ? "取消并关闭" : "关闭"}
                    </Button>
                </div>
            </div>

            <p style={{ margin: "0 0 12px 0", fontSize: 13, color: uiColors.textMuted }}>
                当前操作：<strong style={{ color: uiColors.textStrong }}>{modeText}</strong>。{modeHint}
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
                    <Button
                        type="submit"
                        disabled={loading}
                        full
                        style={{
                            marginTop: 14,
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: `1px solid ${uiColors.primaryActionBorder}`,
                            fontWeight: 700,
                            letterSpacing: "0.02em"
                        }}
                    >
                        {submitButtonText}
                    </Button>
                </form>
            ) : registerStep === "qrcode" ? (
                <div style={{ textAlign: 'center' }}>
                    <p style={{ margin: "0 0 12px 0", fontSize: 14, color: uiColors.textStrong, lineHeight: 1.6 }}>
                        请使用 QQ 扫描下方二维码加入群聊，<br />在群内获取邀请码后再继续注册。
                    </p>
                    <img
                        src={qrcodeImg}
                        alt="QQ群二维码"
                        style={{
                            width: 200,
                            height: 200,
                            display: 'block',
                            margin: '0 auto 16px auto',
                            border: `1px solid ${uiColors.border}`,
                            borderRadius: 8
                        }}
                    />
                    <p style={{ margin: "0 0 12px 0", fontSize: 14, color: uiColors.textStrong, lineHeight: 1.6 }}>
                        东方饭联地图反馈群：994716945
                    </p>
                    <Button
                        type="button"
                        full
                        onClick={() => setRegisterStep("form")}
                        style={{
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: `1px solid ${uiColors.primaryActionBorder}`,
                            fontWeight: 700,
                            letterSpacing: "0.02em"
                        }}
                    >
                        已获取邀请码，继续注册
                    </Button>
                </div>
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
                        <div style={{ position: 'relative' }}>
                            <TextInput
                                id="auth-password-register"
                                type={showPassword ? "text" : "password"}
                                placeholder="设置一个登录密码"
                                value={password}
                                autoComplete="new-password"
                                maxLength={MAX_PASSWORD_LENGTH}
                                onChange={(e) => handlePasswordChange(e.target.value)}
                                style={{ width: '100%', paddingRight: 40 }}
                            />
                            <button
                                type="button"
                                onClick={togglePasswordVisibility}
                                tabIndex={-1}
                                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                                style={{
                                    position: 'absolute',
                                    right: 8,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    padding: 4,
                                    lineHeight: 0,
                                    color: uiColors.textMuted,
                                    fontSize: 20
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                                    {showPassword ? "visibility_off" : "visibility"}
                                </span>
                            </button>
                        </div>
                    </div>
                    <div style={{ marginTop: 10 }}>
                        <label htmlFor="auth-confirm-password-register" style={labelStyle}>确认密码</label>
                        <div style={{ position: 'relative' }}>
                            <TextInput
                                id="auth-confirm-password-register"
                                type={showPassword ? "text" : "password"}
                                placeholder="请再次输入密码"
                                value={confirmPassword}
                                autoComplete="new-password"
                                maxLength={MAX_PASSWORD_LENGTH}
                                onChange={(e) => handleConfirmPasswordChange(e.target.value)}
                                style={{ width: '100%', paddingRight: 40 }}
                            />
                            <button
                                type="button"
                                onClick={togglePasswordVisibility}
                                tabIndex={-1}
                                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                                style={{
                                    position: 'absolute',
                                    right: 8,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    padding: 4,
                                    lineHeight: 0,
                                    color: uiColors.textMuted,
                                    fontSize: 20
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                                    {showPassword ? "visibility_off" : "visibility"}
                                </span>
                            </button>
                        </div>
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
                    </div>
                    <Button
                        type="submit"
                        disabled={loading}
                        full
                        style={{
                            marginTop: 14,
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: `1px solid ${uiColors.primaryActionBorder}`,
                            fontWeight: 700,
                            letterSpacing: "0.02em"
                        }}
                    >
                        {submitButtonText}
                    </Button>
                </form>
            )}

            {slowConnection && (
                <div
                    role="status"
                    aria-live="polite"
                    style={{
                        marginTop: 12,
                        padding: "10px 11px",
                        borderRadius: 8,
                        border: "1px solid var(--color-warning)",
                        color: "var(--color-text-primary)",
                        background: "color-mix(in srgb, var(--color-warning) 12%, var(--color-bg-surface))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        fontSize: 13
                    }}
                >
                    <span>连接较慢，你可以取消后重试。</span>
                    <Button type="button" onClick={() => cancelRequest(true)} style={{ flexShrink: 0, padding: "6px 9px" }}>
                        取消请求
                    </Button>
                </div>
            )}

            {message && (
                <p
                    role="status"
                    aria-live="polite"
                    style={{
                        marginTop: 12,
                        padding: "9px 11px",
                        borderRadius: 8,
                        border: `1px solid ${isSuccessMessage ? 'var(--color-success)' : 'var(--color-danger)'}`,
                        color: isSuccessMessage ? uiColors.successText : uiColors.errorText,
                        background: isSuccessMessage ? uiColors.successBackground : uiColors.errorBackground,
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
