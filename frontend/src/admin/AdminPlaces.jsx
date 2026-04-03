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

export default function AdminPlaces({ backendUrl = null }) {
    const base = backendUrl || resolveBackendUrl();
    const { token, user, onRequireAuth } = useAuth();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [processing, setProcessing] = useState({}); // id -> bool

    const canManage = user && user.admin_level;
    const fetchIdRef = useRef(0);

    // Fetch when user/token state changes to latest
    useEffect(() => {
        if (!canManage) return;
        fetchRequests();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canManage, token]);

    const handleUnauthorized = () => {
        setRequests([]);
        const authMsg = '未登录或授权已失效，请重新登录';
        setMessage(authMsg);
        if (onRequireAuth) onRequireAuth();
    };

    // Fetch requests and ignore responses from stale tokens/earlier fetches
    const fetchRequests = async () => {
        setLoading(true);
        setMessage("");
        const thisFetchId = ++fetchIdRef.current;
        const authToken = token; // capture current token
        try {
            const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
            let res = await fetch(`${base}/place-requests`, { headers });

            // If token changed since we started, ignore this response
            if (thisFetchId !== fetchIdRef.current) {
                return;
            }

            // If 401 and token changed since request started, retry once with latest token
            if (res.status === 401) {
                const latest = token || getLatestStoredToken();
                if (latest && latest !== authToken) {
                    const retryHeaders = { Authorization: `Bearer ${latest}` };
                    res = await fetch(`${base}/place-requests`, { headers: retryHeaders });
                    if (thisFetchId !== fetchIdRef.current) {
                        return;
                    }
                }
            }

            if (!res.ok) {
                // Log full response for debugging
                let txt = "";
                try { txt = await res.text(); } catch (e) { txt = "<failed to read body>"; }
                if (res.status === 401) {
                    // show red error message and open auth modal
                    handleUnauthorized();
                    return;
                }
                const preview = typeof txt === 'string' ? (txt.length > 240 ? txt.slice(0, 240) + '...(truncated)' : txt) : String(txt);
                throw new Error(`服务器错误 ${res.status} ${preview}`);
            }
            const data = await res.json();
            setRequests(data || []);
        } catch (e) {
            console.error("加载申请失败", e);
            // Already handled 401 via handleUnauthorized; show other errors
            if (e && String(e.message || '').toLowerCase().includes('未登录')) {
                // nothing more
            } else {
                setMessage("加载失败: " + (e.message || e));
            }
        } finally {
            setLoading(false);
        }
    };

    const review = async (id, action) => {
        if (!window.confirm(`确认要 ${action === 'approve' ? '通过' : '驳回'} 此申请？`)) return;
        setProcessing(p => ({ ...p, [id]: true }));
        const thisFetchId = ++fetchIdRef.current; // bump to mark new action
        try {
            const authToken = token;
            const headers = {
                'Content-Type': 'application/json',
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
            };
            let res = await fetch(`${base}/place-requests/${id}/review`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ action })
            });

            if (thisFetchId !== fetchIdRef.current) {
                return;
            }

            // Retry once with latest token if 401 and token changed
            if (res.status === 401) {
                const latest = token || getLatestStoredToken();
                if (latest && latest !== authToken) {
                    const retryHeaders = {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${latest}`
                    };
                    res = await fetch(`${base}/place-requests/${id}/review`, {
                        method: 'POST',
                        headers: retryHeaders,
                        body: JSON.stringify({ action })
                    });
                    if (thisFetchId !== fetchIdRef.current) {
                        return;
                    }
                }
            }

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                let txt = "";
                try { txt = JSON.stringify(data); } catch (e) { txt = String(data); }
                if (res.status === 401) {
                    handleUnauthorized();
                    return;
                }
                throw new Error(data.error || `Review failed ${res.status}`);
            }
            await fetchRequests();
            setMessage('操作成功');
        } catch (e) {
            console.error('审批失败', e);
            if (e && String(e.message || '').toLowerCase().includes('未登录')) {
                // already handled
            } else {
                setMessage('操作失败: ' + (e.message || e));
            }
        } finally {
            setProcessing(p => ({ ...p, [id]: false }));
        }
    };

    return (
        <div style={{ marginTop: 12 }}>
            <h3>地点修改申请</h3>
            {!canManage && <div style={{ color: '#b00020' }}>您的账号无权访问此面板。</div>}
            {canManage && (
                <div>
                    <div style={{ marginBottom: 8 }}>
                        <Button themeAware onClick={fetchRequests} disabled={loading}>刷新</Button>
                    </div>
                    {message && <div style={{ color: '#c33', marginBottom: 8 }}>{message}</div>}
                    {loading ? (
                        <div>加载中…</div>
                    ) : (
                        <div>
                            {requests.length === 0 ? (
                                <div>当前没有待处理的申请。</div>
                            ) : (
                                <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>地点ID</th>
                                            <th>申请人</th>
                                            <th>提交时间</th>
                                            <th>当前状态</th>
                                            <th>提议内容</th>
                                            <th>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {requests.map(r => (
                                            <tr key={r.id}>
                                                <td>{r.id}</td>
                                                <td>{r.place_id}</td>
                                                <td>{r.requester_id}</td>
                                                <td>{r.created_time}</td>
                                                <td>{r.status}</td>
                                                <td style={{ maxWidth: 420 }}>
                                                    <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(r.proposed, null, 2)}</pre>
                                                    {r.note ? <div style={{ color: '#666' }}>备注: {r.note}</div> : null}
                                                </td>
                                                <td style={{ whiteSpace: 'nowrap' }}>
                                                    {r.status === 'pending' ? (
                                                        <>
                                                            <Button themeAware onClick={() => review(r.id, 'approve')} disabled={processing[r.id]} style={{ marginRight: 6 }}>通过</Button>
                                                            <Button themeAware onClick={() => review(r.id, 'reject')} disabled={processing[r.id]} style={{ background: '#e02424', color: '#fff' }}>驳回</Button>
                                                        </>
                                                    ) : (
                                                        <div>已处理: {r.status}</div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
