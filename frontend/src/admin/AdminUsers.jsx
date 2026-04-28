import React, { useEffect, useState, useRef } from "react";
import Button from "../components/Button";
import { useAuth } from "../AuthContext";
import AdminBanModal from "./AdminBanModal";
import SelectInput from '../components/SelectInput';
import useDarkMode from "../utils/useDarkMode";
import ResponsiveTable from "../components/ResponsiveTable";
import TextInput from "../components/TextInput";
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

export default function AdminUsers({ backendUrl = null }) {
    const base = backendUrl || resolveBackendUrl();
    const { token, user, onRequireAuth } = useAuth();
    const [users, setUsers] = useState([]);
    const showTip = useTips();
    const confirm = useConfirm();
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState({});
    const [banModalOpen, setBanModalOpen] = useState(false);
    const [banTarget, setBanTarget] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
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
                    showTip('权限不足，无法获取用户列表');
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
                showTip('加载失败: ' + (e.message || e));
            }
        } finally {
            setLoading(false);
        }
    };

    const changeLevel = async (userId, newLevel) => {
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
                showTip(data.error || `更新失败 ${res.status}`);
                return;
            }

            showTip('权限已更新');
            setUsers(list => list.map(u => u.id === userId ? { ...u, admin_level: newLevel || null } : u));
        } catch (e) {
            console.error('changeLevel failed', e);
            showTip('失败：' + (e.message || e));
        }
    };

    const deleteUser = async (id) => {
        if (!(await confirm("确认删除此用户？"))) return;
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
                showTip(data.error || `删除失败 ${res.status}`);
                return;
            }

            showTip('用户已删除');
            setUsers(list => list.filter(u => u.id !== id));
        } catch (e) {
            console.error('deleteUser failed', e);
            showTip('失败：' + (e.message || e));
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
                showTip(data.error || `封禁失败 ${res.status}`);
                return;
            }
            setUsers(list => list.map(x => x.id === id ? { ...x, is_banned: 1, ban_reason: reason || null, ban_expires: data && data.ban_expires ? data.ban_expires : null } : x));
            showTip('用户已封禁');
        } catch (e) {
            console.error('banUser failed', e);
            showTip('封禁失败：' + (e.message || e));
        } finally {
            setProcessing(p => ({ ...p, [banTarget.id]: false }));
            setBanModalOpen(false);
            setBanTarget(null);
        }
    };

    const unbanUser = async (id) => {
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
                showTip(data.error || `解除封禁失败 ${res.status}`);
                return;
            }
            showTip('已解除封禁');
            setUsers(list => list.map(u => u.id === id ? { ...u, is_banned: 0, ban_reason: null, ban_expires: null } : u));
        } catch (e) {
            console.error('unbanUser failed', e);
            showTip('解除封禁失败：' + (e.message || e));
        } finally {
            setProcessing(p => ({ ...p, [id]: false }));
        }
    };

    if (!canManage) return <div style={{ color: '#b00020' }}>您的账号无权访问此面板。</div>;

    const PAGE_SIZE = 10;

    const filtered = users.filter(u => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return String(u.id).includes(q) ||
            (u.username && u.username.toLowerCase().includes(q)) ||
            (u.qq && String(u.qq).toLowerCase().includes(q));
    });

    const totalPages = Math.max(1, Math.ceil((filtered || []).length / PAGE_SIZE));
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [totalPages, page]);

    const pageItems = (filtered || []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return (
        <div>
            <h2>用户管理</h2>
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <TextInput
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                    placeholder="搜索用户名称、id、QQ号"
                    style={{ flex: 1 }}
                />
                <Button themeAware onClick={fetchUsers} disabled={loading}>刷新</Button>
            </div>
            {loading ? (
                <div>加载中…</div>
            ) : filtered.length === 0 ? (
                <div>未找到匹配的用户。</div>
            ) : (
                <ResponsiveTable minWidth={900} cellPadding="8" style={{ border: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #ddd' }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left', padding: 8, minWidth: 100 }}>ID</th>
                            <th style={{ textAlign: 'left', padding: 8 }}>用户名</th>
                            <th style={{ textAlign: 'left', padding: 8 }}>QQ号</th>
                            <th style={{ textAlign: 'left', padding: 8 }}>头像</th>
                            <th style={{ textAlign: 'left', padding: 8 }}>等级</th>
                            <th style={{ textAlign: 'left', padding: 8, maxWidth: 100 }}>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pageItems.map((u, idx) => {
                            const isSelf = user && u.id === user.id;
                            const isSuper = u.admin_level === "YUYUKO";
                            return (
                                <tr key={u.id} style={{ background: idx % 2 === 0 ? (dark ? 'rgba(255,255,255,0.02)' : '#fafafa') : undefined }}>
                                    <td style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={u.id}>{u.id}</td>
                                    <td>{u.username}</td>
                                    <td>{u.qq || "-"}</td>
                                    <td>
                                        {u.has_avatar ? (
                                            <img src={`${backendUrl}/users/${u.id}/avatar?t=${Date.now()}`} alt="avatar" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                                        ) : (
                                            <img src={defaultAvatar} alt="default avatar" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                                        )}
                                    </td>
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
                                    <td style={{ whiteSpace: 'normal', maxWidth: 100 }}>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {u.is_banned ? (
                                                <Button
                                                    themeAware
                                                    onClick={() => unbanUser(u.id)}
                                                    disabled={isSelf || isSuper || processing[u.id]}
                                                    title={isSuper ? '超级管理员不可操作' : (isSelf ? '不可操作自己' : '')}
                                                    style={{ fontSize: 12, padding: '4px 8px', whiteSpace: 'nowrap', minWidth: 72 }}
                                                >
                                                    解除封禁
                                                </Button>
                                            ) : (
                                                <Button
                                                    themeAware
                                                    onClick={() => onBanClick(u)}
                                                    disabled={isSelf || isSuper || processing[u.id]}
                                                    title={isSuper ? '超级管理员不可操作' : (isSelf ? '不可操作自己' : '')}
                                                    style={{ background: '#a04400', color: '#fff', fontSize: 12, padding: '4px 8px', whiteSpace: 'nowrap', minWidth: 60 }}
                                                >
                                                    封禁
                                                </Button>
                                            )}
                                            <Button
                                                themeAware
                                                onClick={() => deleteUser(u.id)}
                                                disabled={isSelf || isSuper || processing[u.id]}
                                                title={isSuper ? '超级管理员不可操作' : (isSelf ? '不可操作自己' : '')}
                                                style={{ background: '#e02424', color: '#ffffff', fontSize: 12, padding: '4px 8px', whiteSpace: 'nowrap', minWidth: 60 }}
                                            >
                                                删除
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </ResponsiveTable>
            )}

            {!loading && filtered.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>共 {filtered.length} 条 — 第 {page} / {totalPages} 页</div>
                    <div>
                        <Button themeAware onClick={() => setPage(1)} disabled={page === 1} style={{ marginRight: 6 }}>首页</Button>
                        <Button themeAware onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ marginRight: 6 }}>上一页</Button>
                        <Button themeAware onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ marginRight: 6 }}>下一页</Button>
                        <Button themeAware onClick={() => setPage(totalPages)} disabled={page === totalPages}>尾页</Button>
                    </div>
                </div>
            )}

            <AdminBanModal open={banModalOpen} onClose={() => { setBanModalOpen(false); setBanTarget(null); }} onConfirm={handleBanConfirm} targetUser={banTarget} />
        </div>
    );
}
