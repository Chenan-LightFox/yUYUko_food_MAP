import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import Tooltip from '../components/Tooltip';
import Button from '../components/Button';
import ManagePanel from '../components/ManagePanel';
import AddForm from './AddForm';
import PlaceDetailPanel from './PlaceDetailPanel';
import useDarkMode from '../utils/useDarkMode';
import { useSearchPanel } from './useSearchPanel';
import ScrollableView from '../components/ScrollableView';
import Notice from '../components/Notice';
import { fetchFavorites } from './api';

function getPlaceKey(place) {
    if (place?.id !== undefined && place?.id !== null && String(place.id) !== '') {
        return `id:${place.id}`;
    }

    const longitude = Number(place?.longitude);
    const latitude = Number(place?.latitude);
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
        return `coord:${longitude.toFixed(6)},${latitude.toFixed(6)}`;
    }

    return `name:${String(place?.name || place?.address || '').trim()}`;
}

function buildNavigationTargets(place) {
    const latitude = Number(place?.latitude);
    const longitude = Number(place?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];

    const rawLabel = (place?.name || place?.address || '目的地').trim();
    const label = encodeURIComponent(rawLabel);

    return [
        {
            id: 'system-default',
            name: '系统默认地图',
            url: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`,
            mobileOnly: true,
            prefersLocationHref: true
        },
        {
            id: 'apple-maps',
            name: 'Apple 地图',
            url: `http://maps.apple.com/?daddr=${latitude},${longitude}&q=${label}`,
            iosOnly: true,
            prefersLocationHref: true
        },
        {
            id: 'amap',
            name: '高德地图',
            url: `https://uri.amap.com/navigation?to=${longitude},${latitude},${label}&mode=car&src=yUYUko_food_MAP`
        },
        {
            id: 'tencent',
            name: '腾讯地图',
            url: `https://apis.map.qq.com/uri/v1/routeplan?type=drive&tocoord=${latitude},${longitude}&to=${label}&policy=0&referer=yUYUko_food_MAP`
        },
        {
            id: 'google',
            name: 'Google Maps',
            url: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
        }
    ];
}

// ---- 分享工具函数 ----

function buildPlaceShareUrl(place) {
    const id = place?.id;
    if (!id) return '';
    return `${window.location.origin}/p/${id}`;
}

function buildAmapShareUrl(place) {
    const id = place?.id;
    if (!id) return '';
    return `${window.location.origin}/p/${id}?nav=amap`;
}

async function buildPlaceClipboardText(place, backendUrl) {
    const name = place?.name || '未知地点';
    const link = buildPlaceShareUrl(place);

    // 优先使用已有地址，否则通过高德逆地理编码 API 获取详细地址
    let address = place?.address || '';
    if (!address && place?.longitude && place?.latitude) {
        try {
            const lng = place.longitude;
            const lat = place.latitude;
            const key = '51097d0d47c2a1d341cf81b0ab82266d';
            const res = await fetch(`https://restapi.amap.com/v3/geocode/regeo?location=${lng},${lat}&key=${key}&extensions=all`);
            if (res.ok) {
                const data = await res.json();
                if (data?.regeocode?.formatted_address) {
                    address = data.regeocode.formatted_address;
                }
            }
        } catch (e) {
            // 忽略逆地理编码失败
        }
    }

    return `${name}${address ? '\n' + address : ''}\n${link}`;
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        // 降级方案
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try { document.execCommand('copy'); return true; } catch (e2) { return false; }
        finally { document.body.removeChild(textarea); }
    }
}

// ---- ShareOptionButton 组件 ----

