import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import * as MapUtils from './map/utils';
import * as Api from './map/api';
import { renderMarkers } from './map/markers';
import MapUI from './map/MapUI';
import CommentPanel from './map/CommentPanel';
import { useTips } from "./components/Tips";
import Button from "./components/Button";
import Tooltip from "./components/Tooltip";

const DEFAULT_CENTER = [113.394405, 23.016485];
const DEFAULT_ZOOM = 24;
const MAP_VIEW_STORAGE_KEY = "yuyuko.map.lastView.v1";
const MAP_VIEW_SAVE_DEBOUNCE_MS = 450;
const MIN_CENTER_SAVE_DISTANCE_METERS = 30;
const MIN_ZOOM_SAVE_DELTA = 0.2;
const LOCATE_ME_MIN_ZOOM = 18;

function isLocalhost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function canUseLocationInCurrentContext() {
    if (typeof window === "undefined") return false;
    const { protocol, hostname } = window.location;
    return window.isSecureContext || protocol === "https:" || isLocalhost(hostname);
}

function getLocationErrorMessage(errorLike) {
    const info = String(errorLike?.info || "");
    const message = String(errorLike?.message || "");
    const detail = `${info} ${message}`.trim().toUpperCase();

    if (detail.includes("PERMISSION_DENIED") || detail.includes("PERMISSION") || detail.includes("DENIED")) {
        return "定位权限被拒绝，请在浏览器中允许访问位置信息后重试。";
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
