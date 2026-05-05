import { useState, useEffect } from 'react';
import { searchRecommendations } from './api';

function sortSearchItems(items, sortBy) {
    const list = Array.isArray(items) ? items.slice() : [];
    if (sortBy === 'distance') {
        return list.sort((left, right) => {
            const leftDist = Number.isFinite(left?.dist) ? left.dist : Number.POSITIVE_INFINITY;
            const rightDist = Number.isFinite(right?.dist) ? right.dist : Number.POSITIVE_INFINITY;
            if (leftDist !== rightDist) return leftDist - rightDist;
            return (left?.rank ?? Number.POSITIVE_INFINITY) - (right?.rank ?? Number.POSITIVE_INFINITY);
        });
    }

    return list.sort((left, right) => {
        const leftRank = Number.isFinite(left?.rank) ? left.rank : Number.POSITIVE_INFINITY;
        const rightRank = Number.isFinite(right?.rank) ? right.rank : Number.POSITIVE_INFINITY;
        if (leftRank !== rightRank) return leftRank - rightRank;
        const leftDist = Number.isFinite(left?.dist) ? left.dist : Number.POSITIVE_INFINITY;
        const rightDist = Number.isFinite(right?.dist) ? right.dist : Number.POSITIVE_INFINITY;
        return leftDist - rightDist;
    });
}

export function useSearchPanel(searchTerm, mapRef, backendUrl, mapReady, userLocationMarkerRef, sortBy = 'relevance', token = '') {
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

                // 获取用户位置，如果存在则用作距离测算的中心
                const userLocPos = userLocationMarkerRef?.current ? userLocationMarkerRef.current.getPosition() : null;
                const centerNode = userLocPos || mapCenterNode;

                const center = centerNode ? { lat: centerNode.lat, lng: centerNode.lng } : undefined;
                let recommendationData = null;
                try {
                    recommendationData = await searchRecommendations(backendUrl, {
                        q: searchTerm.trim(),
                        center,
                        limit: 30,
                        sortBy,
                        token,
                        searchSource: 'panel'
                    });
                } catch (e) {
                    console.error("fetch marked points failed", e);
                }

                if (cancel) return;

                const primaryResults = (Array.isArray(recommendationData?.candidates) ? recommendationData.candidates : []).map((p, idx) => {
                    const lat = p.latitude;
                    const lng = p.longitude;
                    const dist = (centerNode && window.AMap && Number.isFinite(lat) && Number.isFinite(lng))
                        ? window.AMap.GeometryUtil.distance(centerNode, new window.AMap.LngLat(lng, lat))
                        : (Number.isFinite(p.distanceMeters) ? p.distanceMeters : 9999999);
                    return {
                        ...p,
                        isMarked: true,
                        dist,
                        rank: idx,
                        source: p.source || 'local-place',
                        sourceLabel: p.sourceLabel || '高德搜索',
                    };
                });

                const sortedResults = sortSearchItems(primaryResults, sortBy);
                const finalMarked = sortedResults.slice(0, 8);
                const hasMoreMarked = sortedResults.length > 8;
                const othersCombined = sortedResults.slice(8, 18);

                setResults({
                    meta: recommendationData,
                    markedInView: finalMarked,
                    hasMoreMarkedInView: hasMoreMarked,
                    unmarkedInView: [],
                    hasMoreUnmarkedInView: false,
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
    }, [searchTerm, mapRef, backendUrl, mapReady, sortBy, token]);

    return { results, loading };
}
