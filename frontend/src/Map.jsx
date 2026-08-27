import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import * as MapUtils from './map/utils';
import * as Api from './map/api';
import { renderMarkers } from './map/markers';
import MapUI from './map/MapUI';
import CommentPanel from './components/CommentPanel';
import { useTips } from "./components/Tips";
import { useConfirm } from "./components/Confirm";
import Tooltip from './components/Tooltip';
import Button from './components/Button';
import useDarkMode from './utils/useDarkMode';
import { applyThemeColors, resolveThemePrimary, resolveThemeSecondary } from './utils/theme';

const DEFAULT_CENTER = MapUtils.DEFAULT_CENTER;
const DEFAULT_ZOOM = MapUtils.DEFAULT_ZOOM;
const { normalizeLngLat, readSavedMapView, shouldPersistMapView, MAP_VIEW_STORAGE_KEY, MAP_VIEW_SAVE_DEBOUNCE_MS, LOCATE_ME_MIN_ZOOM, canUseLocationInCurrentContext, getLocationErrorMessage } = MapUtils;
const PREFETCH_BOUNDS_RATIO = 1; // prefetch one viewport margin around the visible area

const clampNumber = (value, min, max) => Math.min(Math.max(value, min), max);
function buildInfoWindowContent(place) {
    const root = document.createElement("div");
    root.style.minWidth = "160px";

    const title = document.createElement("strong");
    title.textContent = String(place?.name || "");
    root.appendChild(title);

    const description = document.createElement("div");
    description.textContent = String(place?.description || "");
    root.appendChild(description);

    const category = document.createElement("div");
    category.textContent = `分类: ${String(place?.category || "-")}`;
    root.appendChild(category);

    return root;
}

