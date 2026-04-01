import React from 'react';
import Tooltip from '../components/Tooltip';
import Button from '../components/Button';
import ManagePanel from './ManagePanel';
import AddForm from './AddForm';

export default function MapUI(props) {
    const {
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

    return (
        <>
            <div ref={containerRef} id="map" style={{ width: "100%", height: "100%", position: "relative" }}></div>

            <div style={{ position: "absolute", right: 8, top: 8, zIndex: 2000 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                        placeholder="搜索关键词（例如：火锅/店名）"
                        value={searchTerm}
                        onChange={(e) => {
                            const v = e.target.value;
                            setSearchTerm(v);
                            if (!v || !v.trim()) {
                                clearSearch();
                            }
                        }}
                        style={{ width: 220, padding: "6px 8px" }}
                        disabled={!mapReady || searching}
                    />
                    <Tooltip text={tipText}>
                        <Button
                            onClick={() => searchServer({ q: searchTerm })}
                            disabled={!mapReady || searching || !searchTerm}
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
                    <div style={{ background: "#fff", padding: 10, borderRadius: 6, boxShadow: "0 2px 12px rgba(0,0,0,0.25)", minWidth: 200 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <strong style={{ fontSize: 14 }}>{selectedPlace.name}</strong>
                            <Button onClick={closePopup} style={{ padding: "2px 8px", borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", fontSize: 18, lineHeight: 1 }} title="关闭">×</Button>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 13 }}>{selectedPlace.description || ""}</div>
                        <div style={{ marginTop: 6, color: "#666", fontSize: 12 }}>分类: {selectedPlace.category || "-"}</div>

                        <div style={{ marginTop: 8, color: "#888", fontSize: 12 }}>
                            最近修改：{getLastModifierText(selectedPlace)}
                        </div>

                        <div style={{ marginTop: 8, textAlign: "right" }}>
                            <Tooltip text="在这里留下你的评论">
                                <Button onClick={openCommentPanel}>评论</Button>
                            </Tooltip>
                            <span style={{ padding: 4 }}></span>
                            <Tooltip text="管理此地点">
                                <Button onClick={openManagePanel}>管理</Button>
                            </Tooltip>
                        </div>
                    </div>
                </div>
            )}

            {manageOpen && selectedPlace && (
                <ManagePanel
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
                    background: "#fff", padding: 12, zIndex: 3000, borderRadius: 6, boxShadow: "0 2px 12px rgba(0,0,0,0.3)"
                }}>
                    <h4>添加地点</h4>
                    <AddForm defaultPos={addingPos} onCancel={onAddCancel} onSubmit={onAddSubmit} />
                </div>
            )}
        </>
    );
}
