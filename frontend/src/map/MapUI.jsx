import React, { useState, useRef, useEffect } from 'react';
import Tooltip from '../components/Tooltip';
import Button from '../components/Button';
import ManagePanel from './ManagePanel';
import AddForm from './AddForm';
import PlaceDetailPanel from './PlaceDetailPanel';
import useDarkMode from '../utils/useDarkMode';

export default function MapUI(props) {
    const {
        backendUrl,
        token,
        containerRef,
        searchTerm,
        setSearchTerm,
        clearSearch,
        searchServer,
        mapReady,
        searching,
        tipText,
        customThemeColor,
        authPending,
        handleLocateMe,
        locating,
        addMode,
        handleToggleAddMode,
        addPlaceTipText,
        popupPoint,
        selectedPlace,
        getLastModifierText,
        openManagePanel,
        openCommentPanel,
        closePopup,
        manageOpen,
        manageEdit,
        setManageEdit,
        manageSubmitting,
        manageMessage,
        canDirectManage,
        onManageClose,
        onManageSave,
        onManageDelete,
        onManageSubmitRequest,
        addingPos,
        onAddCancel,
        onAddSubmit
    } = props;

    const [searchOpen, setSearchOpen] = useState(false);
    const [detailOpen, setDetailOpen] = useState(false);
    const inputRef = useRef(null);
    const dark = useDarkMode();

    // Close detail panel if popup closes
    useEffect(() => {
        if (!selectedPlace) setDetailOpen(false);
    }, [selectedPlace]);

    useEffect(() => {
        if (!searchOpen) return;
        const onKey = (e) => {
            if (e.key === 'Escape') setSearchOpen(false);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [searchOpen]);

    const hexToRgba = (hex, a = 1) => {
        try {
            let h = (hex || '').replace('#', '');
            if (h.length === 3) h = h.split('').map(c => c + c).join('');
            const bigint = parseInt(h, 16);
            const r = (bigint >> 16) & 255;
            const g = (bigint >> 8) & 255;
            const b = bigint & 255;
            return `rgba(${r},${g},${b},${a})`;
        } catch (e) {
            return `rgba(0,0,0,${a})`;
        }
    };

    const handleSearchButtonClick = () => {
        if (!searchOpen) {
            setSearchOpen(true);
            setTimeout(() => inputRef.current && inputRef.current.focus(), 180);
            return;
        }
        if (!searchTerm || !searchTerm.trim()) {
            setSearchOpen(false);
            return;
        }
        searchServer({ q: searchTerm });
    };

    return (
        <>
            <div ref={containerRef} id="map" style={{ width: "100%", height: "100%", position: "relative" }}></div>

            <div style={{ position: "absolute", right: 8, top: 8, zIndex: 2000 }}>
                {/* 灰色遮罩，弹出搜索框时显示（位于控件下面） */}
                {searchOpen && (
                    <div onClick={() => setSearchOpen(false)} style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.2)', zIndex: 1995 }} />
                )}

                <div style={{ position: 'relative', width: 320, height: 44, zIndex: 2001 }}>
                    <input
                        ref={inputRef}
                        placeholder="搜索关键词（例如：火锅/店名）"
                        value={searchTerm}
                        onChange={(e) => {
                            const v = e.target.value;
                            setSearchTerm(v);
                            if (!v || !v.trim()) {
                                clearSearch();
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                if (searchTerm && searchTerm.trim()) searchServer({ q: searchTerm });
                            }
                        }}
                        disabled={!mapReady || searching}
                        style={{
                            position: 'absolute',
                            right: 52,
                            top: 0,
                            height: 44,
                            boxSizing: 'border-box',
                            padding: '6px 12px',
                            borderRadius: 22,
                            border: dark ? '2px solid rgba(255,255,255,0.06)' : `2px solid ${customThemeColor}`,
                            background: dark ? '#0b1220' : '#fff',
                            color: dark ? '#e5e7eb' : 'inherit',
                            outline: 'none',
                            transformOrigin: 'right center',
                            transform: searchOpen ? 'scaleX(1)' : 'scaleX(0)',
                            transition: 'transform 240ms cubic-bezier(.2,.8,.2,1), opacity 180ms ease, box-shadow 200ms ease',
                            opacity: searchOpen ? 1 : 0,
                            width: 220,
                            pointerEvents: searchOpen ? 'auto' : 'none',
                            boxShadow: searchOpen ? `0 4px 12px ${hexToRgba(customThemeColor, 0.2)}, 0 0 8px ${hexToRgba(customThemeColor, 0.25)}` : 'none',
                            zIndex: 2002
                        }}
                    />

                    <div style={{ position: 'absolute', right: 0, top: 0 }}>
                        <Tooltip text={tipText}>
                            <Button
                                onClick={handleSearchButtonClick}
                                disabled={!mapReady || searching}
                                style={{
                                    width: 44,
                                    height: 44,
                                    padding: 0,
                                    borderRadius: '50%',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: customThemeColor,
                                    color: '#fff',
                                    border: 'none',
                                    boxShadow: '0 4px 12px rgba(0,47,167,0.2)',
                                    transition: 'background 180ms ease, transform 220ms ease',
                                    cursor: (!mapReady || authPending) ? 'not-allowed' : 'pointer',
                                    opacity: (!mapReady || authPending) ? 0.6 : 1
                                }}
                            >
                                {searching ? (
                                    <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 36 }}>progress_activity</span>
                                ) : (
                                    <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 32 }}>search</span>
                                )}
                            </Button>
                        </Tooltip>
                    </div>
                </div>
            </div>

            <div style={{ position: "absolute", right: 8, bottom: 8, zIndex: 2000 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                    <Tooltip text={authPending ? '正在验证登录状态，请稍候再试' : '定位/我的位置'} placement="top">
                        <div style={{ display: "inline-block" }}>
                            <Button
                                onClick={handleLocateMe}
                                disabled={!mapReady || locating}
                                aria-label="点击获取当前位置并添加标记点"
                                style={{
                                    width: 44,
                                    height: 44,
                                    padding: 0,
                                    borderRadius: '50%',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: locating ? '#089938' : customThemeColor,
                                    color: '#fff',
                                    border: 'none',
                                    boxShadow: addMode ? '0 4px 12px rgba(224,36,36,0.2)' : '0 4px 12px rgba(0,47,167,0.2)',
                                    transition: 'background 180ms ease, transform 220ms ease',
                                    cursor: (!mapReady || authPending) ? 'not-allowed' : 'pointer',
                                    opacity: (!mapReady || authPending) ? 0.6 : 1
                                }}
                            >
                                {locating ? (
                                    <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 30 }}>my_location</span>
                                ) : (
                                    <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 30 }}>location_searching</span>
                                )}
                            </Button>
                        </div>
                    </Tooltip>

                    <div style={{ display: "inline-block" }}>
                        <Tooltip text={addPlaceTipText} placement="top">
                            <div style={{ display: "inline-block" }}>
                                <Button
                                    onClick={handleToggleAddMode}
                                    disabled={!mapReady || authPending}
                                    aria-label={addPlaceTipText}
                                    style={{
                                        width: 44,
                                        height: 44,
                                        padding: 0,
                                        borderRadius: '50%',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: addMode ? '#e02424' : customThemeColor,
                                        color: '#fff',
                                        border: 'none',
                                        boxShadow: addMode ? '0 4px 12px rgba(224,36,36,0.2)' : '0 4px 12px rgba(0,47,167,0.2)',
                                        transition: 'background 180ms ease, transform 220ms ease',
                                        cursor: (!mapReady || authPending) ? 'not-allowed' : 'pointer',
                                        opacity: (!mapReady || authPending) ? 0.6 : 1
                                    }}
                                >
                                    <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 36, transform: addMode ? 'rotate(-45deg)' : 'rotate(0deg)', transition: 'transform 220ms ease' }}>add</span>
                                </Button>
                            </div>
                        </Tooltip>
                    </div>
                </div>
            </div>

            {selectedPlace && popupPoint && (
                <div
                    style={{
                        position: "absolute",
                        left: popupPoint.x,
                        top: popupPoint.y,
                        transform: "translate(-50%, -100%)",
                        zIndex: 4000,
                        pointerEvents: "auto"
                    }}
                >
                    <div style={{ background: dark ? '#0b1220' : '#fff', padding: 10, borderRadius: 6, boxShadow: dark ? "0 6px 24px rgba(0,0,0,0.6)" : "0 2px 12px rgba(0,0,0,0.25)", minWidth: 200 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <strong style={{ fontSize: 14, color: dark ? '#e5e7eb' : undefined }}>{selectedPlace.name}</strong>
                            <Button onClick={closePopup} style={{ padding: "2px 8px", borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", fontSize: 18, lineHeight: 1, color: dark ? '#e5e7eb' : undefined }} title="关闭">×</Button>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 13, color: dark ? '#e5e7eb' : undefined }}>{selectedPlace.description || ""}</div>
                        <div style={{ marginTop: 6, color: dark ? '#9ca3af' : '#666', fontSize: 12 }}>分类: {selectedPlace.category || "-"}</div>

                        <div style={{ marginTop: 8, color: dark ? '#9ca3af' : '#888', fontSize: 12 }}>
                            最近修改：{getLastModifierText(selectedPlace)}
                        </div>

                        {/* 评论功能暂不开放，待敏感词机制完善后再开放 */}
                        {/*<div style={{ marginTop: 8, textAlign: "right" }}>
                            <Tooltip text="在这里留下你的评论">
                                <Button onClick={openCommentPanel} style={{ background: 'transparent', border: dark ? '1px solid rgba(255,255,255,0.06)' : undefined, color: dark ? '#e5e7eb' : undefined, padding: '6px 10px', borderRadius: 4 }}>评论</Button>
                            </Tooltip>
                            <span style={{ padding: 4 }}></span>
                            <Tooltip text="管理此地点">
                                <Button onClick={openManagePanel} style={{ background: 'transparent', border: dark ? '1px solid rgba(255,255,255,0.06)' : undefined, color: dark ? '#e5e7eb' : undefined, padding: '6px 10px', borderRadius: 4 }}>管理</Button>
                            </Tooltip>
                            <span style={{ padding: 4 }}></span>
                            <Tooltip text="查看详情与图片">
                                <Button onClick={() => setDetailOpen(true)} style={{ background: 'transparent', border: dark ? '1px solid rgba(255,255,255,0.06)' : undefined, color: dark ? '#e5e7eb' : undefined, padding: '6px 10px', borderRadius: 4 }}>详情</Button>
                            </Tooltip>
                        </div>*/}
                    </div>
                </div>
            )}

            {manageOpen && selectedPlace && (
                <ManagePanel
                    backendUrl={backendUrl}
                    token={token}
                    selectedPlace={selectedPlace}
                    manageEdit={manageEdit}
                    setManageEdit={setManageEdit}
                    manageSubmitting={manageSubmitting}
                    manageMessage={manageMessage}
                    canDirectManage={canDirectManage}
                    onClose={onManageClose}
                    onSave={onManageSave}
                    onDelete={onManageDelete}
                    onSubmitRequest={onManageSubmitRequest}
                />
            )}

            {addingPos && (
                <div style={{
                    position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
                    background: dark ? '#0b1220' : '#fff', padding: 12, zIndex: 3000, borderRadius: 6, boxShadow: dark ? "0 6px 24px rgba(0,0,0,0.6)" : "0 2px 12px rgba(0,0,0,0.3)"
                }}>
                    <h4 style={{ margin: '0 0 12px 0', color: dark ? '#e5e7eb' : 'inherit' }}>添加地点</h4>
                    <AddForm backendUrl={backendUrl} token={token} defaultPos={addingPos} onCancel={onAddCancel} onSubmit={onAddSubmit} />
                </div>
            )}

            {detailOpen && selectedPlace && (
                <PlaceDetailPanel place={selectedPlace} onClose={() => setDetailOpen(false)} />
            )}
        </>
    );
}
