import React from 'react';
import Button from './Button';
import TextInput from './TextInput';
import TextArea from './TextArea';
import PlaceImageInputs from '../map/PlaceImageInputs';
import useDarkMode from '../utils/useDarkMode';
import ScrollableView from './ScrollableView';
import CategorySelector from './CategorySelector';

export default function ManagePanel({
    backendUrl,
    token,
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
    const dark = useDarkMode();
    if (!selectedPlace) return null;

    return (
        <div style={{
            position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
            background: dark ? 'var(--theme-secondary)' : '#fff9f6', padding: 12, zIndex: 5000, borderRadius: 6, boxShadow: dark ? "0 6px 24px rgba(0,0,0,0.6)" : "0 4px 18px rgba(0,0,0,0.35)",
            minWidth: 360, maxWidth: "90%"
        }}>
            <h4 style={{ margin: 0, color: dark ? '#e5e7eb' : 'inherit' }}>管理地点 — {selectedPlace.name}</h4>
            <div style={{ marginTop: 8, color: dark ? '#e5e7eb' : '#333' }}>
                <div>
                    <label style={{ display: "block", fontSize: 12, color: dark ? '#9ca3af' : '#666' }}>名称</label>
                    <TextInput value={manageEdit.name} onChange={(e) => setManageEdit(me => ({ ...me, name: e.target.value }))} style={{ width: "100%" }} />
                </div>
                <div style={{ marginTop: 8 }}>
                    <label style={{ display: "block", fontSize: 12, color: dark ? '#9ca3af' : '#666' }}>分类</label>
                    <CategorySelector
                        backendUrl={backendUrl}
                        token={token}
                        value={manageEdit.category || ''}
                        onChange={(category) => setManageEdit(me => ({ ...me, category }))}
                    />
                </div>
                <div style={{ marginTop: 8 }}>
                    <label style={{ display: "block", fontSize: 12, color: dark ? '#9ca3af' : '#666' }}>描述</label>
                    <ScrollableView
                        as={TextArea}
                        value={manageEdit.description}
                        onChange={(e) => setManageEdit(me => ({ ...me, description: e.target.value }))}
                        style={{
                            width: "100%",
                            maxHeight: "150px",
                            border: dark ? '1px solid #334155' : undefined,
                            background: dark ? '#07101a' : undefined,
                            color: dark ? '#e5e7eb' : undefined
                        }}
                    />
                </div>
                <div style={{ marginTop: 8 }}>
                    <label style={{ display: "block", fontSize: 12, color: dark ? '#9ca3af' : '#666' }}>人均（元）</label>
                    <TextInput
                        value={manageEdit.per_person_cost != null ? String(manageEdit.per_person_cost) : ''}
                        onChange={(e) => {
                            const v = e.target.value;
                            if (v === '') {
                                setManageEdit(me => ({ ...me, per_person_cost: null }));
                            } else if (/^[1-9]\d*$/.test(v)) {
                                setManageEdit(me => ({ ...me, per_person_cost: parseInt(v, 10) }));
                            }
                        }}
                        style={{ width: "100%" }}
                        placeholder="可选，正整数"
                        inputMode="numeric"
                    />
                </div>
                <ScrollableView style={{ marginTop: 8, maxHeight: "150px", overflowY: "auto" }}>
                    <PlaceImageInputs backendUrl={backendUrl} token={token} images={manageEdit.exterior_images || []} setImages={(imgs) => setManageEdit(me => ({ ...me, exterior_images: imgs }))} label="外观/招牌图片（可选）" />
                    <PlaceImageInputs backendUrl={backendUrl} token={token} images={manageEdit.menu_images || []} setImages={(imgs) => setManageEdit(me => ({ ...me, menu_images: imgs }))} label="菜单图片" />
                </ScrollableView>
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ color: dark ? '#9ca3af' : '#888', fontSize: 12 }}>
                        {canDirectManage() ? "您是创建者或管理员，可直接修改或删除。" : "您不是创建者，提交修改申请后由管理员审核。"}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 8, flexShrink: 0, marginLeft: 'auto' }}>
                        <Button themeAware onClick={onClose} style={{ whiteSpace: 'nowrap' }}>取消</Button>

                        {canDirectManage() ? (
                            <>
                                <Button themeAware onClick={onSave} disabled={manageSubmitting} style={{ whiteSpace: 'nowrap' }}>保存</Button>
                                <Button themeAware onClick={onDelete} disabled={manageSubmitting} style={{ background: "#e02424", color: "#fff9f6", whiteSpace: 'nowrap' }}>删除</Button>
                            </>
                        ) : (
                            <Button themeAware onClick={onSubmitRequest} disabled={manageSubmitting} style={{ whiteSpace: 'nowrap' }}>提交申请</Button>
                        )}
                    </div>
                </div>

                {manageMessage && <div style={{ marginTop: 8, color: "#c33" }}>{manageMessage}</div>}
            </div>
        </div>
    );
}
