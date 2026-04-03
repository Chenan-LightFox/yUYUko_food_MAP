import React, { useState } from 'react';
import Button from '../components/Button';
import { useTips } from '../components/Tips';

export default function AddForm({ defaultPos, onCancel, onSubmit }) {
    const [name, setName] = useState("");
    const [category, setCategory] = useState("");
    const [description, setDescription] = useState("");
    const showTip = useTips();

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
        <div style={{ width: 320 }}>
            <div><strong>经纬度：</strong>{defaultPos[1].toFixed(6)}, {defaultPos[0].toFixed(6)}</div>
            <div style={{ marginTop: 8 }}>
                <input placeholder="店名" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ marginTop: 8 }}>
                <input placeholder="分类（例如：火锅）" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ marginTop: 8 }}>
                <textarea placeholder="描述" value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ marginTop: 8, textAlign: "right" }}>
                <Button onClick={onCancel} style={{ marginRight: 8 }}>取消</Button>
                <Button onClick={handle}>提交</Button>
            </div>
        </div>
    );
}
