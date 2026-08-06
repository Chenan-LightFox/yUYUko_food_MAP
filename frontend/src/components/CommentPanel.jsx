import React from 'react';
import Button from '../components/Button';
import TextArea from '../components/TextArea';
import ScrollableView from './ScrollableView';

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
            background: 'var(--color-bg-surface)', padding: 12, zIndex: 5000, borderRadius: 10, boxShadow: 'var(--shadow-surface)', border: '1px solid var(--color-border)',
            minWidth: 440, maxWidth: "90%"
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: 'var(--color-text-primary)' }}>{place.name}</strong>
                <div>
                    <Button themeAware onClick={onRefresh} disabled={loading} style={{ marginRight: 8 }}>刷新</Button>
                    <Button themeAware onClick={onClose} style={{ border: 'none', background: 'transparent' }} title="关闭">×</Button>
                </div>
            </div>

            <ScrollableView style={{ marginTop: 8, maxHeight: 320, overflowY: 'auto', borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
                {loading ? (
                    <div>加载中…</div>
                ) : (
                    <div>
                        {(!comments || comments.length === 0) ? (
                            <div style={{ color: 'var(--color-text-secondary)' }}>暂无评论，快来成为第一个吧。</div>
                        ) : (
                            comments.map(c => (
                                <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                                    <div style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{c.content}</div>
                                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>{c.user_id || c.userId || '匿名'} · {c.created_time || c.createdTime || '-'}</div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </ScrollableView>

            <div style={{ marginTop: 8 }}>
                {message && <div style={{ color: 'var(--color-danger)', marginBottom: 8 }}>{message}</div>}
                <TextArea value={newComment} onChange={e => setNewComment(e.target.value)} placeholder={canPost ? '写下你的评论…' : '请登录后发表评论'} disabled={!canPost} style={{ width: '96%', minHeight: 80, padding: 8 }} />
                <div style={{ marginTop: 8, textAlign: 'right' }}>
                    <Button themeAware onClick={onSubmit} disabled={!canPost || submitting || !newComment || !newComment.trim()} style={{ marginRight: 8 }}>发布</Button>
                </div>
            </div>
        </div>
    );
}
