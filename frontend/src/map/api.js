export async function fetchPlaces(backendUrl) {
    const res = await fetch(`${backendUrl}/places`);
    if (!res.ok) throw new Error(`Failed to fetch places: ${res.status}`);
    return res.json();
}

export async function fetchPlacesNearby(backendUrl, { minLng, minLat, maxLng, maxLat }) {
    const params = new URLSearchParams({
        minLng: String(minLng),
        minLat: String(minLat),
        maxLng: String(maxLng),
        maxLat: String(maxLat)
    });
    const res = await fetch(`${backendUrl}/places/nearby?${params.toString()}`);
    if (!res.ok) throw new Error(`Failed to fetch nearby places: ${res.status}`);
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

function normalizeDinner(item) {
    if (!item || typeof item !== 'object') return null;
    return {
        id: Number(item.id),
        title: item.title || '',
        description: item.description || '',
        place_name: item.place_name || '',
        start_time: item.start_time || null,
        max_participants: item.max_participants == null ? null : Number(item.max_participants),
        contact_info: item.contact_info || '',
        status: item.status || 'open',
        creator_id: item.creator_id == null ? null : Number(item.creator_id),
        creator_name: item.creator_name || '',
        created_time: item.created_time || null,
        updated_time: item.updated_time || null
    };
}

export async function fetchDinners(backendUrl) {
    const res = await fetch(`${backendUrl}/dinners`);
    if (!res.ok) throw new Error(`获取聚餐活动失败 ${res.status}`);
    const data = await res.json().catch(() => []);
    const list = Array.isArray(data) ? data : [];
    return list.map(normalizeDinner).filter(Boolean);
}

export async function fetchDinnerById(backendUrl, id) {
    const res = await fetch(`${backendUrl}/dinners/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `获取聚餐详情失败 ${res.status}`);
    return normalizeDinner(data);
}

export async function createDinner(backendUrl, token, payload) {
    const res = await fetch(`${backendUrl}/dinners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `创建聚餐失败 ${res.status}`);
    return normalizeDinner(data);
}

export async function deleteDinner(backendUrl, token, id) {
    const targets = [
        `${backendUrl}/dinners/${id}`,
        `${backendUrl}/api/dinners/${id}`
    ];

    let lastError = null;
    for (const url of targets) {
        const res = await fetch(url, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });

        if (res.ok) {
            return res.json().catch(() => ({ success: true }));
        }

        const data = await res.json().catch(() => ({}));
        const msg = data.error || `删除聚餐失败 ${res.status}`;

        // 若是 404，继续尝试兼容路径；其他错误直接抛出
        if (res.status !== 404) {
            throw new Error(msg);
        }
        lastError = new Error(msg);
    }

    throw (lastError || new Error('删除聚餐失败 404'));
}

// -------- Favorites --------

export async function fetchFavorites(backendUrl, token) {
    const res = await fetch(`${backendUrl}/api/favorites`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `获取收藏列表失败 ${res.status}`);
    }
    return res.json();
}

export async function addFavorite(backendUrl, token, placeId) {
    const res = await fetch(`${backendUrl}/api/favorites/${placeId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `收藏失败 ${res.status}`);
    return data;
}

export async function removeFavorite(backendUrl, token, placeId) {
    const res = await fetch(`${backendUrl}/api/favorites/${placeId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `取消收藏失败 ${res.status}`);
    return data;
}
