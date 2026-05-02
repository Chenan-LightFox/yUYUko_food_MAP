import React, { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../components/Button';
import TextInput from '../components/TextInput';
import TextArea from '../components/TextArea';
import Notice from '../components/Notice';
import ResponsiveTable from '../components/ResponsiveTable';
import { useTips } from '../components/Tips';
import { useConfirm } from '../components/Confirm';
import { useAuth } from '../AuthContext';
import useDarkMode from '../utils/useDarkMode';
import { NOTICE_COLOR_OPTIONS, getNoticeColorOption } from '../utils/noticeColors';

function resolveBackendUrl() {
    if (typeof window === 'undefined') return 'http://localhost:2053';
    const { protocol, hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:2053';
    }
    return `${protocol}//${hostname}:2053`;
}

function getLatestStoredToken() {
    try { return localStorage.getItem('token'); } catch (e) { return null; }
}

export default function AdminNotices({ backendUrl = null }) {
    const base = backendUrl || resolveBackendUrl();
    const { token, user, onRequireAuth } = useAuth();
    const dark = useDarkMode();
    const showTip = useTips();
    const confirm = useConfirm();
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [notices, setNotices] = useState([]);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [colorKey, setColorKey] = useState(NOTICE_COLOR_OPTIONS[0].key);
    const fetchIdRef = useRef(0);

    const canManage = !!(user && user.admin_level);

    const currentNotice = useMemo(() => {
        return (notices || []).find((item) => item && item.is_active) || null;
    }, [notices]);

    useEffect(() => {
        if (!canManage) return;
        fetchNotices();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canManage, token]);

    const handleUnauthorized = () => {
        setNotices([]);
        showTip('未登录或授权已失效，请重新登录');
        if (onRequireAuth) onRequireAuth();
    };

    const fetchNotices = async () => {
        setLoading(true);
        const thisFetchId = ++fetchIdRef.current;
        const authToken = token;
        try {
            const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
            let res = await fetch(`${base}/admin/notices`, { headers });

            if (thisFetchId !== fetchIdRef.current) return;

            if (res.status === 401) {
                const latest = token || getLatestStoredToken();
                if (latest && latest !== authToken) {
                    res = await fetch(`${base}/admin/notices`, { headers: { Authorization: `Bearer ${latest}` } });
                    if (thisFetchId !== fetchIdRef.current) return;
                }
            }

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                if (res.status === 401) {
                    handleUnauthorized();
                    return;
                }
                if (res.status === 403) {
                    showTip('权限不足，无法访问公告管理');
                    return;
                }
                throw new Error(data.error || `加载失败 ${res.status}`);
            }

            const data = await res.json().catch(() => []);
            setNotices(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('加载公告失败', e);
            showTip('加载公告失败：' + (e.message || e));
        } finally {
            setLoading(false);
        }
    };

    const publishNotice = async () => {
        const nextTitle = title.trim();
        const nextContent = content.trim();
        if (!nextTitle || !nextContent) {
            showTip('请先填写公告标题和内容');
            return;
        }
        setSubmitting(true);
        const thisFetchId = ++fetchIdRef.current;
        const authToken = token;
        try {
            const headers = {
                'Content-Type': 'application/json',
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
            };
            let res = await fetch(`${base}/admin/notices`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ title: nextTitle, content: nextContent, color_key: colorKey })
            });

            if (thisFetchId !== fetchIdRef.current) return;

            if (res.status === 401) {
                const latest = token || getLatestStoredToken();
                if (latest && latest !== authToken) {
                    res = await fetch(`${base}/admin/notices`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${latest}`
                        },
                        body: JSON.stringify({ title: nextTitle, content: nextContent, color_key: colorKey })
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
                throw new Error(data.error || `发布失败 ${res.status}`);
            }

            showTip('公告已发布，所有用户将自动获取最新公告');
            setTitle('');
            setContent('');
            await fetchNotices();
        } catch (e) {
            console.error('发布公告失败', e);
            showTip('发布公告失败：' + (e.message || e));
        } finally {
            setSubmitting(false);
        }
    };

    const clearCurrentNotice = async () => {
        if (!(await confirm('确认下线当前公告？'))) return;
        setClearing(true);
        const thisFetchId = ++fetchIdRef.current;
        const authToken = token;
        try {
            const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
            let res = await fetch(`${base}/admin/notices/current`, { method: 'DELETE', headers });

            if (thisFetchId !== fetchIdRef.current) return;

            if (res.status === 401) {
                const latest = token || getLatestStoredToken();
                if (latest && latest !== authToken) {
                    res = await fetch(`${base}/admin/notices/current`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${latest}` }
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
                throw new Error(data.error || `下线失败 ${res.status}`);
            }

            showTip('当前公告已下线');
            await fetchNotices();
        } catch (e) {
            console.error('下线公告失败', e);
            showTip('下线公告失败：' + (e.message || e));
        } finally {
            setClearing(false);
        }
    };

    if (!canManage) return <div style={{ color: '#b00020' }}>您的账号无权访问此面板。</div>;

    const previewNotice = {
        title: title.trim() || '公告预览',
        content: content.trim() || '这里会显示公告内容。'
    };

    return (
        <div style={{ marginTop: 12 }}>
            <h3>公告发布</h3>
            <div style={{ marginBottom: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button themeAware onClick={fetchNotices} disabled={loading}>刷新</Button>
                <Button themeAware onClick={clearCurrentNotice} disabled={clearing || !currentNotice}>下线当前公告</Button>
            </div>

            {currentNotice ? (
                <div style={{ marginBottom: 16 }}>
                    <div style={{ marginBottom: 8, fontWeight: 700 }}>当前生效公告</div>
                    <Notice
                        title={currentNotice.title}
                        backgroundColor={getNoticeColorOption(currentNotice.color_key).backgroundColor}
                        style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none', width: '96.5%', maxWidth: 'none', minWidth: 0, marginBottom: 0, textAlign: 'center' }}
                    >
                        <div style={{ whiteSpace: 'pre-wrap' }}>{currentNotice.content}</div>
                    </Notice>
                </div>
            ) : (
                <div style={{ marginBottom: 16, color: dark ? '#9ca3af' : '#666' }}>当前没有生效的公告。</div>
            )}

            <div style={{ marginBottom: 12, padding: 12, border: dark ? '1px solid #1f2937' : '1px solid #e5e7eb', borderRadius: 8, background: dark ? '#0b1220' : '#fff' }}>
                <div style={{ marginBottom: 10, fontWeight: 700 }}>发布新公告</div>
                <div style={{ display: 'grid', gap: 10 }}>
                    <TextInput
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="公告标题"
                        maxLength={80}
                    />
                    <TextArea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="公告内容"
                        rows={5}
                        maxLength={1000}
                    />
                    <div>
                        <div style={{ marginBottom: 8, fontWeight: 600 }}>选择背景颜色</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {NOTICE_COLOR_OPTIONS.map((option) => (
                                <button
                                    key={option.key}
                                    type="button"
                                    title={option.label}
                                    aria-label={option.label}
                                    onClick={() => setColorKey(option.key)}
                                    style={{
                                        width: 34,
                                        height: 34,
                                        padding: 0,
                                        borderRadius: '50%',
                                        border: colorKey === option.key ? '2px solid #111827' : '1px solid #d1d5db',
                                        background: option.backgroundColor,
                                        boxSizing: 'border-box',
                                        cursor: 'pointer'
                                    }}
                                />
                            ))}
                        </div>
                    </div>

                    <div style={{ marginTop: 6 }}>
                        <div style={{ marginBottom: 8, fontWeight: 600 }}>预览</div>
                        <Notice
                            title={previewNotice.title}
                            backgroundColor={getNoticeColorOption(colorKey).backgroundColor}
                            style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none', width: '96.5%', maxWidth: 'none', minWidth: 0, textAlign: 'center' }}
                        >
                            <div style={{ whiteSpace: 'pre-wrap' }}>{previewNotice.content}</div>
                        </Notice>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Button themeAware onClick={publishNotice} disabled={submitting}>发布公告</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}