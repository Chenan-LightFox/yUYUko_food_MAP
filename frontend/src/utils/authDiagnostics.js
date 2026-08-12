const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const SAFE_STAGE = /^[a-z0-9._-]{2,64}$/;

export function reportAuthStage(backendUrl, requestId, stage, detail = '') {
    if (!SAFE_REQUEST_ID.test(String(requestId || '')) || !SAFE_STAGE.test(String(stage || ''))) return;
    try {
        const url = `${String(backendUrl).replace(/\/+$/, '')}/diagnostics/client-auth?request_id=${encodeURIComponent(requestId)}&stage=${encodeURIComponent(stage)}&detail=${encodeURIComponent(String(detail || '').slice(0, 160))}`;
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
            navigator.sendBeacon(url, '');
            return;
        }
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: '',
            keepalive: true
        }).catch(() => {});
    } catch (error) { }
}
