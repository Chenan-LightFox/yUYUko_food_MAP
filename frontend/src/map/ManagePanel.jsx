import React from 'react';
import Button from '../components/Button';
import useDarkMode from '../hooks/useDarkMode';

export default function ManagePanel({
    selectedPlace,
    manageEdit,
    setManageEdit,
    manageSubmitting,
    manageMessage,
    canDirectManage,
    onClose,
    onSave,
    onDelete,
    onSubmitRequest
}) {
    if (!selectedPlace) return null;
    const dark = useDarkMode();
    return (
        <div style={{
            position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
            background: dark ? '#0b1220' : '#fff', padding: 12, zIndex: 5000, borderRadius: 6, boxShadow: dark ? "0 6px 24px rgba(0,0,0,0.6)" : "0 4px 18px rgba(0,0,0,0.35)",
            minWidth: 360, maxWidth: "90%"
        }}>
            <h4 style={{ margin: 0, color: dark ? '#e5e7eb' : 'inherit' }}>管理地点 — {selectedPlace.name}</h4>
            <div style={{ marginTop: 8, color: dark ? '#e5e7eb' : '#333' }}>
                <div>
                    <label style={{ display: "block", fontSize: 12, color: dark ? '#9ca3af' : '#666' }}>名称</label>
                    <input value={manageEdit.name} onChange={(e) => setManageEdit(me => ({ ...me, name: e.target.value }))} style={{ width: "100%", border: dark ? '1px solid #334155' : undefined, background: dark ? '#07101a' : undefined, color: dark ? '#e5e7eb' : undefined }} />
                </div>
                <div style={{ marginTop: 8 }}>
                    <label style={{ display: "block", fontSize: 12, color: dark ? '#9ca3af' : '#666' }}>分类</label>
                    <input value={manageEdit.category} onChange={(e) => setManageEdit(me => ({ ...me, category: e.target.value }))} style={{ width: "100%", border: dark ? '1px solid #334155' : undefined, background: dark ? '#07101a' : undefined, color: dark ? '#e5e7eb' : undefined }} />
                </div>
                <div style={{ marginTop: 8 }}>
                    <label style={{ display: "block", fontSize: 12, color: dark ? '#9ca3af' : '#666' }}>描述</label>
                    <textarea value={manageEdit.description} onChange={(e) => setManageEdit(me => ({ ...me, description: e.target.value }))} style={{ width: "100%", border: dark ? '1px solid #334155' : undefined, background: dark ? '#07101a' : undefined, color: dark ? '#e5e7eb' : undefined }} />
                </div>

                <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ color: dark ? '#9ca3af' : '#888', fontSize: 12 }}>
                        {canDirectManage() ? "您是创建者或管理员，可直接修改或删除。" : "您不是创建者，提交修改申请后由管理员审核。"}
                    </div>
                    <div>
                        <Button themeAware onClick={onClose} style={{ marginRight: 8 }}>取消</Button>

                        {canDirectManage() ? (
                            <>
                                <Button themeAware onClick={onSave} disabled={manageSubmitting} style={{ marginRight: 8 }}>保存</Button>
                                <Button themeAware onClick={onDelete} disabled={manageSubmitting} style={{ background: "#e02424", color: "#fff" }}>删除</Button>
                            </>
                        ) : (
                            <Button themeAware onClick={onSubmitRequest} disabled={manageSubmitting}>提交申请</Button>
                        )}
                    </div>
                </div>

                {manageMessage && <div style={{ marginTop: 8, color: "#c33" }}>{manageMessage}</div>}
            </div>
        </div>
    );
}
