import React, { useState } from 'react';
import Button from '../components/Button';
import TextInput from '../components/TextInput';
import PlaceImageInputs from './PlaceImageInputs';
import { useTips } from '../components/Tips';
import useDarkMode from '../utils/useDarkMode';
import ScrollableView from '../components/ScrollableView';

export default function AddForm({ backendUrl, token, defaultPos, onCancel, onSubmit }) {
    const [name, setName] = useState("");
    const [category, setCategory] = useState("");
    const [showCategoryMenu, setShowCategoryMenu] = useState(false);
    const [description, setDescription] = useState("");
    const [exteriorImages, setExteriorImages] = useState([]);
    const [menuImages, setMenuImages] = useState([]);
    const showTip = useTips();
    const dark = useDarkMode();

    const CATEGORY_DATA = [
        { group: '中餐厅', items: ['上海菜', '东北菜', '中式素菜馆', '中餐厅', '云贵菜', '北京菜', '台湾菜', '四川菜(川菜)', '安徽菜(徽菜)', '山东菜(鲁菜)', '广东菜(粤菜)', '江苏菜', '浙江菜', '清真菜馆', '湖北菜(鄂菜)', '湖南菜(湘菜)', '潮州菜', '火锅店', '福建菜', '西北菜'] },
        { group: '休闲餐饮店', items: ['咖啡厅', '奶茶店', '甜品店', '茶艺馆'] },
        { group: '外国餐厅', items: ['俄国菜', '印度风味', '地中海风格菜品', '墨西哥菜', '德国菜', '意式菜品餐厅', '日本料理', '法式菜品餐厅', '泰国/越南菜品餐厅', '牛扒店', '美式风味', '韩国料理', '其他国家'] },
        { group: '快餐厅', items: ['中式快餐', '西式快餐', '茶餐厅'] },
        { group: '宵夜小吃', items: ['烧烤', '排挡', '街边小摊'] },
        { group: '其他', items: ['其他'] },
        { group: '避雷', items: ['避雷'] }
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
            exterior_images: exteriorImages.filter(Boolean),
            menu_images: menuImages.filter(Boolean),
            longitude: defaultPos[0],
            latitude: defaultPos[1]
        };
        onSubmit(payload);
    };

    return (
        <div style={{ width: 320 }}>
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
                    <ScrollableView style={{
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
                                        let selBg = '#3b82f6';
                                        let selBorder = '#2563eb';
                                        let selColor = '#fff';
                                        if (group.group === '休闲餐饮店') {
                                            selBg = '#4ade80'; // 浅绿色
                                            selBorder = '#22c55e';
                                        } else if (group.group === '宵夜小吃') {
                                            selBg = '#eab308'; // 亮黄色
                                            selBorder = '#ca8a04';
                                        } else if (group.group === '避雷') {
                                            selBg = '#ef4444'; // 红色
                                            selBorder = '#dc2626';
                                        }
                                        return (
                                            <span
                                                key={opt}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleCategory(opt);
                                                }}
                                                style={{
                                                    padding: '4px 8px', fontSize: 12, borderRadius: 12, cursor: 'pointer',
                                                    background: isSelected ? selBg : (dark ? '#334155' : '#f1f5f9'),
                                                    color: isSelected ? selColor : (dark ? '#e2e8f0' : '#333'),
                                                    border: `1px solid ${isSelected ? selBorder : (dark ? '#475569' : '#cbd5e1')}`
                                                }}
                                            >
                                                {opt}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </ScrollableView>
                )}
            </div>
            <div style={{ marginTop: 8 }}>
                <TextInput placeholder="描述" value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ marginTop: 8, maxHeight: "200px", overflowY: "auto" }} className="custom-scrollbar">
                <PlaceImageInputs backendUrl={backendUrl} token={token} images={exteriorImages} setImages={setExteriorImages} label="外观/招牌图片" />
                <PlaceImageInputs backendUrl={backendUrl} token={token} images={menuImages} setImages={setMenuImages} label="菜单图片" />
            </div>
            <div style={{ marginTop: 8, textAlign: "right" }}>
                <Button themeAware onClick={onCancel} style={{ marginRight: 8 }}>取消</Button>
                <Button themeAware onClick={handle}>提交</Button>
            </div>
        </div>
    );
}
