import React, { useEffect, useState, useRef } from "react";
import Button from "../components/Button";
import { useAuth } from "../AuthContext";

function resolveBackendUrl() {
    if (typeof window === "undefined") return "http://localhost:3000";
    const { protocol, hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
        return "http://localhost:3000";
    }
    return `${protocol}//${hostname}:3000`;
}

function getLatestStoredToken() {
    try { return localStorage.getItem('token'); } catch (e) { return null; }
}

export default function AdminComments({ backendUrl = null }) {
    const base = backendUrl || resolveBackendUrl();
    const { token, user, onRequireAuth } = useAuth();
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [processing, setProcessing] = useState({});
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
        setMessage(authMsg);
        if (onRequireAuth) onRequireAuth();
    };

    const fetchComments = async () => {
        setLoading(true);
        setMessage("");
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
                    setMessage('权限不足，无法获取评论列表');
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
                setMessage('加载失败: ' + (e.message || e));
            }
        } finally {
            setLoading(false);
        }
    };

    const deleteComment = async (id) => {
        if (!window.confirm('确认删除此评论？')) return;
        setMessage("");
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
                setMessage(data.error || `删除失败 ${res.status}`);
                return;
            }

            setMessage('已删除');
            setComments(list => list.filter(c => c.id !== id));
        } catch (e) {
            console.error('deleteComment failed', e);
            setMessage('删除失败：' + (e.message || e));
        } finally {
            setProcessing(p => ({ ...p, [id]: false }));
        }
    };

    if (!canManage) return <div style={{ color: '#b00020' }}>您的账号无权访问此面板。</div>;

    return (
        <div style={{ marginTop: 12 }}>
            <h3>评论管理</h3>
            <div style={{ marginBottom: 8 }}>
                <Button onClick={fetchComments} disabled={loading}>刷新</Button>
            </div>

            {message && <div style={{ color: '#c33', marginBottom: 8 }}>{message}</div>}

            {loading ? (
                <div>加载中…</div>
            ) : (
                <div>
                    {comments.length === 0 ? (
                        <div>当前没有评论记录。</div>
                    ) : (
                        <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>地点ID</th>
                                    <th>用户ID</th>
                                    <th>内容</th>
                                    <th>创建时间</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {comments.map(c => (
                                    <tr key={c.id}>
                                        <td>{c.id}</td>
                                        <td>{c.place_id || c.placeId || '-'}</td>
                                        <td>{c.user_id || c.userId || '-'}</td>
                                        <td style={{ maxWidth: 420 }}>
                                            <div style={{ whiteSpace: 'pre-wrap' }}>{c.content || c.text || ''}</div>
                                        </td>
                                        <td>{c.created_time || c.createdTime || '-'}</td>
                                        <td>
                                            <Button onClick={() => deleteComment(c.id)} disabled={processing[c.id]} style={{ background: '#e02424', color: '#fff' }}>删除</Button>
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
