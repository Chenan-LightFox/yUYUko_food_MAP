import React from 'react';
import Button from './Button';
import TextInput from './TextInput';
import TextArea from './TextArea';
import PlaceImageInputs from '../map/PlaceImageInputs';
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
    if (!selectedPlace) return null;

    return (
        <div style={{
            position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
            background: 'var(--color-bg-surface)', padding: 12, zIndex: 5000, borderRadius: 10, boxShadow: 'var(--shadow-surface)', border: '1px solid var(--color-border)',
            minWidth: 360, maxWidth: "90%"
        }}>
            <h4 style={{ margin: 0, color: 'var(--color-text-primary)' }}>管理地点 — {selectedPlace.name}</h4>
            <div style={{ marginTop: 8, color: 'var(--color-text-primary)' }}>
                <div>
                    <label style={{ display: "block", fontSize: 12, color: 'var(--color-text-secondary)' }}>名称</label>
                    <TextInput value={manageEdit.name} onChange={(e) => setManageEdit(me => ({ ...me, name: e.target.value }))} style={{ width: "100%" }} />
                </div>
                <div style={{ marginTop: 8 }}>
                    <label style={{ display: "block", fontSize: 12, color: 'var(--color-text-secondary)' }}>分类</label>
                    <CategorySelector
                        backendUrl={backendUrl}
                        token={token}
                        value={manageEdit.category || ''}
                        onChange={(category) => setManageEdit(me => ({ ...me, category }))}
                    />
                </div>
                <div style={{ marginTop: 8 }}>
                    <label style={{ display: "block", fontSize: 12, color: 'var(--color-text-secondary)' }}>描述</label>
                    <ScrollableView
                        as={TextArea}
                        value={manageEdit.description}
                        onChange={(e) => setManageEdit(me => ({ ...me, description: e.target.value }))}
                        style={{
                            width: "100%",
                            maxHeight: "150px",
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-bg-overlay)',
                            color: 'var(--color-text-primary)'
                        }}
                    />
                </div>
                <div style={{ marginTop: 8 }}>
                    <label style={{ display: "block", fontSize: 12, color: 'var(--color-text-secondary)' }}>人均（元）</label>
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
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>
                        {canDirectManage() ? "您是创建者或管理员，可直接修改或删除。" : "您不是创建者，提交修改申请后由管理员审核。"}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 8, flexShrink: 0, marginLeft: 'auto' }}>
                        <Button themeAware onClick={onClose} style={{ whiteSpace: 'nowrap' }}>取消</Button>

                        {canDirectManage() ? (
                            <>
                                <Button themeAware onClick={onSave} disabled={manageSubmitting} style={{ whiteSpace: 'nowrap' }}>保存</Button>
                                <Button themeAware onClick={onDelete} disabled={manageSubmitting} style={{ background: 'var(--color-danger)', color: 'var(--color-on-emphasis)', borderColor: 'var(--color-danger)', whiteSpace: 'nowrap' }}>删除</Button>
                            </>
                        ) : (
                            <Button themeAware onClick={onSubmitRequest} disabled={manageSubmitting} style={{ whiteSpace: 'nowrap' }}>提交申请</Button>
                        )}
                    </div>
                </div>

                {manageMessage && <div style={{ marginTop: 8, color: 'var(--color-danger)' }}>{manageMessage}</div>}
            </div>
        </div>
    );
}
