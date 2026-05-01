import React, { useEffect, useState, useRef } from "react";
import Button from "../components/Button";
import TextInput from "../components/TextInput";
import { useTips } from "../components/Tips";
import { useConfirm } from "../components/Confirm";
import { useAuth } from "../AuthContext";
import useDarkMode from "../utils/useDarkMode";
import ResponsiveTable from "../components/ResponsiveTable";

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

export default function AdminQQWhitelist({ backendUrl = null }) {
    const base = backendUrl || resolveBackendUrl();
    const { token, user, onRequireAuth } = useAuth();
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(false);
    const showTip = useTips();
    const confirm = useConfirm();
    const [qqInput, setQqInput] = useState("");
    const [batchInput, setBatchInput] = useState("");
    const [adding, setAdding] = useState(false);
    const [processing, setProcessing] = useState({});
    const [searchQuery, setSearchQuery] = useState("");
    const [page, setPage] = useState(1);
    const fetchIdRef = useRef(0);
    const dark = useDarkMode();

    const canManage = user && user.admin_level;

    useEffect(() => {
        if (!canManage) return;
        fetchEntries();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canManage, token]);

    const handleUnauthorized = () => {
        setEntries([]);
        showTip('未登录或授权已失效，请重新登录');
        if (onRequireAuth) onRequireAuth();
    };

    const fetchEntries = async () => {
        setLoading(true);
        const thisFetchId = ++fetchIdRef.current;
        const authToken = token;
        try {
            const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
            let res = await fetch(`${base}/admin/qq-whitelist`, { headers });

            if (thisFetchId !== fetchIdRef.current) return;

            if (res.status === 401) {
                const latest = token || getLatestStoredToken();
                if (latest && latest !== authToken) {
                    const retryHeaders = { Authorization: `Bearer ${latest}` };
                    res = await fetch(`${base}/admin/qq-whitelist`, { headers: retryHeaders });
                    if (thisFetchId !== fetchIdRef.current) return;
                }
            }

            if (!res.ok) {
                if (res.status === 401) {
                    handleUnauthorized();
                    return;
                }
                if (res.status === 403) {
                    showTip('权限不足，无法获取QQ白名单');
                    return;
                }
                throw new Error(`服务器错误 ${res.status}`);
            }

            const data = await res.json().catch(() => []);
            setEntries(data || []);
        } catch (e) {
            console.error('加载QQ白名单失败', e);
            showTip('加载失败: ' + (e.message || e));
        } finally {
            setLoading(false);
        }
    };

    const addQQ = async (e) => {
        e && e.preventDefault();
        // 优先使用批量输入，否则使用单个输入
        const raw = (batchInput || qqInput).trim();
        if (!raw) return showTip('请输入要添加的QQ号');

        setAdding(true);
        const thisFetchId = ++fetchIdRef.current;
        const authToken = token;
        try {
            const headers = {
                'Content-Type': 'application/json',
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
            };
            let res = await fetch(`${base}/admin/qq-whitelist`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ qq: raw })
            });

            if (thisFetchId !== fetchIdRef.current) return;

            if (res.status === 401) {
                const latest = token || getLatestStoredToken();
                if (latest && latest !== authToken) {
                    const retryHeaders = {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${latest}`
                    };
                    res = await fetch(`${base}/admin/qq-whitelist`, {
                        method: 'POST',
                        headers: retryHeaders,
                        body: JSON.stringify({ qq: raw })
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
                throw new Error(data.error || `添加失败 ${res.status}`);
            }

            const { added = [], skipped = [] } = data;
            const parts = [];
            if (added.length > 0) parts.push(`成功添加 ${added.length} 个：${added.join('、')}`);
            if (skipped.length > 0) parts.push(`跳过 ${skipped.length} 个：${skipped.map(s => `${s.qq}(${s.reason})`).join('、')}`);
            showTip(parts.join('；') || '操作完成');
            setQqInput("");
            setBatchInput("");
            await fetchEntries();
        } catch (e) {
            console.error('addQQ failed', e);
            showTip('添加失败：' + (e.message || e));
        } finally {
            setAdding(false);
        }
    };

    const deleteEntry = async (id) => {
        if (!(await confirm('确认将此QQ号移出白名单？'))) return;
        setProcessing(p => ({ ...p, [id]: true }));
        const thisFetchId = ++fetchIdRef.current;
        const authToken = token;
        try {
            const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
            let res = await fetch(`${base}/admin/qq-whitelist/${id}`, { method: 'DELETE', headers });

            if (thisFetchId !== fetchIdRef.current) return;

            if (res.status === 401) {
                const latest = token || getLatestStoredToken();
                if (latest && latest !== authToken) {
                    const retryHeaders = { Authorization: `Bearer ${latest}` };
                    res = await fetch(`${base}/admin/qq-whitelist/${id}`, { method: 'DELETE', headers: retryHeaders });
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

            showTip('已移出白名单');
            setEntries(list => list.filter(e => e.id !== id));
        } catch (e) {
            console.error('deleteEntry failed', e);
            showTip('删除失败：' + (e.message || e));
        } finally {
            setProcessing(p => ({ ...p, [id]: false }));
        }
    };

    if (!canManage) return <div style={{ color: '#b00020' }}>您的账号无权访问此面板。</div>;

    const PAGE_SIZE = 30;

    const filteredEntries = entries.filter(entry => {
        if (!searchQuery) return true;
        return String(entry.qq || '').toLowerCase().includes(searchQuery.toLowerCase());
    });

    const totalPages = Math.max(1, Math.ceil((filteredEntries || []).length / PAGE_SIZE));
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [totalPages, page]);

    const pageEntries = (filteredEntries || []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return (
        <div style={{ marginTop: 12 }}>
            <h3>QQ白名单管理</h3>
            <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <TextInput
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                    placeholder="搜索QQ号"
                    style={{ flex: 1 }}
                />
                <Button themeAware onClick={fetchEntries} disabled={loading}>刷新</Button>
            </div>

            <div style={{ marginBottom: 12, padding: 8, border: dark ? '1px solid #1f2937' : '1px solid #eee', borderRadius: 6, background: dark ? '#0b1220' : undefined }}>
                <div style={{ marginBottom: 8 }}><strong>添加QQ号到白名单</strong></div>
                <div style={{ marginBottom: 8 }}>
                    <label style={{ marginRight: 8, color: dark ? '#9ca3af' : 'inherit' }}>单个QQ号：</label>
                    <TextInput
                        placeholder="输入QQ号"
                        value={qqInput}
                        onChange={e => { setQqInput(e.target.value); setBatchInput(""); }}
                        style={{ width: 220, marginRight: 8 }}
                    />
                </div>
                <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', marginBottom: 4, color: dark ? '#9ca3af' : 'inherit' }}>批量导入（每行一个，或用逗号分隔）：</label>
                    <textarea
                        placeholder={"123456789\n987654321"}
                        value={batchInput}
                        onChange={e => { setBatchInput(e.target.value); setQqInput(""); }}
                        rows={4}
                        style={{
                            width: '100%',
                            maxWidth: 400,
                            boxSizing: 'border-box',
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: dark ? '1px solid #1f2937' : '1px solid #ccc',
                            background: dark ? '#0b1220' : '#fff',
                            color: dark ? '#e5e7eb' : 'inherit',
                            resize: 'vertical',
                            fontSize: 14
                        }}
                    />
                </div>
                <Button themeAware onClick={addQQ} disabled={adding || (!qqInput.trim() && !batchInput.trim())}>
                    {adding ? '添加中...' : '添加到白名单'}
                </Button>
            </div>

            {loading ? (
                <div>加载中…</div>
            ) : (
                <div>
                    {filteredEntries.length === 0 ? (
                        <div>当前白名单为空，请先添加QQ号。</div>
                    ) : (
                        <ResponsiveTable minWidth={600} cellPadding="8" style={{ border: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #ddd' }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left', padding: 8, minWidth: 60 }}>ID</th>
                                    <th style={{ textAlign: 'left', padding: 8, minWidth: 150 }}>QQ号</th>
                                    <th style={{ textAlign: 'left', padding: 8, minWidth: 120 }}>添加时间</th>
                                    <th style={{ textAlign: 'left', padding: 8, minWidth: 80 }}>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageEntries.map((entry, idx) => (
                                    <tr key={entry.id} style={{ background: idx % 2 === 0 ? (dark ? 'rgba(255,255,255,0.02)' : '#fafafa') : undefined }}>
                                        <td>{entry.id}</td>
                                        <td>{entry.qq}</td>
                                        <td>{entry.created_time || "-"}</td>
                                        <td>
                                            <Button
                                                themeAware
                                                onClick={() => deleteEntry(entry.id)}
                                                disabled={processing[entry.id]}
                                                style={{ background: '#e02424', color: '#fff', fontSize: 12, padding: '4px 6px' }}
                                            >
                                                删除
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </ResponsiveTable>
                    )}
                </div>
            )}

            {!loading && filteredEntries.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>共 {filteredEntries.length} 条 — 第 {page} / {totalPages} 页</div>
                    <div>
                        <Button themeAware onClick={() => setPage(1)} disabled={page === 1} style={{ marginRight: 6 }}>首页</Button>
                        <Button themeAware onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ marginRight: 6 }}>上一页</Button>
                        <Button themeAware onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ marginRight: 6 }}>下一页</Button>
                        <Button themeAware onClick={() => setPage(totalPages)} disabled={page === totalPages}>尾页</Button>
                    </div>
                </div>
            )}
        </div>
    );
}
