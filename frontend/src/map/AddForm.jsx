import React, { useState } from 'react';
import Button from '../components/Button';
import TextInput from '../components/TextInput';
import { useTips } from '../components/Tips';
import useDarkMode from '../utils/useDarkMode';

export default function AddForm({ defaultPos, onCancel, onSubmit }) {
    const [name, setName] = useState("");
    const [category, setCategory] = useState("");
    const [description, setDescription] = useState("");
    const showTip = useTips();
    const dark = useDarkMode();

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
            <div><strong style={{ color: dark ? '#e5e7eb' : undefined }}>经纬度：</strong><span style={{ color: dark ? '#e5e7eb' : undefined }}>{defaultPos[1].toFixed(6)}, {defaultPos[0].toFixed(6)}</span></div>
            <div style={{ marginTop: 8 }}>
                <TextInput placeholder="店名" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ marginTop: 8 }}>
                <TextInput placeholder="分类（例如：火锅）" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: "100%" }} />
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
