import React, { useEffect, useRef, useState } from "react";
import * as MapUtils from './map/utils';
import * as Api from './map/api';
import { renderMarkers } from './map/markers';
import MapUI from './map/MapUI';

const DEFAULT_CENTER = MapUtils.DEFAULT_CENTER;
const DEFAULT_ZOOM = MapUtils.DEFAULT_ZOOM;

export default function MapView({ backendUrl, token, isAuthenticated, onRequireAuth }) {
	const containerRef = useRef(null);
	const mapRef = useRef(null);
	const markersRef = useRef([]);
	const geolocationRef = useRef(null);
	const userLocationMarkerRef = useRef(null);
	const addModeRef = useRef(false);
	const saveViewTimerRef = useRef(null);
	const lastSavedViewRef = useRef(null);
	const [addingPos, setAddingPos] = useState(null);
	const [places, setPlaces] = useState([]);
	const [mapReady, setMapReady] = useState(false);
	const [addMode, setAddMode] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");
	const [searchResults, setSearchResults] = useState(null);
	const [searching, setSearching] = useState(false);
	const [locating, setLocating] = useState(false);
	const [locationError, setLocationError] = useState("");
    const [currentUser, setCurrentUser] = useState(null);
    const [fetchingUser, setFetchingUser] = useState(false);
	const [selectedPlace, setSelectedPlace] = useState(null);
	const [popupPoint, setPopupPoint] = useState(null);
	const selectedPlaceRef = useRef(null);
	const hasToken = !!token;
	const authPending = hasToken && !isAuthenticated;
    const canWrite = hasToken && isAuthenticated;

	const [manageOpen, setManageOpen] = useState(false);
	const [manageEdit, setManageEdit] = useState({ name: "", category: "", description: "" });
    const [manageSubmitting, setManageSubmitting] = useState(false);
    const [manageMessage, setManageMessage] = useState("");

    const customThemeColor = '#002fa7';

	const tipText = mapReady ? "点击查找地点" : "地图尚未就绪，稍候再试";
	const locationTipText = !mapReady
		? "地图尚未就绪，稍候再试"
		: (locationError || (MapUtils.canUseLocationInCurrentContext()
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

	// 当 token 可用时尝试获取当前用户（用于判断是否有 admin 权限 / id）
	useEffect(() => {
		let active = true;
		if (!token) {
			setCurrentUser(null);
			return;
		}
		if (currentUser) return; // 已有就不用重复请求
		(async () => {
			setFetchingUser(true);
			try {
				const user = await Api.fetchCurrentUser(backendUrl, token);
				if (active && user) setCurrentUser(user);
			} catch (e) {
				console.warn("获取当前用户失败", e);
			} finally {
				setFetchingUser(false);
			}
		})();
		return () => { active = false; };
	}, [token, backendUrl, currentUser]);

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
			const savedView = MapUtils.readSavedMapView();
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
			const data = await Api.fetchPlaces(backendUrl);
			setPlaces(data);
			renderMarkers(mapRef.current, markersRef, data, showPopup);
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
				const p = map.lnglatToContainer([lnglat.lng ?? lnglat.longitude, lnglat.lat ?? lnglatlatitude]);
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

	// 当 searchResults 或 places 改变时确保 markers 与当前数据同步
	useEffect(() => {
		if (!mapRef.current) return;
		const listToRender = searchResults == null ? places : searchResults;
		renderMarkers(mapRef.current, markersRef, listToRender || [], showPopup);
	}, [searchResults, places]);

	const submitPlace = async (payload) => {
		if (!token) {
			onRequireAuth && onRequireAuth();
			return;
		}

		try {
			await Api.postPlace(backendUrl, token, payload);
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
			const data = await Api.searchPlaces(backendUrl, { q, center, limit });
			setSearchResults(data);
			renderMarkers(mapRef.current, markersRef, data, showPopup);
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
			alert(message);
		} finally {
			setLocating(false);
		}
	};

	// 尝试从 selectedPlace 中读出最后修改人/时间，兼容多种字段名
	const getLastModifierText = (place) => {
		if (!place) return "-";
		const by = place.updated_by || place.updated_by_name || place.modified_by || place.last_modified_by || place.updater || place.updater_name || place.updated_by_name || place.creator_name || null;
		const rawDate = place.updated_at || place.updated_time || place.modified_time || place.last_modified_at || place.modifiedAt || place.updatedAt || place.created_time || null;
		let when = "-";
		if (rawDate) {
			try {
				const d = (typeof rawDate === "number" || /^\d+$/.test(String(rawDate))) ? new Date(Number(rawDate)) : new Date(String(rawDate));
				if (!isNaN(d.getTime())) {
					when = d.toLocaleString();
				}
			} catch (e) { }
		}
		return `${by || "-" } · ${when}`;
	};

	// 打开管理面板（依据当前用户权限选择直接编辑或提交申请）
	const openManagePanel = async () => {
		if (!selectedPlace) return;
		if (!token) {
			onRequireAuth && onRequireAuth();
			return;
		}
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
		setManageEdit({ name: selectedPlace.name || "", category: selectedPlace.category || "", description: selectedPlace.description || "" });
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
		if (!window.confirm("确认删除此地点？此操作不可恢复。")) return;
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
		setManageSubmitting(true);
		try {
			const payload = {
				name: (manageEdit.name || "").trim(),
				category: (manageEdit.category || "").trim(),
				description: (manageEdit.description || "").trim()
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
		setManageSubmitting(true);
		try {
			const payload = {
				place_id: selectedPlace.id,
				proposed: {
					name: (manageEdit.name || "").trim(),
					category: (manageEdit.category || "").trim(),
					description: (manageEdit.description || "").trim()
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

	return (
		<MapUI
			containerRef={containerRef}
			searchTerm={searchTerm}
			setSearchTerm={setSearchTerm}
			clearSearch={clearSearch}
			searchServer={searchServer}
			mapReady={mapReady}
			searching={searching}
			tipText={tipText}
			customThemeColor={customThemeColor}
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
			onAddCancel={() => { setAddingPos(null); setAddMode(false); }}
			onAddSubmit={submitPlace}
		/>
	);
}
