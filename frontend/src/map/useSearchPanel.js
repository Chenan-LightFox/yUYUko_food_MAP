import { useEffect, useState } from 'react';
import { searchPlacesFast } from './api';

const EARTH_RADIUS_METERS = 6371008.8;

function toRadians(value) {
    return value * Math.PI / 180;
}

function distanceMeters(center, place) {
    const lat1 = Number(center?.lat);
    const lng1 = Number(center?.lng);
    const lat2 = Number(place?.latitude);
    const lng2 = Number(place?.longitude);
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
    const latDelta = toRadians(lat2 - lat1);
    const lngDelta = toRadians(lng2 - lng1);
    const h = Math.sin(latDelta / 2) ** 2
        + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lngDelta / 2) ** 2;
    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

function currentMapCenter(mapRef) {
    const center = mapRef?.current?.getCenter?.();
    const lat = Number(center?.lat ?? center?.getLat?.());
    const lng = Number(center?.lng ?? center?.getLng?.());
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
}

// Before submission, show a lightweight preview from the same SQLite fast-search
// endpoint used after Enter. AI is intentionally started only by explicit submit.
export function useSearchPanel(searchTerm, mapRef, backendUrl, mapReady, places) {
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const query = String(searchTerm || '').trim();
        if (!query || !mapReady) {
            setResults(null);
            setLoading(false);
            return undefined;
        }

        const controller = new AbortController();
        let cancelled = false;
        setResults(null);
        setLoading(true);

        const timer = window.setTimeout(async () => {
            try {
                const center = currentMapCenter(mapRef);
                const data = await searchPlacesFast(backendUrl, {
                    q: query,
                    center,
                    limit: 30,
                    signal: controller.signal
                });
                if (cancelled) return;
                const markedResults = (Array.isArray(data) ? data : []).map((place) => {
                    const apiDistanceKm = place.distance_km == null ? Number.NaN : Number(place.distance_km);
                    const dist = Number.isFinite(apiDistanceKm)
                        ? apiDistanceKm * 1000
                        : distanceMeters(center, place);
                    return Number.isFinite(dist) ? { ...place, isMarked: true, dist } : { ...place, isMarked: true };
                });
                // Publish SQLite matches first; nearby AMap POIs are appended when ready.
                setResults(markedResults);

                if (!window.AMap || !center) return;
                const amapPlaces = await new Promise((resolve) => {
                    window.AMap.plugin('AMap.PlaceSearch', () => {
                        const placeSearch = new window.AMap.PlaceSearch({ pageSize: 20, pageIndex: 1 });
                        placeSearch.searchNearBy(query, [center.lng, center.lat], 20000, (status, result) => {
                            if (status === 'complete' && result.info === 'OK') {
                                resolve(result.poiList?.pois || []);
                            } else {
                                resolve([]);
                            }
                        });
                    });
                });
                if (cancelled) return;

                const knownPlaces = [...(places || []), ...markedResults];
                const unmarkedResults = amapPlaces.map((place) => {
                    const lng = Number(place.location?.lng);
                    const lat = Number(place.location?.lat);
                    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
                    const duplicated = knownPlaces.some((known) => {
                        const knownLat = known.latitude == null ? Number.NaN : Number(known.latitude);
                        const knownLng = known.longitude == null ? Number.NaN : Number(known.longitude);
                        if (!Number.isFinite(knownLat) || !Number.isFinite(knownLng)) return false;
                        const distance = distanceMeters(
                            { lat: knownLat, lng: knownLng },
                            { latitude: lat, longitude: lng }
                        );
                        return Number.isFinite(distance) && distance < 50;
                    });
                    if (duplicated) return null;
                    return {
                        id: `amap_${place.id}`,
                        name: place.name,
                        longitude: lng,
                        latitude: lat,
                        address: place.address || `${place.pname || ''}${place.cityname || ''}${place.adname || ''}`,
                        category: place.type || '高德地点',
                        isMarked: false,
                        dist: distanceMeters(center, { latitude: lat, longitude: lng })
                    };
                }).filter(Boolean);
                setResults([...markedResults, ...unmarkedResults]);
            } catch (error) {
                if (!cancelled && error?.name !== 'AbortError') {
                    console.warn('live fast search unavailable:', error.message || error);
                    setResults([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 300);

        return () => {
            cancelled = true;
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [searchTerm, mapRef, backendUrl, mapReady, places]);

    return { results, loading };
}
