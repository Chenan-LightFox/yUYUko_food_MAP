import React, { useRef, useState } from "react";
import Button from "../components/Button";
import useDarkMode from "../utils/useDarkMode";
import { useTips } from "../components/Tips";

export default function PlaceImageInputs({ backendUrl, token, images, setImages, label }) {
    const fileInputRef = useRef(null);
    const [uploading, setUploading] = useState(false);
    const dark = useDarkMode();
    const showTip = useTips();

    const handleUploadClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);

        try {
            const formData = new FormData();
            formData.append('image', file);

            const res = await fetch(`${backendUrl}/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                if (res.status === 413) {
                    showTip(data.error || '图片过大，最大支持 20MB');
                    return;
                }
                throw new Error(data.error || '上传失败');
            }

            const data = await res.json();

            // 拼接完整URL用于保存，如果后端返回相对路径的话。如果后端返回 /uploads/... 
            const fullUrl = data.url.startsWith('http') ? data.url : `${backendUrl}${data.url}`;
            setImages([...images, fullUrl]);
        } catch (error) {
            showTip(error.message || '图片上传失败');
        } finally {
            setUploading(false);
            e.target.value = ''; // 重置文件输入，以便下次可以选择相同的文件
        }
    };

    const handleRemove = (index) => {
        setImages(images.filter((_, i) => i !== index));
    };

    return (
        <div style={{ marginBottom: "15px" }}>
            <div
                style={{
                    marginBottom: "5px",
                    fontSize: "14px",
                    fontWeight: "bold",
                    color: dark ? "#e5e7eb" : undefined
                }}
            >
                {label}
            </div>

            {images.map((url, i) => (
                <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "8px", alignItems: 'center' }}>
                    <img src={url} alt={`Preview ${i}`} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
                    <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                        {url}
                    </div>
                    <Button variant="danger" onClick={() => handleRemove(i)}>删除</Button>
                </div>
            ))}

            <div>
                <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                />
                <Button variant="secondary" onClick={handleUploadClick} size="small" disabled={uploading}>
                    {uploading ? '上传中...' : '+ 传图 / 拍照'}
                </Button>
            </div>
        </div>
    );
}