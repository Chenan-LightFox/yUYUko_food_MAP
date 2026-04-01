export function createMarker(map, place) {
    if (!map || !window.AMap) return null;
    const marker = new window.AMap.Marker({
        position: [place.longitude, place.latitude],
        title: place.name
    });
    marker.setMap(map);
    return marker;
}

export function renderMarkers(map, markersRef, list, onClick) {
    // 清空旧 markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (!map) return [];
    const created = [];
    list.forEach((p) => {
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
    return created;
}
