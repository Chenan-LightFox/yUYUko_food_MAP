export async function fetchPlaces(backendUrl) {
    const res = await fetch(`${backendUrl}/places`);
    if (!res.ok) throw new Error(`Failed to fetch places: ${res.status}`);
    return res.json();
}

export async function fetchCurrentUser(backendUrl, token) {
    if (!token) return null;
    const res = await fetch(`${backendUrl}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return res.json().then(d => d.user);
}

export async function postPlace(backendUrl, token, payload) {
    const res = await fetch(`${backendUrl}/places`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`后端错误 ${res.status} ${res.statusText} ${text}`);
    }
    return res.json();
}

export async function searchPlaces(backendUrl, opts = {}) {
    const params = new URLSearchParams();
    params.set('q', opts.q || '');
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.center && opts.center.lat != null && opts.center.lng != null) {
        params.set('centerLat', String(opts.center.lat));
        params.set('centerLng', String(opts.center.lng));
    }

    const url = `${backendUrl}/api/places/search?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`search failed: ${res.status}`);
    return res.json();
}

export async function putPlace(backendUrl, token, id, payload) {
    const res = await fetch(`${backendUrl}/places/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || `更新失败 ${res.status}`);
    }
    return data;
}

export async function deletePlace(backendUrl, token, id) {
    const res = await fetch(`${backendUrl}/places/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `删除失败 ${res.status}`);
    return data;
}

export async function postPlaceRequest(backendUrl, token, payload) {
    const res = await fetch(`${backendUrl}/place-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `申请提交失败 ${res.status}`);
    return data;
}