function ShareOptionButton({ icon, label, description, onClick, dark }) {
    return (
        React.createElement(Button, {
            onClick,
            style: {
                background: 'transparent',
                border: dark ? '1px solid rgba(255,255,255,0.08)' : '2px solid rgba(0,0,0,0.12)',
                color: dark ? '#e5e7eb' : undefined,
                padding: '10px 12px',
                borderRadius: 6,
                textAlign: 'left',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10
            },
            full: true
        },
            React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 24, flexShrink: 0, marginTop: 2 } }, icon),
            React.createElement('div', { style: { flex: 1 } },
                React.createElement('div', { style: { fontSize: 14, fontWeight: 500 } }, label),
                React.createElement('div', { style: { fontSize: 11, color: dark ? '#9ca3af' : '#6b7280', marginTop: 2 } }, description)
            )
        )
    );
}

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
        searchResetKey,
        searchServer,
        onProgrammaticMapMove,
        onSelectSuggestion,
        mapReady,
        searching,
        tipText,
        customThemeColor,
        customThemeSecondary,
        markerLabels,
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
        isAuthenticated,
        pickerMode,
        pickerContext,
        pickedPlaces,
        onPickPlace,
        onRemovePickedPlace,
        onPickerClose,
        showTip
    } = props;

    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/i.test(ua);
    const isAndroid = /Android/i.test(ua);
    const isMobile = isIOS || isAndroid;

    const navigationTargets = (selectedPlace ? buildNavigationTargets(selectedPlace) : []).filter((item) => {
        if (item.iosOnly && !isIOS) return false;
        if (item.mobileOnly && !isMobile) return false;
        return true;
    });

    const hasNavigationTarget = navigationTargets.length > 0;

    const openNavigationTarget = (target) => {
        if (!target || !target.url) return;

        if (isMobile && target.prefersLocationHref) {
            window.location.href = target.url;
            return;
        }

        window.open(target.url, '_blank', 'noopener,noreferrer');
    };

    const handleNavigate = () => {
        if (!hasNavigationTarget) return;

        setNavPickerOpen(true);
    };

    const [searchOpen, setSearchOpen] = useState(true);
    const [searchResultsVisible, setSearchResultsVisible] = useState(true);
    const [detailOpen, setDetailOpen] = useState(false);
    const [favPageOpen, setFavPageOpen] = useState(false);
    const [pickedPageOpen, setPickedPageOpen] = useState(false);
    const [favItems, setFavItems] = useState([]);
    const [favLoading, setFavLoading] = useState(false);
    const [favError, setFavError] = useState('');
    const [navPickerOpen, setNavPickerOpen] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [isNarrow, setIsNarrow] = useState(() => window.innerWidth <= 500);
    const inputRef = useRef(null);
    const popupRef = useRef(null);
    const searchBarRef = useRef(null);
    const dinnerBtnRef = useRef(null);
    const [popupLayout, setPopupLayout] = useState(null);
    const dark = useDarkMode();
    const hideNonSearchButtons = false;
    const isPosterPicker = pickerMode && pickerContext === 'poster';
    const normalizedPickedPlaces = Array.isArray(pickedPlaces) ? pickedPlaces : [];
    const selectedPlaceAlreadyPicked = !!selectedPlace && normalizedPickedPlaces.some((place) => getPlaceKey(place) === getPlaceKey(selectedPlace));

    useEffect(() => {
        const onResize = () => setIsNarrow(window.innerWidth <= 500);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // 当外部通过 searchResetKey 信号要求关闭搜索建议面板时（如分享链接跳转），
    // 收起下拉建议让搜索框呈现"已提交"的外观
    useEffect(() => {
        if (searchResetKey > 0) {
            setSearchResultsVisible(false);
        }
    }, [searchResetKey]);

    // Detect overlap between search bar and dinner button (wide mode only)
    useLayoutEffect(() => {
        if (isNarrow) return;
        const searchEl = searchBarRef.current;
        const dinnerEl = dinnerBtnRef.current;
        if (!searchEl) return;

        const updatePosition = () => {
            const viewportWidth = window.innerWidth;
            const searchWidth = searchEl.getBoundingClientRect().width;
            if (!searchWidth) return;
            const centeredLeft = (viewportWidth - searchWidth) / 2;

            if (dinnerEl && !pickerMode) {
                const dinnerRect = dinnerEl.getBoundingClientRect();
                const minLeft = dinnerRect.right + 15;
                if (centeredLeft < minLeft) {
                    searchEl.style.left = `${minLeft}px`;
                    searchEl.style.transform = 'none';
                    return;
                }
            }
            searchEl.style.left = '50%';
            searchEl.style.transform = 'translateX(-50%)';
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        return () => window.removeEventListener('resize', updatePosition);
    }, [isNarrow, pickerMode]);

    useEffect(() => {
        if (!selectedPlace) {
            setNavPickerOpen(false);
            setShareOpen(false);
        }
    }, [selectedPlace]);

    const { results: spResults, loading: spLoading } = useSearchPanel(searchTerm, mapRef, backendUrl, mapReady, userLocationMarkerRef, places);

    // Close detail panel if popup closes
    useEffect(() => {
        if (!selectedPlace) setDetailOpen(false);
    }, [selectedPlace]);

    const updatePopupLayout = () => {
        if (!popupPoint || !popupRef.current) return;
        const containerEl = containerRef && containerRef.current;
        const containerWidth = containerEl ? containerEl.clientWidth : window.innerWidth;
        const containerHeight = containerEl ? containerEl.clientHeight : window.innerHeight;
        if (!containerWidth || !containerHeight) return;

        const rect = popupRef.current.getBoundingClientRect();
        const popupWidth = rect.width || popupRef.current.offsetWidth || 0;
        const popupHeight = rect.height || popupRef.current.offsetHeight || 0;
        if (!popupWidth || !popupHeight) return;

        const edgePadding = 12;
        const anchorGap = 10;
        let left = popupPoint.x - popupWidth / 2;
        let top = popupPoint.y - popupHeight - anchorGap;
        let placedAbove = true;

        if (top < edgePadding) {
            top = popupPoint.y + anchorGap;
            placedAbove = false;
        }

        if (left < edgePadding) left = edgePadding;
        if (left + popupWidth > containerWidth - edgePadding) {
            left = Math.max(edgePadding, containerWidth - popupWidth - edgePadding);
        }

        if (top + popupHeight > containerHeight - edgePadding) {
            const altTop = popupPoint.y - popupHeight - anchorGap;
            if (!placedAbove && altTop >= edgePadding) {
                top = altTop;
                placedAbove = true;
            } else {
                top = Math.max(edgePadding, containerHeight - popupHeight - edgePadding);
            }
        }

        const next = { left: Math.round(left), top: Math.round(top) };
        setPopupLayout(prev => (
            prev && prev.left === next.left && prev.top === next.top ? prev : next
        ));
    };

    useLayoutEffect(() => {
        if (!selectedPlace || !popupPoint) {
            setPopupLayout(null);
            return;
        }
        const raf = window.requestAnimationFrame(updatePopupLayout);
        return () => window.cancelAnimationFrame(raf);
    }, [selectedPlace, popupPoint]);

    useEffect(() => {
        if (!selectedPlace || !popupPoint) return;
        const onResize = () => updatePopupLayout();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [selectedPlace, popupPoint]);

    // search bar stays open by default — collapse behaviors removed

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

    const FAVORITE_LOCATION_ZOOM_LEVEL = 16;

    const navigateToPlace = (longitude, latitude) => {
        if (!longitude || !latitude || !mapRef?.current) return;
        if (typeof onProgrammaticMapMove === 'function') {
            onProgrammaticMapMove();
        }
        mapRef.current.setCenter([longitude, latitude]);
        mapRef.current.setZoom(FAVORITE_LOCATION_ZOOM_LEVEL);
    };

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
        if (!searchTerm || !searchTerm.trim()) return;
        setSearchResultsVisible(false);
        searchServer({ q: searchTerm, includeUnmarked: false, autoFit: false });
    };

    const handleClearSearchInput = () => {
        setSearchTerm('');
        setSearchResultsVisible(false);
        clearSearch();
        if (inputRef.current) inputRef.current.focus();
    };

    const handleSelectSpItem = (item) => {
        setSearchTerm(item.name || item.address);
        setSearchResultsVisible(false);
        if (onSelectSuggestion) {
            onSelectSuggestion(item);
        }
        if (mapRef?.current && item.longitude && item.latitude) {
            if (typeof onProgrammaticMapMove === 'function') {
                onProgrammaticMapMove();
            }
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
                        <span onClick={onMore} style={{ cursor: 'pointer', color: customThemeSecondary || customThemeColor }}>查看更多</span>
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

    const handlePickPlace = () => {
        if (!selectedPlace) return;
        if (isPosterPicker && selectedPlaceAlreadyPicked) {
            if (typeof onRemovePickedPlace === 'function') onRemovePickedPlace(selectedPlace);
        } else if (typeof onPickPlace === 'function') {
            onPickPlace(selectedPlace);
        }
        if (typeof closePopup === 'function') closePopup();
    };

    const openDetailPanel = () => {
        setDetailOpen(true);
    };

    const getPopupDescriptionPreview = (place) => {
        const raw = String(place?.description || '').replace(/\s+/g, ' ').trim();
        if (!raw) return { text: '', hasMore: false };
        const limit = 80;
        if (raw.length <= limit) return { text: raw, hasMore: false };
        return { text: `${raw.slice(0, limit).trimEnd()}…`, hasMore: true };
    };

    return (
        <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
            <div ref={containerRef} id="map" style={{ width: "100%", height: "100%", position: "relative" }}></div>

            {/* Marker name labels — rendered as overlay above all marker images */}
            {(markerLabels || []).map((label, idx) => {
                const isThunder = label.category && String(label.category).includes('避雷');
                return (
                    <div
                        key={label.id || idx}
                        style={{
                            position: 'absolute',
                            left: label.x,
                            top: label.y + 2,
                            transform: 'translateX(-50%)',
                            zIndex: 1500,
                            pointerEvents: 'none',
                            background: dark ? 'var(--theme-secondary)' : '#fff9f6',
                            color: dark ? '#e5e7eb' : '#1f2937',
                            fontSize: 12,
                            lineHeight: '16px',
                            padding: '2px 8px 2px 6px',
                            borderRadius: 2,
                            border: '1px solid var(--theme-primary)',
                            borderLeft: isThunder ? '5px solid #dc2626' : '5px solid var(--theme-primary)',
                            whiteSpace: 'nowrap',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.15)'
                        }}
                    >
                        {label.name}
                    </div>
                );
            })}

            {pickerMode && (
                <Notice title={isPosterPicker ? `正在选择海报地点 · 已选 ${normalizedPickedPlaces.length} 个` : '正在选择聚餐地点'} tone="warning" />
            )}

            <div ref={searchBarRef} style={(() => {
                const base = { position: "absolute", bottom: 12, zIndex: 2000 };
                return isNarrow
                    ? { ...base, left: 12, right: 12 }
                    : { ...base, left: '50%', transform: 'translateX(-50%)' };
            })()}>
                <div style={{
                    position: 'relative', height: 44, zIndex: 2001,
                    width: isNarrow ? '100%' : 'min(420px, calc(100vw - 104px))'
                }}>
                    <input
                        ref={inputRef}
                        placeholder="搜索关键词（例如：火锅/店名）"
                        value={searchTerm}
                        onChange={(e) => {
                            const v = e.target.value;
                            setSearchTerm(v);
                            if (!v || !v.trim()) {
                                setSearchResultsVisible(false);
                                clearSearch();
                            } else {
                                setSearchResultsVisible(true);
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                if (searchTerm && searchTerm.trim()) {
                                    setSearchResultsVisible(false);
                                    searchServer({ q: searchTerm, includeUnmarked: false, autoFit: false });
                                }
                            }
                        }}
                        disabled={!mapReady || searching}
                        style={{
                            position: 'absolute',
                            left: 12,
                            top: 0,
                            height: 44,
                            right: 56,
                            boxSizing: 'border-box',
                            padding: '6px 34px 6px 12px',
                            borderRadius: 22,
                            border: dark ? '2px solid rgba(255,255,255,0.06)' : `2px solid ${customThemeColor}`,
                            background: dark ? 'var(--theme-secondary)' : '#fff9f6',
                            color: dark ? '#e5e7eb' : 'inherit',
                            outline: 'none',
                            boxShadow: `0 4px 12px ${hexToRgba(customThemeColor, 0.2)}, 0 0 8px ${hexToRgba(customThemeColor, 0.25)}`,
                            zIndex: 2002
                        }}
                    />

                    {searchTerm && (
                        <Button
                            onClick={handleClearSearchInput}
                            title="清空搜索内容"
                            disabled={!mapReady || searching}
                            style={{
                                position: 'absolute',
                                right: 64,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                width: 20,
                                height: 20,
                                borderRadius: '50%',
                                border: 'none',
                                padding: 0,
                                minWidth: 20,
                                fontSize: 18,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'transparent',
                                color: dark ? '#e5e7eb' : '#4b5563',
                                cursor: (!mapReady || searching) ? 'not-allowed' : 'pointer',
                                opacity: (!mapReady || searching) ? 0.55 : 1,
                                zIndex: 2003
                            }}
                        >
                            ×
                        </Button>
                    )}

                    {searchTerm && searchResultsVisible && (spLoading || spResults) && (
                        <ScrollableView style={{
                            position: 'absolute',
                            bottom: 48,
                            right: 0,
                            width: '100%',
                            maxHeight: '60vh',
                            background: dark ? 'var(--theme-secondary)' : '#fff9f6',
                            borderRadius: 8,
                            boxShadow: `0 4px 12px ${hexToRgba(customThemeColor, 0.2)}`,
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
                        <Tooltip text={tipText} placement="top">
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
                                    color: '#fff9f6',
                                    border: 'none',
                                    boxShadow: `0 4px 12px ${hexToRgba(customThemeColor, 0.2)}`,
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

            {!hideNonSearchButtons && (
                <div ref={dinnerBtnRef} style={{ position: "absolute", left: 16, bottom: isNarrow ? 68 : 12, zIndex: 2000 }}>
                    {pickerMode ? (
                        <Tooltip text={isPosterPicker ? '返回海报生成' : '返回聚餐创建'} placement="top">
                            <div style={{ display: "inline-block" }}>
                                <Button
                                    onClick={onPickerClose}
                                    aria-label="返回"
                                    style={{
                                        width: 64,
                                        height: 64,
                                        padding: 0,
                                        borderRadius: '50%',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: customThemeColor,
                                        color: '#fff9f6',
                                        border: 'none',
                                        boxShadow: `0 4px 12px ${hexToRgba(customThemeColor, 0.2)}`,
                                        transition: 'background 180ms ease, transform 220ms ease',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 36 }}>
                                        arrow_back
                                    </span>
                                </Button>
                            </div>
                        </Tooltip>
                    ) : (
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
                                        color: '#fff9f6',
                                        border: 'none',
                                        boxShadow: `0 4px 12px ${hexToRgba(customThemeColor, 0.2)}`,
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
                    )}
                </div>
            )}

            {!hideNonSearchButtons && (
                <div style={{ position: "absolute", right: 8, top: 8, zIndex: 2000 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                        <div style={{ padding: "4px 8px", background: "rgba(0,0,0,0.5)", color: "#fff9f6", borderRadius: "12px", fontSize: "12px", pointerEvents: "none", userSelect: "none" }}>
                            v1.8.1
                        </div>

                        {!pickerMode && (
                            <div style={{ display: "inline-block" }}>
                                <Tooltip text={addPlaceTipText}>
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
                                                color: '#fff9f6',
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
                        )}

                        <Tooltip text={authPending ? '正在验证登录状态，请稍候再试' : (favPageOpen ? '关闭收藏夹' : '展开收藏夹')}>
                            <div style={{ display: "inline-block" }}>
                                <Button
                                    onClick={() => {
                                        setFavPageOpen((open) => !open);
                                        setPickedPageOpen(false);
                                    }}
                                    disabled={!mapReady}
                                    aria-label={favPageOpen ? '关闭收藏夹' : '展开收藏夹'}
                                    style={{
                                        width: 44,
                                        height: 44,
                                        padding: 0,
                                        borderRadius: '50%',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: favPageOpen ? '#f5220b' : customThemeColor,
                                        color: '#fff9f6',
                                        border: 'none',
                                        transition: 'background 180ms ease, transform 220ms ease',
                                        cursor: (!mapReady || authPending) ? 'not-allowed' : 'pointer',
                                        opacity: (!mapReady || authPending) ? 0.6 : 1
                                    }}
                                >
                                    <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 30 }}>favorite</span>
                                </Button>
                            </div>
                        </Tooltip>

                        {isPosterPicker && (
                            <Tooltip text={pickedPageOpen ? '关闭已选择地点' : `查看已选择地点（${normalizedPickedPlaces.length}）`}>
                                <div style={{ display: "inline-block" }}>
                                    <Button
                                        onClick={() => {
                                            setPickedPageOpen((open) => !open);
                                            setFavPageOpen(false);
                                        }}
                                        disabled={!mapReady}
                                        aria-label={pickedPageOpen ? '关闭已选择地点' : '查看已选择地点'}
                                        style={{
                                            width: 44,
                                            height: 44,
                                            padding: 0,
                                            borderRadius: '50%',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            position: 'relative',
                                            background: pickedPageOpen ? '#f5220b' : customThemeColor,
                                            color: '#fff9f6',
                                            border: 'none',
                                            transition: 'background 180ms ease, transform 220ms ease',
                                            cursor: !mapReady ? 'not-allowed' : 'pointer',
                                            opacity: !mapReady ? 0.6 : 1
                                        }}
                                    >
                                        <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 29 }}>format_list_numbered</span>
                                        <span style={{
                                            position: 'absolute',
                                            right: -3,
                                            top: -3,
                                            minWidth: 18,
                                            height: 18,
                                            padding: '0 4px',
                                            borderRadius: 9,
                                            boxSizing: 'border-box',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            background: '#fff9f6',
                                            color: customThemeColor,
                                            border: `1px solid ${customThemeColor}`,
                                            fontSize: 10,
                                            fontWeight: 700
                                        }}>
                                            {normalizedPickedPlaces.length}
                                        </span>
                                    </Button>
                                </div>
                            </Tooltip>
                        )}

                        {!pickerMode && (
                            <Tooltip text={authPending ? '正在验证登录状态，请稍候再试' : '定位/我的位置'}>
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
                                            color: '#fff9f6',
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
                        )}
                    </div>
                </div>
            )}

            {selectedPlace && popupPoint && (
                <div
                    style={{
                        position: "absolute",
                        left: popupLayout ? popupLayout.left : popupPoint.x,
                        top: popupLayout ? popupLayout.top : popupPoint.y,
                        transform: popupLayout ? "none" : "translate(-50%, -100%)",
                        zIndex: 4000,
                        pointerEvents: "auto"
                    }}
                >
                    <div ref={popupRef} style={{ background: dark ? 'var(--theme-secondary)' : '#fff9f6', padding: 10, borderRadius: 6, boxShadow: dark ? "0 6px 24px rgba(0,0,0,0.6)" : "0 2px 12px rgba(0,0,0,0.25)", minWidth: 200, width: 'min(92vw, 320px)', maxWidth: 'min(92vw, 320px)' }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <strong style={{ fontSize: 14, color: dark ? '#e5e7eb' : undefined }}>{selectedPlace.name}</strong>
                            {!hideNonSearchButtons && (
                                <Button onClick={closePopup} style={{ padding: "2px 8px", borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", fontSize: 18, lineHeight: 1, color: dark ? '#e5e7eb' : undefined }} title="关闭">×</Button>
                            )}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 13, color: dark ? '#e5e7eb' : undefined, lineHeight: 1.5, wordBreak: 'break-word' }}>
                            {(() => {
                                const { text, hasMore } = getPopupDescriptionPreview(selectedPlace);
                                return (
                                    <>
                                        <span>{text}</span>
                                        {hasMore && !pickerMode && (
                                            <span
                                                onClick={openDetailPanel}
                                                style={{ marginLeft: 4, color: '#9ca3af', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                title="在详情中查看更多"
                                            >
                                                [在详情中查看更多]
                                            </span>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                        <div style={{ marginTop: 6, color: dark ? '#9ca3af' : '#666', fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span>分类: {selectedPlace.category || "-"}</span>
                            {selectedPlace.per_person_cost != null && <span>人均 ¥{selectedPlace.per_person_cost}</span>}
                        </div>

                        {!pickerMode && (
                            <div style={{ marginTop: 8, color: dark ? '#9ca3af' : '#888', fontSize: 12 }}>
                                最近修改：{getLastModifierText(selectedPlace)}
                            </div>
                        )}

                        {pickerMode ? (
                            <div style={{ marginTop: 10, textAlign: 'right' }}>
                                {!hideNonSearchButtons && (
                                    <Button
                                        onClick={handlePickPlace}
                                        aria-label={isPosterPicker && selectedPlaceAlreadyPicked ? '取消选择此地点' : '选择此地点'}
                                        style={{
                                            ...(isPosterPicker && selectedPlaceAlreadyPicked ? { background: '#dc2626' } : {}),
                                            color: '#fff9f6',
                                            border: 0
                                        }}
                                    >
                                        {isPosterPicker && selectedPlaceAlreadyPicked ? '取消选择' : '选择此地点'}
                                    </Button>
                                )}
                            </div>
                        ) : (
                            !hideNonSearchButtons && (
                                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                                    <Tooltip text={hasNavigationTarget ? '发送到设备地图 App' : '该地点缺少坐标，无法导航'}>
                                        <Button
                                            onClick={handleNavigate}
                                            disabled={!hasNavigationTarget}
                                            style={{ background: 'transparent', border: dark ? '1px solid rgba(255,255,255,0.06)' : '2px solid rgba(0,0,0,0.1)', color: dark ? '#e5e7eb' : '#592943', padding: '6px 10px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 20 }}>near_me</span>
                                        </Button>
                                    </Tooltip>
                                    <Tooltip text="分享此地点">
                                        <Button
                                            onClick={() => setShareOpen(true)}
                                            style={{ background: 'transparent', border: dark ? '1px solid rgba(255,255,255,0.06)' : '2px solid rgba(0,0,0,0.1)', color: dark ? '#e5e7eb' : '#592943', padding: '6px 10px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 20 }}>
                                                share
                                            </span>
                                        </Button>
                                    </Tooltip>
                                    {/* 评论功能暂不开放，待敏感词机制完善后再开放 */}
                                    { /*<Tooltip text="在这里留下你的评论">
                                    <Button onClick={openCommentPanel} style={{ background: 'transparent', border: dark ? '1px solid rgba(255,255,255,0.06)' : undefined, color: dark ? '#e5e7eb' : '#592943', padding: '6px 10px', borderRadius: 4 }}>评论</Button>
                                </Tooltip>
                                <span style={{ padding: 4 }}></span> */ }
                                    {selectedPlace.isMarked !== false && (
                                        <Tooltip text={favoriteIds && favoriteIds.has(selectedPlace.id) ? '已收藏，点击取消收藏' : (isAuthenticated ? '点击收藏此地点' : '登录后可收藏')}>
                                            <Button
                                                onClick={() => onToggleFavorite && onToggleFavorite(selectedPlace)}
                                                disabled={favoriteLoading}
                                                style={{ background: 'transparent', border: dark ? '1px solid rgba(255,255,255,0.06)' : '2px solid rgba(0,0,0,0.1)', color: favoriteIds && favoriteIds.has(selectedPlace.id) ? '#f5220b' : (dark ? '#e5e7eb' : '#592943'), padding: '6px 10px', borderRadius: 4, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                            >
                                                <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 20 }}>
                                                    {favoriteIds && favoriteIds.has(selectedPlace.id) ? 'heart_minus' : 'heart_plus'}
                                                </span>
                                            </Button>
                                        </Tooltip>
                                    )}
                                    <Tooltip text={selectedPlace.isMarked === false ? '创建此地点' : '管理此地点'}>
                                        {selectedPlace.isMarked === false ? (
                                            <Button onClick={openCreateFromPoi} style={{ background: 'transparent', border: dark ? '1px solid rgba(255,255,255,0.06)' : '2px solid rgba(0,0,0,0.1)', color: dark ? '#e5e7eb' : '#592943', padding: '6px 10px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 20 }}>add_circle</span>
                                            </Button>
                                        ) : (
                                            <Button onClick={openManagePanel} style={{ background: 'transparent', border: dark ? '1px solid rgba(255,255,255,0.06)' : '2px solid rgba(0,0,0,0.1)', color: dark ? '#e5e7eb' : '#592943', padding: '6px 10px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 20 }}>edit</span>
                                            </Button>
                                        )}
                                    </Tooltip>
                                    <Tooltip text="查看详情与图片">
                                        <Button onClick={() => setDetailOpen(true)} style={{ background: 'transparent', border: dark ? '1px solid rgba(255,255,255,0.06)' : '2px solid rgba(0,0,0,0.1)', color: dark ? '#e5e7eb' : '#592943', padding: '6px 10px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 20 }}>more_horiz</span>
                                        </Button>
                                    </Tooltip>
                                </div>
                            )
                        )}
                    </div>
                </div>
            )}

            {!hideNonSearchButtons && !pickerMode && manageOpen && selectedPlace && (
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

            {navPickerOpen && (
                <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    right: 0,
                    bottom: 0,
                    background: dark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)',
                    zIndex: 5600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 16
                }}>
                    <div style={{
                        width: 'min(420px, 92vw)',
                        background: dark ? 'var(--theme-secondary)' : '#fff9f6',
                        borderRadius: 10,
                        boxShadow: dark ? '0 8px 32px rgba(0,0,0,0.65)' : '0 8px 32px rgba(0,0,0,0.24)',
                        border: dark ? '1px solid #334155' : '1px solid #e5e7eb',
                        color: dark ? '#e5e7eb' : '#111827',
                        padding: 14
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <strong style={{ fontSize: 15 }}>选择导航应用</strong>
                            <Button onClick={() => setNavPickerOpen(false)} style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: 'transparent', fontSize: 18, lineHeight: 1, color: dark ? '#e5e7eb' : undefined }}>×</Button>
                        </div>

                        <div style={{ fontSize: 12, color: dark ? '#9ca3af' : '#6b7280', marginBottom: 10 }}>
                            将前往: {selectedPlace?.name || '该地点'}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {navigationTargets.map((target) => (
                                <Button
                                    key={target.id}
                                    onClick={() => {
                                        setNavPickerOpen(false);
                                        openNavigationTarget(target);
                                    }}
                                    style={{ background: 'transparent', border: dark ? '1px solid rgba(255,255,255,0.08)' : '2px solid rgba(0,0,0,0.12)', color: dark ? '#e5e7eb' : undefined, padding: '8px 10px', borderRadius: 6, textAlign: 'left' }}
                                    full
                                >
                                    {target.name}
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {shareOpen && selectedPlace && (
                <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    right: 0,
                    bottom: 0,
                    background: dark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)',
                    zIndex: 5600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 16
                }}
                    onClick={(e) => { if (e.target === e.currentTarget) setShareOpen(false); }}
                >
                    <div style={{
                        width: 'min(420px, 92vw)',
                        background: dark ? 'var(--theme-secondary)' : '#fff9f6',
                        borderRadius: 10,
                        boxShadow: dark ? '0 8px 32px rgba(0,0,0,0.65)' : '0 8px 32px rgba(0,0,0,0.24)',
                        border: dark ? '1px solid #334155' : '1px solid #e5e7eb',
                        color: dark ? '#e5e7eb' : '#111827',
                        padding: 14
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <strong style={{ fontSize: 15 }}>分享地点</strong>
                            <Button onClick={() => setShareOpen(false)} style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: 'transparent', fontSize: 18, lineHeight: 1, color: dark ? '#e5e7eb' : undefined }}>×</Button>
                        </div>

                        <div style={{ fontSize: 12, color: dark ? '#9ca3af' : '#6b7280', marginBottom: 10 }}>
                            正在分享: {selectedPlace.name || '该地点'}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {/* 选项1: 分享到 QQ/微信 */}
                            <ShareOptionButton
                                icon="share"
                                label="分享到 QQ / 微信"
                                description="在 QQ 或微信中打开，会自动显示地点详情卡片"
                                onClick={() => {
                                    const url = buildPlaceShareUrl(selectedPlace);
                                    if (navigator.share) {
                                        setShareOpen(false);
                                        const shareText = selectedPlace.description
                                            ? `${selectedPlace.name} · ${selectedPlace.category || ''} · ${selectedPlace.description} — 上东方饭联地图发现更多美食`
                                            : `${selectedPlace.name}${selectedPlace.category ? ' · ' + selectedPlace.category : ''} — 东方饭联地图，与饭搭子发现身边好店`;
                                        navigator.share({ title: selectedPlace.name, text: shareText, url }).catch(() => { });
                                    } else {
                                        copyToClipboard(url).then(ok => {
                                            if (ok && showTip) showTip('分享链接已复制到剪贴板');
                                        });
                                        setShareOpen(false);
                                    }
                                }}
                                dark={dark}
                            />

                            {/* 选项2: 复制地点信息到剪贴板 */}
                            <ShareOptionButton
                                icon="content_copy"
                                label="复制地点信息"
                                description="复制地点名称、地址和链接到剪贴板"
                                onClick={async () => {
                                    setShareOpen(false);
                                    const info = await buildPlaceClipboardText(selectedPlace, backendUrl);
                                    const ok = await copyToClipboard(info);
                                    if (ok && showTip) showTip('地点信息已复制到剪贴板');
                                }}
                                dark={dark}
                            />

                            {/* 选项3: 分享高德导航链接 */}
                            <ShareOptionButton
                                icon="navigation"
                                label="分享高德导航链接"
                                description="在 QQ 或微信中打开链接可跳转高德地图导航"
                                onClick={() => {
                                    const amapUrl = buildAmapShareUrl(selectedPlace);
                                    if (navigator.share) {
                                        setShareOpen(false);
                                        const amapShareText = `导航到 ${selectedPlace.name}${selectedPlace.address ? ' · ' + selectedPlace.address : ''} — 使用高德地图一键导航`;
                                        navigator.share({ title: `导航到 ${selectedPlace.name}`, text: amapShareText, url: amapUrl }).catch(() => { });
                                    } else {
                                        copyToClipboard(amapUrl).then(ok => {
                                            if (ok && showTip) showTip('高德导航链接已复制到剪贴板');
                                        });
                                        setShareOpen(false);
                                    }
                                }}
                                dark={dark}
                            />
                        </div>
                    </div>
                </div>
            )}

            {!hideNonSearchButtons && !pickerMode && addingPos && (
                <div style={{
                    position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
                    background: dark ? 'var(--theme-secondary)' : '#fff9f6', padding: 12, zIndex: 3000, borderRadius: 6, boxShadow: dark ? "0 6px 24px rgba(0,0,0,0.6)" : "0 2px 12px rgba(0,0,0,0.3)"
                }}>
                    <h4 style={{ margin: '0 0 12px 0', color: dark ? '#e5e7eb' : 'inherit' }}>添加地点</h4>
                    <AddForm backendUrl={backendUrl} token={token} defaultPos={addingPos} onCancel={onAddCancel} onSubmit={onAddSubmit} defaultName={addingPrefill?.name} defaultCategory={addingPrefill?.category} defaultDescription={addingPrefill?.description} />
                </div>
            )}

            {!hideNonSearchButtons && !pickerMode && detailOpen && selectedPlace && (
                <PlaceDetailPanel place={selectedPlace} onClose={() => setDetailOpen(false)} />
            )}

            {!hideNonSearchButtons && favPageOpen && (
                <div style={{
                    position: 'absolute', right: 60, top: 8,
                    width: 300, maxHeight: '60vh',
                    background: dark ? '#0f172a' : '#fff9f6',
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
                                        navigateToPlace(item.longitude, item.latitude);
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
                                    <span style={{ fontSize: 14, color: item.name ? (dark ? '#f3f4f6' : '#111827') : (dark ? '#9ca3af' : '#6b7280'), fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {item.name || `地点 #${item.place_id}（已删除）`}
                                    </span>
                                    {item.category && (
                                        <span style={{ fontSize: 12, color: dark ? '#9ca3af' : '#6b7280', marginTop: 2 }}>{item.category}</span>
                                    )}
                                    {item.name && (!item.longitude || !item.latitude) && (
                                        <span style={{ fontSize: 11, color: '#f59e0b', marginTop: 2 }}>坐标缺失，无法定位</span>
                                    )}
                                </div>
                            ))
                        )}
                    </ScrollableView>
                </div>
            )}

            {isPosterPicker && pickedPageOpen && (
                <div style={{
                    position: 'absolute',
                    right: 60,
                    top: 8,
                    width: 'min(300px, calc(100vw - 80px))',
                    maxHeight: '60vh',
                    background: dark ? '#0f172a' : '#fff9f6',
                    color: dark ? '#f8fafc' : '#333',
                    borderRadius: 8,
                    boxShadow: dark ? '0 4px 24px rgba(0,0,0,0.6)' : '0 4px 24px rgba(0,0,0,0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    zIndex: 5000
                }}>
                    <div style={{
                        padding: '12px 16px',
                        borderBottom: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexShrink: 0
                    }}>
                        <h3 style={{ margin: 0, fontSize: 16, color: dark ? '#f8fafc' : '#111827' }}>
                            已选择地点（{normalizedPickedPlaces.length}）
                        </h3>
                        <Button
                            onClick={() => setPickedPageOpen(false)}
                            aria-label="关闭已选择地点"
                            style={{ padding: '2px 8px', background: 'transparent', border: 'none', color: dark ? '#e5e7eb' : '#374151', fontSize: 18, lineHeight: 1, cursor: 'pointer' }}
                        >
                            ×
                        </Button>
                    </div>

                    <ScrollableView style={{ flex: 1 }}>
                        {normalizedPickedPlaces.length === 0 ? (
                            <div style={{ padding: 16, textAlign: 'center', color: dark ? '#9ca3af' : '#6b7280', fontSize: 13 }}>
                                点击地图 Marker，再选择此地点
                            </div>
                        ) : (
                            normalizedPickedPlaces.map((item, index) => (
                                <div
                                    key={getPlaceKey(item)}
                                    onClick={() => {
                                        navigateToPlace(item.longitude, item.latitude);
                                        setPickedPageOpen(false);
                                    }}
                                    style={{
                                        padding: '10px 12px 10px 16px',
                                        cursor: (item.longitude && item.latitude) ? 'pointer' : 'default',
                                        borderBottom: `1px solid ${dark ? '#1f2937' : '#f3f4f6'}`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 9
                                    }}
                                    onMouseEnter={(event) => { event.currentTarget.style.backgroundColor = dark ? '#1f2937' : '#f9fafb'; }}
                                    onMouseLeave={(event) => { event.currentTarget.style.backgroundColor = 'transparent'; }}
                                >
                                    <span style={{
                                        width: 24,
                                        height: 24,
                                        borderRadius: '50%',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                        background: customThemeColor,
                                        color: '#fff9f6',
                                        fontSize: 11,
                                        fontWeight: 700
                                    }}>
                                        {index + 1}
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: 14, color: dark ? '#f3f4f6' : '#111827', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {item.name || item.address || '未命名地点'}
                                        </span>
                                        <span style={{ fontSize: 12, color: dark ? '#9ca3af' : '#6b7280', marginTop: 2 }}>
                                            {item.category || '未分类'}
                                        </span>
                                    </div>
                                    <Button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            if (typeof onRemovePickedPlace === 'function') onRemovePickedPlace(item);
                                        }}
                                        aria-label={`移除${item.name || item.address || '此地点'}`}
                                        style={{ padding: '3px 7px', background: 'transparent', border: 'none', color: dark ? '#ff8a93' : '#b00020', fontSize: 12 }}
                                    >
                                        移除
                                    </Button>
                                </div>
                            ))
                        )}
                    </ScrollableView>
                </div>
            )}
        </div>
    );
}
