export function createMarker(map, place) {
    if (!map || !window.AMap) return null;
    const marker = new window.AMap.Marker({
        position: [place.longitude, place.latitude],
        title: place.name,
        extData: place
    });
    // Do not automatically setMap here as we will use MarkerClusterer
    return marker;
}

export function renderMarkers(map, markersRef, list, onClick) {
    // 清空旧 markers及聚类
    if (markersRef.current && markersRef.current.__cluster) {
        markersRef.current.__cluster.setMap(null);
    } else if (markersRef.current && Array.isArray(markersRef.current)) {
        markersRef.current.forEach((m) => m.setMap && m.setMap(null));
    }

    markersRef.current = [];
    if (!map || !window.AMap) return [];

    const created = [];
    const points = [];

    list.forEach((p) => {
        const lnglat = [p.longitude, p.latitude];
        points.push({
            lnglat,
            weight: 1,
            place: p // 自定义数据
        });
        // 仍然可以创建独立的 Marker 对象以备 onClick 等需要，但这不自动添加到地图上
        const marker = createMarker(map, p);
        if (!marker) return;
        marker.on('click', () => {
            const pos = marker.getPosition();
            const lnglatObj = (pos && pos.lng != null && pos.lat != null) ? { lng: pos.lng, lat: pos.lat } : { longitude: p.longitude, latitude: p.latitude };
            onClick && onClick(p, lnglatObj);
        });
        markersRef.current.push(marker);
        created.push(marker);
    });

    if (window.AMap.MarkerCluster) {
        const cluster = new window.AMap.MarkerCluster(map, points, {
            gridSize: 60,
            zoomOnClick: false
        });

        cluster.on('click', (clusterData) => {
            const data = clusterData.clusterData;
            if (data && data.length > 0) {
                // 如果是单个marker被点击
                if (data.length === 1) {
                    const place = data[0].place;
                    const lnglatObj = { lng: place.longitude, lat: place.latitude };
                    onClick && onClick(place, lnglatObj);
                    return;
                }

                // 点击时将视野中心先移动到该合并Marker的位置
                const centerLngLat = clusterData.lnglat;
                map.panTo(centerLngLat);

                setTimeout(() => {
                    // 然后放大视图直至Markers分散到屏幕的80%范围
                    // 可以通过计算边界，并为其应用基于地图宽高计算的间距(padding) 从而达到80%的视觉效果
                    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
                    data.forEach(item => {
                        let lng = item.lnglat.lng !== undefined ? item.lnglat.lng : item.lnglat[0];
                        let lat = item.lnglat.lat !== undefined ? item.lnglat.lat : item.lnglat[1];
                        if (lat < minLat) minLat = lat;
                        if (lat > maxLat) maxLat = lat;
                        if (lng < minLng) minLng = lng;
                        if (lng > maxLng) maxLng = lng;
                    });

                    if (minLng === maxLng && minLat === maxLat) {
                        map.setZoom(map.getZoom() + 2);
                    } else {
                        // 计算边界跨度
                        const dw = maxLng - minLng;
                        const dh = maxLat - minLat;
                        // 为了让内容只占80%，所需增加的边距（总跨度放大至1/0.8 = 1.25倍）
                        const padW = (dw / 0.8) - dw;
                        const padH = (dh / 0.8) - dh;

                        const bounds = new window.AMap.Bounds(
                            [minLng - padW / 2, minLat - padH / 2],
                            [maxLng + padW / 2, maxLat + padH / 2]
                        );
                        map.setBounds(bounds);
                    }
                }, 300); // 先做panTo，然后再缩放
            }
        });

        markersRef.current.__cluster = cluster;
    } else {
        // 如果没有聚类插件，退回到平铺
        created.forEach(marker => marker.setMap(map));
    }

    return created;
}
