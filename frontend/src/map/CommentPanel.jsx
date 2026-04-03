import React from 'react';
import Button from '../components/Button';
import useDarkMode from '../hooks/useDarkMode';

export default function CommentPanel({
    place,
    comments = [],
    loading,
    message,
    newComment,
    setNewComment,
    submitting,
    onClose,
    onRefresh,
    onSubmit,
    canPost
}) {
    if (!place) return null;
    const dark = useDarkMode();
    return (
        <div style={{
            position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
            background: dark ? '#0b1220' : '#fff', padding: 12, zIndex: 5000, borderRadius: 6, boxShadow: dark ? "0 6px 24px rgba(0,0,0,0.6)" : "0 4px 18px rgba(0,0,0,0.35)",
            minWidth: 440, maxWidth: "90%"
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: dark ? '#e5e7eb' : 'inherit' }}>{place.name}</strong>
                <div>
                    <Button themeAware onClick={onRefresh} disabled={loading} style={{ marginRight: 8 }}>刷新</Button>
                    <Button themeAware onClick={onClose} style={{ border: 'none', background: 'transparent' }} title="关闭">×</Button>
                </div>
            </div>

            <div style={{ marginTop: 8, maxHeight: 320, overflowY: 'auto', borderTop: dark ? '1px solid #1f2937' : '1px solid #eee', paddingTop: 8 }}>
                {loading ? (
                    <div>加载中…</div>
                ) : (
                    <div>
                        {(!comments || comments.length === 0) ? (
                            <div style={{ color: dark ? '#9ca3af' : '#666' }}>暂无评论，快来成为第一个吧。</div>
                        ) : (
                            comments.map(c => (
                                <div key={c.id} style={{ padding: '8px 0', borderBottom: dark ? '1px solid #111827' : '1px solid #f3f3f3' }}>
                                    <div style={{ fontSize: 13, color: dark ? '#e5e7eb' : '#333' }}>{c.content}</div>
                                    <div style={{ marginTop: 6, fontSize: 12, color: dark ? '#9ca3af' : '#777' }}>{c.user_id || c.userId || '匿名'} · {c.created_time || c.createdTime || '-'}</div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            <div style={{ marginTop: 8 }}>
                {message && <div style={{ color: '#c33', marginBottom: 8 }}>{message}</div>}
                <textarea value={newComment} onChange={e => setNewComment(e.target.value)} placeholder={canPost ? '写下你的评论…' : '请登录后发表评论'} disabled={!canPost} style={{ width: '96%', minHeight: 80, padding: 8, border: dark ? '1px solid #334155' : undefined, background: dark ? '#07101a' : undefined, color: dark ? '#e5e7eb' : undefined }} />
                <div style={{ marginTop: 8, textAlign: 'right' }}>
                    <Button themeAware onClick={onSubmit} disabled={!canPost || submitting || !newComment || !newComment.trim()} style={{ marginRight: 8 }}>发布</Button>
                </div>
            </div>
        </div>
    );
}
