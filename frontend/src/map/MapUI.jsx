import React, { useState, useRef, useEffect } from 'react';
import Tooltip from '../components/Tooltip';
import Button from '../components/Button';
import ManagePanel from '../components/ManagePanel';
import AddForm from './AddForm';
import PlaceDetailPanel from './PlaceDetailPanel';
import useDarkMode from '../utils/useDarkMode';
import { useSearchPanel } from './useSearchPanel';
import ScrollableView from '../components/ScrollableView';
import { fetchFavorites } from './api';

export default function MapUI(props) {
    const {
        places,
        mapRef,
        userLocationMarkerRef,
        backendUrl,
        token,
        containerRef,
        searchTerm,
        setSearchTerm,
        clearSearch,
        searchServer,
        onSelectSuggestion,
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
        onOpenDinnerCreate,
        onOpenDinners,
        popupPoint,
        selectedPlace,
        getLastModifierText,
        openManagePanel,
        openCreateFromPoi,
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
        addingPrefill,
        onAddCancel,
        onAddSubmit,
        favoriteIds,
        favoriteLoading,
        onToggleFavorite,
        isAuthenticated
    } = props;

    const [searchOpen, setSearchOpen] = useState(false);
    const [detailOpen, setDetailOpen] = useState(false);
    const [favPageOpen, setFavPageOpen] = useState(false);
    const [favItems, setFavItems] = useState([]);
    const [favLoading, setFavLoading] = useState(false);
    const [favError, setFavError] = useState('');
    const inputRef = useRef(null);
    const dark = useDarkMode();

    const { results: spResults, loading: spLoading } = useSearchPanel(searchTerm, mapRef, backendUrl, mapReady, userLocationMarkerRef, places);

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

    // Load favorites when panel opens
    useEffect(() => {
        if (!favPageOpen) return;
        if (!isAuthenticated || !token) return;
        let active = true;
        setFavLoading(true);
        setFavError('');
        (async () => {
            try {
                const rows = await fetchFavorites(backendUrl, token);
                if (active) setFavItems(rows || []);
            } catch (e) {
                if (active) setFavError('加载收藏失败：' + (e.message || e));
            } finally {
                if (active) setFavLoading(false);
            }
        })();
        return () => { active = false; };
    }, [favPageOpen, isAuthenticated, token, backendUrl]);

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

    const handleSelectSpItem = (item) => {
        setSearchTerm(item.name || item.address);
        setSearchOpen(false);
        if (onSelectSuggestion) {
            onSelectSuggestion(item);
        }
        if (mapRef?.current && item.longitude && item.latitude) {
            mapRef.current.setCenter([item.longitude, item.latitude]);
            mapRef.current.setZoom(16);
        }
    };

    const renderSpSection = (title, items, hasMore, onMore) => {
        if (!items || items.length === 0) return null;
        return (
            <div style={{ marginBottom: 12 }}>
                <div style={{ padding: '4px 12px', fontSize: 12, color: dark ? '#9ca3af' : '#6b7280', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{title}</span>
                    {hasMore && onMore && (
                        <span onClick={onMore} style={{ cursor: 'pointer', color: customThemeColor }}>查看更多</span>
                    )}
                </div>
                {items.map(item => (
                    <div
                        key={item.id}
                        onClick={() => handleSelectSpItem(item)}
                        style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            borderBottom: `1px solid ${dark ? '#1f2937' : '#f3f4f6'}`,
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = dark ? '#1f2937' : '#f9fafb'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <span style={{ fontSize: 14, color: dark ? '#f3f4f6' : '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <span style={{ fontSize: 12, color: dark ? '#9ca3af' : '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1, paddingRight: 8 }}>
                                {item.address || item.category || item.description || ''}
                            </span>
                            <span style={{ fontSize: 11, color: dark ? '#6b7280' : '#9ca3af', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                距离: {item.dist < 1000 ? `${Math.round(item.dist)}米` : `${(item.dist / 1000).toFixed(1)}公里`}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        );
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

                    {searchOpen && searchTerm && (spLoading || spResults) && (
                        <ScrollableView style={{
                            position: 'absolute',
                            top: 48,
                            right: 0,
                            width: 320,
                            maxHeight: '60vh',
                            background: dark ? '#0b1220' : '#fff',
                            borderRadius: 8,
                            boxShadow: searchOpen ? `0 4px 12px ${hexToRgba(customThemeColor, 0.2)}` : 'none',
                            border: dark ? '1px solid rgba(255,255,255,0.06)' : `1px solid ${hexToRgba(customThemeColor, 0.5)}`,
                            zIndex: 2002,
                            display: 'flex',
                            flexDirection: 'column',
                            color: dark ? '#e5e7eb' : '#1f2937'
                        }}>
                            {spLoading && !spResults ? (
                                <div style={{ padding: 12, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>加载中...</div>
                            ) : (
                                <>
                                    {renderSpSection('标记点结果', spResults?.markedInView, spResults?.hasMoreMarkedInView, () => searchServer({ q: searchTerm }))}
                                    {renderSpSection('非标记点结果', spResults?.unmarkedInView, spResults?.hasMoreUnmarkedInView, () => {
                                        if (mapRef?.current && spResults?.unmarkedInView?.[0]) {
                                            mapRef.current.setCenter([spResults.unmarkedInView[0].longitude, spResults.unmarkedInView[0].latitude]);
                                        }
                                        setSearchOpen(false);
                                    })}
                                    {renderSpSection('其他匹配结果', spResults?.others, false, null)}
                                    {(!spResults?.markedInView?.length && !spResults?.unmarkedInView?.length && !spResults?.others?.length) && (
                                        <div style={{ padding: 12, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>未找到匹配的结果</div>
                                    )}
                                </>
                            )}
                        </ScrollableView>
                    )}

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

            <div style={{ position: "absolute", left: 16, bottom: 32, zIndex: 2000 }}>
                <Tooltip text={authPending ? '正在验证登录状态，请稍候再试' : '发起聚餐'} placement="top">
                    <div style={{ display: "inline-block" }}>
                        <Button
                            onClick={() => {
                                if (typeof onOpenDinners === 'function') {
                                    onOpenDinners();
                                    return;
                                }
                                if (typeof onOpenDinnerCreate === 'function') onOpenDinnerCreate();
                            }}
                            disabled={!mapReady || authPending}
                            aria-label="发起聚餐"
                            style={{
                                width: 64,
                                height: 64,
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
                            <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 36 }}>
                                flatware
                            </span>
                        </Button>
                    </div>
                </Tooltip>
            </div>

            <div style={{ position: "absolute", right: 8, bottom: 8, zIndex: 2000 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                    <Tooltip text={authPending ? '正在验证登录状态，请稍候再试' : (favPageOpen ? '关闭收藏夹' : '展开收藏夹')} placement="top">
                        <div style={{ display: "inline-block" }}>
                            <Button
                                onClick={() => setFavPageOpen(v => !v)}
                                disabled={!mapReady}
                                aria-label="展开收藏夹"
                                style={{
                                    width: 44,
                                    height: 44,
                                    padding: 0,
                                    borderRadius: '50%',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: favPageOpen ? '#089938' : customThemeColor,
                                    color: '#fff',
                                    border: 'none',
                                    transition: 'background 180ms ease, transform 220ms ease',
                                    cursor: (!mapReady || authPending) ? 'not-allowed' : 'pointer',
                                    opacity: (!mapReady || authPending) ? 0.6 : 1
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 30 }}>heart</span>
                            </Button>
                        </div>
                    </Tooltip>

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

                    <div style={{ padding: "4px 8px", background: "rgba(0,0,0,0.5)", color: "#fff", borderRadius: "12px", fontSize: "12px", pointerEvents: "none", userSelect: "none" }}>
                        v1.2.3beta
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

                        <div style={{ marginTop: 8, textAlign: "right" }}>
                            {/* 评论功能暂不开放，待敏感词机制完善后再开放 */}
                            { /*<Tooltip text="在这里留下你的评论">
                                <Button onClick={openCommentPanel} style={{ background: 'transparent', border: dark ? '1px solid rgba(255,255,255,0.06)' : undefined, color: dark ? '#e5e7eb' : undefined, padding: '6px 10px', borderRadius: 4 }}>评论</Button>
                            </Tooltip>
                            <span style={{ padding: 4 }}></span> */ }
                            {selectedPlace.isMarked !== false && (
                                <>
                                    <Tooltip text={favoriteIds && favoriteIds.has(selectedPlace.id) ? '取消收藏' : (isAuthenticated ? '收藏此地点' : '登录后可收藏')}>
                                        <Button
                                            onClick={() => onToggleFavorite && onToggleFavorite(selectedPlace)}
                                            disabled={favoriteLoading}
                                            style={{ background: 'transparent', border: dark ? '1px solid rgba(255,255,255,0.06)' : undefined, color: favoriteIds && favoriteIds.has(selectedPlace.id) ? '#f5220b' : (dark ? '#e5e7eb' : undefined), padding: '6px 10px', borderRadius: 4, lineHeight: 1 }}
                                        >
                                            <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 14 }}>
                                                {favoriteIds && favoriteIds.has(selectedPlace.id) ? 'heart_minus' : 'heart_plus'}
                                            </span>
                                        </Button>
                                    </Tooltip>
                                    <span style={{ padding: 4 }}></span>
                                </>
                            )}
                            <Tooltip text={selectedPlace.isMarked === false ? '创建此地点' : '管理此地点'}>
                                {selectedPlace.isMarked === false ? (
                                    <Button onClick={openCreateFromPoi} style={{ background: 'transparent', border: dark ? '1px solid rgba(255,255,255,0.06)' : undefined, color: dark ? '#e5e7eb' : undefined, padding: '6px 10px', borderRadius: 4 }}>创建</Button>
                                ) : (
                                    <Button onClick={openManagePanel} style={{ background: 'transparent', border: dark ? '1px solid rgba(255,255,255,0.06)' : undefined, color: dark ? '#e5e7eb' : undefined, padding: '6px 10px', borderRadius: 4 }}>管理</Button>
                                )}
                            </Tooltip>
                            <span style={{ padding: 4 }}></span>
                            <Tooltip text="查看详情与图片">
                                <Button onClick={() => setDetailOpen(true)} style={{ background: 'transparent', border: dark ? '1px solid rgba(255,255,255,0.06)' : undefined, color: dark ? '#e5e7eb' : undefined, padding: '6px 10px', borderRadius: 4 }}>详情</Button>
                            </Tooltip>
                        </div>
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
                    <AddForm backendUrl={backendUrl} token={token} defaultPos={addingPos} onCancel={onAddCancel} onSubmit={onAddSubmit} defaultName={addingPrefill?.name} defaultCategory={addingPrefill?.category} defaultDescription={addingPrefill?.description} />
                </div>
            )}

            {detailOpen && selectedPlace && (
                <PlaceDetailPanel place={selectedPlace} onClose={() => setDetailOpen(false)} />
            )}

            {favPageOpen && (
                <div style={{
                    position: 'absolute', right: 60, bottom: 8,
                    width: 300, maxHeight: '60vh',
                    background: dark ? '#0f172a' : '#fff',
                    color: dark ? '#f8fafc' : '#333',
                    borderRadius: 8,
                    boxShadow: dark ? '0 4px 24px rgba(0,0,0,0.6)' : '0 4px 24px rgba(0,0,0,0.2)',
                    display: 'flex', flexDirection: 'column',
                    zIndex: 5000
                }}>
                    <div style={{
                        padding: '12px 16px',
                        borderBottom: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        flexShrink: 0
                    }}>
                        <h3 style={{ margin: 0, fontSize: 16, color: dark ? '#f8fafc' : '#111827' }}>我的收藏</h3>
                        <Button
                            onClick={() => setFavPageOpen(false)}
                            style={{ padding: '2px 8px', background: 'transparent', border: 'none', color: dark ? '#e5e7eb' : '#374151', fontSize: 18, lineHeight: 1, cursor: 'pointer' }}
                        >×</Button>
                    </div>

                    <ScrollableView style={{ flex: 1 }}>
                        {!isAuthenticated ? (
                            <div style={{ padding: 16, textAlign: 'center', color: dark ? '#9ca3af' : '#6b7280', fontSize: 13 }}>
                                请登录后查看收藏
                            </div>
                        ) : favLoading ? (
                            <div style={{ padding: 16, textAlign: 'center', color: dark ? '#9ca3af' : '#6b7280', fontSize: 13 }}>
                                加载中...
                            </div>
                        ) : favError ? (
                            <div style={{ padding: 16, textAlign: 'center', color: '#ef4444', fontSize: 13 }}>
                                {favError}
                            </div>
                        ) : favItems.length === 0 ? (
                            <div style={{ padding: 16, textAlign: 'center', color: dark ? '#9ca3af' : '#6b7280', fontSize: 13 }}>
                                暂无收藏地点
                            </div>
                        ) : (
                            favItems.map(item => (
                                <div
                                    key={item.place_id}
                                    onClick={() => {
                                        if (item.longitude && item.latitude && mapRef?.current) {
                                            mapRef.current.setCenter([item.longitude, item.latitude]);
                                            mapRef.current.setZoom(16);
                                        }
                                        setFavPageOpen(false);
                                    }}
                                    style={{
                                        padding: '10px 16px',
                                        cursor: (item.longitude && item.latitude) ? 'pointer' : 'default',
                                        borderBottom: `1px solid ${dark ? '#1f2937' : '#f3f4f6'}`,
                                        display: 'flex',
                                        flexDirection: 'column'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = dark ? '#1f2937' : '#f9fafb'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <span style={{ fontSize: 14, color: dark ? '#f3f4f6' : '#111827', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {item.name || `地点 #${item.place_id}`}
                                    </span>
                                    {item.category && (
                                        <span style={{ fontSize: 12, color: dark ? '#9ca3af' : '#6b7280', marginTop: 2 }}>{item.category}</span>
                                    )}
                                    {(!item.longitude || !item.latitude) && (
                                        <span style={{ fontSize: 11, color: '#f59e0b', marginTop: 2 }}>坐标缺失，无法定位</span>
                                    )}
                                </div>
                            ))
                        )}
                    </ScrollableView>
                </div>
            )}
        </>
    );
}
