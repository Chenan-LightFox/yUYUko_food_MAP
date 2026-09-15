const { randomUUID } = require('crypto');

// Private revision differences are business history, not research training data.
function recordSavedChanges(sql, journeyId, revision, before, after, input, time) {
    if (!before) return;
    const reasons = new Set(['wrong_branch', 'wrong_place', 'not_visited', 'privacy', 'other']);
    const insert = sql.prepare('INSERT INTO JourneyCorrection(id,journey_id,revision,stop_id,field,before_value,after_value,reason,created_at) VALUES(?,?,?,?,?,?,?,?,?)');
    const put = (stopId, field, oldValue, newValue, reason = 'unknown') => {
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) insert.run(randomUUID(), journeyId, revision, stopId, field, JSON.stringify(oldValue), JSON.stringify(newValue), reason, time);
    };
    const identity = s => ({name:s.name,place_id:s.place_id,source:s.source,lng:s.lng,lat:s.lat});
    for (const stop of after.stops) {
        const old = before.stops.find(s => s.id === stop.id);
        if (!old) continue;
        const raw = input.stops.find(s => s.id === stop.id);
        const reason = reasons.has(raw?.correction_reason) ? raw.correction_reason : 'unknown';
        put(stop.id, 'place', identity(old), identity(stop), reason);
        for (const field of ['at','visit_status','confirmed','media_ids','expenses']) put(stop.id, field, old[field], stop[field], reason);
    }
    put('', 'order', before.stops.map(s=>s.id), after.stops.map(s=>s.id));
}
module.exports = {recordSavedChanges};
