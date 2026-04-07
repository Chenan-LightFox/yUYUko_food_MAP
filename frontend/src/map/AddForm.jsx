import React, { useState } from 'react';
import Button from '../components/Button';
import TextInput from '../components/TextInput';
import { useTips } from '../components/Tips';
import useDarkMode from '../utils/useDarkMode';

export default function AddForm({ defaultPos, onCancel, onSubmit }) {
    const [name, setName] = useState("");
    const [category, setCategory] = useState("");
    const [showCategoryMenu, setShowCategoryMenu] = useState(false);
    const [description, setDescription] = useState("");
    const showTip = useTips();
    const dark = useDarkMode();

    const CATEGORY_DATA = [
        { group: '中餐厅', items: ['上海菜', '东北菜', '中式素菜馆', '中餐厅', '云贵菜', '北京菜', '台湾菜', '四川菜(川菜)', '安徽菜(徽菜)', '山东菜(鲁菜)', '广东菜(粤菜)', '江苏菜', '浙江菜', '清真菜馆', '湖北菜(鄂菜)', '湖南菜(湘菜)', '潮州菜', '火锅店', '福建菜', '西北菜'] },
        { group: '休闲餐饮店', items: ['咖啡厅', '奶茶店', '甜品店', '茶艺馆'] },
        { group: '外国餐厅', items: ['俄国菜', '印度风味', '地中海风格菜品', '墨西哥菜', '德国菜', '意式菜品餐厅', '日本料理', '法式菜品餐厅', '泰国/越南菜品餐厅', '牛扒店', '美式风味', '韩国料理', '其他国家'] },
        { group: '快餐厅', items: ['中式快餐', '西式快餐', '茶餐厅'] },
        { group: '宵夜小吃', items: ['烧烤', '排挡', '街边小摊'] },
        { group: '其他', items: ['其他'] }
    ];

    const toggleCategory = (opt) => {
        let current = category.split(',').map(s => s.trim()).filter(Boolean);
        if (current.includes(opt)) {
            current = current.filter(x => x !== opt);
        } else {
            current.push(opt);
        }
        setCategory(current.join(', '));
    };

    const handle = () => {
        if (!name) { showTip("请输入名称"); return; }
        const payload = {
            name,
            category,
            description,
            longitude: defaultPos[0],
            latitude: defaultPos[1]
        };
        onSubmit(payload);
    };

    return (
        <div style={{ width: 320, background: dark ? '#0b1220' : '#fff', padding: 12, borderRadius: 6, boxShadow: dark ? "0 6px 24px rgba(0,0,0,0.6)" : "0 4px 18px rgba(0,0,0,0.35)" }}>
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: ${dark ? '#1e293b' : '#f1f5f9'}; border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: ${dark ? '#475569' : '#cbd5e1'}; border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: ${dark ? '#64748b' : '#94a3b8'}; }
            `}</style>
            <div><strong style={{ color: dark ? '#e5e7eb' : undefined }}>经纬度：</strong><span style={{ color: dark ? '#e5e7eb' : undefined }}>{defaultPos[1].toFixed(6)}, {defaultPos[0].toFixed(6)}</span></div>
            <div style={{ marginTop: 8 }}>
                <TextInput placeholder="店名" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ marginTop: 8, position: 'relative' }}>
                <TextInput 
                    placeholder="请选择分类（可多选）" 
                    value={category} 
                    readOnly 
                    onClick={() => setShowCategoryMenu(!showCategoryMenu)}
                    style={{ width: "100%", cursor: "pointer" }} 
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
                                        const isSelected = category.split(',').map(s => s.trim()).includes(opt);
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
            <div style={{ marginTop: 8 }}>
                <TextInput placeholder="描述" value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ marginTop: 8, textAlign: "right" }}>
                <Button themeAware onClick={onCancel} style={{ marginRight: 8 }}>取消</Button>
                <Button themeAware onClick={handle}>提交</Button>
            </div>
        </div>
    );
}
