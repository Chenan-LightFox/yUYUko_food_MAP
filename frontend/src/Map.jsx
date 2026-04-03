import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import * as MapUtils from './map/utils';
import * as Api from './map/api';
import { renderMarkers } from './map/markers';
import MapUI from './map/MapUI';
import CommentPanel from './map/CommentPanel';
import { useTips } from "./components/Tips";
import Tooltip from './components/Tooltip';
import Button from './components/Button';

const DEFAULT_CENTER = MapUtils.DEFAULT_CENTER;
const DEFAULT_ZOOM = MapUtils.DEFAULT_ZOOM;
const { normalizeLngLat, readSavedMapView, shouldPersistMapView, MAP_VIEW_STORAGE_KEY, MAP_VIEW_SAVE_DEBOUNCE_MS, LOCATE_ME_MIN_ZOOM, canUseLocationInCurrentContext, getLocationErrorMessage } = MapUtils;



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

export default function MapView({ backendUrl, token, isAuthenticated, onRequireAuth }) {
    const containerRef = useRef(null);  // 引用地图容器
    const mapRef = useRef(null);        // 存储 AMap 实例
    const markersRef = useRef([]);      // 存储当前地图上的 marker 实例，方便更新时清除旧 marker
    const geolocationRef = useRef(null);    // 缓存高德定位实例，避免重复创建
    const userLocationMarkerRef = useRef(null); // 单独维护“我的位置” marker，避免被地点 marker 重绘清掉
    const addModeRef = useRef(false);   // 用于在地图事件中读取最新的添加模式状态
    const saveViewTimerRef = useRef(null);  // 记录视野持久化防抖 timer
    const lastSavedViewRef = useRef(null);  // 缓存最后一次成功持久化的视野

    const [addingPos, setAddingPos] = useState(null);   // 点击地图后要添加地点的位置
    const [places, setPlaces] = useState([]);           // 当前加载的地点列表
    const [mapReady, setMapReady] = useState(false);    // 地图是否初始化完毕
    const [addMode, setAddMode] = useState(false);      // 是否处于“添加地点”模式
    const [searchTerm, setSearchTerm] = useState("");   // 搜索关键词
    const [searchResults, setSearchResults] = useState(null);   // 搜索结果列表，null 表示未搜索或已清除搜索
    const [searching, setSearching] = useState(false);  // 是否正在搜索中
    const [locating, setLocating] = useState(false);    // 是否正在定位中
    const [locationError, setLocationError] = useState("");  // 最近一次定位错误，供 tooltip 提示

    const [selectedPlace, setSelectedPlace] = useState(null); // 被选中的地点对象（来自 places）
    const [popupPoint, setPopupPoint] = useState(null); // { x, y } 相对于地图容器的像素位置
    const selectedPlaceRef = useRef(null);
    const hasToken = !!token;
    const authPending = hasToken && !isAuthenticated;
    const canWrite = hasToken && isAuthenticated;

    const tipText = mapReady ? "点击查找地点" : "地图尚未就绪，稍候再试"; // 查找功能 tooltip 提示
    const locationTipText = !mapReady
        ? "地图尚未就绪，稍候再试"
        : (locationError || (canUseLocationInCurrentContext()
            ? "点击获取当前位置并在地图上标记"
            : "定位功能仅在 HTTPS 或 localhost 环境下可用"));
    const addPlaceTipText = !mapReady
        ? "地图尚未就绪，稍候再试"
        : authPending
            ? "正在验证登录状态，请稍候再试"
            : canWrite
                ? (addMode ? "点击取消添加模式" : "点击后在地图上选择位置以添加地点")
                : "登录后才能添加地点";

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
        let pollTimer = null;
        let handleMapClick = null;
        let handleViewChange = null;
        let handlePageHide = null;
        let handleVisibilityChange = null;
        let handleUpdatePopup = null;
        let handleResize = null;
        let resizeObserver = null;

        const getCurrentMapView = () => {
            if (!mapRef.current) return null;
            const center = normalizeLngLat(mapRef.current.getCenter());
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
            if (!force && !shouldPersistMapView(lastSavedViewRef.current, currentView)) return;
            try {
                window.localStorage.setItem(MAP_VIEW_STORAGE_KEY, JSON.stringify(currentView));
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
            }, MAP_VIEW_SAVE_DEBOUNCE_MS);
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
            const savedView = readSavedMapView();
            mapRef.current = new AMap.Map(containerRef.current, {
                resizeEnable: true,
                center: savedView ? [savedView.lng, savedView.lat] : DEFAULT_CENTER,
                zoom: savedView ? savedView.zoom : DEFAULT_ZOOM
            });
            lastSavedViewRef.current = savedView;

            handleMapClick = (e) => {
                if (!addModeRef.current) return;
                const { lng, lat } = e.lnglat;
                setAddingPos([lng, lat]);
            };
            handleViewChange = () => {
                schedulePersistMapView();
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
            handleResize = () => {
                if (mapRef.current && typeof mapRef.current.resize === "function") {
                    mapRef.current.resize();
                }
                handleUpdatePopup();
            };

            mapRef.current.on("click", handleMapClick);
            mapRef.current.on("moveend", handleViewChange);
            mapRef.current.on("zoomend", handleViewChange);
            mapRef.current.on("moveend", handleUpdatePopup);
            mapRef.current.on("zoomend", handleUpdatePopup);
            window.addEventListener("resize", handleResize);
            if (containerRef.current && typeof ResizeObserver !== "undefined") {
                resizeObserver = new ResizeObserver(() => {
                    handleResize();
                });
                resizeObserver.observe(containerRef.current);
            }

            window.addEventListener("pagehide", handlePageHide);
            document.addEventListener("visibilitychange", handleVisibilityChange);

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
            }
            if (handlePageHide) window.removeEventListener("pagehide", handlePageHide);
            if (handleVisibilityChange) {
                document.removeEventListener("visibilitychange", handleVisibilityChange);
            }
            if (handleResize) window.removeEventListener("resize", handleResize);
            if (resizeObserver) resizeObserver.disconnect();
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
        };
    }, []);

    const loadPlaces = async () => {
        try {
            const res = await fetch(`${backendUrl}/places`);
            const data = await res.json();
            setPlaces(data);
            renderMarkers(data);
        } catch (e) {
            console.error("加载地点失败", e);
        }
    };

    // 用于展示自定义弹窗
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
                const infoWindow = new AMap.InfoWindow({ content: buildInfoWindowContent(p) });
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

    const renderMarkers = (list) => {
        // 清空旧 markers
        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = [];
        // 检测初始化
        if (!mapRef.current) {
            console.warn("renderMarkers: 地图尚未初始化，跳过渲染");
            return [];
        }
        const created = [];
        list.forEach((p) => {
            // TODO: 修改为自己的Marker图标
            const marker = new AMap.Marker({
                position: [p.longitude, p.latitude],
                title: p.name
            });
            marker.setMap(mapRef.current);
            marker.on("click", () => {
                const pos = marker.getPosition();
                // pos 可能是对象或数组，统一传入 { longitude, latitude } 或 { lng, lat }
                const lnglatObj = (pos && pos.lng != null && pos.lat != null) ? { lng: pos.lng, lat: pos.lat } : { longitude: p.longitude, latitude: p.latitude };
                showPopup(p, lnglatObj);
            });
            markersRef.current.push(marker);
            created.push(marker);
        });
        return created;
    };

    // 当 searchResults 或 places 改变时确保 markers 与当前数据同步
    useEffect(() => {
        if (!mapRef.current) return;
        const listToRender = searchResults == null ? places : searchResults;
        renderMarkers(listToRender || []);
    }, [searchResults, places]);

    const submitPlace = async (payload) => {
        if (!token) {
            onRequireAuth && onRequireAuth();
            return;
        }

        try {
            const res = await fetch(`${backendUrl}/places`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                if (res.status === 401) {
                    onRequireAuth && onRequireAuth();
                }
                const text = await res.text().catch(() => "");
                throw new Error(`后端错误 ${res.status} ${res.statusText} ${text}`);
            }
            await res.json();
            setAddingPos(null);
            // 重新加载数据并清除搜索结果（若正在搜索）
            await loadPlaces();
            setSearchResults(null);
            setSearching(false);
            setAddMode(false);
        } catch (e) {
            console.error("提交地点失败", e);
            alert("提交失败: " + (e.message || e));
        }
    };

    // 使用后端 /api/places/search 接口进行搜索（注意 /api 前缀）
    const searchServer = async ({ q = "", center = undefined, limit = 200 } = {}) => {
        if (!mapRef.current && !center) {
            console.warn("searchServer: 地图尚未就绪且未传入 center，直接返回");
            return;
        }
        setSearching(true);
        try {
            const params = new URLSearchParams();
            params.set("q", q || "");
            if (limit) params.set("limit", String(limit));
            if (center && center.lat != null && center.lng != null) {
                params.set("centerLat", String(center.lat));
                params.set("centerLng", String(center.lng));
            }
            const url = `${backendUrl}/api/places/search?${params.toString()}`;
            const res = await fetch(url);
            const data = await res.json();
            setSearchResults(data);
            renderMarkers(data);
            // 若匹配成功，调整视野到所有匹配 marker
            const markers = markersRef.current;
            if (markers && markers.length > 0) {
                try {
                    mapRef.current.setFitView(markers);
                } catch (e) {
                    const first = data[0];
                    if (first) {
                        mapRef.current.setCenter([first.longitude, first.latitude]);
                        mapRef.current.setZoom(15);
                    }
                }
            }
        } catch (e) {
            console.error("searchServer error", e);
        } finally {
            setSearching(false);
        }
    };

    const searchAllMarkers = async () => {
        // 兼容旧名：直接调用后端搜全局（不传 center）
        await searchServer({ q: searchTerm });
    };

    const clearSearch = async () => {
        setSearchTerm("");
        setSearchResults(null);
        setSearching(false);
        await loadPlaces();
    };

    const handleToggleAddMode = () => {
        if (!mapReady || authPending) return;
        if (!canWrite) {
            onRequireAuth && onRequireAuth();
            return;
        }
        setAddMode((v) => !v);
    };

    const handleCreateAtCenter = () => {
        if (!mapRef.current) return;
        const center = mapRef.current.getCenter();
        const lng = center.lng || (center.lnglat && center.lnglat.lng) || center.getLng && center.getLng();
        const lat = center.lat || (center.lnglat && center.lnglat.lat) || center.getLat && center.getLat();
        setAddingPos([lng, lat]);
    };

    const closePopup = () => {
        selectedPlaceRef.current = null;
        setSelectedPlace(null);
        setPopupPoint(null);
    };

    const handleLocateMe = async () => {
        if (!mapReady || !mapRef.current) {
            return;
        }

        if (!canUseLocationInCurrentContext()) {
            const message = "定位功能仅在 HTTPS 或 localhost 环境下可用。";
            setLocationError(message);
            alert(message);
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

            const position = normalizeLngLat(result.position);
            if (!position) {
                throw new Error("定位结果缺少有效坐标");
            }

            ensureUserLocationMarker([position.lng, position.lat]);

            const currentZoomRaw = Number(mapRef.current.getZoom());
            const nextZoom = Number.isFinite(currentZoomRaw)
                ? Math.max(currentZoomRaw, LOCATE_ME_MIN_ZOOM)
                : LOCATE_ME_MIN_ZOOM;
            if (typeof mapRef.current.setZoomAndCenter === "function") {
                mapRef.current.setZoomAndCenter(nextZoom, [position.lng, position.lat]);
            } else {
                mapRef.current.setCenter([position.lng, position.lat]);
                mapRef.current.setZoom(nextZoom);
            }
        } catch (error) {
            const message = getLocationErrorMessage(error);
            setLocationError(message);
            console.error("定位失败", error);
            alert(message);
        } finally {
            setLocating(false);
        }
    };

    return (
        <>
            {/* 确保地图容器有尺寸，避免 AMap 无法渲染 */}
            <div ref={containerRef} id="map" style={{ width: "100%", height: "100%", position: "relative" }}></div>

            <div style={{ position: "absolute", right: 8, top: 8, zIndex: 2000 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {/* 搜索输入与按钮 */}
                    <input
                        placeholder="搜索关键词（例如：火锅/店名）"
                        value={searchTerm}
                        onChange={(e) => {
                            const v = e.target.value;
                            setSearchTerm(v);
                            // 用户清空输入时立即恢复所有 marker
                            if (!v || !v.trim()) {
                                clearSearch();
                            }
                        }}
                        style={{ width: 220, padding: "6px 8px" }}
                        disabled={!mapReady || searching}
                    />
                    <Tooltip text={tipText}>
                        <Button onClick={() => searchServer({ q: searchTerm })} disabled={!mapReady || searching || !searchTerm}>
                            {searching ? "搜索中..." : "按关键字查找"}
                        </Button>
                    </Tooltip>
                </div>
            </div>

            <div style={{ position: "absolute", right: 8, bottom: 8, zIndex: 2000 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                    <Tooltip text={locationTipText} placement="top">
                        <div style={{ display: "inline-block" }}>
                            <Button
                                onClick={handleLocateMe}
                                disabled={!mapReady || locating}
                                aria-label="点击获取当前位置并添加标记点"
                                style={{
                                    background: locating ? "#4f8cff" : undefined,
                                    borderColor: locating ? "#4f8cff" : undefined,
                                    color: locating ? "#fff" : undefined
                                }}
                            >
                                {locating ? "定位中..." : "定位我"}
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
                                        background: addMode ? '#e02424' : '#002fa7',
                                        color: '#fff',
                                        border: 'none',
                                        boxShadow: addMode ? '0 4px 12px rgba(224,36,36,0.2)' : '0 4px 12px rgba(0,47,167,0.2)',
                                        transition: 'background 180ms ease, transform 220ms ease',
                                        cursor: (!mapReady || authPending) ? 'not-allowed' : 'pointer',
                                        opacity: (!mapReady || authPending) ? 0.6 : 1
                                    }}
                                >
                                    <span style={{
                                        display: 'inline-block',
                                        fontSize: 36,
                                        fontWeight: 'bold',
                                        marginTop: 1,
                                        lineHeight: 1,
                                        transform: addMode ? 'rotate(-45deg)' : 'rotate(0deg)',
                                        transition: 'transform 220ms ease'
                                    }}>+</span>
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
                        <div style={{ marginTop: 8, textAlign: "right" }}>
                            <Tooltip text="管理此地点">
                                <Button onClick={() => { /* TODO: 打开管理或详情面板 */ }}>管理</Button>
                            </Tooltip>
                        </div>
                    </div>
                </div>
            )}

            {addingPos && (
                <div style={{
                    position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
                    background: "#fff", padding: 12, zIndex: 3000, borderRadius: 6, boxShadow: "0 2px 12px rgba(0,0,0,0.3)"
                }}>
                    <h4>添加地点</h4>
                    {/* 当用户在表单取消时也退出添加模式 */}
                    <AddForm defaultPos={addingPos} onCancel={() => { setAddingPos(null); setAddMode(false); }} onSubmit={submitPlace} />
                </div>
            )}
        </>
    );
}

function AddForm({ defaultPos, onCancel, onSubmit }) {
    const [name, setName] = useState("");
    const [category, setCategory] = useState("");
    const [description, setDescription] = useState("");

    const handle = () => {
        if (!name) return alert("请输入名称");
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
