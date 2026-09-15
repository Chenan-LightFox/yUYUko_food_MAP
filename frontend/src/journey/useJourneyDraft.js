import {useCallback,useEffect,useRef,useState} from 'react';
import {eventId,request} from './feedback';

const signature=j=>JSON.stringify([j.id||null,j.revision||0,j.document]);
export default function useJourneyDraft(base,token,journal,dirty) {
    const latest=useRef({journal,dirty});latest.current={journal,dirty};
    const active=useRef(null),generation=useRef(0),inFlight=useRef(null),publishing=useRef(false),paused=useRef(false),mounted=useRef(true);
    const pendingPublish=useRef(null),pendingWrite=useRef(null);
    const [state,setState]=useState({kind:'idle',message:''});
    const report=useCallback((kind,message)=>{if(mounted.current)setState({kind,message});},[]);
    const start=useCallback(draft=>{
        generation.current++;paused.current=false;pendingPublish.current=null;pendingWrite.current=null;
        active.current=draft?{id:draft.id,revision:draft.revision,hash:signature({id:draft.journey_id,revision:draft.base_revision,document:draft.document})}:null;
        report(draft?'saved':'idle',draft?'草稿已同步':'');
    },[report]);
    const isSynced=useCallback(()=>!pendingPublish.current&&!pendingWrite.current&&(!latest.current.dirty||!!(active.current&&latest.current.journal&&active.current.hash===signature(latest.current.journal))),[]);
    const persist=useCallback(async(snapshot=latest.current.journal,keepalive=false)=>{
        if(!snapshot||!token)return null;
        if(pendingPublish.current)throw new Error('上次保存结果尚未确认，请再次点击保存日记；当前修改仍保留在本页。');
        const epoch=generation.current;
        while(inFlight.current){try{await inFlight.current;}catch{}if(epoch!==generation.current)return null;}
        if(epoch!==generation.current)return null;
        if(pendingPublish.current)throw new Error('请先确认上次保存结果');
        if(!active.current)active.current={id:eventId(),revision:0,hash:null};
        const meta=active.current,hash=signature(snapshot);
        if(meta.hash===hash&&!pendingWrite.current)return meta;
        const attempt=pendingWrite.current||{hash,body:{journey_id:snapshot.id||null,base_revision:snapshot.revision||0,draft_revision:meta.revision,document:snapshot.document}};
        pendingWrite.current=attempt;
        report('saving','正在同步草稿…');
        const operation=request(base,token,`/api/journeys/drafts/${meta.id}`,{method:'PUT',keepalive,body:JSON.stringify(attempt.body)});
        inFlight.current=operation;
        try{
            const result=await operation;
            if(epoch!==generation.current)return null;
            meta.revision=result.revision;meta.hash=attempt.hash;pendingWrite.current=null;paused.current=false;
            report('saved','草稿已同步');
        }catch(e){
            if(epoch===generation.current){paused.current=!!e.status&&e.status!==429&&e.status<500;if(paused.current)pendingWrite.current=null;report(paused.current?'conflict':'offline',paused.current?e.message:'草稿尚未同步，将自动重试；请暂时保留此页面。');}
            throw e;
        }finally{if(inFlight.current===operation)inFlight.current=null;}
        // Resolve an uncertain earlier write before sending edits made since then.
        if(meta.hash!==hash)return persist(snapshot,keepalive);
        return meta;
    },[base,token,report]);
    const flush=useCallback(async()=>{
        // A change may arrive while the previous write is in flight.
        while(latest.current.dirty&&!isSynced()){
            const snapshot=latest.current.journal;
            if(!await persist(snapshot))throw new Error('编辑状态已改变，请重试');
        }
        return true;
    },[persist,isSynced]);
    const publish=useCallback(async(snapshot,asCopy=false)=>{
        publishing.current=true;
        try{
            if(!pendingPublish.current){
                const meta=await persist(snapshot);
                if(!meta)throw new Error('草稿尚未同步，请重试');
                pendingPublish.current={id:meta.id,revision:meta.revision,snapshot,asCopy};
            }
            const attempt=pendingPublish.current;
            try{
                const saved=await request(base,token,`/api/journeys/drafts/${attempt.id}/publish`,{method:'POST',body:JSON.stringify({draft_revision:attempt.revision,as_copy:attempt.asCopy})});
                start(null);return {saved,snapshot:attempt.snapshot};
            }catch(e){
                if(e.status&&e.status<500)pendingPublish.current=null;
                else {paused.current=true;report('pending','保存结果待确认，请再次点击保存日记；当前修改仍保留在本页。');}
                throw e;
            }
        }finally{publishing.current=false;}
    },[base,token,persist,start,report]);
    useEffect(()=>{
        if(!dirty||!journal)return;
        const timer=setTimeout(()=>{if(!publishing.current&&!paused.current)persist().catch(()=>{});},900);
        return()=>clearTimeout(timer);
    },[journal,dirty,persist]);
    useEffect(()=>{
        const retry=()=>{if(latest.current.dirty&&!publishing.current&&!paused.current&&!isSynced())persist().catch(()=>{});};
        const timer=setInterval(retry,5000);window.addEventListener('online',retry);
        const leave=e=>{if(!isSynced())e.detail.waitUntil(flush());};
        window.addEventListener('journey:before-leave',leave);
        const unload=e=>{if(!isSynced()){e.preventDefault();e.returnValue='';}};
        window.addEventListener('beforeunload',unload);
        const hide=()=>{if(!isSynced()&&!publishing.current&&!paused.current)persist(latest.current.journal,true).catch(()=>{});};
        window.addEventListener('pagehide',hide);
        const visibility=()=>{if(document.visibilityState==='hidden')hide();};
        document.addEventListener('visibilitychange',visibility);
        return()=>{clearInterval(timer);window.removeEventListener('online',retry);window.removeEventListener('journey:before-leave',leave);window.removeEventListener('beforeunload',unload);window.removeEventListener('pagehide',hide);document.removeEventListener('visibilitychange',visibility);};
    },[persist,flush,isSynced]);
    useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
    const fork=useCallback(()=>{start(null);return persist();},[start,persist]);
    const prepare=async()=>{await persist();await flush();return {id:active.current?.id,revision:active.current?.revision};};
    return {state,start,isSynced,flush,prepare,publish,fork,currentId:()=>active.current?.id,currentRevision:()=>active.current?.revision};
}
