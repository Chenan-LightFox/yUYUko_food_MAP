import React,{useCallback,useEffect,useRef,useState} from 'react';
import {eventId,request} from './feedback';
import {makeCover,downloadBlob} from './cover';
import CommunityPanel from './CommunityPanel';
import MergePreview from './MergePreview';
import useJourneyDraft from './useJourneyDraft';
import JourneyResolution from './JourneyResolution';
import {applyResolutionPatch} from './resolution.mjs';
import {getThemeColor,getThemeSecondary,pickContrastTextColor,DEFAULT_PRIMARY,DEFAULT_SECONDARY} from '../utils/theme';
import './journey.css';
function readPalette(){
    const primary=getThemeColor()||DEFAULT_PRIMARY,secondary=getThemeSecondary()||DEFAULT_SECONDARY;
    return {primary,secondary,onPrimary:pickContrastTextColor(primary),onSecondary:pickContrastTextColor(secondary)};
}
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const newStop=()=>({id:eventId(),name:'新地点',note:'',lng:null,lat:null,place_id:null,address:'',source:'manual',confirmed:false,visit_status:'unknown',at:'',mood:'',media_ids:[],expenses:[]});
const newDocument=()=>({title:'我的一天',start_date:today(),end_date:today(),summary:'',stops:[]});
function PrivatePhoto({id,base,token}) {
    const [url,setUrl]=useState('');
    useEffect(()=>{const controller=new AbortController();let objectUrl;
        fetch(`${base}/api/journeys/media/${id}`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal}).then(r=>{if(!r.ok)throw Error();return r.blob();}).then(blob=>{objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}).catch(()=>{});
        return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
    },[id,base,token]);
    return url?<img src={url} alt="私人行程照片"/>:<span>图片载入中</span>;
}
export default function JourneyWorkspace({backendUrl:base,token,isAuthenticated,onRequireAuth,mapRef,mapReady,selectedPlace,feedback,onOpen}) {
    const [palette,setPalette]=useState(readPalette);
    useEffect(()=>{const update=()=>setPalette(readPalette());window.addEventListener('themechange',update);return()=>window.removeEventListener('themechange',update);},[]);
    const [open,setOpen]=useState(false),[tab,setTab]=useState('library'),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
    const [picking,setPicking]=useState(null);
    const [mergeSelection,setMergeSelection]=useState(null);
    const jobAttempt=useRef(null);
    const [draftItems,setDraftItems]=useState([]);
    const [items,setItems]=useState([]),[month,setMonth]=useState(today().slice(0,7)),[day,setDay]=useState(''),[mergeIds,setMergeIds]=useState([]);
    const [cap,setCap]=useState({}),[journal,setJournal]=useState(null),[dirty,setDirty]=useState(false),[activeId,setActiveId]=useState(null),[revisions,setRevisions]=useState([]);
    const [input,setInput]=useState({text:'',city:'',start_date:today(),end_date:today(),media_ids:[],use_center:false});
    const [job,setJob]=useState(null),[jobs,setJobs]=useState([]),[media,setMedia]=useState([]),[share,setShare]=useState(null),[coverBlob,setCoverBlob]=useState(null),[coverUrl,setCoverUrl]=useState('');
    const [shareOptions,setShareOptions]=useState({platform:'小红书',style:'自然',min:100,max:500,include_notes:false,include_expenses:false,stop_ids:[]}),[coverStyle,setCoverStyle]=useState('主站'),[caption,setCaption]=useState(''),[useBasemap,setUseBasemap]=useState(false);
    const journalRef=useRef(journal),dirtyRef=useRef(dirty),mounted=useRef(true),focusRef=useRef(null),bodyRef=useRef(null);
    journalRef.current=journal;dirtyRef.current=dirty;
    const drafts=useJourneyDraft(base,token,journal,dirty);
    const api=useCallback((path,options)=>request(base,token,`/api/journeys${path}`,options),[base,token]);
    const notify=useCallback(text=>{setError(text);setMessage('');},[]);
    const perform=async fn=>{setBusy(true);setError('');try{return await fn();}catch(e){notify(e.message);}finally{if(mounted.current)setBusy(false);}};
    const loadLibrary=async()=>{const [list,taskList,draftList]=await Promise.all([api(''),api('/jobs'),api('/drafts')]);setItems(list);setJobs(taskList);setDraftItems(draftList);};
    useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
    useEffect(()=>{const blocked=()=>{setOpen(true);notify('草稿尚未同步，已保留当前页面。请重试同步或处理草稿冲突后再离开。');};window.addEventListener('journey:leave-blocked',blocked);return()=>window.removeEventListener('journey:leave-blocked',blocked);},[notify]);
    useEffect(()=>{
        if(!open||!token)return;
        let active=true;
        Promise.all([api('/capabilities'),api(''),api('/jobs'),api('/drafts')]).then(([c,list,taskList,draftList])=>{if(active){setCap(c);setItems(list);setJobs(taskList);setDraftItems(draftList);}}).catch(e=>{if(active)notify(e.message);});
        return()=>{active=false;};
    },[open,token,api,notify]);
    useEffect(()=>{if(open)focusRef.current?.focus();},[open]);
    useEffect(()=>{if(bodyRef.current)bodyRef.current.scrollTop=0;},[tab]);
    useEffect(()=>{
        if(!picking||!mapRef.current)return;
        const map=mapRef.current;
        const choose=e=>{
            const lng=e.lnglat?.getLng?.()??e.lnglat?.lng,lat=e.lnglat?.getLat?.()??e.lnglat?.lat;
            if(!Number.isFinite(lng)||!Number.isFinite(lat))return;
            setJournal(j=>({...j,document:{...j.document,stops:j.document.stops.map(s=>s.id===picking?{...s,lng,lat,source:'manual',place_id:null,address:'',confirmed:false}:s)}}));
            setDirty(true);setShare(null);setPicking(null);setOpen(true);setMessage('位置已更新，请核对后保存。');
        };
        map.on('click',choose);return()=>map.off('click',choose);
    },[picking,mapRef]);
    useEffect(()=>{
        if(!job||!['queued','running'].includes(job.status))return;
        let active=true,timer;
        const poll=async()=>{try{const result=await api(`/jobs/${job.id}`);if(active){setJob(result);if(result.status==='failed')notify(result.error);}}catch(e){if(active)notify(e.message);}finally{if(active)timer=setTimeout(poll,2200);}};
        timer=setTimeout(poll,800);return()=>{active=false;clearTimeout(timer);};
    },[job?.id,job?.status,api,notify]);
    const document=journal?.document,active=document?.stops.find(s=>s.id===activeId);
    const edit=patch=>{setJournal(j=>({...j,document:{...j.document,...patch}}));setDirty(true);setShare(null);};
    const editStop=patch=>{edit({stops:document.stops.map(s=>s.id===activeId?{...s,...patch}:s)});};
    const applyResolution=result=>{
        if(result.draft_id!==drafts.currentId())throw new Error('这份建议属于另一份草稿，请从对应任务恢复。');
        const current=journalRef.current.document,next=applyResolutionPatch(current,result);
        if(JSON.stringify(current)!==JSON.stringify(next))edit({stops:next.stops});
        setMessage('候选建议已更新，已确认地点和手写内容均已保留。');
    };
    const openJob=id=>perform(async()=>{
        if(!canDiscard())return;
        const result=await api(`/jobs/${id}`);
        if(result.kind==='clarification'){
            const loaded=await api(`/drafts/${result.input.draft_id}`);drafts.start(loaded);
            setJournal({id:loaded.journey_id,revision:loaded.base_revision,document:loaded.document});setDirty(true);setActiveId(result.input.stop_id);setShare(null);setTab('editor');
        }else{setInput({...result.input,use_center:false});setTab('input');}
        setJob(result);
    });
    const focusStop=useCallback(id=>{setActiveId(id);setTab('editor');const s=journalRef.current?.document.stops.find(p=>p.id===id);if(s?.lng!=null&&mapRef.current){mapRef.current.setZoomAndCenter(15,[s.lng,s.lat]);mapRef.current.panBy?.(window.innerWidth>600?-200:0,window.innerWidth>600?0:-200);}},[mapRef]);
    // Own overlays on the existing map, independent of restaurant markers and clustering.
    useEffect(()=>{
        const map=mapRef.current, AMap=window.AMap;
        if(!open||!mapReady||!map||!AMap||!document||!['editor','share'].includes(tab))return;
        const overlays=[];
        document.stops.forEach((s,index)=>{
            if(s.lng==null||s.lat==null)return;
            const content=window.document.createElement('button');content.textContent=String(index+1);content.title=s.name;content.setAttribute('aria-label',`途经点 ${index+1} ${s.name}`);
            Object.assign(content.style,{border:'2px solid var(--color-bg-surface)',borderRadius:'50%',width:'34px',height:'34px',background:s.id===activeId?palette.primary:palette.secondary,color:s.id===activeId?palette.onPrimary:palette.onSecondary,fontWeight:'bold',cursor:'pointer',boxShadow:'var(--shadow-surface)'});
            const marker=new AMap.Marker({position:[s.lng,s.lat],content,offset:new AMap.Pixel(-17,-17),zIndex:300});marker.on('click',()=>focusStop(s.id));overlays.push(marker);
            const previous=document.stops[index-1];
            if(previous?.lng!=null)overlays.push(new AMap.Polyline({path:[[previous.lng,previous.lat],[s.lng,s.lat]],strokeColor:palette.primary,strokeWeight:4,strokeStyle:'dashed',zIndex:150}));
        });
        map.add(overlays);return()=>{try{map.remove(overlays);}catch{}};
    },[open,mapReady,mapRef,document,activeId,tab,focusStop,palette]);
    useEffect(()=>{
        if(!coverBlob){setCoverUrl('');return;}
        const url=URL.createObjectURL(coverBlob);setCoverUrl(url);return()=>URL.revokeObjectURL(url);
    },[coverBlob]);
    const canDiscard=()=>!busy&&(drafts.isSynced()||window.confirm('草稿还有未同步修改，离开后可能丢失这些修改。已同步草稿仍会保留。确定离开当前编辑？'));
    const newJournal=()=>{if(!canDiscard())return;drafts.start(null);setJournal({id:null,revision:0,document:newDocument()});setDirty(true);setActiveId(null);setShare(null);setTab('editor');};
    const loadJournal=id=>perform(async()=>{if(!canDiscard())return;const loaded=await api(`/${id}`);drafts.start(null);setJournal(loaded);setActiveId(loaded.document.stops[0]?.id||null);setDirty(false);setShare(null);setTab('editor');setRevisions([]);});
    const resumeDraft=id=>perform(async()=>{if(!canDiscard())return;const loaded=await api(`/drafts/${id}`);drafts.start(loaded);setJournal({id:loaded.journey_id,revision:loaded.base_revision,document:loaded.document});setDirty(true);setActiveId(loaded.document.stops[0]?.id||null);setShare(null);setTab('editor');setMessage('已恢复私人草稿，可以继续编辑或保存为日记。');});
    const save=async(asCopy=false)=>{
        const {saved,snapshot}=await drafts.publish(journalRef.current,asCopy);
        // Preserve edits made while the save was in flight, while advancing the base revision.
        const changed=journalRef.current!==snapshot;
        setJournal(current=>changed?{...current,id:saved.id,revision:saved.revision}:saved);setDirty(changed);setMessage(changed?'前一个版本已保存，还有新修改待保存。':'日记已保存，仅自己可见。');await loadLibrary();return saved;
    };
    const uploadPhotos=async(files,target)=>{
        if(files.length+(target==='input'?input.media_ids.length:active?.media_ids.length||0)>12)throw new Error('每处最多添加 12 张图片');
        const ids=[];
        for(const file of files){const form=new FormData();form.append('image',file);const media=await api('/media',{method:'POST',body:form});ids.push(media.id);}
        if(target==='input')setInput(i=>({...i,media_ids:[...i.media_ids,...ids]}));
        else {const id=activeId;setJournal(j=>({...j,document:{...j.document,stops:j.document.stops.map(s=>s.id===id?{...s,media_ids:[...s.media_ids,...ids]}:s)}}));setDirty(true);}
    };
    const applyJob=()=>{
        if(!canDiscard())return;
        const draft=job.output.document;
        drafts.start(null);
        setJournal({id:null,revision:0,document:draft});setActiveId(draft.stops[0]?.id||null);setDirty(true);setShare(null);setTab('editor');setMessage(job.output.notice);
    };
    const generateJourney=()=>perform(async()=>{
        const center=input.use_center?mapRef.current?.getCenter?.():null;
        const payload={...input,center:center?{lng:center.getLng(),lat:center.getLat()}:null};
        const signature=JSON.stringify(payload);
        if(jobAttempt.current?.signature!==signature)jobAttempt.current={signature,request_id:eventId()};
        try {
            const result=await api('/jobs',{method:'POST',body:JSON.stringify({...payload,request_id:jobAttempt.current.request_id})});
            setJob(result);jobAttempt.current=null;setMessage('已开始生成，可以收起面板，稍后从日历中的任务继续。');
        } catch(e) {if([409,410].includes(e.status))jobAttempt.current=null;throw e;}
    });
    const addPlace=()=>{
        if(!selectedPlace)return;
        const external=selectedPlace.isMarked===false||String(selectedPlace.id).startsWith('amap_');
        if(external&&!cap.amap_search){notify('高德地点尚未配置存储授权，请添加站内地点或手动标记。');return;}
        const s={...newStop(),name:selectedPlace.name,place_id:external?null:Number(selectedPlace.id),lng:Number(selectedPlace.longitude),lat:Number(selectedPlace.latitude),address:selectedPlace.address||'',source:external?'amap':'local'};
        edit({stops:[...document.stops,s]});setActiveId(s.id);
    };
    const generateShare=()=>perform(async()=>{
        if(dirtyRef.current)throw new Error('请先保存日记，再选择要分享的地点。');
        const data=await api(`/${journal.id}/share`,{method:'POST',body:JSON.stringify({...shareOptions,base_revision:journal.revision})});
        setShare(data);setCaption(data.cover.caption);setCoverBlob(await makeCover(data.cover,coverStyle,data.cover.caption));
    });
    const refreshCover=()=>perform(async()=>{
        let mapBlob=null;
        if(useBasemap){const response=await fetch(`${base}/api/journeys/${journal.id}/cover-map`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({base_revision:share.revision,stop_ids:share.stop_ids})});if(!response.ok){const result=await response.json();throw new Error(result.error||'地图首图生成失败');}mapBlob=await response.blob();}
        setCoverBlob(await makeCover(share.cover,coverStyle,caption,mapBlob));
    });
    const openWorkspace=()=>{if(!isAuthenticated||!token){onRequireAuth?.();return;}setOpen(true);onOpen?.();};
    const calendarDays=()=>{const [y,m]=month.split('-').map(Number);if(!y||m<1||m>12)return [];return Array.from({length:new Date(y,m,0).getDate()},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`);};
    return <>
        {!open&&!picking&&<button className="journey-launch" style={{'--journey-on-primary':palette.onPrimary}} onClick={openWorkspace}>✦ 日记 · 同好</button>}
        {picking&&<button className="journey-launch" style={{'--journey-on-primary':palette.onPrimary}} onClick={()=>{setPicking(null);setOpen(true);}}>点击地图选位置 · 点此取消</button>}
        {open&&<section className="journey-workspace" style={{'--journey-on-primary':palette.onPrimary}} aria-label="我的行程日记" onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}}>
            <header className="journey-head"><div><h2>把一天，留在地图上</h2><small className="journey-muted">描述 → 确认 → 留存 → 分享</small></div><button ref={focusRef} onClick={()=>setOpen(false)} aria-label="收起日记">收起</button></header>
            <nav className="journey-tabs">{[['library','日历'],['input','图文生成'],['editor','编辑'],['community','同好']].map(([id,label])=><button key={id} aria-pressed={tab===id} disabled={id==='editor'&&!journal} onClick={()=>{setTab(id);if(id==='library')loadLibrary().catch(e=>notify(e.message));}}>{label}</button>)}</nav>
            {(error||message)&&<div className={`journey-status ${error?'journey-error':''}`} role={error?'alert':'status'}>{error||message}<button style={{float:'right',padding:0,minHeight:24}} aria-label="关闭提示" onClick={()=>{setError('');setMessage('');}}>×</button></div>}
            {dirty&&journal&&<div className="journey-status" role="status" aria-label="草稿同步状态">{drafts.isSynced()?'草稿已同步，尚未保存为正式日记。':['saved','idle'].includes(drafts.state.kind)?'等待同步草稿…':drafts.state.message||'等待同步草稿…'}{['offline','conflict'].includes(drafts.state.kind)&&<button disabled={busy} onClick={()=>perform(()=>drafts.flush())}>重试同步</button>}{drafts.state.kind==='conflict'&&<button disabled={busy} onClick={()=>perform(()=>drafts.fork())}>另存为新草稿</button>}</div>}
            <div ref={bodyRef} className="journey-body" aria-busy={busy}>
                {tab==='library'&&<div className="journey-stack">
                    {!!draftItems.length&&<section className="journey-card journey-stack"><h3>未完成的草稿</h3>{draftItems.map(d=><div key={d.id} className="journey-actions"><button onClick={()=>resumeDraft(d.id)}>恢复草稿：{d.title}</button><button disabled={busy} aria-label={`丢弃草稿 ${d.title}`} onClick={()=>perform(async()=>{if(!window.confirm('丢弃这份未完成草稿？正式日记不会被删除。'))return;await api(`/drafts/${d.id}`,{method:'DELETE',body:JSON.stringify({draft_revision:d.revision})});if(drafts.currentId()===d.id){drafts.start(null);setJournal(null);setDirty(false);}await loadLibrary();})}>丢弃</button></div>)}</section>}
                    <div className="journey-actions"><button className="journey-primary" onClick={newJournal}>＋ 手动新建</button><button onClick={()=>setTab('input')}>AI 回顾一天</button></div>
                    <label>归档月份<input type="month" value={month} onChange={e=>{setMonth(e.target.value);setDay('');}}/></label>
                    <div className="journey-calendar">{['日','一','二','三','四','五','六'].map(t=><small key={t}>{t}</small>)}{Array.from({length:new Date(`${month}-01T00:00:00`).getDay()||0},(_,i)=><span key={`blank${i}`}/>)}{calendarDays().map(d=>{const n=items.filter(j=>j.start_date<=d&&j.end_date>=d).length;return <button data-active={d===day} key={d} onClick={()=>setDay(d===day?'':d)}>{Number(d.slice(-2))}<small>{n?`${n} 篇`:'·'}</small></button>;})}</div>
                    <p className="journey-muted">{day||month} · 勾选两个日期连续或重叠的行程可合并，来源日记会保留。</p>
                    {items.filter(j=>day?j.start_date<=day&&j.end_date>=day:j.start_date.slice(0,7)<=month&&j.end_date.slice(0,7)>=month).map(j=><div key={j.id} className="journey-actions"><input type="checkbox" aria-label={`选择 ${j.title} 以合并`} checked={mergeIds.includes(j.id)} onChange={e=>setMergeIds(v=>e.target.checked?[...v.slice(-1),j.id]:v.filter(id=>id!==j.id))}/><button className="journey-row" onClick={()=>loadJournal(j.id)}><strong>{j.title}</strong><small>{j.start_date} · {j.stop_count} 站</small></button></div>)}
                    {!items.length&&<p>你的第一篇日记从一句话开始。</p>}
                    {mergeIds.length===2&&!mergeSelection&&<button disabled={busy} onClick={()=>{if(canDiscard())setMergeSelection({first_id:mergeIds[0],second_id:mergeIds[1],revisions:mergeIds.map(id=>items.find(j=>j.id===id).revision)});}}>预览合并</button>}
                    {mergeSelection&&<MergePreview base={base} token={token} selection={mergeSelection} onClose={()=>setMergeSelection(null)} onMerged={async result=>{drafts.start(null);setJournal(result);setDirty(false);setTab('editor');setActiveId(result.document.stops[0]?.id);setMergeIds([]);setMergeSelection(null);setShare(null);await loadLibrary();}}/>}
                    {!!jobs.length&&<><h3>最近的生成任务</h3>{jobs.map(j=><div key={j.id} className="journey-actions"><button onClick={()=>openJob(j.id)}>{j.created_at.slice(0,10)} · {({queued:'排队中',running:'生成中',ready:'可编辑',failed:'失败'})[j.status]}</button><button disabled={busy} onClick={()=>perform(async()=>{await api(`/jobs/${j.id}`,{method:'DELETE'});if(job?.id===j.id)setJob(null);await loadLibrary();})}>移除任务</button></div>)}</>}
                    <details onToggle={e=>{if(e.currentTarget.open)perform(async()=>setMedia(await api('/media')));}}><summary>私人图片空间</summary><p className="journey-muted">可删除未被日记、版本或生成任务引用的图片。</p><div className="journey-photos">{media.map(m=><figure key={m.id}><PrivatePhoto id={m.id} base={base} token={token}/><button disabled={busy} onClick={()=>perform(async()=>{await api(`/media/${m.id}`,{method:'DELETE'});setMedia(await api('/media'));})}>删除</button></figure>)}</div></details>
                </div>}
                {tab==='input'&&<div className="journey-stack">
                    <h3>先说说你去了哪里</h3><p className="journey-muted">例如：“昨天在杭州，先去西湖，下午到湖滨银泰，晚饭在外婆家。菜单在照片里。”店名不完整也可以，稍后再确认。</p>
                    <div className="journey-actions"><label>开始日期<input type="date" value={input.start_date} onChange={e=>setInput({...input,start_date:e.target.value,end_date:input.end_date<e.target.value?e.target.value:input.end_date})}/></label><label>结束日期<input type="date" value={input.end_date} onChange={e=>setInput({...input,end_date:e.target.value})}/></label></div>
                    <label>所在城市<input placeholder="回忆发生的城市，帮助区分同名地点" maxLength={50} value={input.city} onChange={e=>setInput({...input,city:e.target.value})}/></label>
                    <label>一天的片段<textarea rows={6} maxLength={12000} value={input.text} onChange={e=>setInput({...input,text:e.target.value})}/></label>
                    <label className="journey-check"><input type="checkbox" checked={input.use_center} onChange={e=>setInput({...input,use_center:e.target.checked})}/>使用当前地图中心辅助找店（仅本次生成）</label>
                    <label>添加照片（每张最多 5 MB，共 12 张）<input type="file" accept="image/*" multiple disabled={busy||!cap.vision_ai} onChange={e=>{const files=[...e.target.files];e.target.value='';perform(()=>uploadPhotos(files,'input'));}}/></label>
                    <div className="journey-photos">{input.media_ids.map(id=><figure key={id}><PrivatePhoto id={id} base={base} token={token}/><button onClick={()=>setInput({...input,media_ids:input.media_ids.filter(i=>i!==id)})}>移出输入</button></figure>)}</div>
                    {!cap.text_ai&&<p className="journey-muted">AI 尚未配置。可以先手动创建日记；管理员配置模型后启用自动提取。</p>}
                    {cap.text_ai&&!cap.vision_ai&&<p className="journey-muted">当前配置只支持文字；图片仍可在编辑日记时保存。</p>}
                    <p className="journey-muted">生成时，所选图文会发送给站点配置的 AI 服务；允许使用高德查询时，会发送地点关键词和城市。照片工作副本会移除 EXIF 元数据。</p>
                    <button className="journey-primary" disabled={busy||!cap.text_ai||['queued','running'].includes(job?.status)} onClick={generateJourney}>{['queued','running'].includes(job?.status)?'正在提取与核对地点…':'生成行程草稿'}</button>
                    {job?.status==='ready'&&job.kind!=='clarification'&&<section className="journey-card journey-stack"><strong>已提取 {job.output.document.stops.length} 个途经点</strong>{job.output.questions.map(q=><p key={q.stop_id}>{q.prompt}</p>)}<button onClick={applyJob}>载入草稿并逐站确认</button></section>}
                    {job?.status==='failed'&&<p role="alert">{job.error}。可点击生成按钮主动重试。</p>}
                </div>}
                {tab==='editor'&&document&&<div className="journey-stack">
                    <div className="journey-actions"><button className="journey-primary" disabled={busy} onClick={()=>perform(save)}>{dirty?'保存日记':'已保存 · 再次保存'}</button><button disabled={!journal.id||dirty||busy} onClick={()=>{setShareOptions(o=>({...o,stop_ids:document.stops.filter(s=>s.confirmed&&s.visit_status==='visited').map(s=>s.id)}));setShare(null);setCoverBlob(null);setTab('share');}}>生成分享</button></div>
                    <JourneyResolution document={document} active={active} drafts={drafts} api={api} job={job} onJob={setJob} editStop={editStop} applyResult={applyResolution} perform={perform} busy={busy} cap={cap} focusStop={focusStop}/>
                    <label>日记标题<input value={document.title} maxLength={120} onChange={e=>edit({title:e.target.value})}/></label>
                    <div className="journey-actions"><label>开始<input type="date" value={document.start_date} onChange={e=>edit({start_date:e.target.value})}/></label><label>结束<input type="date" value={document.end_date} onChange={e=>edit({end_date:e.target.value})}/></label></div>
                    <label>总体记录<textarea value={document.summary} maxLength={5000} onChange={e=>edit({summary:e.target.value})}/></label>
                    <p className="journey-muted">地图数字对应途经顺序，虚线仅为顺序示意。未定位的地点仍可保存；未确认到访的地点不会用于分享。</p>
                    <div className="journey-stoplist">{document.stops.map((s,i)=><button key={s.id} aria-pressed={s.id===activeId} onClick={()=>focusStop(s.id)}>{i+1}. {s.name}{!s.confirmed?' · 待确认':''}</button>)}</div>
                    <div className="journey-actions"><button disabled={document.stops.length>=60} onClick={()=>{const s=newStop();edit({stops:[...document.stops,s]});setActiveId(s.id);}}>＋ 途经点</button><button disabled={!selectedPlace||document.stops.length>=60} onClick={addPlace}>加入当前选中地点</button></div>
                    {active&&<section className="journey-card journey-stack">
                        <label>地点名称<input value={active.name} maxLength={160} onChange={e=>editStop({name:e.target.value,confirmed:false})}/></label>
                        {!!active.evidence&&<p className="journey-muted">输入证据：{active.evidence}</p>}
                        {!!active.candidates?.length&&<label>候选分店<select value="" onChange={e=>{const candidate=active.candidates.find(c=>c.id===e.target.value);if(candidate){editStop({...candidate,id:active.id,confirmed:false,candidates:[],needs_choice:false,location_resolution:'pending'});mapRef.current?.setCenter([candidate.lng,candidate.lat]);}}}><option value="">请选择匹配的地点</option>{active.candidates.map(c=><option key={c.id} value={c.id}>{c.suggested?'联合建议（待确认） · ':''}{c.name} · {c.address||c.source}</option>)}</select></label>}
                        {journal.id&&<label>本次修正原因（选填，保存后记录）<select value={active.correction_reason||''} onChange={e=>editStop({correction_reason:e.target.value})}><option value="">未指定</option><option value="wrong_branch">分店错误</option><option value="wrong_place">地点错误</option><option value="not_visited">实际未到访</option><option value="privacy">隐私调整</option><option value="other">其他</option></select></label>}
                        <p className="journey-muted">{active.lng!=null?`${active.address||'已定位'} · ${active.lng.toFixed(5)}, ${active.lat.toFixed(5)}`:'尚未定位：可继续编辑，不会阻止保存。'}</p>
                        <div className="journey-actions"><button disabled={!mapReady} onClick={()=>{setPicking(activeId);setOpen(false);}}>在地图上点选位置</button><button onClick={()=>editStop({lng:null,lat:null,place_id:null,source:'manual',address:'',confirmed:false})}>清除位置</button></div>
                        <label>时间（可留空）<input type="datetime-local" value={active.at} onChange={e=>editStop({at:e.target.value})}/></label>
                        <label>经历状态<select value={active.visit_status} onChange={e=>editStop({visit_status:e.target.value,confirmed:false})}><option value="unknown">待确定</option><option value="visited">已经去过</option><option value="planned">只是计划 / 提到</option></select></label>
                        <label>补充描述<textarea value={active.note} maxLength={4000} onChange={e=>editStop({note:e.target.value})}/></label>
                        <label>心情<select value={active.mood} onChange={e=>editStop({mood:e.target.value})}>{['','😊','🥰','😋','😌','🥹','😴','😐','😢','😤'].map(m=><option key={m} value={m}>{m||'不记录'}</option>)}</select></label>
                        <strong>实际支出（人民币）</strong>{active.expenses.map((expense,index)=><div className="journey-actions" key={expense.id}><input aria-label={`支出 ${index+1} 金额`} type="number" min="0" max="1000000" step="0.01" value={expense.amount} onChange={e=>editStop({expenses:active.expenses.map(x=>x.id===expense.id?{...x,amount:e.target.value}:x)})}/><input aria-label={`支出 ${index+1} 说明`} maxLength={100} value={expense.note} onChange={e=>editStop({expenses:active.expenses.map(x=>x.id===expense.id?{...x,note:e.target.value}:x)})}/><button onClick={()=>editStop({expenses:active.expenses.filter(x=>x.id!==expense.id)})}>移除</button></div>)}
                        <button disabled={active.expenses.length>=30} onClick={()=>editStop({expenses:[...active.expenses,{id:eventId(),amount:0,note:''}]})}>＋ 记一笔</button>
                        <label>地点照片<input type="file" accept="image/*" multiple disabled={busy} onChange={e=>{const files=[...e.target.files];e.target.value='';perform(()=>uploadPhotos(files,'stop'));}}/></label>
                        <div className="journey-photos">{active.media_ids.map(id=><figure key={id}><PrivatePhoto id={id} base={base} token={token}/><button onClick={()=>editStop({media_ids:active.media_ids.filter(i=>i!==id)})}>移出此站</button></figure>)}</div>
                        <label className="journey-check"><input type="checkbox" checked={active.confirmed} onChange={e=>editStop({confirmed:e.target.checked,location_resolution:'pending'})}/>我已核对这个地点与经历状态</label>
                        <div className="journey-actions">{[-1,1].map(delta=><button key={delta} disabled={document.stops.indexOf(active)+delta<0||document.stops.indexOf(active)+delta>=document.stops.length} onClick={()=>{const list=[...document.stops],i=list.indexOf(active);[list[i],list[i+delta]]=[list[i+delta],list[i]];edit({stops:list});}}>{delta<0?'往前一站':'往后一站'}</button>)}<button onClick={()=>{edit({stops:document.stops.filter(s=>s.id!==activeId)});setActiveId(null);}}>移除此站</button></div>
                    </section>}
                    <p>共 {document.stops.length} 站 · 支出 ¥{document.stops.reduce((n,s)=>n+s.expenses.reduce((a,e)=>a+(Number(e.amount)||0),0),0).toFixed(2)}</p>
                    {!!document.sources?.length&&<p className="journey-muted">此篇由 {document.sources.length} 篇日记合并而来。来源日记保留；删除此篇即可撤销合并结果。</p>}
                    {journal.id&&<details><summary>版本与删除</summary><div className="journey-stack"><button disabled={busy} onClick={()=>perform(()=>save(true))}>保存为新日记</button><button onClick={()=>perform(async()=>setRevisions(await api(`/${journal.id}/revisions`)))}>查看历史版本</button>{revisions.map(r=><button key={r.revision} disabled={busy||r.revision===journal.revision} onClick={()=>perform(async()=>{if(!canDiscard())return;const restored=await api(`/${journal.id}/restore`,{method:'POST',body:JSON.stringify({revision:r.revision,base_revision:journal.revision})});drafts.start(null);setJournal(restored);setDirty(false);setShare(null);setRevisions([]);setMessage('已恢复为新版本，原有版本仍然保留。');await loadLibrary();})}>恢复版本 {r.revision} · {r.created_at.slice(0,16)}</button>)}<button disabled={busy} onClick={()=>perform(async()=>{if(!window.confirm('删除这篇日记及其历史版本？此操作无法撤销。'))return;await api(`/${journal.id}`,{method:'DELETE',body:JSON.stringify({base_revision:journal.revision})});drafts.start(null);setJournal(null);setDirty(false);setTab('library');await loadLibrary();})}>删除日记及历史版本</button></div></details>}
                </div>}
                {tab==='share'&&document&&<div className="journey-stack">
                    <button onClick={()=>setTab('editor')}>← 回到日记</button><h3>只分享你选中的片段</h3>
                    {document.stops.filter(s=>s.confirmed&&s.visit_status==='visited').map(s=><label key={s.id} className="journey-check"><input type="checkbox" checked={shareOptions.stop_ids.includes(s.id)} onChange={e=>{setShare(null);setShareOptions(o=>({...o,stop_ids:e.target.checked?[...o.stop_ids,s.id]:o.stop_ids.filter(id=>id!==s.id)}));}}/>{s.name}</label>)}
                    <div className="journey-actions"><label>平台<select value={shareOptions.platform} onChange={e=>setShareOptions({...shareOptions,platform:e.target.value})}>{['小红书','朋友圈','手账','日记'].map(p=><option key={p}>{p}</option>)}</select></label><label>文风<select value={shareOptions.style} onChange={e=>setShareOptions({...shareOptions,style:e.target.value})}>{['自然','活泼','简洁','文艺'].map(s=><option key={s}>{s}</option>)}</select></label></div>
                    <div className="journey-actions"><label>最少字数<input type="number" min="30" max="1000" value={shareOptions.min} onChange={e=>setShareOptions({...shareOptions,min:Number(e.target.value)})}/></label><label>最多字数<input type="number" min="30" max="1500" value={shareOptions.max} onChange={e=>setShareOptions({...shareOptions,max:Number(e.target.value)})}/></label></div>
                    <label className="journey-check"><input type="checkbox" checked={shareOptions.include_notes} onChange={e=>setShareOptions({...shareOptions,include_notes:e.target.checked})}/>将所选站点的描述提供给 AI</label><label className="journey-check"><input type="checkbox" checked={shareOptions.include_expenses} onChange={e=>setShareOptions({...shareOptions,include_expenses:e.target.checked})}/>包含所选站点的实际支出</label>
                    <button disabled={busy||!shareOptions.stop_ids.length} className="journey-primary" onClick={generateShare}>生成贴文与首图</button>
                    {share&&<><label>贴文（可以直接修改）<textarea rows={9} maxLength={4000} value={share.text} onChange={e=>setShare({...share,text:e.target.value})}/></label><p className="journey-muted">{Array.from(share.text).length} 字 · 目标 {share.min}–{share.max} 字{Array.from(share.text).length<share.min||Array.from(share.text).length>share.max?'，请编辑至目标范围':''}。{!share.generated?'当前为事实整理稿，AI 未配置。':''}</p>
                        <div className="journey-actions"><label>首图风格<select value={coverStyle} onChange={e=>setCoverStyle(e.target.value)}>{['主站','奶油','薄荷','夜色'].map(s=><option key={s}>{s}</option>)}</select></label><label>简短介绍<input value={caption} maxLength={100} onChange={e=>setCaption(e.target.value)}/></label></div>
                        <label className="journey-check"><input type="checkbox" disabled={!cap.amap_export} checked={useBasemap} onChange={e=>setUseBasemap(e.target.checked)}/>使用高德地图底图{!cap.amap_export?'（待管理员配置导出授权）':''}</label>
                        <button disabled={busy} onClick={refreshCover}>更新首图预览</button>{coverUrl&&<img className="journey-cover" src={coverUrl} alt="行程分享首图预览"/>}
                        <p className="journey-muted">导出前请检查贴文、地点与首图。图片不会自动公开发布；原始照片与私人日记也不会随之上传。</p>
                        <div className="journey-actions"><button onClick={()=>perform(async()=>{await navigator.clipboard.writeText(share.text);setMessage('贴文已复制。');})}>复制贴文</button><button disabled={!coverBlob} onClick={()=>downloadBlob(coverBlob,'行程首图.png')}>下载首图</button><button onClick={()=>downloadBlob(new Blob([share.text],{type:'text/plain;charset=utf-8'}),'行程贴文.txt')}>下载文字</button></div>
                        <button disabled={!coverBlob} onClick={()=>perform(async()=>{const file=new File([coverBlob],'行程首图.png',{type:'image/png'});if(!navigator.canShare?.({files:[file]}))throw new Error('此浏览器不支持分享图片，请下载首图并复制文字。');await navigator.share({files:[file],text:share.text,title:share.cover.title});})}>系统分享</button>
                    </>}
                </div>}
                {tab==='community'&&<CommunityPanel key={token} base={base} token={token} feedback={feedback} onError={notify}/>}
            </div>
        </section>}
    </>;
}
