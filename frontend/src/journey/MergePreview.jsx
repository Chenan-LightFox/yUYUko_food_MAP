import React,{useEffect,useRef,useState} from 'react';
import {request,eventId} from './feedback';

export default function MergePreview({base,token,selection,onMerged,onClose}) {
    const [policy,setPolicy]=useState('constraints'),[resolutions,setResolutions]=useState({});
    const [preview,setPreview]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
    const attempt=useRef(null);
    useEffect(()=>{
        const controller=new AbortController();setLoading(true);setError('');
        request(base,token,'/api/journeys/merge/preview',{method:'POST',signal:controller.signal,body:JSON.stringify({...selection,order_policy:policy,expense_resolutions:resolutions})})
            .then(result=>{if(!controller.signal.aborted){setPreview(result);setLoading(false);}}).catch(e=>{if(!controller.signal.aborted){setError(e.message);setLoading(false);}});
        return()=>controller.abort();
    },[base,token,selection,policy,resolutions]);
    const commit=async()=>{
        setBusy(true);setError('');
        if(attempt.current?.hash!==preview.preview_hash)attempt.current={hash:preview.preview_hash,id:eventId()};
        try {const result=await request(base,token,'/api/journeys/merge',{method:'POST',body:JSON.stringify({...selection,order_policy:policy,expense_resolutions:resolutions,preview_hash:preview.preview_hash,request_id:attempt.current.id})});await onMerged(result);}
        catch(e){setError(e.message);}finally{setBusy(false);}
    };
    return <section className="journey-card journey-stack" aria-label="合并预览">
        <h3>合并预览</h3>
        <label>顺序规则<select disabled={busy||loading} value={policy} onChange={e=>{setLoading(true);setPolicy(e.target.value);}}>
            <option value="constraints">兼顾原有顺序与明确时间</option><option value="time">以明确时间为准</option><option value="source">保留两篇原有顺序</option>
        </select></label>
        {error&&<p role="alert">{error}</p>}
        {!preview&&!error&&<p>正在检查时间与费用…</p>}
        {preview&&<>
            <ol>{preview.document.stops.map(s=><li key={s.id}>{s.at?.replace('T',' ')||'时间待补充'} · {s.name}</li>)}</ol>
            {preview.warnings.map((w,i)=><p key={i} className="journey-muted">{w}</p>)}
            {preview.conflicts.map((c,i)=><div key={i}><p>{c.message}</p>{c.type==='expense'&&<label>这笔支出如何保留<select disabled={busy||loading} value={resolutions[c.id]||''} onChange={e=>{setLoading(true);setResolutions(r=>({...r,[c.id]:e.target.value}));}}>
                <option value="" disabled>请选择</option>{c.options.map(o=><option key={o.ref} value={o.ref}>{o.title} · {o.place} · ¥{o.amount} · {o.note}</option>)}<option value="separate">分别保留，视作不同支出</option>
            </select></label>}</div>)}
            <strong>合计 ¥{(preview.total_minor/100).toFixed(2)}</strong>
            <p className="journey-muted">将创建新的私人日记，两篇来源日记仍然保留。</p>
        </>}
        <div className="journey-actions"><button disabled={busy||loading||!!error||!preview||!!preview.conflicts.length} onClick={commit}>确认合并</button><button disabled={busy} onClick={onClose}>取消预览</button></div>
    </section>;
}
