import React, { useEffect, useState, useRef } from "react";
import Button from "../components/Button";
import TextInput from "../components/TextInput";
import { useTips } from "../components/Tips";
import { useConfirm } from "../components/Confirm";
import { useAuth } from "../AuthContext";
import useDarkMode from "../utils/useDarkMode";
import { getThemeColor } from "../utils/theme";

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

export default function AdminComments({ backendUrl = null }) {
    const base = backendUrl || resolveBackendUrl();
    const { token, user, onRequireAuth } = useAuth();
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(false);
    const showTip = useTips();
    const confirm = useConfirm();
    const [processing, setProcessing] = useState({});
    const dark = useDarkMode();
    const themeColor = getThemeColor();
    const hexToRgba = (hex, a = 1) => {
        try {
            let h = (hex || '').replace('#', '');
            if (h.length === 3) h = h.split('').map(c => c + c).join('');
            const bigint = parseInt(h, 16);
            const r = (bigint >> 16) & 255;
            const g = (bigint >> 8) & 255;
            const b = bigint & 255;
            return `rgba(${r},${g},${b},${a})`;
        } catch (e) {
            return `rgba(0,0,0,${a})`;
        }
    };
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 10;
    const fetchIdRef = useRef(0);

    const canManage = user && user.admin_level;

    useEffect(() => {
        if (!canManage) return;
        fetchComments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canManage, token]);

    const handleUnauthorized = () => {
        setComments([]);
        const authMsg = '未登录或授权已失效，请重新登录';
        showTip(authMsg);
        if (onRequireAuth) onRequireAuth();
    };

    const fetchComments = async () => {
        setLoading(true);
        const thisFetchId = ++fetchIdRef.current;
        const authToken = token;
        try {
            const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
            let res = await fetch(`${base}/admin/comments`, { headers });

            if (thisFetchId !== fetchIdRef.current) return;

            if (res.status === 401) {
                const latest = token || getLatestStoredToken();
                if (latest && latest !== authToken) {
                    const retryHeaders = { Authorization: `Bearer ${latest}` };
                    res = await fetch(`${base}/admin/comments`, { headers: retryHeaders });
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
                    showTip('权限不足，无法获取评论列表');
                    return;
                }
                throw new Error(`服务器错误 ${res.status} ${txt}`);
            }

            const data = await res.json().catch(() => []);
            setComments(data || []);
        } catch (e) {
            console.error('加载评论失败', e);
            if (e && String(e.message || '').toLowerCase().includes('未登录')) {
                // handled
            } else {
                showTip('加载失败: ' + (e.message || e));
            }
        } finally {
            setLoading(false);
        }
    };

    const deleteComment = async (id) => {
        if (!(await confirm('确认删除此评论？'))) return;
        setProcessing(p => ({ ...p, [id]: true }));
        const thisFetchId = ++fetchIdRef.current;
        const authToken = token;
        try {
            const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
            let res = await fetch(`${base}/admin/comments/${id}`, { method: 'DELETE', headers });

            if (thisFetchId !== fetchIdRef.current) return;

            if (res.status === 401) {
                const latest = token || getLatestStoredToken();
                if (latest && latest !== authToken) {
                    const retryHeaders = { Authorization: `Bearer ${latest}` };
                    res = await fetch(`${base}/admin/comments/${id}`, { method: 'DELETE', headers: retryHeaders });
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

            showTip('已删除');
            setComments(list => list.filter(c => c.id !== id));
        } catch (e) {
            console.error('deleteComment failed', e);
            showTip('删除失败：' + (e.message || e));
        } finally {
            setProcessing(p => ({ ...p, [id]: false }));
        }
    };

    if (!canManage) return <div style={{ color: '#b00020' }}>您的账号无权访问此面板。</div>;

    return (
        <div style={{ marginTop: 12 }}>
            <h3>评论管理</h3>
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <TextInput
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                    placeholder="搜索 ID / 地点ID / 用户ID / 内容"
                    style={{ flex: 1 }}
                />
                <Button themeAware onClick={fetchComments} disabled={loading}>刷新</Button>
            </div>

            {loading ? (
                <div>加载中…</div>
            ) : (
                <div>
                    {comments.length === 0 ? (
                        <div>当前没有评论记录。</div>
                    ) : (
                        (() => {
                            const q = (searchQuery || '').trim().toLowerCase();
                            const filtered = q === '' ? comments : comments.filter(c => {
                                const combined = `${c.id} ${c.place_id || c.placeId || ''} ${c.user_id || c.userId || ''} ${c.content || c.text || ''}`.toLowerCase();
                                return combined.includes(q);
                            });
                            const totalPages = Math.max(1, Math.ceil((filtered || []).length / PAGE_SIZE));
                            if (page > totalPages) setPage(totalPages);
                            const pageItems = (filtered || []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

                            if (filtered.length === 0) return <div>未找到匹配的评论。</div>;

                            return (
                                <div>
                                    <table cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', border: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #ddd' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ textAlign: 'left', padding: 8 }}>ID</th>
                                                <th style={{ textAlign: 'left', padding: 8 }}>地点ID</th>
                                                <th style={{ textAlign: 'left', padding: 8 }}>用户ID</th>
                                                <th style={{ textAlign: 'left', padding: 8 }}>内容</th>
                                                <th style={{ textAlign: 'left', padding: 8 }}>创建时间</th>
                                                <th style={{ textAlign: 'left', padding: 8 }}>操作</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pageItems.map((c, idx) => (
                                                <tr key={c.id} style={{ background: idx % 2 === 0 ? (dark ? 'rgba(255,255,255,0.02)' : '#fafafa') : undefined }}>
                                                    <td>{c.id}</td>
                                                    <td>{c.place_id || c.placeId || '-'}</td>
                                                    <td>{c.user_id || c.userId || '-'}</td>
                                                    <td style={{ maxWidth: 420 }}>
                                                        <div style={{ whiteSpace: 'pre-wrap' }}>{c.content || c.text || ''}</div>
                                                    </td>
                                                    <td>{c.created_time || c.createdTime || '-'}</td>
                                                    <td>
                                                        <Button themeAware onClick={() => deleteComment(c.id)} disabled={processing[c.id]} style={{ background: '#e02424', color: '#fff' }}>删除</Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>共 {filtered.length} 条 — 第 {page} / {totalPages} 页</div>
                                        <div>
                                            <Button themeAware onClick={() => setPage(1)} disabled={page === 1} style={{ marginRight: 6 }}>首页</Button>
                                            <Button themeAware onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ marginRight: 6 }}>上一页</Button>
                                            <Button themeAware onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ marginRight: 6 }}>下一页</Button>
                                            <Button themeAware onClick={() => setPage(totalPages)} disabled={page === totalPages}>尾页</Button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()
                    )}
                </div>
            )}
        </div>
    );
}
