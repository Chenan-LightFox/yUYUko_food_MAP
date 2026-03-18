import React, { useEffect, useRef, useState } from "react";
import Tooltip from './components/Tooltip';
import Button from './components/Button';

export default function MapView({ backendUrl, userId }) {
    const containerRef = useRef(null);  // 引用地图容器
    const mapRef = useRef(null);        // 存储 AMap 实例
    const markersRef = useRef([]);      // 存储当前地图上的 marker 实例，方便更新时清除旧 marker
    const addModeRef = useRef(false);   // 用于在地图事件中读取最新的添加模式状态

    const [addingPos, setAddingPos] = useState(null);   // 点击地图后要添加地点的位置
    const [places, setPlaces] = useState([]);           // 当前加载的地点列表
    const [mapReady, setMapReady] = useState(false);    // 地图是否初始化完毕
    const [addMode, setAddMode] = useState(false);      // 是否处于“添加地点”模式
    const [searchTerm, setSearchTerm] = useState("");   // 搜索关键词
    const [searchResults, setSearchResults] = useState(null);   // 搜索结果列表，null 表示未搜索或已清除搜索
    const [searching, setSearching] = useState(false);  // 是否正在搜索中

    const tipText = mapReady ? "点击查找地点" : "地图尚未就绪，稍候再试"; // 查找功能 tooltip 提示

    // 同步 ref，以便地图上的 click handler 总能读取到最新的 addMode
    useEffect(() => {
        addModeRef.current = addMode;
        if (containerRef.current) {
            containerRef.current.style.cursor = addMode ? "crosshair" : "";
        }
    }, [addMode]);

    useEffect(() => {
        // 等待 AMap 脚本加载
        const init = () => {
            mapRef.current = new AMap.Map(containerRef.current, {
                resizeEnable: true,
                center: [113.394405, 23.016485], // 考虑更改为用户当前位置，若无法获取定位则为用户上一次浏览位置的坐标，默认位置为b记鱼粥
                zoom: 24
            });

            mapRef.current.on("click", (e) => {
                if (!addModeRef.current) return;
                const { lng, lat } = e.lnglat;
                setAddingPos([lng, lat]);
            });

            setMapReady(true);
            loadPlaces();
        };

        if (window.AMap) init();
        else {
            const t = setInterval(() => {
                if (window.AMap) {
                    clearInterval(t);
                    init();
                }
            }, 200);
        }
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
            // TODO: 在信息弹窗上添加关闭按钮及管理按钮
            marker.on("click", () => {
                const info = `<div style="min-width:160px"><strong>${p.name}</strong><div>${p.description || ""}</div><div>分类: ${p.category || "-"}</div></div>`;
                const infoWindow = new AMap.InfoWindow({ content: info });
                infoWindow.open(mapRef.current, marker.getPosition());
            });
            markersRef.current.push(marker);
            created.push(marker);
        });
        return created;
    };

    const submitPlace = async (payload) => {
        try {
            const res = await fetch(`${backendUrl}/places`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-User-Id": String(userId)
                },
                body: JSON.stringify(payload)
            });
            const saved = await res.json();
            setAddingPos(null);
            // 重新加载数据并清除搜索结果（若正在搜索）
            await loadPlaces();
            setSearchResults(null);
            setSearching(false);
        } catch (e) { 
            console.error(e);
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

    const handleCreateAtCenter = () => {
        if (!mapRef.current) return;
        const center = mapRef.current.getCenter();
        const lng = center.lng || (center.lnglat && center.lnglat.lng) || center.getLng && center.getLng();
        const lat = center.lat || (center.lnglat && center.lnglat.lat) || center.getLat && center.getLat();
        setAddingPos([lng, lat]);
    };

    return (
        <>
            {/* 确保地图容器有尺寸，避免 AMap 无法渲染 */}
            <div ref={containerRef} id="map" style={{ width: "100%", height: "100%" }}></div>

            <div style={{ position: "absolute", right: 8, top: 8, zIndex: 2000 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {/* 搜索输入与按钮 */}
                    <input
                        placeholder="搜索关键词（例如：火锅/店名）"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
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
                {/* 添加地点开关按钮 */}
                <div style={{ display: "inline-block" }}>
                    <Button
                        onClick={() => setAddMode((v) => !v)}
                        disabled={!mapReady}
                        title={addMode ? "点击取消添加模式" : "点击后在地图上选择位置以添加地点"}
                        style={{
                            background: addMode ? "#f0ad4e" : undefined,
                            color: addMode ? "#fff" : undefined
                        }}
                    >
                        {addMode ? "取消添加" : "添加地点"}
                    </Button>
                </div>
            </div>

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
        onSubmit({
            name,
            category,
            description,
            longitude: defaultPos[0],
            latitude: defaultPos[1]
        });
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
