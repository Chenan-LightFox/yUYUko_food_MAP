import React,{useEffect,useRef} from 'react';
import {eventId} from './feedback';
import {locationBasis} from './resolution.mjs';

export default function JourneyResolution({document,active,drafts,api,job,onJob,editStop,applyResult,perform,busy,cap,focusStop}) {
    const attempt=useRef(null),latest=useRef(null);
    const relevant=document.stops.filter(s=>s.visit_status!=='planned');
    const unresolved=relevant.filter(s=>!s.confirmed&&s.location_resolution!=='deferred');
    const deferred=relevant.some(s=>s.location_resolution==='deferred'||!Number.isFinite(s.lng)||!Number.isFinite(s.lat));
    const state=unresolved.length?'等待核对':deferred?'部分地点待定位':'地点核对完成';
    const rank=async()=>{
        const draft=await drafts.prepare();if(!draft.id)return;
        const result=await api(`/drafts/${draft.id}/rank`,{method:'POST',body:JSON.stringify({draft_revision:draft.revision})});
        applyResult(result);
    };
    latest.current={rank,perform,busy};
    const anchors=JSON.stringify(document.stops.map(s=>[s.id,s.confirmed,s.confirmed?s.lng:null,s.confirmed?s.lat:null,s.visit_status,s.location_resolution]));
    useEffect(()=>{
        if(!document.stops.some(s=>!s.confirmed&&s.candidates?.length))return;
        const timer=setTimeout(()=>{if(!latest.current.busy)latest.current.perform(latest.current.rank);},650);return()=>clearTimeout(timer);
    },[anchors]);
    const submit=()=>perform(async()=>{
        const draft=await drafts.prepare();
        const payload={draft_id:draft.id,draft_revision:draft.revision,stop_id:active.id,answer:active.clarification_text||'',city:active.clarification_city||''};
        const signature=JSON.stringify([payload.draft_id,payload.stop_id,payload.answer,payload.city,locationBasis(document)]);
        if(attempt.current?.signature!==signature)attempt.current={signature,id:eventId(),payload};
        let created;
        try{created=await api('/clarifications',{method:'POST',body:JSON.stringify({...attempt.current.payload,request_id:attempt.current.id})});}
        catch(e){if([409,410].includes(e.status))attempt.current=null;throw e;}
        onJob({...created,kind:'clarification',input:payload});attempt.current=null;
    });
    const task=job?.kind==='clarification'&&job.input?.draft_id===drafts.currentId()?job:null;
    if(!document.stops.length)return null;
    if(!unresolved.length&&!deferred)return <p className="journey-muted">地点核对完成；已确认位置会保持固定。</p>;
    return <section className="journey-card journey-stack" aria-label="地点澄清">
        <strong>{state} · {unresolved.length} 站未确认</strong>
        <p className="journey-muted">确认过且已经到访的地点会作为固定锚点。重新评估只更新其他候选的顺序，不改变你的记录。</p>
        {unresolved.slice(0,2).map(s=><button key={s.id} onClick={()=>focusStop(s.id)}>核对：{s.name}</button>)}
        <button disabled={busy||!document.stops.some(s=>!s.confirmed&&s.candidates?.length)} onClick={()=>perform(rank)}>重新评估其他候选</button>
        {active&&!active.confirmed&&active.visit_status!=='planned'&&active.location_resolution!=='deferred'&&<>
            <label>补充地点线索<textarea maxLength={1000} rows={2} placeholder="例如：在杭州湖滨银泰旁边，门口有地铁站" value={active.clarification_text||''} onChange={e=>editStop({clarification_text:e.target.value})}/></label>
            <label>线索中的城市（选填）<input maxLength={50} value={active.clarification_city||''} onChange={e=>editStop({clarification_city:e.target.value})}/></label>
            <button disabled={busy||!cap.text_ai||!active.clarification_text?.trim()||['queued','running'].includes(task?.status)} onClick={submit}>根据线索继续找店</button>
            {!cap.text_ai&&<p className="journey-muted">AI 尚未配置，可直接选择候选或在地图上标记。</p>}
            <button disabled={busy} onClick={()=>editStop({location_resolution:'deferred',confirmed:false})}>暂时无法确定，保留待定位</button>
        </>}
        {active?.location_resolution==='deferred'&&<button onClick={()=>editStop({location_resolution:'pending'})}>继续核对这个地点</button>}
        {task&&<div role="status">{({queued:'线索检索排队中…',running:'正在根据线索核对地点…',ready:'新候选已就绪',failed:'本次检索失败，线索仍已保留'})[task.status]}</div>}
        {task?.status==='ready'&&<button disabled={busy} onClick={()=>perform(async()=>{applyResult(task.output);onJob(null);})}>应用这次候选建议</button>}
    </section>;
}
