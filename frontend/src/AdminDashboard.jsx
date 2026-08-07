import React, { useMemo, useState } from "react";
import Button from "./components/Button";
import AdminPlaces from "./admin/AdminPlaces";
import AdminUsers from "./admin/AdminUsers";
import AdminInvitecode from "./admin/AdminInvitecodes";
import AdminComments from "./admin/AdminComments";
import AdminGeneralUsers from "./admin/AdminGeneralUsers";
import AdminQQWhitelist from "./admin/AdminQQWhitelist";
import AdminAuditModal from "./admin/AdminAuditModal";
import AdminNotices from "./admin/AdminNotices";
import ScrollableView from "./components/ScrollableView";

const PERMISSIONS = {
    YUYUKO: ["用户管理", "操作日志", "标记点管理", "邀请码管理", "评论管理", "QQ白名单管理", "公告发布"],
    YOUMU: ["普通用户管理", "标记点管理", "邀请码管理", "评论管理", "QQ白名单管理", "公告发布"],
    KOMACHI: ["普通用户管理", "评论管理"]
};

export default function AdminDashboard({ user, token, backendUrl, onBackHome, onLogout, onRequireAuth }) {
    const level = user && user.admin_level ? user.admin_level : null;
    const perms = level ? (PERMISSIONS[level] || []) : [];
    const [auditOpen, setAuditOpen] = useState(false);

    const canManagePlaces = useMemo(() => perms.includes("标记点管理"), [perms]);
    const canManageUsers = useMemo(() => perms.includes("用户管理"), [perms]);
    const canManageInvites = useMemo(() => perms.includes("邀请码管理"), [perms]);
    const canManageComments = useMemo(() => perms.includes("评论管理"), [perms]);
    const canManageGeneralUsers = useMemo(() => perms.includes("普通用户管理"), [perms]);
    const canManageQQWhitelist = useMemo(() => perms.includes("QQ白名单管理"), [perms]);
    const canManageAnnouncements = useMemo(() => perms.includes("公告发布"), [perms]);
    const canViewAudit = useMemo(() => perms.includes("操作日志"), [perms]);

    const rootStyle = { height: "100%", minHeight: 0, background: 'var(--color-bg-base)', padding: 20, boxSizing: "border-box", color: 'var(--color-text-primary)' };
    const containerStyle = { maxWidth: 960, margin: "0 auto" };
    const headerRow = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 };
    const cardStyle = { background: 'var(--color-bg-surface)', borderRadius: 10, padding: 16, border: '1px solid var(--color-border)', boxShadow: '0 8px 24px var(--color-glow)' };
    const panelStyle = { marginTop: 18, background: 'var(--color-bg-surface)', padding: 12, borderRadius: 10, border: '1px solid var(--color-border)' };

    return (
        <ScrollableView as="main" style={rootStyle}>
            <div style={containerStyle}>
                <div style={{ ...headerRow, marginTop: 50 }}>
                    <h2 style={{ margin: 0 }}>管理员后台</h2>
                </div>

                <div style={cardStyle}>
                    <div style={{ marginBottom: 8 }}><strong>当前用户：</strong>{user ? user.username : "-"}</div>
                    <div style={{ marginBottom: 10 }}><strong>管理员等级：</strong>{level || "普通用户"}</div>

                    {level ? (
                        <div>
                            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                {canViewAudit && (
                                    <Button themeAware onClick={() => setAuditOpen(true)}>查看操作日志</Button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div style={{ color: 'var(--color-danger)' }}>当前账号不是管理员，无法访问后台功能。</div>
                    )}
                </div>

                {/* 用户管理面板 */}
                {canManageUsers && (
                    <div style={panelStyle}>
                        <AdminUsers backendUrl={backendUrl} token={token} user={user} onRequireAuth={onRequireAuth} />
                    </div>
                )}

                {/* 普通用户管理面板 */}
                {canManageGeneralUsers && (
                    <div style={panelStyle}>
                        <AdminGeneralUsers backendUrl={backendUrl} token={token} user={user} onRequireAuth={onRequireAuth} />
                    </div>
                )}

                {/* 标记点管理面板 */}
                {canManagePlaces && (
                    <div style={panelStyle}>
                        <AdminPlaces backendUrl={backendUrl} token={token} user={user} onRequireAuth={onRequireAuth} />
                    </div>
                )}

                {/* 邀请码管理面板 */}
                {canManageInvites && (
                    <div style={panelStyle}>
                        <AdminInvitecode backendUrl={backendUrl} token={token} user={user} onRequireAuth={onRequireAuth} />
                    </div>
                )}

                {/* QQ白名单管理面板 */}
                {canManageQQWhitelist && (
                    <div style={panelStyle}>
                        <AdminQQWhitelist backendUrl={backendUrl} token={token} user={user} onRequireAuth={onRequireAuth} />
                    </div>
                )}

                {/* 公告发布面板 */}
                {canManageAnnouncements && (
                    <div style={panelStyle}>
                        <AdminNotices backendUrl={backendUrl} token={token} user={user} onRequireAuth={onRequireAuth} />
                    </div>
                )}

                {/* 评论管理面板（评论功能暂不开放） */}
                {/*canManageComments && (
                    <div style={panelStyle}>
                        <AdminComments backendUrl={backendUrl} token={token} user={user} onRequireAuth={onRequireAuth} />
                    </div>
                )*/}
            </div>
            <AdminAuditModal open={auditOpen} onClose={() => setAuditOpen(false)} backendUrl={backendUrl} token={token} />
        </ScrollableView>
    );
}
