import React, { useEffect, useRef, useState } from "react";

export default function MapView({ backendUrl, userId }) {
    const containerRef = useRef(null);  // 引用地图容器
    const mapRef = useRef(null);        // 存储 AMap 实例
    const markersRef = useRef([]);      // 存储当前地图上的 marker 实例，方便更新时清除旧 marker
    const [addingPos, setAddingPos] = useState(null);   // 点击地图后要添加地点的位置
    const [places, setPlaces] = useState([]);           // 当前加载的地点列表
    const [mapReady, setMapReady] = useState(false);    // 地图是否初始化完毕
    const [hoverTip, setHoverTip] = useState(false);    // 控制 tooltip 显示
    const tipText = mapReady ? "点击在当前地图视野内查找地点" : "地图尚未就绪，稍候再试"; // 查找功能 tooltip 提示

    useEffect(() => {
        // 等待 AMap 脚本加载
        const init = () => {
            mapRef.current = new AMap.Map(containerRef.current, {
                resizeEnable: true,
                center: [116.397428, 39.90923],
                zoom: 13
            });

            mapRef.current.on("click", (e) => {
                const { lng, lat } = e.lnglat;
                setAddingPos([lng, lat]);
            });

            setMapReady(true); // 标记地图已就绪
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
            return;
        }
        list.forEach((p) => {
            const marker = new AMap.Marker({
                position: [p.longitude, p.latitude],
                title: p.name
            });
            marker.setMap(mapRef.current);
            marker.on("click", () => {
                const info = `<div style="min-width:160px"><strong>${p.name}</strong><div>${p.description || ""}</div><div>分类: ${p.category || "-"}</div></div>`;
                const infoWindow = new AMap.InfoWindow({ content: info });
                infoWindow.open(mapRef.current, marker.getPosition());
            });
            markersRef.current.push(marker);
        });
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
            loadPlaces();
        } catch (e) {
            console.error(e);
        }
    };

    const searchInView = async () => {
        // 确保地图已初始化并且 getBounds 不为 null
        if (!mapRef.current) {
            console.warn("searchInView: 地图尚未初始化");
            return;
        }
        const bounds = mapRef.current.getBounds(); // 返回 LngLatBounds
        if (!bounds) {
            console.warn("searchInView: 无法获取地图边界");
            return;
        }
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const url = `${backendUrl}/places/nearby?minLng=${sw.lng}&minLat=${sw.lat}&maxLng=${ne.lng}&maxLat=${ne.lat}`;
        const res = await fetch(url);
        const data = await res.json();
        setPlaces(data);
        renderMarkers(data);
    };

    return (
        <>
            {/* 确保地图容器有尺寸，避免 AMap 无法渲染 */}
            <div ref={containerRef} id="map" style={{ width: "100%", height: "100%" }}></div>

            <div style={{ position: "absolute", right: 8, top: 8, zIndex: 2000 }}>
                <div
                  style={{ position: "relative", display: "inline-block" }}
                  onMouseEnter={() => setHoverTip(true)}
                  onMouseLeave={() => setHoverTip(false)}
                >
                    <button onClick={searchInView} disabled={!mapReady}>
                        查找当前视野内地点
                    </button>

                    {hoverTip && (
                        <div
                            role="tooltip"
                            style={{
                                position: "absolute",
                                top: "calc(100% + 6px)",
                                right: 0,
                                background: "rgba(0,0,0,0.75)",
                                color: "#fff",
                                padding: "6px 8px",
                                borderRadius: 4,
                                fontSize: 12,
                                whiteSpace: "nowrap",
                                zIndex: 4000,
                                boxShadow: "0 2px 8px rgba(0,0,0,0.25)"
                            }}
                        >
                            {tipText}
                        </div>
                    )}
                </div>
            </div>

            {addingPos && (
                <div style={{
                    position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
                    background: "#fff", padding: 12, zIndex: 3000, borderRadius: 6, boxShadow: "0 2px 12px rgba(0,0,0,0.3)"
                }}>
                    <h4>添加地点</h4>
                    <AddForm defaultPos={addingPos} onCancel={() => setAddingPos(null)} onSubmit={submitPlace} />
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
                <button onClick={onCancel} style={{ marginRight: 8 }}>取消</button>
                <button onClick={handle}>提交</button>
            </div>
        </div>
    );
}