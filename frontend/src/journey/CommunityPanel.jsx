import React,{useEffect,useState} from 'react';
import {request} from './feedback';
export default function CommunityPanel({base,token,feedback,onError}) {
    const [settings,setSettings]=useState(null),[collections,setCollections]=useState([]),[favorites,setFavorites]=useState([]),[neighbors,setNeighbors]=useState(null),[person,setPerson]=useState(null),[stats,setStats]=useState(null),[busy,setBusy]=useState(false);
    const api=(path,options)=>request(base,token,`/api/community${path}`,options);
    const load=async()=>{
        const [c,l,f,n,s]=await Promise.all([api('/consent'),api('/collections'),request(base,token,'/api/favorites'),api('/neighbors'),api('/feedback')]);
        setSettings(c);setCollections(l);setFavorites(f);setNeighbors(n);setStats(s);feedback.updateConsent(c);
    };
    useEffect(()=>{let active=true;load().catch(e=>{if(active)onError(e.message);});return()=>{active=false;};},[base,token]);
    const perform=async fn=>{setBusy(true);try{await fn();}catch(e){onError(e.message);}finally{setBusy(false);}};
    const saveSettings=()=>perform(async()=>{const saved=await api('/consent',{method:'PUT',body:JSON.stringify(settings)});setSettings(saved);feedback.updateConsent(saved);setNeighbors(await api('/neighbors'));setPerson(null);setStats(await api('/feedback'));});
    const saveCollection=c=>perform(async()=>{
        await api(`/collections/${c.id}`,{method:'PUT',body:JSON.stringify({...c,place_ids:c.places.map(p=>p.id)})});await load();
    });
    const editCollection=(id,patch)=>setCollections(list=>list.map(c=>c.id===id?{...c,...patch}:c));
    if(!settings)return <p>正在载入同好与收藏夹…</p>;
    return <div className="journey-stack">
        <h3>偏好星图</h3>
        <p className="journey-muted">中心是你。距离越近，用户向量越相似；方向仅用于排布，用户彼此间的距离没有相似度含义。</p>
        <p className="journey-muted">{neighbors?.notice}</p>
        {!neighbors?.neighbors.length?<p>{neighbors?.profile_status==='disabled'?'请先开启同好发现。':neighbors?.profile_status==='ready'?'暂时没有匹配的同好，可稍后再来查看。':'用户向量尚未就绪；可以先收藏地点、使用地图，无需公开收藏夹。'}</p>:<>
            <svg viewBox="-1.2 -1.2 2.4 2.4" className="journey-taste" role="img" aria-label="以我为中心的偏好星图">
                {[0.35,0.65,0.95].map(r=><circle key={r} r={r} fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth=".008"/>)}
                <circle r=".07" fill="var(--theme-primary)"/><text y=".17" textAnchor="middle" fontSize=".09" fill="currentColor">我</text>
                {neighbors.neighbors.map(p=><g key={p.id} role="button" tabIndex="0" aria-label={`查看 ${p.username} 的公开收藏夹`} onClick={()=>perform(async()=>setPerson(await api(`/users/${p.id}/collections`)))} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ') {e.preventDefault();perform(async()=>setPerson(await api(`/users/${p.id}/collections`)));}}}>
                    <circle cx={p.x} cy={p.y} r=".045" fill="var(--theme-secondary)"/><title>{p.username} · {Math.round(p.similarity*100)}% · {p.shared.join('、')}</title>
                </g>)}
            </svg>
            {neighbors.neighbors.map(p=><button className="journey-row" key={p.id} onClick={()=>perform(async()=>setPerson(await api(`/users/${p.id}/collections`)))}><strong>{p.username}</strong><span>向量相似度 {Math.round(p.similarity*100)}% · {p.confidence}</span><small>{p.shared.join(' · ')}</small></button>)}
        </>}
        {person&&<section className="journey-card"><h4>{person.user.username} 的公开收藏夹</h4>{person.collections.length?person.collections.map(c=><div key={c.id}><strong>{c.title}</strong><ul>{c.places.map(p=><li key={p.id}>{p.name} · {p.category||'未分类'}</li>)}</ul></div>):<p>暂时没有公开收藏夹。</p>}</section>}
        <h3>我的收藏夹</h3><p className="journey-muted">收藏夹默认私密，公开仅用于向同好展示。匹配使用既有用户向量，不要求公开收藏夹；私人日记不会进入同好画像。</p>
        <button disabled={busy} onClick={()=>perform(async()=>{await api('/collections',{method:'POST',body:JSON.stringify({title:'新收藏夹'})});await load();})}>＋ 新建收藏夹</button>
        {collections.map(c=><section key={c.id} className="journey-card journey-stack">
            <input aria-label="收藏夹名称" value={c.title} maxLength={80} onChange={e=>editCollection(c.id,{title:e.target.value})}/>
            <label className="journey-check"><input type="checkbox" checked={c.is_public} onChange={e=>editCollection(c.id,{is_public:e.target.checked})}/>公开此收藏夹</label>
            <div className="journey-scroll">{favorites.map(f=>{const id=Number(f.place_id||f.id);return <label key={id} className="journey-check"><input type="checkbox" checked={c.places.some(p=>p.id===id)} onChange={e=>editCollection(c.id,{places:e.target.checked?[...c.places,{id,name:f.name}]:c.places.filter(p=>p.id!==id)})}/>{f.name}</label>;})}</div>
            <div className="journey-actions"><button disabled={busy} onClick={()=>saveCollection(c)}>保存收藏夹</button><button disabled={busy} onClick={()=>perform(async()=>{if(window.confirm(`删除“${c.title}”？原有收藏会保留。`)){await api(`/collections/${c.id}`,{method:'DELETE'});await load();}})}>删除</button></div>
        </section>)}
        <h3>公开与数据使用设置</h3><p className="journey-muted">同好发现、交互反馈和研究使用默认开启，可在这里关闭；已保存的选择会保留。私人收藏明细和原始向量不会向其他用户展示。</p>
        <label>兴趣标签（逗号分隔，最多 20 个）<input value={settings.tags.join('，')} maxLength={500} onChange={e=>setSettings({...settings,tags:e.target.value.split(/[,，]/)})}/></label>
        <label className="journey-check"><input type="checkbox" checked={settings.discovery} onChange={e=>setSettings({...settings,discovery:e.target.checked})}/>允许使用我的用户向量匹配同好，并向其他用户展示用户名、兴趣标签及公开收藏夹</label>
        <label className="journey-check"><input type="checkbox" checked={settings.feedback} onChange={e=>setSettings({...settings,feedback:e.target.checked,research:e.target.checked?settings.research:false})}/>记录搜索操作、可见结果、点选、收藏和纠错，帮助改进地图</label>
        <p className="journey-muted">只记录站内地点 ID、操作、展示顺序和推荐决策；不记录搜索原文、持续位置或私人照片。保留 30 天，关闭后清除新增交互记录。原有收藏与偏好功能照常工作。</p>
        <label className="journey-check"><input type="checkbox" disabled={!settings.feedback} checked={settings.research} onChange={e=>setSettings({...settings,research:e.target.checked})}/>另行允许这些站内交互用于算法研究与离线评估</label>
        <button disabled={busy} onClick={saveSettings}>保存设置</button>
        <p>{stats?.counts.map(s=>`${({search:'搜索',exposure:'可见结果',click:'点选',favorite:'收藏',unfavorite:'取消收藏',correction:'纠错',next:'换一家',confirm_stop:'确认到访'})[s.kind]||s.kind} ${s.count}`).join(' · ')||'暂无新增交互记录'}</p>
        <button disabled={busy} onClick={()=>perform(async()=>{const c=await api('/feedback',{method:'DELETE'});setSettings(c);feedback.updateConsent(c);setStats(await api('/feedback'));})}>清除交互记录</button>
    </div>;
}
