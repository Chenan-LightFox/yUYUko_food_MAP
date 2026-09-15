// Await every editor's private draft before the SPA replaces its page or logs out.
export async function preserveJourneyBeforeLeave() {
    const pending=[];
    window.dispatchEvent(new CustomEvent('journey:before-leave',{detail:{waitUntil:promise=>pending.push(promise)}}));
    try {await Promise.all(pending);return true;}catch{window.dispatchEvent(new Event('journey:leave-blocked'));return false;}
}
