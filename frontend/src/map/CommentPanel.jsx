import React from 'react';
import Button from '../components/Button';

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
    return (
        <div style={{
            position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
            background: "#fff", padding: 12, zIndex: 5000, borderRadius: 6, boxShadow: "0 4px 18px rgba(0,0,0,0.35)",
            minWidth: 440, maxWidth: "90%"
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{place.name}</strong>
                <div>
                    <Button onClick={onRefresh} disabled={loading} style={{ marginRight: 8 }}>刷新</Button>
                    <Button onClick={onClose} style={{ border: 'none', background: 'transparent' }} title="关闭">×</Button>
                </div>
            </div>

            <div style={{ marginTop: 8, maxHeight: 320, overflowY: 'auto', borderTop: '1px solid #eee', paddingTop: 8 }}>
                {loading ? (
                    <div>加载中…</div>
                ) : (
                    <div>
                        {(!comments || comments.length === 0) ? (
                            <div style={{ color: '#666' }}>暂无评论，快来成为第一个吧。</div>
                        ) : (
                            comments.map(c => (
                                <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f3f3' }}>
                                    <div style={{ fontSize: 13, color: '#333' }}>{c.content}</div>
                                    <div style={{ marginTop: 6, fontSize: 12, color: '#777' }}>{c.user_id || c.userId || '匿名'} · {c.created_time || c.createdTime || '-'}</div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            <div style={{ marginTop: 8 }}>
                {message && <div style={{ color: '#c33', marginBottom: 8 }}>{message}</div>}
                <textarea value={newComment} onChange={e => setNewComment(e.target.value)} placeholder={canPost ? '写下你的评论…' : '请登录后发表评论'} disabled={!canPost} style={{ width: '96%', minHeight: 80, padding: 8 }} />
                <div style={{ marginTop: 8, textAlign: 'right' }}>
                    <Button onClick={onSubmit} disabled={!canPost || submitting || !newComment || !newComment.trim()} style={{ marginRight: 8 }}>发布</Button>
                </div>
            </div>
        </div>
    );
}
