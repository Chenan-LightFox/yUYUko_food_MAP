import { useState, useEffect } from 'react';
import { searchPlaces } from './api';

export function useSearchPanel(searchTerm, mapRef, backendUrl, mapReady, userLocationMarkerRef, places) {
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

                const processMarked = (markedData || []).map((p, idx) => {
                    const lat = p.latitude;
                    const lng = p.longitude;
                    const dist = (centerNode && window.AMap) ? window.AMap.GeometryUtil.distance(centerNode, new window.AMap.LngLat(lng, lat)) : (p.distance || 9999999);
                    return { ...p, isMarked: true, dist, rank: idx }; // 优先保留来自后端的关键词相关度排序
                });

                const markedPoints = processMarked.sort((a, b) => a.rank - b.rank || a.dist - b.dist);

                // 2. Fetch AMap POI (unmarked points)
                let unmarkedData = [];
                if (window.AMap) {
                    unmarkedData = await new Promise(resolve => {
                        window.AMap.plugin('AMap.PlaceSearch', () => {
                            const ps = new window.AMap.PlaceSearch({
                                pageSize: 20,
                                pageIndex: 1
                            });
                            const cpoint = centerNode ? [centerNode.lng, centerNode.lat] : null;
                            if (cpoint) {
                                ps.searchNearBy(searchTerm.trim(), cpoint, 20000, (status, result) => {
                                    if (status === 'complete' && result.info === 'OK') {
                                        resolve(result.poiList.pois || []);
                                    } else {
                                        resolve([]);
                                    }
                                });
                            } else {
                                ps.search(searchTerm.trim(), (status, result) => {
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

                if (cancel) return;

                const allKnownPlaces = [...(places || []), ...markedPoints];
                const isNearKnownPlace = (lng, lat) => {
                    if (!window.AMap || !lng || !lat) return false;
                    for (const p of allKnownPlaces) {
                        if (!p.longitude || !p.latitude) continue;
                        const d = window.AMap.GeometryUtil.distance(
                            new window.AMap.LngLat(lng, lat),
                            new window.AMap.LngLat(p.longitude, p.latitude)
                        );
                        if (d < 50) return true; // 视为同一个地点，过滤掉
                    }
                    return false;
                };

                const processUnmarked = unmarkedData.map((p, idx) => {
                    const lng = p.location?.lng;
                    const lat = p.location?.lat;
                    if (!lng || !lat) return null;
                    if (isNearKnownPlace(lng, lat)) return null;
                    const dist = (centerNode && window.AMap) ? window.AMap.GeometryUtil.distance(centerNode, new window.AMap.LngLat(lng, lat)) : 9999999;
                    return {
                        id: 'amap_' + p.id,
                        name: p.name,
                        longitude: lng,
                        latitude: lat,
                        address: p.address || `${p.pname || ''}${p.cityname || ''}${p.adname || ''}`,
                        isMarked: false,
                        dist,
                        rank: idx // AMap 原本返回的排序（关键词相关度优先）
                    };
                }).filter(Boolean);

                const unmarkedPoints = processUnmarked.sort((a, b) => a.rank - b.rank || a.dist - b.dist);

                const finalMarked = markedPoints.slice(0, 5);
                const hasMoreMarked = markedPoints.length > 5;

                const finalUnmarked = unmarkedPoints.slice(0, 5);
                const hasMoreUnmarked = unmarkedPoints.length > 5;

                const othersCombined = [
                    ...markedPoints.slice(5),
                    ...unmarkedPoints.slice(5)
                ].slice(0, 10);

                setResults({
                    markedInView: finalMarked,
                    hasMoreMarkedInView: hasMoreMarked,
                    unmarkedInView: finalUnmarked,
                    hasMoreUnmarkedInView: hasMoreUnmarked,
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
