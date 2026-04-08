import React, { useState } from 'react';
import Button from './Button';
import TextInput from './TextInput';
import PlaceImageInputs from '../map/PlaceImageInputs';
import useDarkMode from '../utils/useDarkMode';

const CATEGORY_DATA = [
    { group: '中餐厅', items: ['上海菜', '东北菜', '中式素菜馆', '中餐厅', '云贵菜', '北京菜', '台湾菜', '四川菜(川菜)', '安徽菜(徽菜)', '山东菜(鲁菜)', '广东菜(粤菜)', '江苏菜', '浙江菜', '清真菜馆', '湖北菜(鄂菜)', '湖南菜(湘菜)', '潮州菜', '火锅店', '福建菜', '西北菜'] },
    { group: '休闲餐饮店', items: ['咖啡厅', '奶茶店', '甜品店', '茶艺馆'] },
    { group: '外国餐厅', items: ['俄国菜', '印度风味', '地中海风格菜品', '墨西哥菜', '德国菜', '意式菜品餐厅', '日本料理', '法式菜品餐厅', '泰国/越南菜品餐厅', '牛扒店', '美式风味', '韩国料理', '其他国家'] },
    { group: '快餐厅', items: ['中式快餐', '西式快餐', '茶餐厅'] },
    { group: '宵夜小吃', items: ['烧烤', '排挡', '街边小摊'] },
    { group: '其他', items: ['其他'] }
];

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
    const [showCategoryMenu, setShowCategoryMenu] = useState(false);

    if (!selectedPlace) return null;
    const dark = useDarkMode();

    const toggleCategory = (opt) => {
        const catStr = manageEdit.category || '';
        let current = catStr.split(',').map(s => s.trim()).filter(Boolean);
        if (current.includes(opt)) {
            current = current.filter(x => x !== opt);
        } else {
            current.push(opt);
        }
        setManageEdit(me => ({ ...me, category: current.join(', ') }));
    };

    return (
        <div style={{
            position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
            background: dark ? '#0b1220' : '#fff', padding: 12, zIndex: 5000, borderRadius: 6, boxShadow: dark ? "0 6px 24px rgba(0,0,0,0.6)" : "0 4px 18px rgba(0,0,0,0.35)",
            minWidth: 360, maxWidth: "90%"
        }}>
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: ${dark ? '#1e293b' : '#f1f5f9'}; border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: ${dark ? '#475569' : '#cbd5e1'}; border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: ${dark ? '#64748b' : '#94a3b8'}; }
            `}</style>
            <h4 style={{ margin: 0, color: dark ? '#e5e7eb' : 'inherit' }}>管理地点 — {selectedPlace.name}</h4>
            <div style={{ marginTop: 8, color: dark ? '#e5e7eb' : '#333' }}>
                <div>
                    <label style={{ display: "block", fontSize: 12, color: dark ? '#9ca3af' : '#666' }}>名称</label>
                    <TextInput value={manageEdit.name} onChange={(e) => setManageEdit(me => ({ ...me, name: e.target.value }))} style={{ width: "100%" }} />
                </div>
                <div style={{ marginTop: 8 }}>
                    <label style={{ display: "block", fontSize: 12, color: dark ? '#9ca3af' : '#666' }}>分类</label>
                    <div style={{ position: 'relative' }}>
                        <TextInput
                            value={manageEdit.category || ''}
                            readOnly
                            onClick={() => setShowCategoryMenu(!showCategoryMenu)}
                            style={{ width: "100%", cursor: "pointer" }}
                            placeholder="请选择分类（可多选）"
                        />
                        {showCategoryMenu && (
                            <div className="custom-scrollbar" style={{
                                position: 'absolute', top: '100%', left: 0, width: '100%',
                                background: dark ? '#1e293b' : '#fff',
                                border: `1px solid ${dark ? '#334155' : '#ccc'}`,
                                borderRadius: 4, zIndex: 10,
                                maxHeight: 150, overflowY: 'auto',
                                padding: 8, display: 'flex', flexWrap: 'wrap', gap: 6,
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                            }}>
                                {CATEGORY_DATA.map(group => (
                                    <div key={group.group} style={{ width: '100%', marginBottom: 6 }}>
                                        <div style={{ fontSize: 13, fontWeight: 'bold', color: dark ? '#cbd5e1' : '#475569', marginBottom: 4 }}>
                                            {group.group}
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                            {group.items.map(opt => {
                                                const catStr = manageEdit.category || '';
                                                const isSelected = catStr.split(',').map(s => s.trim()).includes(opt);
                                                return (
                                                    <span
                                                        key={opt}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleCategory(opt);
                                                        }}
                                                        style={{
                                                            padding: '4px 8px', fontSize: 12, borderRadius: 12, cursor: 'pointer',
                                                            background: isSelected ? '#3b82f6' : (dark ? '#334155' : '#f1f5f9'),
                                                            color: isSelected ? '#fff' : (dark ? '#e2e8f0' : '#333'),
                                                            border: `1px solid ${isSelected ? '#2563eb' : (dark ? '#475569' : '#cbd5e1')}`
                                                        }}
                                                    >
                                                        {opt}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div style={{ marginTop: 8 }}>
                    <label style={{ display: "block", fontSize: 12, color: dark ? '#9ca3af' : '#666' }}>描述</label>
                    <textarea value={manageEdit.description} onChange={(e) => setManageEdit(me => ({ ...me, description: e.target.value }))} style={{ width: "100%", border: dark ? '1px solid #334155' : undefined, background: dark ? '#07101a' : undefined, color: dark ? '#e5e7eb' : undefined }} />
                </div>                  <div style={{ marginTop: 8, maxHeight: "150px", overflowY: "auto" }} className="custom-scrollbar">
                    <PlaceImageInputs backendUrl={backendUrl} token={token} images={manageEdit.exterior_images || []} setImages={(imgs) => setManageEdit(me => ({ ...me, exterior_images: imgs }))} label="外观/招牌图片" />
                    <PlaceImageInputs backendUrl={backendUrl} token={token} images={manageEdit.menu_images || []} setImages={(imgs) => setManageEdit(me => ({ ...me, menu_images: imgs }))} label="菜单图片" />
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
