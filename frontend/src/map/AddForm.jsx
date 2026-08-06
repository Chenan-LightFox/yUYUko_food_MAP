import React, { useState } from 'react';
import Button from '../components/Button';
import TextInput from '../components/TextInput';
import PlaceImageInputs from './PlaceImageInputs';
import { useTips } from '../components/Tips';
import useDarkMode from '../utils/useDarkMode';
import ScrollableView from '../components/ScrollableView';
import CategorySelector from '../components/CategorySelector';

export default function AddForm({ backendUrl, token, defaultPos, defaultName = "", defaultCategory = "", defaultDescription = "", onCancel, onSubmit }) {
    const [name, setName] = useState(defaultName);
    const [category, setCategory] = useState(defaultCategory);
    const [description, setDescription] = useState(defaultDescription);
    const [exteriorImages, setExteriorImages] = useState([]);
    const [menuImages, setMenuImages] = useState([]);
    const [perPersonCost, setPerPersonCost] = useState('');
    const showTip = useTips();
    const dark = useDarkMode();

    const handle = () => {
        if (!name) { showTip("请输入名称"); return; }
        const payload = {
            name,
            category,
            description,
            per_person_cost: perPersonCost ? parseInt(perPersonCost, 10) : null,
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
                <CategorySelector
                    backendUrl={backendUrl}
                    token={token}
                    value={category}
                    onChange={setCategory}
                />
            </div>
            <div style={{ marginTop: 8 }}>
                <TextInput placeholder="描述" value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ marginTop: 8 }}>
                <TextInput
                    placeholder="人均价格（元，可选）"
                    value={perPersonCost}
                    onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || /^[1-9]\d*$/.test(v)) setPerPersonCost(v);
                    }}
                    style={{ width: "100%" }}
                    inputMode="numeric"
                />
            </div>
            <ScrollableView style={{ marginTop: 8, maxHeight: "200px", overflowY: "auto" }}>
                <PlaceImageInputs backendUrl={backendUrl} token={token} images={exteriorImages} setImages={setExteriorImages} label="外观/招牌图片（可选）" />
                <PlaceImageInputs backendUrl={backendUrl} token={token} images={menuImages} setImages={setMenuImages} label="菜单图片（可选）" />
            </ScrollableView>
            <div style={{ marginTop: 8, textAlign: "right" }}>
                <Button themeAware onClick={onCancel} style={{ marginRight: 8 }}>取消</Button>
                <Button themeAware onClick={handle}>提交</Button>
            </div>
        </div>
    );
}
