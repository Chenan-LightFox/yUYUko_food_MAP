import React, { useEffect, useState, useRef } from "react";
import Button from "../components/Button";
import TextInput from "../components/TextInput";
import { useTips } from "../components/Tips";
import { useConfirm } from "../components/Confirm";
import { useAuth } from "../AuthContext";
import useDarkMode from "../utils/useDarkMode";

function resolveBackendUrl() {
    if (typeof window === "undefined") return "http://localhost:2053";
    const { protocol, hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
        return "http://localhost:2053";
    }
    return `${protocol}//${hostname}:2053`;
}

function getLatestStoredToken() {
    try { return localStorage.getItem('token'); } catch (e) { return null; }
}

function randomString(len) {
    // Secure random alphanumeric string
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
        const arr = new Uint8Array(len);
        window.crypto.getRandomValues(arr);
        return Array.from(arr).map(v => chars[v % chars.length]).join('');
    }
    let s = '';
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}

export default function AdminInvitecode({ backendUrl = null }) {
    const base = backendUrl || resolveBackendUrl();
    const { token, user, onRequireAuth } = useAuth();
    const [invites, setInvites] = useState([]);
    const [loading, setLoading] = useState(false);
    const showTip = useTips();
    const confirm = useConfirm();
    const [creating, setCreating] = useState(false);
    const [maxUses, setMaxUses] = useState(1);
    const [lastCreatedCode, setLastCreatedCode] = useState("");
    const [processing, setProcessing] = useState({});
    const fetchIdRef = useRef(0);
    const dark = useDarkMode();

    const canManage = user && user.admin_level;

    useEffect(() => {
        if (!canManage) return;
        fetchInvites();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canManage, token]);

    const handleUnauthorized = () => {
        setInvites([]);
        const authMsg = '未登录或授权已失效，请重新登录';
        showTip(authMsg);
        if (onRequireAuth) onRequireAuth();
    };

    const fetchInvites = async () => {
        setLoading(true);
        const thisFetchId = ++fetchIdRef.current;
        const authToken = token;
        try {
            const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
            let res = await fetch(`${base}/admin/invites`, { headers });

            if (thisFetchId !== fetchIdRef.current) return;

            if (res.status === 401) {
                const latest = token || getLatestStoredToken();
                if (latest && latest !== authToken) {
                    const retryHeaders = { Authorization: `Bearer ${latest}` };
                    res = await fetch(`${base}/admin/invites`, { headers: retryHeaders });
                    if (thisFetchId !== fetchIdRef.current) return;
                }
            }

            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                if (res.status === 401) {
                    handleUnauthorized();
                    return;
                }
                if (res.status === 403) {
                    showTip('权限不足，无法获取邀请码列表');
                    return;
                }
                throw new Error(`服务器错误 ${res.status} ${txt}`);
            }

            const data = await res.json().catch(() => []);
            setInvites(data || []);
        } catch (e) {
            console.error('加载邀请码失败', e);
            if (e && String(e.message || '').toLowerCase().includes('未登录')) {
                // handled
            } else {
                showTip('加载失败: ' + (e.message || e));
            }
        } finally {
            setLoading(false);
        }
    };

    const createInvite = async (codeArg = null) => {
        // generate code if not provided
        const code = codeArg || randomString(24 + Math.floor(Math.random() * 9)); // 24-32
        setCreating(true);
        const thisFetchId = ++fetchIdRef.current;
        const authToken = token;
        try {
            const headers = {
                'Content-Type': 'application/json',
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
            };
            let res = await fetch(`${base}/admin/invites`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ code, max_uses: Number(maxUses) || 1 })
            });

            if (thisFetchId !== fetchIdRef.current) return;

            if (res.status === 401) {
                const latest = token || getLatestStoredToken();
                if (latest && latest !== authToken) {
                    const retryHeaders = {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${latest}`
                    };
                    res = await fetch(`${base}/admin/invites`, { method: 'POST', headers: retryHeaders, body: JSON.stringify({ code, max_uses: Number(maxUses) || 1 }) });
                    if (thisFetchId !== fetchIdRef.current) return;
                }
            }

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 401) {
                    handleUnauthorized();
                    return;
                }
                throw new Error(data.error || `创建失败 ${res.status}`);
            }

            showTip('创建成功，请复制以下邀请码文本（只会显示一次）');
            setLastCreatedCode(code);
            setMaxUses(1);
            await fetchInvites();
        } catch (e) {
            console.error('createInvite failed', e);
            showTip('创建失败：' + (e.message || e));
            setLastCreatedCode("");
        } finally {
            setCreating(false);
        }
    };

    const deleteInvite = async (id) => {
        if (!(await confirm('确认删除此邀请码？'))) return;
        setProcessing(p => ({ ...p, [id]: true }));
        const thisFetchId = ++fetchIdRef.current;
        const authToken = token;
        try {
            const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
            let res = await fetch(`${base}/admin/invites/${id}`, { method: 'DELETE', headers });

            if (thisFetchId !== fetchIdRef.current) return;

            if (res.status === 401) {
                const latest = token || getLatestStoredToken();
                if (latest && latest !== authToken) {
                    const retryHeaders = { Authorization: `Bearer ${latest}` };
                    res = await fetch(`${base}/admin/invites/${id}`, { method: 'DELETE', headers: retryHeaders });
                    if (thisFetchId !== fetchIdRef.current) return;
                }
            }

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 401) {
                    handleUnauthorized();
                    return;
                }
                throw new Error(data.error || `删除失败 ${res.status}`);
            }

            showTip('已删除');
            setInvites(list => list.filter(i => i.id !== id));
        } catch (e) {
            console.error('deleteInvite failed', e);
            showTip('删除失败：' + (e.message || e));
        } finally {
            setProcessing(p => ({ ...p, [id]: false }));
        }
    };

    const copyToClipboard = (text) => {
        try {
            if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            showTip('已复制到剪贴板');
        } catch (e) {
            console.warn('copy failed', e);
            showTip('复制失败');
        }
    };

    if (!canManage) return <div style={{ color: '#b00020' }}>您的账号无权访问此面板。</div>;

    return (
        <div style={{ marginTop: 12 }}>
            <h3>邀请码管理</h3>
            <div style={{ marginBottom: 8 }}>
                <Button themeAware onClick={fetchInvites} disabled={loading}>刷新</Button>
            </div>


            <div style={{ marginBottom: 12, padding: 8, border: dark ? '1px solid #1f2937' : '1px solid #eee', borderRadius: 6, background: dark ? '#0b1220' : undefined }}>
                <div style={{ marginBottom: 8 }}><strong>创建新邀请码</strong></div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <label style={{ marginRight: 8, color: dark ? '#9ca3af' : 'inherit' }}>可用次数：</label>
                    <TextInput type="number" value={maxUses} onChange={e => setMaxUses(Number(e.target.value))} min={1} style={{ width: 120, marginRight: 8 }} />
                    <Button themeAware onClick={() => createInvite()} disabled={creating}>生成并创建</Button>
                </div>
                {lastCreatedCode && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center' }}>
                        <TextInput readOnly value={lastCreatedCode} style={{ flex: 1, marginRight: 8 }} />
                        <Button themeAware onClick={() => copyToClipboard(lastCreatedCode)}>复制</Button>
                    </div>
                )}
            </div>

            {loading ? (
                <div>加载中…</div>
            ) : (
                <div>
                    {invites.length === 0 ? (
                        <div>当前没有邀请码记录。</div>
                    ) : (
                        <table cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', border: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #ddd' }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left', padding: 8 }}>ID</th>
                                    <th style={{ textAlign: 'left', padding: 8 }}>Code (hashed)</th>
                                    <th style={{ textAlign: 'left', padding: 8 }}>Max Uses</th>
                                    <th style={{ textAlign: 'left', padding: 8 }}>Current Uses</th>
                                    <th style={{ textAlign: 'left', padding: 8 }}>创建时间</th>
                                    <th style={{ textAlign: 'left', padding: 8 }}>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invites.map((inv, idx) => (
                                    <tr key={inv.id} style={{ background: idx % 2 === 0 ? (dark ? 'rgba(255,255,255,0.02)' : '#fafafa') : undefined }}>
                                        <td>{inv.id}</td>
                                        <td style={{ maxWidth: 320, wordBreak: 'break-all' }}>{inv.code || inv.hashed || "-"}</td>
                                        <td>{inv.max_uses != null ? inv.max_uses : (inv.maxUses || "-")}</td>
                                        <td>{inv.current_uses != null ? inv.current_uses : (inv.currentUses || 0)}</td>
                                        <td>{inv.created_time || inv.createdTime || "-"}</td>
                                        <td>
                                            <Button themeAware onClick={() => deleteInvite(inv.id)} disabled={processing[inv.id]} style={{ background: '#e02424', color: '#fff' }}>删除</Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
}