export default function MapView({
    backendUrl,
    token,
    isAuthenticated,
    isAdmin,
    onRequireAuth,
    onOpenDinners,
    onOpenMine,
    onLogout,
    onOpenAdmin,
    onOpenPosterExport,
    desktopHeaderMenu = null,
    pickerMode = false,
    pickerContext = 'dinner',
    pickedPlaces = [],
    onPickPlace,
    onRemovePickedPlace,
    onPickerClose
}) {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef([]);
    const geolocationRef = useRef(null);
    const userLocationMarkerRef = useRef(null);
    const addModeRef = useRef(false);
    const saveViewTimerRef = useRef(null);
    const lastSavedViewRef = useRef(null);
    const [addingPos, setAddingPos] = useState(null);
    const [addingPrefill, setAddingPrefill] = useState(null);
    const [places, setPlaces] = useState([]);
    const [mapReady, setMapReady] = useState(false);
    const [mapComplete, setMapComplete] = useState(false);
    const [addMode, setAddMode] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState(null);
    const [searching, setSearching] = useState(false);
    const [aiThinking, setAiThinking] = useState(false);
    const [aiRecommendations, setAiRecommendations] = useState([]);
    const [searchResetKey, setSearchResetKey] = useState(0);
    const showTip = useTips();
    const confirm = useConfirm();
    const [locating, setLocating] = useState(false);
    const [locationError, setLocationError] = useState("");
    const [currentUser, setCurrentUser] = useState(null);
    const { setUser: setAuthUser } = useAuth();
    const [fetchingUser, setFetchingUser] = useState(false);
    const [selectedPlace, setSelectedPlace] = useState(null);
    const [popupPoint, setPopupPoint] = useState(null);
    const [markerLabels, setMarkerLabels] = useState([]);
    const [commentOpen, setCommentOpen] = useState(false);
    const [commentsList, setCommentsList] = useState([]);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [commentMessage, setCommentMessage] = useState("");
    const [newComment, setNewComment] = useState("");
    const [commentSubmitting, setCommentSubmitting] = useState(false);
    const selectedPlaceRef = useRef(null);
    const manageOpenRef = useRef(false);
    const commentOpenRef = useRef(false);
    const prevPickerModeRef = useRef(pickerMode);
    const lastFetchedTokenRef = useRef(null);
    const hasToken = !!token;
    const authPending = hasToken && !isAuthenticated;
    // disallow write actions for banned users
    const isBanned = !!(currentUser && currentUser.is_banned);
    const canWrite = hasToken && isAuthenticated && !isBanned;

    const [manageOpen, setManageOpen] = useState(false);
    const [manageEdit, setManageEdit] = useState({ name: "", category: "", description: "", per_person_cost: null });
    const [manageSubmitting, setManageSubmitting] = useState(false);
    const [manageMessage, setManageMessage] = useState("");

    const [favoriteIds, setFavoriteIds] = useState(new Set());
    const [favoriteLoading, setFavoriteLoading] = useState(false);

    const searchResultsRef = useRef(null);
    useEffect(() => { searchResultsRef.current = searchResults; }, [searchResults]);
    const searchTermRef = useRef(searchTerm);
    useEffect(() => { searchTermRef.current = searchTerm; }, [searchTerm]);
    const searchingRef = useRef(searching);
    useEffect(() => { searchingRef.current = searching; }, [searching]);
    const searchServerRef = useRef(null);
    const searchRequestIdRef = useRef(0);
    const searchAbortControllersRef = useRef([]);
    const skipNextSearchRef = useRef(false);
    const skipSearchTimerRef = useRef(null);
    useEffect(() => () => {
        searchAbortControllersRef.current.forEach((controller) => controller.abort());
    }, []);
    useEffect(() => { manageOpenRef.current = manageOpen; }, [manageOpen]);
    useEffect(() => { commentOpenRef.current = commentOpen; }, [commentOpen]);
    const loadPlacesRef = useRef(null);
    const handleUpdateLabelsRef = useRef(null);
    const placesRef = useRef([]);
    const visibleIndividualIdsRef = useRef(new Set());

    const clearSearchState = ({ resetTerm = true, closeSearchUi = true, reloadPlaces = true } = {}) => {
        searchRequestIdRef.current += 1;
        searchAbortControllersRef.current.forEach((controller) => controller.abort());
        searchAbortControllersRef.current = [];
        if (resetTerm) setSearchTerm("");
        setSearchResults(null);
        setSearching(false);
        setAiThinking(false);
        setAiRecommendations([]);
        if (closeSearchUi) setSearchResetKey((v) => v + 1);
        if (reloadPlaces && loadPlacesRef.current) {
            return loadPlacesRef.current(true);
        }
        return null;
    };

    const handleSearchTermChange = (value) => {
        if (value !== searchTermRef.current) {
            searchRequestIdRef.current += 1;
            searchAbortControllersRef.current.forEach((controller) => controller.abort());
            searchAbortControllersRef.current = [];
            setSearchResults(null);
            setSearching(false);
            setAiThinking(false);
            setAiRecommendations([]);
        }
        setSearchTerm(value);
    };

    const armSkipAutoSearch = (durationMs = 900) => {
        skipNextSearchRef.current = true;
        if (skipSearchTimerRef.current) {
            window.clearTimeout(skipSearchTimerRef.current);
        }
        skipSearchTimerRef.current = window.setTimeout(() => {
            skipNextSearchRef.current = false;
            skipSearchTimerRef.current = null;
        }, durationMs);
    };

    const [customThemeColor, setCustomThemeColor] = useState(() => resolveThemePrimary(null));
    const [customThemeSecondary, setCustomThemeSecondary] = useState(() => resolveThemeSecondary(null));

    const applyEffectiveTheme = (mapSettings) => {
        const primary = resolveThemePrimary(mapSettings);
        const secondary = resolveThemeSecondary(mapSettings);
        setCustomThemeColor(primary);
        setCustomThemeSecondary(secondary);
        try { applyThemeColors(primary, secondary); } catch (e) { }
    };

    useEffect(() => {
        try {
            let ms = null;
            if (currentUser && currentUser.map_settings) {
                ms = currentUser.map_settings;
            }
            if (!ms || !ms.theme_color) {
                try {
                    const raw = window.localStorage.getItem('map_settings');
                    if (raw) ms = JSON.parse(raw);
                } catch (e) { }
            }
            applyEffectiveTheme(ms);
        } catch (e) { }
    }, [currentUser]);

    useEffect(() => {
        const onThemeChange = (e) => {
            try {
                const detail = (e && e.detail) ? e.detail : null;
                if (detail) {
                    if (typeof detail.color !== 'undefined') {
                        setCustomThemeColor(detail.color || resolveThemePrimary(null));
                    }
                    if (typeof detail.secondary !== 'undefined') {
                        setCustomThemeSecondary(detail.secondary || resolveThemeSecondary(null));
                    }
                    // Dark mode toggled — re-resolve defaults if user hasn't customized
                    if (typeof detail.dark !== 'undefined') {
                        let ms = null;
                        try {
                            const raw = window.localStorage.getItem('map_settings');
                            if (raw) ms = JSON.parse(raw);
                        } catch (ex) { }
                        if (!ms || !ms.theme_color) {
                            setCustomThemeColor(resolveThemePrimary(ms));
                        }
                        if (!ms || !ms.theme_color_secondary) {
                            setCustomThemeSecondary(resolveThemeSecondary(ms));
                        }
                    }
                }
            } catch (err) { }
        };
        window.addEventListener('themechange', onThemeChange);
        return () => window.removeEventListener('themechange', onThemeChange);
    }, []);

    // Helper: try multiple AMap APIs to set a map style string (robust across versions)
    const trySetAmapStyle = (map, styleStr) => {
        if (!map) return false;
        try {
            if (typeof map.setMapStyle === 'function') {
                try { map.setMapStyle(styleStr); return true; } catch (e) { /* ignore */ }
                try { map.setMapStyle({ style: styleStr }); return true; } catch (e) { /* ignore */ }
            }
            if (typeof map.setStyle === 'function') {
                try { map.setStyle(styleStr); return true; } catch (e) { /* ignore */ }
            }
            if (typeof map.setOptions === 'function') {
                try { map.setOptions({ mapStyle: styleStr }); return true; } catch (e) { /* ignore */ }
                try { map.setOptions({ style: styleStr }); return true; } catch (e) { /* ignore */ }
            }
        } catch (e) {
            // ignore
        }
        return false;
    };

    // 更丰富的样式候选（按优先级），可以替换成你在高德控制台看到的样式 id
    const AMAP_STYLE_CANDIDATES_DARK = [
        'amap://styles/dark',
        'amap://styles/darkblue',
        'amap://styles/grey',
        'amap://styles/night'
    ];

    const AMAP_STYLE_CANDIDATES_LIGHT = [
        'amap://styles/light',
        'amap://styles/normal',
        'amap://styles/night',
        'amap://styles/default'
    ];

    const trySetAnyAmapStyle = (map, candidates) => {
        if (!map || !Array.isArray(candidates)) return null;
        for (const s of candidates) {
            try {
                if (trySetAmapStyle(map, s)) return s;
            } catch (e) {
                // ignore and try next
            }
        }
        return null;
    };

    // 从用户设置或 localStorage 中读取首选样式：优先返回主题专属配置，再回退到通用 map_style
    // 用户未登录时（currentUser === null）会回退到 localStorage 或默认样式
    const getPreferredCandidates = (isDark) => {
        try {
            let userStyle = null;

            // 首先尝试用户登录后的设置（currentUser.map_settings）
            if (currentUser && currentUser.map_settings) {
                userStyle = currentUser.map_settings[isDark ? 'map_style_dark' : 'map_style_light'] || null;
                if (!userStyle && currentUser.map_settings.map_style) userStyle = currentUser.map_settings.map_style;
            }

            // 回退到 localStorage 中的设置（本地保存）
            if (!userStyle) {
                try {
                    const raw = window.localStorage.getItem('map_settings');
                    if (raw) {
                        const ms = JSON.parse(raw);
                        if (ms) {
                            userStyle = ms[isDark ? 'map_style_dark' : 'map_style_light'] || ms.map_style || null;
                        }
                    }
                } catch (e) { /* ignore */ }
            }

            // 使用默认样式列表，如果用户有自定义样式则优先使用
            const base = isDark ? AMAP_STYLE_CANDIDATES_DARK : AMAP_STYLE_CANDIDATES_LIGHT;
            if (userStyle) return [userStyle].concat(base.filter(s => s !== userStyle));
            return base;
        } catch (e) {
            // 异常时返回默认样式列表
            return isDark ? AMAP_STYLE_CANDIDATES_DARK : AMAP_STYLE_CANDIDATES_LIGHT;
        }
    };

    const dark = useDarkMode();

    const tipText = mapReady ? "点击查找地点" : "地图尚未就绪，稍候再试";
    const locationTipText = !mapReady
        ? "地图尚未就绪，稍候再试"
        : (locationError || (MapUtils.canUseLocationInCurrentContext()
            ? "点击获取当前位置并在地图上标记"
            : "定位功能仅在 HTTPS 或 localhost 环境下可用"));
    const addPlaceTipText = !mapReady
        ? "地图尚未就绪，稍候再试"
        : authPending
            ? "正在核验通行凭证，请稍候再试"
            : isBanned
                ? "通行凭证已受限，无法添加地点"
                : canWrite
                    ? (addMode ? "点击取消添加模式" : "点击后在地图上选择位置以添加地点")
                    : "核验通行凭证后才能添加地点";

    // 同步 ref，以便地图上的 click handler 总能读取到最新的 addMode
    useEffect(() => {
        addModeRef.current = addMode;
        if (containerRef.current) {
            containerRef.current.style.cursor = addMode ? "crosshair" : "";
        }
    }, [addMode]);

    useEffect(() => {
        if (canWrite) return;
        if (addMode) setAddMode(false);
        if (addingPos) setAddingPos(null);
    }, [canWrite, addMode, addingPos]);

    useEffect(() => {
        if (pickerMode && !prevPickerModeRef.current) {
            clearSearchState();
        }
        prevPickerModeRef.current = pickerMode;
    }, [pickerMode]);

    // Load favorites when user authenticates; clear when logged out
    useEffect(() => {
        if (!token || !isAuthenticated) {
            setFavoriteIds(new Set());
            return;
        }
        let active = true;
        (async () => {
            try {
                const rows = await Api.fetchFavorites(backendUrl, token);
                if (active) {
                    const ids = new Set((rows || []).map(r => r.place_id));
                    setFavoriteIds(ids);
                }
            } catch (e) {
                console.warn('加载收藏列表失败', e);
            }
        })();
        return () => { active = false; };
    }, [token, isAuthenticated, backendUrl]);

    // 当 token 可用时尝试获取当前用户（用于判断是否有 admin 权限 / id）
    useEffect(() => {
        let active = true;
        if (!token) {
            setCurrentUser(null);
            lastFetchedTokenRef.current = null;
            return;
        }
        // If we've already fetched for this token, skip
        if (lastFetchedTokenRef.current === token) return;
        (async () => {
            setFetchingUser(true);
            try {
                const user = await Api.fetchCurrentUser(backendUrl, token);
                if (active && user) {
                    setCurrentUser(user);
                    try {
                        if (typeof setAuthUser === 'function') setAuthUser(user);
                    } catch (err) {
                        // ignore
                    }
                    lastFetchedTokenRef.current = token;
                } else {
                    lastFetchedTokenRef.current = null;
                }
            } catch (e) {
                console.warn("获取当前用户失败", e);
                lastFetchedTokenRef.current = null;
            } finally {
                setFetchingUser(false);
            }
        })();
        return () => { active = false; };
    }, [token, backendUrl]);

    useEffect(() => {
        let pollTimer = null;
        let handleMapClick = null;
        let handleViewChange = null;
        let handlePageHide = null;
        let handleVisibilityChange = null;
        let handleUpdatePopup = null;
        let handleUpdateLabels = null;
        let handleResize = null;
        let handleMapStyleChange = null;
        let resizeObserver = null;
        let loadTimer = null;

        const getCurrentMapView = () => {
            if (!mapRef.current) return null;
            const center = MapUtils.normalizeLngLat(mapRef.current.getCenter());
            if (!center) return null;
            const zoomRaw = Number(mapRef.current.getZoom());
            const zoom = Number.isFinite(zoomRaw) ? zoomRaw : DEFAULT_ZOOM;
            return {
                lng: Number(center.lng.toFixed(6)),
                lat: Number(center.lat.toFixed(6)),
                zoom: Number(zoom.toFixed(2))
            };
        };

        const persistCurrentMapView = (force = false) => {
            const currentView = getCurrentMapView();
            if (!currentView) return;
            if (!force && !MapUtils.shouldPersistMapView(lastSavedViewRef.current, currentView)) return;
            try {
                window.localStorage.setItem(MapUtils.MAP_VIEW_STORAGE_KEY, JSON.stringify(currentView));
                lastSavedViewRef.current = currentView;
            } catch (e) {
                console.warn("保存上次地图视野失败", e);
            }
        };

        const schedulePersistMapView = () => {
            if (saveViewTimerRef.current) {
                window.clearTimeout(saveViewTimerRef.current);
            }
            saveViewTimerRef.current = window.setTimeout(() => {
                saveViewTimerRef.current = null;
                persistCurrentMapView(false);
            }, MapUtils.MAP_VIEW_SAVE_DEBOUNCE_MS);
        };

        // 将经纬度转换为容器像素
        const lngLatToContainerPoint = (lnglat) => {
            if (!mapRef.current || !lnglat) return null;
            try {
                const map = mapRef.current;
                if (typeof map.lngLatToContainer === "function") {
                    const p = map.lngLatToContainer([lnglat.lng ?? lnglat.longitude, lnglat.lat ?? lnglat.latitude]);
                    return { x: p.x, y: p.y };
                }
                if (typeof map.lnglatToContainer === "function") {
                    const p = map.lnglatToContainer([lnglat.lng ?? lnglat.longitude, lnglat.lat ?? lnglat.latitude]);
                    return { x: p.x, y: p.y };
                }
                if (typeof map.lnglatToPixel === "function") {
                    const p = map.lnglatToPixel([lnglat.lng ?? lnglat.longitude, lnglat.lat ?? lnglat.latitude]);
                    return { x: p.x, y: p.y };
                }
            } catch (e) {
            }
            return null;
        };

        // 在地图初始化时绑定事件
        const init = () => {
            if (!containerRef.current) return;
            const savedView = MapUtils.readSavedMapView();

            // 判断是否使用深色模式
            // 1. 首先检查 document 的 data-theme 属性
            // 2. 如果没有设置，检查 localStorage 中的 map_settings
            // 3. 如果都没有，默认为 false（浅色）
            let pageDark = (typeof document !== 'undefined' && document.documentElement && document.documentElement.getAttribute('data-theme') === 'dark');
            if (!pageDark) {
                try {
                    const raw = window.localStorage.getItem('map_settings');
                    if (raw) {
                        const ms = JSON.parse(raw);
                        if (ms && typeof ms.dark_mode !== 'undefined') pageDark = !!ms.dark_mode;
                    }
                } catch (e) { /* ignore */ }
            }

            const preferredStyles = getPreferredCandidates(pageDark);

            mapRef.current = new AMap.Map(containerRef.current, {
                resizeEnable: true,
                center: savedView ? [savedView.lng, savedView.lat] : DEFAULT_CENTER,
                zoom: savedView ? savedView.zoom : DEFAULT_ZOOM,
                mapStyle: preferredStyles.length > 0 ? preferredStyles[0] : undefined
            });
            lastSavedViewRef.current = savedView;

            mapRef.current.on('complete', () => {
                setMapComplete(true);
                // 地图加载完全后再次确保由于bounds已准备好，加载附近数据
                if (loadPlacesRef.current) {
                    loadPlacesRef.current(false);
                }
            });

            handleMapClick = (e) => {
                if (addModeRef.current) {
                    const { lng, lat } = e.lnglat;
                    setAddingPos([lng, lat]);
                    return;
                }
                if (manageOpenRef.current || commentOpenRef.current) return;
                if (!selectedPlaceRef.current) return;
                if (e && e.target && mapRef.current && e.target !== mapRef.current) return;
                closePopup();
            };
            handleViewChange = () => {
                schedulePersistMapView();
                // 每次移动或缩放结束时，增加适当防抖加载数据
                if (loadTimer) {
                    window.clearTimeout(loadTimer);
                }
                loadTimer = window.setTimeout(() => {
                    loadTimer = null;
                    if (loadPlacesRef.current) {
                        loadPlacesRef.current(false);
                    }
                }, 300);

            };
            handlePageHide = () => {
                persistCurrentMapView(true);
            };
            handleVisibilityChange = () => {
                if (document.visibilityState === "hidden") {
                    persistCurrentMapView(true);
                }
            };

            // 当地图移动/缩放等导致容器坐标变化时，更新弹窗像素位置
            handleUpdatePopup = () => {
                const selected = selectedPlaceRef.current;
                if (!selected) return;
                const point = lngLatToContainerPoint({ longitude: selected.longitude, latitude: selected.latitude });
                setPopupPoint(point);
            };
            handleUpdateLabels = () => {
                const isSearch = searchResultsRef.current != null;
                const currentPlaces = isSearch ? searchResultsRef.current : placesRef.current;
                const visibleIds = visibleIndividualIdsRef.current;
                const container = containerRef.current;
                if (!currentPlaces || currentPlaces.length === 0) {
                    setMarkerLabels([]);
                    return;
                }
                const cw = container ? container.clientWidth : window.innerWidth;
                const ch = container ? container.clientHeight : window.innerHeight;
                const maxHalfW = 100;
                const labelH = 22;   // label height + gap
                const edgeMargin = 5; // extra margin before showing/hiding
                const labels = [];
                for (const p of currentPlaces) {
                    if (!p.name) continue;
                    // 高德临时 POI 默认只存在于结果列表；只有用户单独选中后
                    // 才会显示对应 marker 和名称。
                    if (p.isMarked === false && p.showOnMap !== true) continue;
                    // 搜索模式下不依赖聚类 visibleIds，确保所有搜索结果标签都显示
                    if (!isSearch && visibleIds.size > 0 && !visibleIds.has(p.id)) continue;
                    const point = lngLatToContainerPoint({ longitude: p.longitude, latitude: p.latitude });
                    if (!point) continue;
                    const halfW = Math.min((p.name || '').length * 7 + 12, maxHalfW);
                    // Skip if label would extend beyond any edge
                    if (point.x < halfW + edgeMargin || point.x > cw - halfW - edgeMargin) continue;
                    if (point.y < edgeMargin || point.y > ch - labelH - edgeMargin) continue;
                    labels.push({
                        x: point.x,
                        y: point.y,
                        name: p.name,
                        category: p.category || '',
                        id: p.id
                    });
                }
                setMarkerLabels(labels);
            };
            handleUpdateLabelsRef.current = handleUpdateLabels;
            handleResize = () => {
                if (mapRef.current && typeof mapRef.current.resize === "function") {
                    mapRef.current.resize();
                }
                handleUpdatePopup();
                handleUpdateLabels();
            };

            mapRef.current.on("click", handleMapClick);
            mapRef.current.on("moveend", handleViewChange);
            mapRef.current.on("zoomend", handleViewChange);
            mapRef.current.on("moveend", handleUpdatePopup);
            mapRef.current.on("zoomend", handleUpdatePopup);
            mapRef.current.on("moveend", handleUpdateLabels);
            mapRef.current.on("zoomend", handleUpdateLabels);
            mapRef.current.on("mapmove", handleUpdateLabels);
            mapRef.current.on("zoomchange", handleUpdateLabels);
            window.addEventListener("resize", handleResize);
            if (containerRef.current && typeof ResizeObserver !== "undefined") {
                resizeObserver = new ResizeObserver(() => {
                    handleResize();
                });
                resizeObserver.observe(containerRef.current);
            }

            window.addEventListener("pagehide", handlePageHide);
            document.addEventListener("visibilitychange", handleVisibilityChange);

            // listen for explicit map style changes from settings UI
            handleMapStyleChange = (e) => {
                try {
                    if (!mapRef.current) return;
                    const detail = (e && e.detail) ? e.detail : null;
                    const pageDark = (typeof document !== 'undefined' && document.documentElement && document.documentElement.getAttribute('data-theme') === 'dark');
                    const preferred = getPreferredCandidates(pageDark);
                    if (detail) {
                        const want = (pageDark ? (detail.map_style_dark || null) : (detail.map_style_light || null)) || detail.map_style || null;
                        const candidates = want ? [want].concat(preferred.filter(s => s !== want)) : preferred;
                        trySetAnyAmapStyle(mapRef.current, candidates);
                    } else {
                        trySetAnyAmapStyle(mapRef.current, preferred);
                    }
                } catch (e) { /* ignore */ }
            };
            document.addEventListener('mapstylechange', handleMapStyleChange);

            setMapReady(true);
            loadPlaces();
        };

        if (window.AMap) init();
        else {
            pollTimer = setInterval(() => {
                if (window.AMap) {
                    clearInterval(pollTimer);
                    pollTimer = null;
                    init();
                }
            }, 200);
        }

        return () => {
            persistCurrentMapView(true);
            if (pollTimer) clearInterval(pollTimer);
            if (saveViewTimerRef.current) {
                window.clearTimeout(saveViewTimerRef.current);
                saveViewTimerRef.current = null;
            }
            if (loadTimer) {
                window.clearTimeout(loadTimer);
                loadTimer = null;
            }
            if (skipSearchTimerRef.current) {
                window.clearTimeout(skipSearchTimerRef.current);
                skipSearchTimerRef.current = null;
            }
            if (mapRef.current) {
                if (handleMapClick) mapRef.current.off("click", handleMapClick);
                if (handleViewChange) {
                    mapRef.current.off("moveend", handleViewChange);
                    mapRef.current.off("zoomend", handleViewChange);
                }
                if (handleUpdatePopup) {
                    mapRef.current.off("moveend", handleUpdatePopup);
                    mapRef.current.off("zoomend", handleUpdatePopup);
                }
                if (handleUpdateLabels) {
                    mapRef.current.off("moveend", handleUpdateLabels);
                    mapRef.current.off("zoomend", handleUpdateLabels);
                    mapRef.current.off("mapmove", handleUpdateLabels);
                    mapRef.current.off("zoomchange", handleUpdateLabels);
                }
            }
            if (handlePageHide) window.removeEventListener("pagehide", handlePageHide);
            if (handleVisibilityChange) {
                document.removeEventListener("visibilitychange", handleVisibilityChange);
            }
            if (handleResize) window.removeEventListener("resize", handleResize);
            if (resizeObserver) resizeObserver.disconnect();
            try { document.removeEventListener('mapstylechange', handleMapStyleChange); } catch (e) { }
            if (userLocationMarkerRef.current) {
                userLocationMarkerRef.current.setMap(null);
                userLocationMarkerRef.current = null;
            }
            if (mapRef.current && geolocationRef.current && typeof mapRef.current.removeControl === "function") {
                try {
                    mapRef.current.removeControl(geolocationRef.current);
                } catch (e) {
                    console.warn("移除定位控件失败", e);
                }
            }
            geolocationRef.current = null;
            if (mapRef.current && typeof mapRef.current.destroy === 'function') {
                try {
                    mapRef.current.destroy();
                } catch (e) {
                    console.warn('销毁地图实例失败', e);
                }
            }
            mapRef.current = null;
        };
    }, []);

    // Watch for dark mode changes and update AMap style accordingly (no re-init)
    useEffect(() => {
        if (!mapComplete || !mapRef.current || typeof window === 'undefined' || !window.AMap) return;
        const map = mapRef.current;
        try {
            trySetAnyAmapStyle(map, getPreferredCandidates(dark));
        } catch (e) {
            // ignore style apply errors
        }
    }, [dark, currentUser, mapComplete]);

    // 当用户信息加载完成后，立即强制更新地图样式
    // 确保用户已登录时使用用户的设置，而不是默认值
    useEffect(() => {
        if (!mapRef.current || !mapComplete || !currentUser) return;
        try {
            const map = mapRef.current;
            const isDark = dark;
            const preferred = getPreferredCandidates(isDark);
            trySetAnyAmapStyle(map, preferred);
        } catch (e) {
            console.warn('更新地图样式失败', e);
        }
    }, [currentUser, dark, mapComplete]);

    const loadPlaces = async (force = false) => {
        // 如果正在搜索，不请求附近地点，除非强制
        if (!force && searchResultsRef.current !== null) return;
        if (!mapRef.current) return;
        try {
            const bounds = mapRef.current.getBounds();
            if (!bounds) return;
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            const minLng = typeof sw.lng !== 'undefined' ? sw.lng : sw.getLng();
            const minLat = typeof sw.lat !== 'undefined' ? sw.lat : sw.getLat();
            const maxLng = typeof ne.lng !== 'undefined' ? ne.lng : ne.getLng();
            const maxLat = typeof ne.lat !== 'undefined' ? ne.lat : ne.getLat();

            let targetMinLng = minLng;
            let targetMinLat = minLat;
            let targetMaxLng = maxLng;
            let targetMaxLat = maxLat;

            const lngSpan = maxLng - minLng;
            const latSpan = maxLat - minLat;
            if (Number.isFinite(lngSpan) && Number.isFinite(latSpan) && lngSpan > 0 && latSpan > 0) {
                const marginLng = lngSpan * PREFETCH_BOUNDS_RATIO;
                const marginLat = latSpan * PREFETCH_BOUNDS_RATIO;
                targetMinLng = clampNumber(minLng - marginLng, -180, 180);
                targetMaxLng = clampNumber(maxLng + marginLng, -180, 180);
                targetMinLat = clampNumber(minLat - marginLat, -90, 90);
                targetMaxLat = clampNumber(maxLat + marginLat, -90, 90);
            }

            const data = await Api.fetchPlacesNearby(backendUrl, {
                minLng: targetMinLng,
                minLat: targetMinLat,
                maxLng: targetMaxLng,
                maxLat: targetMaxLat
            });
            setPlaces(data);
            placesRef.current = data;
            if (searchResultsRef.current === null) {
                renderMarkers(mapRef.current, markersRef, data, showPopup, {
                    onIndividualIds: (ids) => { visibleIndividualIdsRef.current = ids; }
                });
                // Schedule label update after markers render
                setTimeout(() => {
                    if (handleUpdateLabelsRef.current) handleUpdateLabelsRef.current();
                }, 50);
            }
        } catch (e) {
            console.error("加载地点失败", e);
        }
    };
    loadPlacesRef.current = loadPlaces;

    // Toggle favorite for a place
    const handleToggleFavorite = async (place) => {
        if (!place || place.isMarked === false) return;
        if (!token || !isAuthenticated) {
            showTip('核验通行凭证后可收藏');
            onRequireAuth && onRequireAuth();
            return;
        }
        if (isBanned) {
            showTip('您的通行凭证已受限，无法收藏');
            return;
        }
        const placeId = place.id;
        const isFav = favoriteIds.has(placeId);
        // Optimistic update
        setFavoriteIds(prev => {
            const next = new Set(prev);
            if (isFav) next.delete(placeId);
            else next.add(placeId);
            return next;
        });
        setFavoriteLoading(true);
        try {
            if (isFav) {
                await Api.removeFavorite(backendUrl, token, placeId);
            } else {
                await Api.addFavorite(backendUrl, token, placeId);
            }
        } catch (e) {
            // Rollback on error
            setFavoriteIds(prev => {
                const next = new Set(prev);
                if (isFav) next.add(placeId);
                else next.delete(placeId);
                return next;
            });
            showTip((isFav ? '取消收藏失败：' : '收藏失败：') + (e.message || e));
        } finally {
            setFavoriteLoading(false);
        }
    };
    // 优先在 React 层绘制
    // 若计算容器坐标失败则回退到 InfoWindow
    const showPopup = (p, lnglatObj) => {
        selectedPlaceRef.current = p;
        setSelectedPlace(p);
        const point = lngLatToContainerPointLocal(lnglatObj || { longitude: p.longitude, latitude: p.latitude });
        if (point) {
            setPopupPoint(point);
        } else {
            // 使用默认 InfoWindow
            try {
                const info = `<div style="min-width:160px"><strong>${p.name}</strong><div>${p.description || ""}</div><div>分类: ${p.category || "-"}</div></div>`;
                const infoWindow = new AMap.InfoWindow({ content: info });
                infoWindow.open(mapRef.current, [p.longitude, p.latitude]);
                // 清除 React 层选择
                selectedPlaceRef.current = null;
                setSelectedPlace(null);
                setPopupPoint(null);
            } catch (e) {
                console.warn("打开 InfoWindow 失败", e);
            }
        }
    };

    // 局部复制的容器转换函数（在组件作用域中用于 showPopup）
    const lngLatToContainerPointLocal = (lnglat) => {
        if (!mapRef.current || !lnglat) return null;
        try {
            const map = mapRef.current;
            if (typeof map.lngLatToContainer === "function") {
                const p = map.lngLatToContainer([lnglat.lng ?? lnglat.longitude, lnglat.lat ?? lnglat.latitude]);
                return { x: p.x, y: p.y };
            }
            if (typeof map.lnglatToContainer === "function") {
                const p = map.lnglatToContainer([lnglat.lng ?? lnglat.longitude, lnglat.lat ?? lnglat.latitude]);
                return { x: p.x, y: p.y };
            }
            if (typeof map.lnglatToPixel === "function") {
                const p = map.lnglatToPixel([lnglat.lng ?? lnglat.longitude, lnglat.lat ?? lnglat.latitude]);
                return { x: p.x, y: p.y };
            }
        } catch (e) { /* ignore */ }
        return null;
    };

    const ensureGeolocation = async () => {
        if (!mapRef.current || !window.AMap) {
            throw new Error("地图尚未就绪");
        }
        if (geolocationRef.current) {
            return geolocationRef.current;
        }

        return new Promise((resolve, reject) => {
            window.AMap.plugin("AMap.Geolocation", () => {
                try {
                    const geolocation = new window.AMap.Geolocation({
                        convert: true,
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 0,
                        GeoLocationFirst: true,
                        showButton: false,
                        showMarker: false,
                        showCircle: false,
                        panToLocation: false,
                        zoomToAccuracy: false,
                        getCityWhenFail: false
                    });

                    if (mapRef.current && typeof mapRef.current.addControl === "function") {
                        mapRef.current.addControl(geolocation);
                    }
                    geolocationRef.current = geolocation;
                    resolve(geolocation);
                } catch (error) {
                    reject(error);
                }
            });
        });
    };

    const ensureUserLocationMarker = (position) => {
        if (!mapRef.current || !window.AMap) return null;
        if (!userLocationMarkerRef.current) {
            userLocationMarkerRef.current = new window.AMap.Marker({
                position,
                title: "我的位置",
                zIndex: 3000
            });
            userLocationMarkerRef.current.setMap(mapRef.current);
            if (typeof userLocationMarkerRef.current.setTop === "function") {
                userLocationMarkerRef.current.setTop(true);
            }
        } else {
            userLocationMarkerRef.current.setPosition(position);
            if (!userLocationMarkerRef.current.getMap()) {
                userLocationMarkerRef.current.setMap(mapRef.current);
            }
        }
        return userLocationMarkerRef.current;
    };

    // 当 searchResults、places 或 darkMode 改变时确保 markers 与当前数据同步
    useEffect(() => {
        if (!mapRef.current) return;
        const listToRender = searchResults == null ? places : searchResults;
        const visibleMapPlaces = (listToRender || []).filter((place) => place.isMarked !== false || place.showOnMap === true);
        renderMarkers(mapRef.current, markersRef, visibleMapPlaces, showPopup);
        // 同步更新标签，避免旧标签残留
        setTimeout(() => {
            if (handleUpdateLabelsRef.current) handleUpdateLabelsRef.current();
        }, 50);
    }, [searchResults, places, dark]);

    const submitPlace = async (payload) => {
        if (!token) {
            onRequireAuth && onRequireAuth();
            return;
        }
        if (isBanned) {
            showTip('您的通行凭证已受限，无法提交地点。');
            return;
        }

        try {
            await Api.postPlace(backendUrl, token, payload);
            setAddingPos(null);
            setAddingPrefill(null);
            // 重新加载数据并清除搜索结果（若正在搜索）
            setSearchResults(null);
            setSearching(false);
            setAiThinking(false);
            setAiRecommendations([]);
            await loadPlaces(true); // force load since state hasn't updated ref yet
            setAddMode(false);
        } catch (e) {
            console.error("提交地点失败", e);
            showTip("提交失败: " + (e.message || e));
        }
    };

    // 提交搜索时同时启动快速字面匹配与 AI 语义推荐；快速结果不会等待 AI。
    const searchServer = async ({ q = "", center = undefined, bounds = undefined, limit = undefined, autoFit = true, includeUnmarked = true } = {}) => {
        const query = String(q || '').trim();
        if (!query) return;
        const readMapPoint = (point) => {
            const lat = Number(point?.lat ?? point?.getLat?.());
            const lng = Number(point?.lng ?? point?.getLng?.());
            return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
        };
        const mapCenter = readMapPoint(mapRef.current?.getCenter?.());
        const effectiveCenter = center || mapCenter;
        const mapBounds = mapRef.current?.getBounds?.();
        const southWest = readMapPoint(mapBounds?.getSouthWest?.());
        const northEast = readMapPoint(mapBounds?.getNorthEast?.());
        const effectiveBounds = bounds || (southWest && northEast ? {
            minLng: southWest.lng,
            minLat: southWest.lat,
            maxLng: northEast.lng,
            maxLat: northEast.lat
        } : undefined);
        if (!mapRef.current && !effectiveCenter) {
            console.warn("searchServer: 地图尚未就绪且未传入 center，直接返回");
            return;
        }

        searchAbortControllersRef.current.forEach((controller) => controller.abort());
        const fastController = new AbortController();
        const aiController = new AbortController();
        searchAbortControllersRef.current = [fastController, aiController];
        const requestId = ++searchRequestIdRef.current;
        let baseData = [];
        let fastSettled = false;
        let resolvedRecommendations = [];

        const mergeRecommendations = (data, recommendations) => {
            const validRecommendations = (Array.isArray(recommendations) ? recommendations : [])
                .filter((recommendation) => recommendation?.place)
                .slice(0, 3);
            if (!validRecommendations.length) return data;
            const recommendedIds = new Set(validRecommendations.map((recommendation) => String(recommendation.place.id)));
            return [
                ...validRecommendations.map((recommendation) => recommendation.place),
                ...data.filter((place) => !recommendedIds.has(String(place.id)))
            ];
        };

        const publishResults = (data, recommendations) => {
            if (requestId !== searchRequestIdRef.current) return;
            const merged = mergeRecommendations(data, recommendations);
            setSearchResults(merged);
            const visibleMapPlaces = merged.filter((place) => place.isMarked !== false || place.showOnMap === true);
            renderMarkers(mapRef.current, markersRef, visibleMapPlaces, showPopup);
        };

        setSearching(true);
        setAiThinking(true);
        setAiRecommendations([]);

        // Both network calls are created before either one is awaited.
        const fastPromise = Api.searchPlacesFast(backendUrl, {
            q: query,
            center: effectiveCenter,
            limit,
            signal: fastController.signal
        });
        const aiPromise = Api.searchPlacesAi(backendUrl, {
            q: query,
            limit: 5,
            center: effectiveCenter,
            bounds: effectiveBounds,
            signal: aiController.signal
        });

        aiPromise
            .then((result) => {
                if (requestId !== searchRequestIdRef.current) return;
                resolvedRecommendations = Array.isArray(result?.recommendations)
                    ? result.recommendations.filter((recommendation) => recommendation?.place).slice(0, 3)
                    : (result?.recommendation?.place ? [result.recommendation] : []);
                setAiRecommendations(resolvedRecommendations);
                if (fastSettled && resolvedRecommendations.length) publishResults(baseData, resolvedRecommendations);
            })
            .catch((error) => {
                if (error?.name !== 'AbortError' && requestId === searchRequestIdRef.current) {
                    console.warn('AI search unavailable; keeping fast results:', error.message || error);
                }
            })
            .finally(() => {
                if (requestId === searchRequestIdRef.current) setAiThinking(false);
            });

        try {
            const markedData = await fastPromise;
            if (requestId !== searchRequestIdRef.current) return;
            const markedResults = (Array.isArray(markedData) ? markedData : []).map((place) => {
                const distanceKm = place.distance_km == null ? Number.NaN : Number(place.distance_km);
                return Number.isFinite(distanceKm) ? { ...place, dist: distanceKm * 1000 } : place;
            });

            let unmarkedData = [];
            if (includeUnmarked && window.AMap) {
                unmarkedData = await new Promise(resolve => {
                    window.AMap.plugin('AMap.PlaceSearch', () => {
                        const ps = new window.AMap.PlaceSearch({
                            pageSize: 20,
                            pageIndex: 1
                        });
                        const cpoint = effectiveCenter
                            ? [effectiveCenter.lng, effectiveCenter.lat]
                            : (mapRef.current ? [mapRef.current.getCenter().lng, mapRef.current.getCenter().lat] : null);

                        if (cpoint) {
                            ps.searchNearBy(query, cpoint, 20000, (status, result) => {
                                if (status === 'complete' && result.info === 'OK') {
                                    resolve(result.poiList.pois || []);
                                } else {
                                    resolve([]);
                                }
                            });
                        } else {
                            ps.search(query, (status, result) => {
                                if (status === 'complete' && result.info === 'OK') {
                                    resolve(result.poiList.pois || []);
                                } else {
                                    resolve([]);
                                }
                            });
                        }
                    });
                });
            }
            if (requestId !== searchRequestIdRef.current) return;

            const processUnmarked = unmarkedData.map(p => {
                const lng = p.location?.lng;
                const lat = p.location?.lat;
                if (!lng || !lat) return null;

                const allKnown = [...(places || []), ...markedResults];
                let isKnown = false;
                if (window.AMap) {
                    for (const kp of allKnown) {
                        if (!kp.longitude || !kp.latitude) continue;
                        const d = window.AMap.GeometryUtil.distance(
                            new window.AMap.LngLat(lng, lat),
                            new window.AMap.LngLat(kp.longitude, kp.latitude)
                        );
                        if (d < 50) {
                            isKnown = true;
                            break;
                        }
                    }
                }
                if (isKnown) return null;

                const dist = effectiveCenter && window.AMap
                    ? window.AMap.GeometryUtil.distance(
                        new window.AMap.LngLat(effectiveCenter.lng, effectiveCenter.lat),
                        new window.AMap.LngLat(lng, lat)
                    )
                    : null;

                return {
                    id: 'amap_' + p.id,
                    name: p.name,
                    longitude: lng,
                    latitude: lat,
                    address: p.address || `${p.pname || ''}${p.cityname || ''}${p.adname || ''}`,
                    category: p.type || "高德地点",
                    isMarked: false,
                    showOnMap: false,
                    ...(Number.isFinite(dist) ? { dist } : {})
                };
            }).filter(Boolean);

            baseData = includeUnmarked ? [...markedResults, ...processUnmarked] : markedResults;
            fastSettled = true;

            publishResults(baseData, resolvedRecommendations);
            // 若匹配成功，调整视野到所有匹配 marker
            if (autoFit) {
                const markers = markersRef.current;
                if (markers && markers.length > 0) {
                    skipNextSearchRef.current = true;
                    if (skipSearchTimerRef.current) {
                        window.clearTimeout(skipSearchTimerRef.current);
                    }
                    skipSearchTimerRef.current = window.setTimeout(() => {
                        skipNextSearchRef.current = false;
                        skipSearchTimerRef.current = null;
                    }, 800);
                    try {
                        mapRef.current.setFitView(markers);
                    } catch (e) {
                        const first = baseData[0];
                        if (first) {
                            mapRef.current.setCenter([first.longitude, first.latitude]);
                            mapRef.current.setZoom(15);
                        }
                    }
                }
            }
        } catch (e) {
            if (e?.name !== 'AbortError') console.error("searchServer error", e);
            if (requestId === searchRequestIdRef.current) {
                fastSettled = true;
                publishResults([], resolvedRecommendations);
            }
        } finally {
            if (requestId === searchRequestIdRef.current) setSearching(false);
        }
    };
    searchServerRef.current = searchServer;

    const searchAllMarkers = async () => {
        // 兼容旧名：直接调用后端搜全局（不传 center）
        await searchServer({ q: searchTerm });
    };

    const clearSearch = async () => {
        await clearSearchState({ resetTerm: true, closeSearchUi: false });
    };

    const handleSelectSuggestion = (item) => {
        setSearchResults([item?.isMarked === false ? { ...item, showOnMap: true } : item]);
    };

    // 处理分享链接中的 ?place=<id> 参数：加载单个地点并居中
    useEffect(() => {
        if (!mapReady || !backendUrl) return;
        const params = new URLSearchParams(window.location.search);
        const placeId = params.get('place');
        if (!placeId) return;

        const isNavShare = params.get('nav') === 'amap';

        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${backendUrl}/places/${placeId}`);
                if (!res.ok || cancelled) return;
                const place = await res.json();
                if (!place || !place.longitude || !place.latitude || cancelled) return;

                if (isNavShare) {
                    // 高德导航分享：直接跳转到高德地图导航
                    const label = encodeURIComponent((place.name || '目的地').trim());
                    const lng = place.longitude;
                    const lat = place.latitude;
                    window.location.href = `https://uri.amap.com/navigation?to=${lng},${lat},${label}&mode=car&src=yUYUko_food_MAP`;
                    return;
                }

                setSearchTerm(place.name || '');
                setSearchResults([place]);
                setSearchResetKey((v) => v + 1); // 通知 MapUI 关闭搜索建议面板，呈现"已提交"状态
                armSkipAutoSearch(800);
                mapRef.current.setCenter([place.longitude, place.latitude]);
                mapRef.current.setZoom(16);
            } catch (e) {
                console.warn('加载分享地点失败', e);
            }
        })();

        return () => { cancelled = true; };
    }, [mapReady, backendUrl]);

    const handleToggleAddMode = () => {
        if (!mapReady || authPending) return;
        if (!canWrite) {
            if (isBanned) {
                showTip('您的通行凭证已受限，无法添加地点');
                return;
            }
            onRequireAuth && onRequireAuth();
            return;
        }
        setAddMode((v) => {
            const next = !v;
            if (next) clearSearchState();
            return next;
        });
    };

    const handleCreateAtCenter = () => {
        if (!mapRef.current) return;
        clearSearchState();
        const center = mapRef.current.getCenter();
        const lng = center.lng || (center.lnglat && center.lnglat.lng) || center.getLng && center.getLng();
        const lat = center.lat || (center.lnglat && center.lnglat.lat) || center.getLat && center.getLat();
        setAddingPos([lng, lat]);
    };

    const closePopup = () => {
        selectedPlaceRef.current = null;
        setSelectedPlace(null);
        setPopupPoint(null);
        setManageOpen(false);
        setManageMessage("");
    };

    const handleLocateMe = async () => {
        if (!mapReady || !mapRef.current) {
            return;
        }

        if (!MapUtils.canUseLocationInCurrentContext()) {
            const message = "定位功能仅在 HTTPS 或 localhost 环境下可用。";
            setLocationError(message);
            showTip(message);
            return;
        }

        setLocating(true);
        setLocationError("");

        try {
            const geolocation = await ensureGeolocation();
            const result = await new Promise((resolve, reject) => {
                geolocation.getCurrentPosition((status, locateResult) => {
                    if (status === "complete" && locateResult && locateResult.position) {
                        resolve(locateResult);
                        return;
                    }
                    reject(locateResult || new Error("定位失败"));
                });
            });

            const position = MapUtils.normalizeLngLat(result.position);
            if (!position) {
                throw new Error("定位结果缺少有效坐标");
            }

            ensureUserLocationMarker([position.lng, position.lat]);

            const currentZoomRaw = Number(mapRef.current.getZoom());
            const nextZoom = Number.isFinite(currentZoomRaw)
                ? Math.max(currentZoomRaw, MapUtils.LOCATE_ME_MIN_ZOOM)
                : MapUtils.LOCATE_ME_MIN_ZOOM;
            if (typeof mapRef.current.setZoomAndCenter === "function") {
                mapRef.current.setZoomAndCenter(nextZoom, [position.lng, position.lat]);
            } else {
                mapRef.current.setCenter([position.lng, position.lat]);
                mapRef.current.setZoom(nextZoom);
            }
        } catch (error) {
            const message = MapUtils.getLocationErrorMessage(error);
            setLocationError(message);
            console.error("定位失败", error);
            showTip(message);
        } finally {
            setLocating(false);
        }
    };

    // 尝试从 selectedPlace 中读出最后修改人/时间，兼容多种字段名，优先使用名字字段并仅保留到日（YYYY-MM-DD）
    const getLastModifierText = (place) => {
        if (!place) return "-";
        // 优先尝试带名字的字段，再回退到 id/其他字段
        const nameFields = place.updated_by_name || place.updater_name || place.modified_by_name || place.last_modified_by_name || place.creator_name || place.created_by_name || null;
        const idFields = place.updated_by || place.modified_by || place.last_modified_by || place.updater || place.creator_id || place.creator || place.created_by || null;
        const by = nameFields || `uid${idFields}` || null;
        const rawDate = place.updated_at || place.updated_time || place.modified_time || place.last_modified_at || place.modifiedAt || place.updatedAt || place.created_time || null;
        let when = "-";
        if (rawDate) {
            try {
                const d = (typeof rawDate === "number" || /^\d+$/.test(String(rawDate))) ? new Date(Number(rawDate)) : new Date(String(rawDate));
                if (!isNaN(d.getTime())) {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(d.getDate()).padStart(2, '0');
                    when = `${y}-${m}-${dd}`;
                }
            } catch (e) { }
        }
        const result = `${by || "-"} · ${when}`;
        try { console.debug && console.debug('[getLastModifierText]', { id: place.id, by, rawDate, formatted: result }); } catch (e) { }
        return result;
    };

    const openCreateFromPoi = () => {
        if (!selectedPlace) return;
        if (!token) {
            onRequireAuth && onRequireAuth();
            return;
        }
        if (isBanned) {
            showTip('您的通行凭证已受限，无法提交地点。');
            return;
        }
        clearSearchState();
        closePopup();
        setAddingPos([selectedPlace.longitude, selectedPlace.latitude]);
        setAddingPrefill({
            name: selectedPlace.name || "",
            category: selectedPlace.category || "",
            description: selectedPlace.description || selectedPlace.address || ""
        });
    };

    // 打开管理面板（依据当前用户权限选择直接编辑或提交申请）
    const openManagePanel = async () => {
        if (!selectedPlace) return;
        if (!token) {
            onRequireAuth && onRequireAuth();
            return;
        }
        if (isBanned) {
            showTip('您的通行凭证已受限，无法进行管理操作');
            return;
        }
        clearSearchState();
        if (!currentUser && !fetchingUser) {
            try {
                setFetchingUser(true);
                const user = await Api.fetchCurrentUser(backendUrl, token);
                if (user) setCurrentUser(user);
            } catch (e) {
                console.warn("获取当前用户失败", e);
            } finally {
                setFetchingUser(false);
            }
        }
        setManageEdit({
            name: selectedPlace.name || "",
            category: selectedPlace.category || "",
            description: selectedPlace.description || "",
            per_person_cost: selectedPlace.per_person_cost != null ? selectedPlace.per_person_cost : null,
            exterior_images: selectedPlace.exterior_images ? JSON.parse(selectedPlace.exterior_images) : [],
            menu_images: selectedPlace.menu_images ? JSON.parse(selectedPlace.menu_images) : []
        });
        setManageMessage("");
        setManageOpen(true);
    };

    // 判断当前用户是否可直接管理
    const canDirectManage = () => {
        if (!selectedPlace || !currentUser) return false;
        const isCreator = String(selectedPlace.creator_id) === String(currentUser.id);
        const isAdmin = !!(currentUser && currentUser.admin_level);
        return isCreator || isAdmin;
    };

    // 直接删除
    const handleDirectDelete = async () => {
        if (!selectedPlace) return;
        if (!token) { onRequireAuth && onRequireAuth(); return; }
        if (isBanned) { showTip('您的通行凭证已受限，无法删除地点'); return; }
        if (!(await confirm("确认删除此地点？此操作不可恢复。"))) return;
        setManageSubmitting(true);
        try {
            await Api.deletePlace(backendUrl, token, selectedPlace.id);
            setManageMessage("已删除");
            setManageOpen(false);
            closePopup();
            await loadPlaces();
        } catch (e) {
            console.error("删除失败", e);
            setManageMessage("删除失败：" + (e.message || e));
        } finally {
            setManageSubmitting(false);
        }
    };

    // 直接更新
    const handleDirectUpdate = async () => {
        if (!selectedPlace) return;
        if (!token) { onRequireAuth && onRequireAuth(); return; }
        if (isBanned) { showTip('您的通行凭证已受限，无法更新地点'); return; }
        setManageSubmitting(true);
        try {
            const payload = {
                name: (manageEdit.name || "").trim(),
                category: (manageEdit.category || "").trim(),
                description: (manageEdit.description || "").trim(),
                per_person_cost: manageEdit.per_person_cost,
                exterior_images: (manageEdit.exterior_images || []).filter(Boolean),
                menu_images: (manageEdit.menu_images || []).filter(Boolean)
            };
            await Api.putPlace(backendUrl, token, selectedPlace.id, payload);
            setManageMessage("已更新");
            setManageOpen(false);
            closePopup();
            await loadPlaces();
        } catch (e) {
            console.error("更新失败", e);
            setManageMessage("更新失败：" + (e.message || e));
        } finally {
            setManageSubmitting(false);
        }
    };

    // 提交修改申请 -> 提交到管理员后台由管理员审核
    const handleSubmitModifyRequest = async () => {
        if (!selectedPlace) return;
        if (!token) { onRequireAuth && onRequireAuth(); return; }
        if (isBanned) { showTip('您的通行凭证已受限，无法提交修改申请'); return; }
        setManageSubmitting(true);
        try {
            const payload = {
                place_id: selectedPlace.id,
                proposed: {
                    name: (manageEdit.name || "").trim(),
                    category: (manageEdit.category || "").trim(),
                    description: (manageEdit.description || "").trim(),
                    per_person_cost: manageEdit.per_person_cost,
                    exterior_images: (manageEdit.exterior_images || []).filter(Boolean),
                    menu_images: (manageEdit.menu_images || []).filter(Boolean)
                },
                note: "用户提交地点信息修改申请"
            };
            await Api.postPlaceRequest(backendUrl, token, payload);
            setManageMessage("申请已提交，管理员将会审核。");
            setManageOpen(false);
        } catch (e) {
            console.error("提交申请失败", e);
            setManageMessage("提交申请失败：" + (e.message || e));
        } finally {
            setManageSubmitting(false);
        }
    };

    const openCommentPanel = async () => {
        if (!selectedPlace) return;
        setCommentMessage("");
        if (!token) {
            onRequireAuth && onRequireAuth();
            return;
        }
        clearSearchState();
        // 当用户被封禁时显示提示（仍允许查看评论，但不能发布）
        if (isBanned) {
            showTip('您的通行凭证已受限，无法发表评论');
        }
        setCommentOpen(true);
        await fetchComments();
    };

    const closeCommentPanel = () => {
        setCommentOpen(false);
        setCommentsList([]);
        setNewComment("");
        setCommentMessage("");
    };

    const fetchComments = async () => {
        if (!selectedPlace) return;
        setCommentsLoading(true);
        setCommentMessage("");
        try {
            const res = await fetch(`${backendUrl}/comments/place/${selectedPlace.id}`);
            if (!res.ok) throw new Error(`fetch comments failed ${res.status}`);
            const data = await res.json();
            setCommentsList(data || []);
        } catch (e) {
            console.error('fetchComments error', e);
            setCommentMessage('加载评论失败');
        } finally {
            setCommentsLoading(false);
        }
    };

    const submitComment = async () => {
        if (!selectedPlace) return;
        if (!token) { onRequireAuth && onRequireAuth(); return; }
        if (isBanned) { setCommentMessage('您的通行凭证已受限，无法发表评论'); return; }
        if (!newComment || !newComment.trim()) return;
        setCommentSubmitting(true);
        setCommentMessage("");
        try {
            const res = await fetch(`${backendUrl}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ place_id: selectedPlace.id, content: newComment.trim() })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 401) { onRequireAuth && onRequireAuth(); return; }
                throw new Error(data.error || `post failed ${res.status}`);
            }
            // prepend new comment
            setCommentsList(list => [data, ...list]);
            setNewComment("");
            setCommentMessage('已发布');
        } catch (e) {
            console.error('submitComment failed', e);
            setCommentMessage('发布失败：' + (e.message || e));
        } finally {
            setCommentSubmitting(false);
        }
    };

    return (
        <>
            <MapUI
                places={places}
                mapRef={mapRef}
                userLocationMarkerRef={userLocationMarkerRef}
                backendUrl={backendUrl}
                token={token}
                containerRef={containerRef}
                searchTerm={searchTerm}
                setSearchTerm={handleSearchTermChange}
                clearSearch={clearSearch}
                searchResetKey={searchResetKey}
                searchServer={searchServer}
                searchResults={searchResults}
                aiThinking={aiThinking}
                aiRecommendations={aiRecommendations}
                onProgrammaticMapMove={armSkipAutoSearch}
                onSelectSuggestion={handleSelectSuggestion}
                mapReady={mapReady}
                searching={searching}
                tipText={tipText}
                customThemeColor={customThemeColor}
                customThemeSecondary={customThemeSecondary}
                markerLabels={markerLabels}
                authPending={authPending}
                handleLocateMe={handleLocateMe}
                locating={locating}
                addMode={addMode}
                handleToggleAddMode={handleToggleAddMode}
                addPlaceTipText={addPlaceTipText}
                popupPoint={popupPoint}
                selectedPlace={selectedPlace}
                getLastModifierText={getLastModifierText}
                openManagePanel={openManagePanel}
                openCreateFromPoi={openCreateFromPoi}
                openCommentPanel={openCommentPanel}
                closePopup={closePopup}
                manageOpen={manageOpen}
                manageEdit={manageEdit}
                setManageEdit={setManageEdit}
                manageSubmitting={manageSubmitting}
                manageMessage={manageMessage}
                canDirectManage={canDirectManage}
                onManageClose={() => { setManageOpen(false); setManageMessage(""); }}
                onManageSave={handleDirectUpdate}
                onManageDelete={handleDirectDelete}
                onManageSubmitRequest={handleSubmitModifyRequest}
                addingPos={addingPos}
                addingPrefill={addingPrefill}
                onAddCancel={() => { setAddingPos(null); setAddMode(false); setAddingPrefill(null); }}
                onAddSubmit={submitPlace}
                favoriteIds={favoriteIds}
                favoriteLoading={favoriteLoading}
                onToggleFavorite={handleToggleFavorite}
                isAuthenticated={isAuthenticated}
                currentUser={currentUser}
                isAdmin={isAdmin}
                onRequireAuth={onRequireAuth}
                onOpenDinners={onOpenDinners}
                onOpenMine={onOpenMine}
                onLogout={onLogout}
                onOpenAdmin={onOpenAdmin}
                onOpenPosterExport={onOpenPosterExport}
                desktopHeaderMenu={desktopHeaderMenu}
                pickerMode={pickerMode}
                pickerContext={pickerContext}
                pickedPlaces={pickedPlaces}
                onPickPlace={onPickPlace}
                onRemovePickedPlace={onRemovePickedPlace}
                onPickerClose={onPickerClose}
                showTip={showTip}
            />

            {commentOpen && selectedPlace && (
                <CommentPanel
                    place={selectedPlace}
                    comments={commentsList}
                    loading={commentsLoading}
                    message={commentMessage}
                    newComment={newComment}
                    setNewComment={setNewComment}
                    submitting={commentSubmitting}
                    onClose={closeCommentPanel}
                    onRefresh={fetchComments}
                    onSubmit={submitComment}
                    canPost={isAuthenticated && !isBanned}
                />
            )}
        </>
    );
}
