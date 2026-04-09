import React, { useEffect, useState, useRef } from "react";
import Button from "../components/Button";
import { useAuth } from "../AuthContext";
import useDarkMode from "../utils/useDarkMode";
import { useTips } from "../components/Tips";
import { useConfirm } from "../components/Confirm";
import defaultAvatar from '../img/default.png';

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

export default function AdminGeneralUsers({ backendUrl = null }) {
    const base = backendUrl || resolveBackendUrl();
    const { token, user, onRequireAuth } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const showTip = useTips();
    const confirm = useConfirm();
    const [processing, setProcessing] = useState({});
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
        showTip(authMsg);
        if (onRequireAuth) onRequireAuth();
    };

    const fetchUsers = async () => {
        setLoading(true);
        const thisFetchId = ++fetchIdRef.current;
        const authToken = token;
        try {
            const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
            let res = await fetch(`${base}/admin/general-users`, { headers });

            if (thisFetchId !== fetchIdRef.current) return;

            if (res.status === 401) {
                const latest = token || getLatestStoredToken();
                if (latest && latest !== authToken) {
                    const retryHeaders = { Authorization: `Bearer ${latest}` };
                    res = await fetch(`${base}/admin/general-users`, { headers: retryHeaders });
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
                    showTip('权限不足，无法获取普通用户列表');
                    return;
                }
                throw new Error(`服务器错误 ${res.status} ${txt}`);
            }

            const data = await res.json().catch(() => []);
            setUsers(data || []);
        } catch (e) {
            console.error('加载普通用户失败', e);
            if (e && String(e.message || '').toLowerCase().includes('未登录')) {
                // handled
            } else {
                showTip('加载失败: ' + (e.message || e));
            }
        } finally {
            setLoading(false);
        }
    };

    const deleteUser = async (id) => {
        if (!(await confirm('确认删除此用户？'))) return;
        setProcessing(p => ({ ...p, [id]: true }));
        const thisFetchId = ++fetchIdRef.current;
        const authToken = token;
        try {
            const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
            let res = await fetch(`${base}/admin/general-users/${id}`, { method: 'DELETE', headers });

            if (thisFetchId !== fetchIdRef.current) return;

            if (res.status === 401) {
                const latest = token || getLatestStoredToken();
                if (latest && latest !== authToken) {
                    const retryHeaders = { Authorization: `Bearer ${latest}` };
                    res = await fetch(`${base}/admin/general-users/${id}`, { method: 'DELETE', headers: retryHeaders });
                    if (thisFetchId !== fetchIdRef.current) return;
                }
            }

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 401) {
                    handleUnauthorized();
                    return;
                }
                showTip(data.error || `删除失败 ${res.status}`);
                return;
            }

            showTip('用户已删除');
            setUsers(list => list.filter(u => u.id !== id));
        } catch (e) {
            console.error('deleteUser failed', e);
            showTip('删除失败：' + (e.message || e));
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
        <div style={{ marginTop: 12 }}>
            <h3>普通用户管理</h3>
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


            {loading ? (
                <div>加载中…</div>
            ) : (
                <div>
                    {filteredUsers.length === 0 ? (
                        <div>当前没有匹配的普通用户记录。</div>
                    ) : (
                        <table cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', border: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #ddd' }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left', padding: 8 }}>ID</th>
                                    <th style={{ textAlign: 'left', padding: 8 }}>用户名</th>
                                    <th style={{ textAlign: 'left', padding: 8 }}>QQ号</th>
                                    <th style={{ textAlign: 'left', padding: 8 }}>头像</th>
                                    <th style={{ textAlign: 'left', padding: 8 }}>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.map((u, idx) => (
                                    <tr key={u.id} style={{ background: idx % 2 === 0 ? (dark ? 'rgba(255,255,255,0.02)' : '#fafafa') : undefined }}>
                                        <td>{u.id}</td>
                                        <td>{u.username}</td>
                                        <td>{u.qq || '-'}</td>
                                        <td>
                                            {u.has_avatar ? (
                                                <img src={`${backendUrl}/users/${u.id}/avatar?t=${Date.now()}`} alt="avatar" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                                            ) : (
                                                <img src={defaultAvatar} alt="default avatar" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                                            )}
                                        </td>
                                        <td>
                                            <Button themeAware onClick={() => deleteUser(u.id)} disabled={processing[u.id]} style={{ background: '#e02424', color: '#ffffff' }}>删除</Button>
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
