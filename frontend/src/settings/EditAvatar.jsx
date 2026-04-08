import React, { useState, useRef, useEffect, useCallback } from 'react';
import Button from '../components/Button';
import useDarkMode from '../utils/useDarkMode';
import defaultAvatar from '../img/default.png';
import { TipsContext } from '../components/Tips';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../utils/cropImage';
import PageTemplate from '../components/PageTemplate';

export default function EditAvatar({ user, onBack, backendUrl, token, onUpdateUser }) {
    const dark = useDarkMode();
    const [file, setFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const fileInputRef = useRef(null);
    const { showTip } = React.useContext(TipsContext);

    // Cropper state
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

    const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    useEffect(() => {
        if (file) {
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
            return () => URL.revokeObjectURL(url);
        } else {
            setPreviewUrl('');
        }
    }, [file]);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            setError('');
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!file || !previewUrl || !croppedAreaPixels) {
            setError('请选择图片并调整裁剪区域');
            return;
        }
        setUploading(true);
        setError('');

        try {
            const croppedImageBlob = await getCroppedImg(previewUrl, croppedAreaPixels, 0);

            const formData = new FormData();
            formData.append('avatar', croppedImageBlob, 'avatar.jpg');

            const res = await fetch(`${backendUrl}/users/me/avatar`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`
                },
                body: formData
            });

            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data && data.error ? data.error : `上传失败状态码：${res.status}`);
            }

            const data = await res.json();
            if (data.success && data.user) {
                onUpdateUser(data.user, token);
                showTip('头像更新成功');
                onBack();
            } else {
                throw new Error('数据格式错误');
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <PageTemplate breadcrumb={[{ label: '设置', onClick: onBack }, { label: '修改头像' }]} onBack={onBack}>
            <div style={{ maxWidth: 500, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                {previewUrl ? (
                    <div style={{ position: 'relative', width: '100%', height: 300, background: '#333', borderRadius: 8, overflow: 'hidden' }}>
                        <Cropper
                            image={previewUrl}
                            crop={crop}
                            zoom={zoom}
                            aspect={1}
                            cropShape="round"
                            showGrid={false}
                            onCropChange={setCrop}
                            onZoomChange={setZoom}
                            onCropComplete={onCropComplete}
                        />
                    </div>
                ) : (
                    <div style={{
                        width: 150, height: 150, borderRadius: '50%', background: dark ? '#1f2937' : '#f3f4f6',
                        display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
                        border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`
                    }}>
                        {user && user.has_avatar ? (
                            <img src={`${backendUrl}/users/${user.id}/avatar?t=${Date.now()}`} alt="Current Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <img src={defaultAvatar} alt="Default Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        )}
                    </div>
                )}

                {previewUrl && (
                    <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 14 }}>缩放:</span>
                        <input
                            type="range"
                            min={1}
                            max={3}
                            step={0.1}
                            value={zoom}
                            onChange={(e) => setZoom(Number(e.target.value))}
                            style={{ flex: 1 }}
                        />
                    </div>
                )}
                <div>
                    <input
                        type="file"
                        accept="image/*"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                    />
                    <Button
                        themeAware
                        onClick={() => fileInputRef.current.click()}
                        style={{ padding: '8px 16px', background: dark ? '#374151' : '#e5e7eb', color: dark ? '#f9fafb' : '#374151', border: 'none' }}
                    >
                        选择图片
                    </Button>
                </div>

                {error && <div style={{ color: dark ? '#fda4af' : '#ef4444', fontSize: 14 }}>{error}</div>}

                <div style={{ marginTop: 10, width: '100%' }}>
                    <Button
                        themeAware
                        onClick={handleUpload}
                        disabled={uploading || !file}
                        style={{
                            width: '100%', padding: '12px', background: !file ? (dark ? '#374151' : '#e5e7eb') : '#3b82f6',
                            color: !file ? (dark ? '#9ca3af' : '#9ca3af') : '#fff', border: 'none',
                            fontWeight: 600
                        }}
                    >
                        {uploading ? '上传中...' : '保存更改'}
                    </Button>
                </div>
            </div>
        </PageTemplate>
    );
}