import { useState, useEffect } from 'react';
import { searchPlaces } from './api';

export function useSearchPanel(searchTerm, mapRef, backendUrl, mapReady, userLocationMarkerRef) {
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!searchTerm || !searchTerm.trim() || !mapReady) {
            setResults(null);
            return;
        }

        let cancel = false;

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const map = mapRef?.current;
                const mapCenterNode = map ? map.getCenter() : null;
                const bounds = map ? map.getBounds() : null;

                // 获取用户位置，如果存在则用作距离测算的中心
                const userLocPos = userLocationMarkerRef?.current ? userLocationMarkerRef.current.getPosition() : null;
                const centerNode = userLocPos || mapCenterNode;

                const center = centerNode ? { lat: centerNode.lat, lng: centerNode.lng } : undefined;

                // 1. Searched marked points (from our backend)
                let markedData = [];
                try {
                    markedData = await searchPlaces(backendUrl, {
                        q: searchTerm.trim(),
                        center,
                        limit: 30
                    });
                } catch (e) {
                    console.error("fetch marked points failed", e);
                }

                if (cancel) return;

                const processMarked = (markedData || []).map(p => {
                    const lat = p.latitude;
                    const lng = p.longitude;
                    const isInside = (bounds && window.AMap) ? bounds.contains(new window.AMap.LngLat(lng, lat)) : false;
                    const dist = (centerNode && window.AMap) ? window.AMap.GeometryUtil.distance(centerNode, new window.AMap.LngLat(lng, lat)) : (p.distance || 9999999);
                    return { ...p, isMarked: true, isInside, dist, rank: p.rank || 0 };
                });

                const markedInView = processMarked.filter(p => p.isInside).sort((a, b) => a.dist - b.dist);
                const markedOthers = processMarked.filter(p => !p.isInside).sort((a, b) => a.rank - b.rank || a.dist - b.dist);

                // 2. Fetch AMap POI (unmarked points)
                let unmarkedData = [];
                if (window.AMap) {
                    unmarkedData = await new Promise(resolve => {
                        window.AMap.plugin('AMap.PlaceSearch', () => {
                            const ps = new window.AMap.PlaceSearch({
                                city: '全国',
                                pageSize: 20,
                                pageIndex: 1
                            });
                            ps.search(searchTerm.trim(), (status, result) => {
                                if (status === 'complete' && result.info === 'OK') {
                                    resolve(result.poiList.pois || []);
                                } else {
                                    resolve([]);
                                }
                            });
                        });
                    });
                }

                if (cancel) return;

                const processUnmarked = unmarkedData.map(p => {
                    const lng = p.location?.lng;
                    const lat = p.location?.lat;
                    if (!lng || !lat) return null;
                    const isInside = (bounds && window.AMap) ? bounds.contains(new window.AMap.LngLat(lng, lat)) : false;
                    const dist = (centerNode && window.AMap) ? window.AMap.GeometryUtil.distance(centerNode, new window.AMap.LngLat(lng, lat)) : 9999999;
                    return {
                        id: 'amap_' + p.id,
                        name: p.name,
                        longitude: lng,
                        latitude: lat,
                        address: p.address || `${p.pname || ''}${p.cityname || ''}${p.adname || ''}`,
                        isMarked: false,
                        isInside,
                        dist
                    };
                }).filter(Boolean);

                const unmarkedInView = processUnmarked.filter(p => p.isInside).sort((a, b) => a.dist - b.dist);
                const unmarkedOthers = processUnmarked.filter(p => !p.isInside).sort((a, b) => a.dist - b.dist);

                const finalMarkedInView = markedInView.slice(0, 5);
                const hasMoreMarkedInView = markedInView.length > 5;

                const finalUnmarkedInView = unmarkedInView.slice(0, 5);
                const hasMoreUnmarkedInView = unmarkedInView.length > 5;

                const othersCombined = [
                    ...markedInView.slice(5),
                    ...unmarkedInView.slice(5),
                    ...markedOthers,
                    ...unmarkedOthers
                ].slice(0, 10);

                setResults({
                    markedInView: finalMarkedInView,
                    hasMoreMarkedInView,
                    unmarkedInView: finalUnmarkedInView,
                    hasMoreUnmarkedInView,
                    others: othersCombined
                });

            } catch (e) {
                console.error("live search failed", e);
            } finally {
                if (!cancel) setLoading(false);
            }
        }, 400);

        return () => {
            cancel = true;
            clearTimeout(timer);
        };
    }, [searchTerm, mapRef, backendUrl, mapReady]);

    return { results, loading };
}
