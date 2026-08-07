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
import { pickContrastTextColor } from '../utils/theme';
import defaultAvatar from '../img/default.png';

const POPUP_GHOST_CLICK_GUARD_MS = 400;

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
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
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
                React.createElement('div', { style: { fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 } }, description)
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
        searchResults,
        aiThinking,
        aiRecommendations = [],
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
        currentUser,
        isAdmin,
        onRequireAuth,
        onOpenDinners,
        onOpenMine,
        onLogout,
        onOpenAdmin,
        onOpenPosterExport,
        desktopHeaderMenu,
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

    const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
    const [mobileAccountOpen, setMobileAccountOpen] = useState(false);
    const [searchResultsVisible, setSearchResultsVisible] = useState(true);
    const [detailOpen, setDetailOpen] = useState(false);
    const [favPageOpen, setFavPageOpen] = useState(false);
    const [pickedPageOpen, setPickedPageOpen] = useState(false);
    const [favItems, setFavItems] = useState([]);
    const [favLoading, setFavLoading] = useState(false);
    const [favError, setFavError] = useState('');
    const [navPickerOpen, setNavPickerOpen] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [isNarrow, setIsNarrow] = useState(() => window.innerWidth <= 640);
    const inputRef = useRef(null);
    const popupRef = useRef(null);
    const popupOpenedAtRef = useRef(0);
    const searchBarRef = useRef(null);
    const dinnerBtnRef = useRef(null);
    const [popupLayout, setPopupLayout] = useState(null);
    const dark = useDarkMode();
    const hideNonSearchButtons = false;
    const isPosterPicker = pickerMode && pickerContext === 'poster';
    const normalizedPickedPlaces = Array.isArray(pickedPlaces) ? pickedPlaces : [];
    const selectedPlaceAlreadyPicked = !!selectedPlace && normalizedPickedPlaces.some((place) => getPlaceKey(place) === getPlaceKey(selectedPlace));
    const popupActionButtonStyle = {
        background: 'transparent',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-primary)',
        padding: '9px 10px',
        minWidth: 44,
        minHeight: 44,
        borderRadius: 8,
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        touchAction: 'manipulation'
    };
    const popupActionIconStyle = { display: 'inline-block', fontSize: 20 };
    const popupActionLabelStyle = { fontSize: 11, fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap' };
    const mobileNavButtonStyle = {
        flex: 1,
        minWidth: 0,
        minHeight: 58,
        padding: '6px 2px',
        border: 0,
        borderRadius: 10,
        background: 'transparent',
        color: 'var(--color-text-primary)',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        fontSize: 11,
        lineHeight: 1.1,
        touchAction: 'manipulation'
    };

    const toggleFavorites = () => {
        if (!isAuthenticated) {
            onRequireAuth?.();
            return;
        }
        setFavPageOpen((open) => !open);
        setPickedPageOpen(false);
        setMobileMoreOpen(false);
        setMobileAccountOpen(false);
    };

    const toggleMobileMore = () => {
        setMobileMoreOpen((open) => !open);
        setMobileAccountOpen(false);
        setFavPageOpen(false);
    };

    const runMobileMoreAction = (action) => {
        setMobileMoreOpen(false);
        action?.();
    };

    const toggleMobileAccount = () => {
        if (!isAuthenticated) {
            onOpenMine?.();
            return;
        }
        setMobileAccountOpen((open) => !open);
        setMobileMoreOpen(false);
        setFavPageOpen(false);
    };

    const runMobileAccountAction = (action) => {
        setMobileAccountOpen(false);
        action?.();
    };

    useEffect(() => {
        if (!isAuthenticated) setMobileAccountOpen(false);
    }, [isAuthenticated]);

    const stabilizeMobileSearchViewport = () => {
        if (!isNarrow) return;
        const anchorViewport = () => {
            // Mobile browsers may scroll the layout viewport while revealing the keyboard.
            // The map is a fixed app surface, so always keep that viewport anchored at zero.
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        };
        window.requestAnimationFrame(anchorViewport);
        window.setTimeout(anchorViewport, 250);
    };

    useEffect(() => {
        const onResize = () => setIsNarrow(window.innerWidth <= 640);
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

    // Keep the search bar centered in wide mode.
    useLayoutEffect(() => {
        if (isNarrow) return;
        const searchEl = searchBarRef.current;
        if (!searchEl) return;

        const updatePosition = () => {
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

    useLayoutEffect(() => {
        if (!selectedPlace || !popupPoint) {
            popupOpenedAtRef.current = 0;
            return;
        }
        popupOpenedAtRef.current = window.performance.now();
    }, [selectedPlace, Boolean(popupPoint)]);

    const handlePopupFavoriteClick = (event) => {
        event.stopPropagation();
        const elapsed = window.performance.now() - popupOpenedAtRef.current;
        if (popupOpenedAtRef.current && elapsed < POPUP_GHOST_CLICK_GUARD_MS) {
            event.preventDefault();
            return;
        }
        onToggleFavorite?.(selectedPlace);
    };

    const { results: spResults, loading: spLoading } = useSearchPanel(searchTerm, mapRef, backendUrl, mapReady, places);

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

    const hasSubmittedSearch = Array.isArray(searchResults);
    const searchButtonLabel = hasSubmittedSearch
        ? (searchResultsVisible ? '折叠搜索结果' : '展开搜索结果')
        : (tipText || '搜索');
    const searchButtonIconColor = pickContrastTextColor(customThemeColor);

    const handleSearchButtonClick = () => {
        if (hasSubmittedSearch) {
            setSearchResultsVisible((visible) => !visible);
            return;
        }
        if (!searchTerm || !searchTerm.trim()) return;
        setSearchResultsVisible(true);
        searchServer({ q: searchTerm, includeUnmarked: true, autoFit: false });
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
                <div style={{ padding: '4px 12px', fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{title}</span>
                    {hasMore && onMore && (
                        <span onClick={onMore} style={{ cursor: 'pointer', color: customThemeSecondary || customThemeColor }}>查看更多</span>
                    )}
                </div>
                {items.map(item => {
                    const isAmapResult = item.isMarked === false;
                    return (
                        <div
                            key={item.id}
                            onClick={() => handleSelectSpItem(item)}
                            style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                borderBottom: '1px solid var(--color-border)',
                                display: 'flex',
                                flexDirection: 'column',
                                background: isAmapResult ? 'var(--theme-secondary-0-12)' : 'transparent'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-overlay)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isAmapResult ? 'var(--theme-secondary-0-12)' : 'transparent'}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                                <span style={{ fontSize: 14, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{item.name}</span>
                                {isAmapResult && (
                                    <span style={{
                                        flexShrink: 0,
                                        padding: '1px 6px',
                                        borderRadius: 999,
                                        border: '1px solid var(--theme-secondary)',
                                        background: 'var(--color-bg-surface)',
                                        color: 'var(--theme-secondary)',
                                        fontSize: 10,
                                        fontWeight: 700
                                    }}>高德地图</span>
                                )}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1, paddingRight: 8 }}>
                                    {item.address || item.category || item.description || ''}
                                </span>
                                {Number.isFinite(item.dist) && (
                                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                        距离: {item.dist < 1000 ? `${Math.round(item.dist)}米` : `${(item.dist / 1000).toFixed(1)}公里`}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderAiRecommendations = () => {
        const recommendations = (Array.isArray(aiRecommendations) ? aiRecommendations : [])
            .filter((recommendation) => recommendation?.place)
            .slice(0, 3);
        return recommendations.map((recommendation, index) => {
            const place = recommendation.place;
            const matchPercent = Number.isFinite(Number(recommendation.match_percent))
                ? Math.round(Number(recommendation.match_percent))
                : Math.round((Number(recommendation.score) || 0) * 100);
            const distanceKm = recommendation.distance_km == null ? Number.NaN : Number(recommendation.distance_km);
            const distanceText = Number.isFinite(distanceKm)
                ? (distanceKm < 1 ? `距地图中心 ${Math.round(distanceKm * 1000)} 米` : `距地图中心 ${distanceKm.toFixed(1)} 公里`)
                : '';
            return (
                <div
                    key={`ai-recommendation-${place.id ?? index}`}
                    onClick={() => handleSelectSpItem(place)}
                    style={{
                        margin: `${index === 0 ? 10 : 0}px 10px 12px`,
                        padding: 12,
                        cursor: 'pointer',
                        borderRadius: 12,
                        border: '1px solid var(--theme-primary)',
                        borderLeft: '4px solid var(--theme-primary)',
                        background: 'linear-gradient(135deg, var(--theme-primary-0-2), var(--theme-secondary-0-12)), var(--color-bg-surface)',
                        boxShadow: '0 0 8px var(--theme-primary-0-25), 0 0 22px var(--theme-secondary-0-2)',
                        animation: 'yuyuko-card-in 320ms ease-out both',
                        animationDelay: `${index * 60}ms`
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-primary)', fontWeight: 800, fontSize: 13 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--theme-icon)' }}>auto_awesome</span>
                            幽幽子特别推荐{recommendations.length > 1 ? ` ${index + 1}/${recommendations.length}` : ''}
                        </div>
                        <span style={{
                            color: 'var(--color-text-primary)',
                            background: 'var(--theme-secondary-0-12)',
                            border: '1px solid var(--theme-secondary)',
                            borderRadius: 999,
                            padding: '2px 7px',
                            fontSize: 12,
                            fontWeight: 700,
                            whiteSpace: 'nowrap'
                        }}>匹配度 {matchPercent}%</span>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)' }}>{place.name}</div>
                    {(place.category || place.per_person_cost || distanceText) && (
                        <div style={{ marginTop: 3, color: 'var(--color-text-secondary)', fontSize: 12 }}>
                            {[place.category, place.per_person_cost ? `人均约 ${place.per_person_cost} 元` : '', distanceText].filter(Boolean).join(' · ')}
                        </div>
                    )}
                    <div style={{ marginTop: 8, color: 'var(--color-text-primary)', fontSize: 13, lineHeight: 1.55 }}>
                        {recommendation.reason}
                    </div>
                </div>
            );
        });
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
                            background: 'var(--color-bg-surface)',
                            color: 'var(--color-text-primary)',
                            fontSize: 12,
                            lineHeight: '16px',
                            padding: '2px 8px 2px 6px',
                            borderRadius: 2,
                            border: '1px solid var(--theme-primary)',
                            borderLeft: isThunder ? '5px solid var(--color-danger)' : '5px solid var(--theme-primary)',
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

            <div ref={searchBarRef} data-map-search-bar style={(() => {
                const base = { position: "absolute", zIndex: 2000 };
                if (isNarrow) {
                    return {
                        ...base,
                        left: 12,
                        right: 12,
                        bottom: pickerMode ? 12 : 78,
                        display: 'block'
                    };
                }
                return { ...base, top: 10, left: '50%', transform: 'translateX(-50%)' };
            })()}>
                <div style={{
                    position: 'relative', height: 44, zIndex: 2001,
                    width: isNarrow ? '100%' : 'min(420px, calc(100vw - 104px))'
                }}>
                    <input
                        ref={inputRef}
                        placeholder="搜店名，或说说现在想吃什么"
                        value={searchTerm}
                        onFocus={stabilizeMobileSearchViewport}
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
                                    setSearchResultsVisible(true);
                                    searchServer({ q: searchTerm, includeUnmarked: true, autoFit: false });
                                }
                            }
                        }}
                        disabled={!mapReady}
                        style={{
                            position: 'absolute',
                            left: 12,
                            top: 0,
                            height: 44,
                            right: 56,
                            boxSizing: 'border-box',
                            padding: '6px 34px 6px 12px',
                            borderRadius: 22,
                            border: `2px solid ${dark ? 'var(--color-border)' : customThemeColor}`,
                            background: 'var(--color-bg-overlay)',
                            color: 'var(--color-text-primary)',
                            outline: 'none',
                            boxShadow: `0 4px 12px ${hexToRgba(customThemeColor, 0.2)}, 0 0 8px ${hexToRgba(customThemeColor, 0.25)}`,
                            zIndex: 2002
                        }}
                    />

                    {searchTerm && (
                        <Button
                            onClick={handleClearSearchInput}
                            title="清空搜索内容"
                            disabled={!mapReady}
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
                                color: 'var(--color-text-secondary)',
                                cursor: !mapReady ? 'not-allowed' : 'pointer',
                                opacity: !mapReady ? 0.55 : 1,
                                zIndex: 2003
                            }}
                        >
                            ×
                        </Button>
                    )}

                    {searchTerm && searchResultsVisible && (aiThinking || aiRecommendations.length > 0 || Array.isArray(searchResults) || spLoading || Array.isArray(spResults)) && (
                        <ScrollableView style={{
                            position: 'absolute',
                            ...(isNarrow ? { bottom: 48 } : { top: 48 }),
                            right: 0,
                            width: '100%',
                            maxHeight: '60vh',
                            background: 'var(--color-bg-surface)',
                            borderRadius: 8,
                            boxShadow: `0 4px 12px ${hexToRgba(customThemeColor, 0.2)}`,
                            border: `1px solid ${dark ? 'var(--color-border)' : hexToRgba(customThemeColor, 0.5)}`,
                            zIndex: 2002,
                            display: 'flex',
                            flexDirection: 'column',
                            color: 'var(--color-text-primary)'
                        }}>
                            {aiThinking && (
                                <div style={{
                                    padding: '10px 12px 6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 7,
                                    color: 'var(--color-text-secondary)',
                                    fontSize: 12,
                                    fontWeight: 700
                                }}>
                                    <span className="material-symbols-outlined" style={{
                                        color: 'var(--theme-icon)',
                                        fontSize: 18,
                                        animation: 'yuyuko-thinking-spin 1s linear infinite'
                                    }}>progress_activity</span>
                                    thinking · 幽幽子正在为你寻觅美食…
                                </div>
                            )}
                            {renderAiRecommendations()}
                            {(() => {
                                const baseResults = Array.isArray(searchResults) ? searchResults : spResults;
                                const recommendedIds = new Set(aiRecommendations.map((recommendation) => String(recommendation?.place?.id)));
                                const visibleResults = Array.isArray(baseResults)
                                    ? baseResults.filter((place) => !recommendedIds.has(String(place.id)))
                                    : [];
                                const siteResults = visibleResults.filter((place) => place.isMarked !== false);
                                const amapResults = visibleResults.filter((place) => place.isMarked === false);
                                if (!Array.isArray(baseResults) && spLoading) {
                                    return <div style={{ padding: 12, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>加载中...</div>;
                                }
                                return (
                                    <>
                                        {renderSpSection('站内地点', siteResults, false, null)}
                                        {renderSpSection('高德地图结果 · 选择后在地图显示', amapResults, false, null)}
                                        {!visibleResults.length && !aiThinking && aiRecommendations.length === 0 && !spLoading && (
                                            <div style={{ padding: 12, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>未找到匹配的结果</div>
                                        )}
                                    </>
                                );
                            })()}
                        </ScrollableView>
                    )}

                    <div style={{ position: 'absolute', right: 0, top: 0 }}>
                        <Tooltip text={searchButtonLabel} placement="top">
                            <Button
                                onClick={handleSearchButtonClick}
                                disabled={!mapReady || !searchTerm.trim()}
                                aria-label={searchButtonLabel}
                                style={{
                                    width: 44,
                                    height: 44,
                                    padding: 0,
                                    borderRadius: '50%',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: customThemeColor,
                                    color: searchButtonIconColor,
                                    border: 'none',
                                    boxShadow: `0 4px 12px ${hexToRgba(customThemeColor, 0.2)}`,
                                    transition: 'background 180ms ease, transform 220ms ease',
                                    cursor: (!mapReady || authPending) ? 'not-allowed' : 'pointer',
                                    opacity: (!mapReady || authPending) ? 0.6 : 1
                                }}
                            >
                                {searching ? (
                                    <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 36 }}>progress_activity</span>
                                ) : hasSubmittedSearch ? (
                                    <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 32 }}>
                                        {searchResultsVisible ? 'expand_less' : 'expand_more'}
                                    </span>
                                ) : (
                                    <span className="material-symbols-outlined" style={{ display: 'inline-block', fontSize: 32 }}>search</span>
                                )}
                            </Button>
                        </Tooltip>
                    </div>
                </div>
            </div>

            {!hideNonSearchButtons && pickerMode && (
                <div ref={dinnerBtnRef} style={{ position: "absolute", left: 16, bottom: isNarrow ? 68 : 12, zIndex: 2000 }}>
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
                                    color: '#FFFFFF',
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
                </div>
            )}

            {!hideNonSearchButtons && (!isNarrow || pickerMode) && (
                <div style={{
                    position: "absolute",
                    ...(desktopHeaderMenu === 'more' ? { left: 8 } : { right: 8 }),
                    top: 72,
                    zIndex: 2000
                }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
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
                                                background: addMode ? 'var(--color-danger)' : customThemeColor,
                                                color: addMode ? 'var(--color-on-emphasis)' : '#FFFFFF',
                                                border: 'none',
                                                boxShadow: addMode ? '0 4px 12px rgba(217,83,79,0.22)' : '0 4px 12px var(--color-glow)',
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
                                    onClick={toggleFavorites}
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
                                        background: favPageOpen ? 'var(--color-primary-active)' : customThemeColor,
                                        color: favPageOpen ? 'var(--color-on-emphasis)' : '#FFFFFF',
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
                                            background: pickedPageOpen ? 'var(--color-primary-active)' : customThemeColor,
                                            color: pickedPageOpen ? 'var(--color-on-emphasis)' : '#FFFFFF',
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
                                            background: 'var(--color-bg-surface)',
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
                                            background: locating ? 'var(--color-success)' : customThemeColor,
                                            color: locating ? 'var(--color-on-emphasis)' : '#FFFFFF',
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

            {!hideNonSearchButtons && isNarrow && !pickerMode && (
                <>
                    {mobileMoreOpen && (
                        <div style={{
                            position: 'absolute',
                            ...(isNarrow ? { left: 12, right: 12, bottom: 76 } : { right: 60, top: 72 }),
                            width: isNarrow ? 'auto' : 300,
                            maxHeight: isNarrow ? 'min(56vh, 440px)' : '60vh',
                            background: 'var(--color-bg-surface)',
                            color: 'var(--color-text-primary)',
                            borderRadius: 10,
                            border: '1px solid var(--color-border)',
                            boxShadow: 'var(--shadow-surface)',
                            display: 'flex', flexDirection: 'column',
                            zIndex: 5000
                        }}>
                            <div style={{
                                padding: '12px 16px',
                                borderBottom: '1px solid var(--color-border)',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                flexShrink: 0
                            }}>
                                <h3 style={{ margin: 0, fontSize: 16, color: 'var(--color-text-primary)' }}>更多功能</h3>
                                <Button
                                    onClick={() => setMobileMoreOpen(false)}
                                    style={{ padding: '2px 8px', background: 'transparent', border: 'none', color: 'var(--color-text-secondary)', fontSize: 18, lineHeight: 1, cursor: 'pointer' }}
                                >×</Button>
                            </div>
                            {isAuthenticated && (
                                <Button themeAware variant="menu" full onClick={() => runMobileMoreAction(onOpenDinners)}>
                                    聚餐活动
                                </Button>
                            )}
                            {isAuthenticated && (
                                <Button themeAware variant="menu" full onClick={() => runMobileMoreAction(onOpenPosterExport)}>
                                    导出海报
                                </Button>
                            )}
                            {isAdmin && (
                                <Button themeAware variant="menu" full onClick={() => runMobileMoreAction(onOpenAdmin)}>
                                    管理后台
                                </Button>
                            )}
                            <div style={{ marginTop: 4, padding: '10px', borderTop: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 12 }}>
                                东方饭联地图 · v2.0.0
                            </div>
                        </div>
                    )}

                    {isAuthenticated && mobileAccountOpen && (
                        <div
                            role="menu"
                            aria-label="用户菜单"
                            style={{
                                position: 'absolute',
                                right: 12,
                                bottom: 76,
                                zIndex: 2200,
                                width: 'min(260px, calc(100vw - 24px))',
                                padding: 8,
                                boxSizing: 'border-box',
                                borderRadius: 14,
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-bg-surface)',
                                color: 'var(--color-text-primary)',
                                boxShadow: 'var(--shadow-surface)'
                            }}
                        >
                            <div style={{ padding: '7px 10px 10px' }}>
                                <div style={{ fontWeight: 750, overflowWrap: 'anywhere' }}>{currentUser?.username || '账号'}</div>
                                <div style={{ marginTop: 3, fontSize: 12, color: 'var(--color-text-secondary)' }}>已登录</div>
                            </div>
                            <div style={{ height: 1, background: 'var(--color-border)' }} />
                            <Button themeAware variant="menu" full onClick={() => runMobileAccountAction(onOpenMine)}>
                                账号与地图设置
                            </Button>
                            <div style={{ height: 1, background: 'var(--color-border)' }} />
                            <Button themeAware variant="menu" full onClick={() => runMobileAccountAction(onLogout)} style={{ color: 'var(--color-danger)' }}>
                                退出登录
                            </Button>
                        </div>
                    )}

                    <nav
                        aria-label="地图主要操作"
                        style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 2050,
                            minHeight: 66,
                            padding: '4px 6px calc(4px + env(safe-area-inset-bottom))',
                            boxSizing: 'border-box',
                            display: 'flex',
                            alignItems: 'stretch',
                            gap: 2,
                            background: 'color-mix(in srgb, var(--color-bg-surface) 94%, transparent)',
                            borderTop: '1px solid var(--color-border)',
                            boxShadow: '0 -6px 20px rgba(18, 16, 22, 0.10)',
                            backdropFilter: 'blur(12px)'
                        }}
                    >
                        <Button onClick={toggleMobileMore} aria-pressed={mobileMoreOpen} style={{ ...mobileNavButtonStyle, color: mobileMoreOpen ? customThemeColor : mobileNavButtonStyle.color }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>more_horiz</span>
                            <span>更多</span>
                        </Button>
                        <Button onClick={toggleFavorites} aria-pressed={favPageOpen} style={{ ...mobileNavButtonStyle, color: favPageOpen ? customThemeColor : mobileNavButtonStyle.color }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>favorite</span>
                            <span>收藏</span>
                        </Button>
                        <Button
                            onClick={() => {
                                handleToggleAddMode();
                                setMobileMoreOpen(false);
                                setFavPageOpen(false);
                            }}
                            disabled={!mapReady || authPending}
                            aria-pressed={addMode}
                            style={{ ...mobileNavButtonStyle, color: addMode ? 'var(--color-danger)' : customThemeColor }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 27, transform: addMode ? 'rotate(-45deg)' : 'none', transition: 'transform 180ms ease' }}>add_circle</span>
                            <span>{addMode ? '取消添加' : '添加'}</span>
                        </Button>
                        <Button onClick={handleLocateMe} disabled={!mapReady || locating} style={{ ...mobileNavButtonStyle, color: locating ? 'var(--color-success)' : mobileNavButtonStyle.color }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>{locating ? 'my_location' : 'location_searching'}</span>
                            <span>{locating ? '定位中' : '定位'}</span>
                        </Button>
                        <Button
                            onClick={toggleMobileAccount}
                            aria-label={isAuthenticated ? `打开用户 ${currentUser?.username || ''} 的菜单` : '登录'}
                            aria-haspopup={isAuthenticated ? 'menu' : undefined}
                            aria-expanded={isAuthenticated ? mobileAccountOpen : undefined}
                            style={{ ...mobileNavButtonStyle, color: mobileAccountOpen ? customThemeColor : mobileNavButtonStyle.color }}
                        >
                            {isAuthenticated && currentUser ? (
                                <img
                                    src={currentUser.has_avatar ? `${backendUrl}/users/${currentUser.id}/avatar` : (currentUser.avatar || defaultAvatar)}
                                    alt={currentUser.username || '用户头像'}
                                    style={{ width: 25, height: 25, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${customThemeColor}` }}
                                />
                            ) : (
                                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>{isAuthenticated ? 'person' : 'login'}</span>
                            )}
                            <span style={{ maxWidth: '64px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {isAuthenticated ? (currentUser?.username || '账号') : '登录'}
                            </span>
                        </Button>
                    </nav>
                </>
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
                    <div ref={popupRef} style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', padding: 10, borderRadius: 10, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-surface)', minWidth: 200, width: 'min(92vw, 320px)', maxWidth: 'min(92vw, 320px)' }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <strong style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{selectedPlace.name}</strong>
                            {!hideNonSearchButtons && (
                                <Button onClick={closePopup} style={{ padding: "2px 8px", borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", fontSize: 18, lineHeight: 1, color: 'var(--color-text-secondary)' }} title="关闭">×</Button>
                            )}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.5, wordBreak: 'break-word' }}>
                            {(() => {
                                const { text, hasMore } = getPopupDescriptionPreview(selectedPlace);
                                return (
                                    <>
                                        <span>{text}</span>
                                        {hasMore && !pickerMode && (
                                            <span
                                                onClick={openDetailPanel}
                                                style={{ marginLeft: 4, color: 'var(--color-text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                title="在详情中查看更多"
                                            >
                                                [在详情中查看更多]
                                            </span>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                        <div style={{ marginTop: 6, color: 'var(--color-text-secondary)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span>分类: {selectedPlace.category || "-"}</span>
                            {selectedPlace.per_person_cost != null && <span>人均 ¥{selectedPlace.per_person_cost}</span>}
                        </div>

                        {!pickerMode && (
                            <div style={{ marginTop: 8, color: 'var(--color-text-muted)', fontSize: 12 }}>
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
                                            ...(isPosterPicker && selectedPlaceAlreadyPicked ? { background: 'var(--color-danger)' } : {}),
                                            color: isPosterPicker && selectedPlaceAlreadyPicked ? 'var(--color-on-emphasis)' : '#FFFFFF',
                                            border: 0
                                        }}
                                    >
                                        {isPosterPicker && selectedPlaceAlreadyPicked ? '取消选择' : '选择此地点'}
                                    </Button>
                                )}
                            </div>
                        ) : (
                            !hideNonSearchButtons && (
                                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <Tooltip text={hasNavigationTarget ? '发送到设备地图 App' : '该地点缺少坐标，无法导航'}>
                                        <Button
                                            onClick={handleNavigate}
                                            disabled={!hasNavigationTarget}
                                            aria-label="导航到此地点"
                                            style={popupActionButtonStyle}
                                        >
                                            <span className="material-symbols-outlined" style={popupActionIconStyle}>near_me</span>
                                            <span style={popupActionLabelStyle}>导航</span>
                                        </Button>
                                    </Tooltip>
                                    <Tooltip text="分享此地点">
                                        <Button
                                            onClick={() => setShareOpen(true)}
                                            aria-label="分享此地点"
                                            style={popupActionButtonStyle}
                                        >
                                            <span className="material-symbols-outlined" style={popupActionIconStyle}>
                                                share
                                            </span>
                                            <span style={popupActionLabelStyle}>分享</span>
                                        </Button>
                                    </Tooltip>
                                    {/* 评论功能暂不开放，待敏感词机制完善后再开放 */}
                                    { /*<Tooltip text="在这里留下你的评论">
                                    <Button onClick={openCommentPanel} style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: '6px 10px', borderRadius: 4 }}>评论</Button>
                                </Tooltip>
                                <span style={{ padding: 4 }}></span> */ }
                                    {selectedPlace.isMarked !== false && (
                                        <Tooltip text={favoriteIds && favoriteIds.has(selectedPlace.id) ? '已收藏，点击取消收藏' : (isAuthenticated ? '点击收藏此地点' : '登录后可收藏')}>
                                            <Button
                                                onClick={handlePopupFavoriteClick}
                                                disabled={favoriteLoading}
                                                aria-label={favoriteIds && favoriteIds.has(selectedPlace.id) ? '取消收藏此地点' : '收藏此地点'}
                                                aria-pressed={favoriteIds && favoriteIds.has(selectedPlace.id)}
                                                style={{ ...popupActionButtonStyle, color: favoriteIds && favoriteIds.has(selectedPlace.id) ? 'var(--color-primary)' : popupActionButtonStyle.color }}
                                            >
                                                <span className="material-symbols-outlined" style={popupActionIconStyle}>
                                                    {favoriteIds && favoriteIds.has(selectedPlace.id) ? 'heart_minus' : 'heart_plus'}
                                                </span>
                                            </Button>
                                        </Tooltip>
                                    )}
                                    <Tooltip text={selectedPlace.isMarked === false ? '创建此地点' : '管理此地点'}>
                                        {selectedPlace.isMarked === false ? (
                                            <Button onClick={openCreateFromPoi} aria-label="创建此地点" style={popupActionButtonStyle}>
                                                <span className="material-symbols-outlined" style={popupActionIconStyle}>add_circle</span>
                                            </Button>
                                        ) : (
                                            <Button onClick={openManagePanel} aria-label="编辑此地点" style={popupActionButtonStyle}>
                                                <span className="material-symbols-outlined" style={popupActionIconStyle}>edit</span>
                                            </Button>
                                        )}
                                    </Tooltip>
                                    <Tooltip text="查看详情与图片">
                                        <Button onClick={() => setDetailOpen(true)} aria-label="查看更多地点详情" style={popupActionButtonStyle}>
                                            <span className="material-symbols-outlined" style={popupActionIconStyle}>more_horiz</span>
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
                    background: 'var(--color-backdrop)',
                    zIndex: 5600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 16
                }}>
                    <div style={{
                        width: 'min(420px, 92vw)',
                        background: 'var(--color-bg-surface)',
                        borderRadius: 10,
                        boxShadow: 'var(--shadow-surface)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        padding: 14
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <strong style={{ fontSize: 15 }}>选择导航应用</strong>
                            <Button onClick={() => setNavPickerOpen(false)} style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: 'transparent', fontSize: 18, lineHeight: 1, color: 'var(--color-text-secondary)' }}>×</Button>
                        </div>

                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
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
                                    style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: '8px 10px', borderRadius: 6, textAlign: 'left' }}
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
                    background: 'var(--color-backdrop)',
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
                        background: 'var(--color-bg-surface)',
                        borderRadius: 10,
                        boxShadow: 'var(--shadow-surface)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        padding: 14
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <strong style={{ fontSize: 15 }}>分享地点</strong>
                            <Button onClick={() => setShareOpen(false)} style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: 'transparent', fontSize: 18, lineHeight: 1, color: 'var(--color-text-secondary)' }}>×</Button>
                        </div>

                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
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
                    width: 'min(520px, calc(100vw - 24px))', maxHeight: 'calc(var(--app-height, 100vh) - 48px)', overflowY: 'auto', boxSizing: 'border-box',
                    background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', padding: 12, zIndex: 5000, borderRadius: 10, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-surface)'
                }}>
                    <h4 style={{ margin: '0 0 12px 0', color: 'var(--color-text-primary)' }}>添加地点</h4>
                    <AddForm backendUrl={backendUrl} token={token} defaultPos={addingPos} onCancel={onAddCancel} onSubmit={onAddSubmit} defaultName={addingPrefill?.name} defaultCategory={addingPrefill?.category} defaultDescription={addingPrefill?.description} />
                </div>
            )}

            {!hideNonSearchButtons && !pickerMode && detailOpen && selectedPlace && (
                <PlaceDetailPanel place={selectedPlace} onClose={() => setDetailOpen(false)} onNavigate={handleNavigate} />
            )}

            {!hideNonSearchButtons && favPageOpen && (
                <div style={{
                    position: 'absolute',
                    ...(isNarrow ? { left: 12, right: 12, bottom: 76 } : { right: 60, top: 72 }),
                    width: isNarrow ? 'auto' : 300,
                    maxHeight: isNarrow ? 'min(56vh, 440px)' : '60vh',
                    background: 'var(--color-bg-surface)',
                    color: 'var(--color-text-primary)',
                    borderRadius: 10,
                    border: '1px solid var(--color-border)',
                    boxShadow: 'var(--shadow-surface)',
                    display: 'flex', flexDirection: 'column',
                    zIndex: 5000
                }}>
                    <div style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--color-border)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        flexShrink: 0
                    }}>
                        <h3 style={{ margin: 0, fontSize: 16, color: 'var(--color-text-primary)' }}>我的收藏</h3>
                        <Button
                            onClick={() => setFavPageOpen(false)}
                            style={{ padding: '2px 8px', background: 'transparent', border: 'none', color: 'var(--color-text-secondary)', fontSize: 18, lineHeight: 1, cursor: 'pointer' }}
                        >×</Button>
                    </div>

                    <ScrollableView style={{ flex: 1 }}>
                        {!isAuthenticated ? (
                            <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>
                                请登录后查看收藏
                            </div>
                        ) : favLoading ? (
                            <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>
                                加载中...
                            </div>
                        ) : favError ? (
                            <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-danger)', fontSize: 13 }}>
                                {favError}
                            </div>
                        ) : favItems.length === 0 ? (
                            <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>
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
                                        borderBottom: '1px solid var(--color-border)',
                                        display: 'flex',
                                        flexDirection: 'column'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-overlay)'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <span style={{ fontSize: 14, color: item.name ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {item.name || `地点 #${item.place_id}（已删除）`}
                                    </span>
                                    {item.category && (
                                        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>{item.category}</span>
                                    )}
                                    {item.name && (!item.longitude || !item.latitude) && (
                                        <span style={{ fontSize: 11, color: 'var(--color-warning)', marginTop: 2 }}>坐标缺失，无法定位</span>
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
                    background: 'var(--color-bg-surface)',
                    color: 'var(--color-text-primary)',
                    borderRadius: 10,
                    border: '1px solid var(--color-border)',
                    boxShadow: 'var(--shadow-surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    zIndex: 5000
                }}>
                    <div style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--color-border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexShrink: 0
                    }}>
                        <h3 style={{ margin: 0, fontSize: 16, color: 'var(--color-text-primary)' }}>
                            已选择地点（{normalizedPickedPlaces.length}）
                        </h3>
                        <Button
                            onClick={() => setPickedPageOpen(false)}
                            aria-label="关闭已选择地点"
                            style={{ padding: '2px 8px', background: 'transparent', border: 'none', color: 'var(--color-text-secondary)', fontSize: 18, lineHeight: 1, cursor: 'pointer' }}
                        >
                            ×
                        </Button>
                    </div>

                    <ScrollableView style={{ flex: 1 }}>
                        {normalizedPickedPlaces.length === 0 ? (
                            <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>
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
                                        borderBottom: '1px solid var(--color-border)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 9
                                    }}
                                    onMouseEnter={(event) => { event.currentTarget.style.backgroundColor = 'var(--color-bg-overlay)'; }}
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
                                        color: '#FFFFFF',
                                        fontSize: 11,
                                        fontWeight: 700
                                    }}>
                                        {index + 1}
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {item.name || item.address || '未命名地点'}
                                        </span>
                                        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
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
                                        style={{ padding: '3px 7px', background: 'transparent', border: 'none', color: 'var(--color-danger)', fontSize: 12 }}
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
