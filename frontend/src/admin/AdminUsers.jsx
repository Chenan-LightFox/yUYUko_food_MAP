import React, { useEffect, useState, useRef } from "react";
import Button from "../components/Button";
import { useAuth } from "../AuthContext";
import AdminBanModal from "./AdminBanModal";
import SelectInput from '../components/SelectInput';
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

export default function AdminUsers({ backendUrl = null }) {
    const base = backendUrl || resolveBackendUrl();
    const { token, user, onRequireAuth } = useAuth();
    const [users, setUsers] = useState([]);
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState({});
    const [banModalOpen, setBanModalOpen] = useState(false);
    const [banTarget, setBanTarget] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const fetchIdRef = useRef(0);
    const dark = useDarkMode();

    const canManage = user && user.admin_level;

    useEffect(() => {
        if (!canManage) return;
        fetchUsers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canManage, token]);

    const handleUnauthorized = () => {
        setUsers([]);
        const authMsg = '未登录或授权已失效，请重新登录';
        setMessage(authMsg);
        if (onRequireAuth) onRequireAuth();
    };

    const fetchUsers = async () => {
        setLoading(true);
        setMessage("");
        const thisFetchId = ++fetchIdRef.current;
        const authToken = token;
        try {
            const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
            let res = await fetch(`${base}/admin/users`, { headers });

            if (thisFetchId !== fetchIdRef.current) return; // stale

            if (res.status === 401) {
                const latest = token || getLatestStoredToken();
                if (latest && latest !== authToken) {
                    const retryHeaders = { Authorization: `Bearer ${latest}` };
                    res = await fetch(`${base}/admin/users`, { headers: retryHeaders });
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
                    setMessage('权限不足，无法获取用户列表');
                    return;
                }
                throw new Error(`服务器错误 ${res.status} ${txt}`);
            }

            const data = await res.json().catch(() => []);
            setUsers(data || []);
        } catch (e) {
            console.error('加载用户失败', e);
            if (e && String(e.message || '').toLowerCase().includes('未登录')) {
                // handled
            } else {
                setMessage('加载失败: ' + (e.message || e));
            }
        } finally {
            setLoading(false);
        }
    };

    const changeLevel = async (userId, newLevel) => {
        setMessage("");
        const thisFetchId = ++fetchIdRef.current;
        const authToken = token;
        try {
            const headers = {
                'Content-Type': 'application/json',
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
            };
            let res = await fetch(`${base}/admin/users/set-level`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ userId, admin_level: newLevel })
            });

            if (thisFetchId !== fetchIdRef.current) return; // stale

            if (res.status === 401) {
                const latest = token || getLatestStoredToken();
                if (latest && latest !== authToken) {
                    const retryHeaders = {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${latest}`
                    };
                    res = await fetch(`${base}/admin/users/set-level`, {
                        method: 'POST',
                        headers: retryHeaders,
                        body: JSON.stringify({ userId, admin_level: newLevel })
                    });
                    if (thisFetchId !== fetchIdRef.current) return;
                }
            }

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 401) {
                    handleUnauthorized();
                    return;
                }
                setMessage(data.error || `更新失败 ${res.status}`);
                return;
            }

            setMessage('权限已更新');
            setUsers(list => list.map(u => u.id === userId ? { ...u, admin_level: newLevel || null } : u));
        } catch (e) {
            console.error('changeLevel failed', e);
            setMessage('失败：' + (e.message || e));
        }
    };

    const deleteUser = async (id) => {
        if (!window.confirm("确认删除此用户？")) return;
        setMessage("");
        const thisFetchId = ++fetchIdRef.current;
        const authToken = token;
        try {
            const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
            let res = await fetch(`${base}/admin/users/${id}`, {
                method: 'DELETE',
                headers
            });

            if (thisFetchId !== fetchIdRef.current) return;

            if (res.status === 401) {
                const latest = token || getLatestStoredToken();
                if (latest && latest !== authToken) {
                    const retryHeaders = { Authorization: `Bearer ${latest}` };
                    res = await fetch(`${base}/admin/users/${id}`, { method: 'DELETE', headers: retryHeaders });
                    if (thisFetchId !== fetchIdRef.current) return;
                }
            }

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 401) {
                    handleUnauthorized();
                    return;
                }
                setMessage(data.error || `删除失败 ${res.status}`);
                return;
            }

            setMessage('用户已删除');
            setUsers(list => list.filter(u => u.id !== id));
        } catch (e) {
            console.error('deleteUser failed', e);
            setMessage('失败：' + (e.message || e));
        }
    };

    const onBanClick = (u) => {
        setBanTarget(u);
        setBanModalOpen(true);
    };

    const handleBanConfirm = async ({ reason, durationDays }) => {
        if (!banTarget) return;
        const id = banTarget.id;
        setProcessing(p => ({ ...p, [id]: true }));
        setMessage("");
        try {
            const headers = {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            };
            // durationDays: null -> no expiry (should be treated as permanent by backend)
            const body = { userId: id, reason };
            if (durationDays !== null) body.durationDays = durationDays;
            const res = await fetch(`${base}/admin/users/ban`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 401) {
                    handleUnauthorized();
                    return;
                }
                setMessage(data.error || `封禁失败 ${res.status}`);
                return;
            }
            setUsers(list => list.map(x => x.id === id ? { ...x, is_banned: 1, ban_reason: reason || null, ban_expires: data && data.ban_expires ? data.ban_expires : null } : x));
            setMessage('用户已封禁');
        } catch (e) {
            console.error('banUser failed', e);
            setMessage('封禁失败：' + (e.message || e));
        } finally {
            setProcessing(p => ({ ...p, [banTarget.id]: false }));
            setBanModalOpen(false);
            setBanTarget(null);
        }
    };

    const unbanUser = async (id) => {
        setMessage("");
        setProcessing(p => ({ ...p, [id]: true }));
        try {
            const headers = {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            };
            const res = await fetch(`${base}/admin/users/unban`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ userId: id })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 401) {
                    handleUnauthorized();
                    return;
                }
                setMessage(data.error || `解除封禁失败 ${res.status}`);
                return;
            }
            setMessage('已解除封禁');
            setUsers(list => list.map(u => u.id === id ? { ...u, is_banned: 0, ban_reason: null, ban_expires: null } : u));
        } catch (e) {
            console.error('unbanUser failed', e);
            setMessage('解除封禁失败：' + (e.message || e));
        } finally {
            setProcessing(p => ({ ...p, [id]: false }));
        }
    };

    if (!canManage) return <div style={{ color: '#b00020' }}>您的账号无权访问此面板。</div>;

    const filteredUsers = users.filter(u => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return String(u.id).includes(q) ||
            (u.username && u.username.toLowerCase().includes(q)) ||
            (u.qq && String(u.qq).toLowerCase().includes(q));
    });

    return (
        <div>
            <h2>用户管理</h2>
            <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                    <input
                        type="text"
                        placeholder="搜索用户名称、id、qq号"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{ padding: '6px 12px', width: '100%', boxSizing: 'border-box', border: dark ? '1px solid #334155' : '1px solid #d1d5db', background: dark ? '#07101a' : '#fff', color: dark ? '#e5e7eb' : 'inherit', borderRadius: 6 }}
                    />
                </div>
                <Button themeAware onClick={fetchUsers} disabled={loading}>刷新</Button>
            </div>
            {message && <div style={{ color: "red" }}>{message}</div>}
            {loading ? (
                <div>加载中…</div>
            ) : (
                <table cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', border: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #ddd' }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left', padding: 8 }}>ID</th>
                            <th style={{ textAlign: 'left', padding: 8 }}>用户名</th>
                            <th style={{ textAlign: 'left', padding: 8 }}>QQ号</th>
                            <th style={{ textAlign: 'left', padding: 8 }}>头像</th>
                            <th style={{ textAlign: 'left', padding: 8 }}>等级</th>
                            <th style={{ textAlign: 'left', padding: 8 }}>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredUsers.map((u, idx) => {
                            const isSelf = user && u.id === user.id;
                            const isSuper = u.admin_level === "YUYUKO";
                            return (
                                <tr key={u.id} style={{ background: idx % 2 === 0 ? (dark ? 'rgba(255,255,255,0.02)' : '#fafafa') : undefined }}>
                                    <td>{u.id}</td>
                                    <td>{u.username}</td>
                                    <td>{u.qq || "-"}</td>
                                    <td>{u.avatar || "-"}</td>
                                    <td>
                                        <SelectInput value={u.admin_level || ""}
                                            onChange={e => changeLevel(u.id, e.target.value)}
                                            disabled={isSelf || (isSuper && !isSelf)}
                                            style={{ padding: '6px 8px', borderRadius: 4 }}>
                                            <option value="YUYUKO">YUYUKO</option>
                                            <option value="YOUMU">YOUMU</option>
                                            <option value="KOMACHI">KOMACHI</option>
                                            <option value="">普通用户</option>
                                        </SelectInput>
                                    </td>
                                    <td>
                                        {u.is_banned ? (
                                            <Button themeAware onClick={() => unbanUser(u.id)} disabled={isSelf || processing[u.id]} style={{ marginRight: 8 }}>解除封禁</Button>
                                        ) : (
                                            !isSuper && (
                                                <Button themeAware onClick={() => onBanClick(u)} disabled={isSelf || processing[u.id]} style={{ marginRight: 8, background: '#a04400', color: '#fff' }}>封禁</Button>
                                            )
                                        )}

                                        {isSuper ? null : (
                                            <Button themeAware onClick={() => deleteUser(u.id)} disabled={isSelf || processing[u.id]} style={{ background: '#e02424', color: '#ffffff' }}>删除</Button>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            )}
            <AdminBanModal open={banModalOpen} onClose={() => { setBanModalOpen(false); setBanTarget(null); }} onConfirm={handleBanConfirm} targetUser={banTarget} />
        </div>
    );
}
