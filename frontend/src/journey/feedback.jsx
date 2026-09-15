import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
export const eventId = () => globalThis.crypto?.randomUUID?.() || `event_${Date.now()}_${Math.random().toString(36).slice(2)}`;
export async function request(base,token,path,options={}) {
    const response=await fetch(`${base}${path}`,{...options,headers:{...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),Authorization:`Bearer ${token}`,...options.headers}});
    if(response.status===204) return null;
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw Object.assign(new Error(data.error||`请求失败 (${response.status})`),{status:response.status});
    return data;
}
export function useMapFeedback(base,token) {
    const [consent,setConsent]=useState(null),[queryEpoch,setQueryEpoch]=useState(0);
    const session=useRef(eventId()),query=useRef(eventId()),queue=useRef([]),render=useRef(null),seen=useRef(new Set()),inflight=useRef(false);
    const reset=useCallback(()=>{queue.current=[];render.current=null;seen.current.clear();session.current=eventId();query.current=eventId();},[]);
    useEffect(()=>{
        let active=true;reset();setConsent(null);
        if(token)request(base,token,'/api/community/consent').then(c=>{if(active)setConsent(c);}).catch(()=>{});
        return()=>{active=false;reset();};
    },[base,token,reset]);
    const updateConsent=useCallback(c=>{reset();setConsent(c);},[reset]);
    const beginSearch=useCallback(()=>{query.current=eventId();render.current=null;seen.current.clear();setQueryEpoch(n=>n+1);},[]);
    // Read the committed card order synchronously, before click handlers hide it.
    const present=useCallback(()=>{
        if(!token||!consent?.feedback)return null;
        const elements=Array.from(document.querySelectorAll('[data-feedback-surface="search"][data-feedback-place]')).slice(0,200);
        const ids=elements.map(el=>Number(el.dataset.feedbackPlace)),cards=elements.map(el=>el.dataset.feedbackCard);
        const signature=JSON.stringify([ids,cards]);
        if(!render.current||render.current.signature!==signature||render.current.query!==query.current){
            render.current={id:eventId(),revision:eventId(),query:query.current,signature,ids,cards,impressions:new Map(),uploaded:false};
        }
        return render.current;
    },[base,token,consent]);
    const record=useCallback((kind,surface,placeId=null,extra={})=>{
        if(!token||!consent?.feedback)return;
        const place_id=Number.isSafeInteger(placeId)?placeId:null;
        if(placeId!==null&&place_id===null)return;
        let snapshot=null,context={};
        if(surface==='search'&&place_id!==null){
            snapshot=present();const rank=extra.card_id?snapshot.cards.indexOf(extra.card_id):snapshot.ids.indexOf(place_id);
            if(rank<0||snapshot.ids[rank]!==place_id)return;
            const card=snapshot.cards[rank];
            if(!snapshot.impressions.has(card))snapshot.impressions.set(card,eventId());
            const impression=snapshot.impressions.get(card);
            if(kind==='exposure'){if(seen.current.has(impression))return;seen.current.add(impression);}
            context={decision_id:snapshot.id,rank,impression_id:impression,impression_status:seen.current.has(impression)?'threshold_met':'clicked_before_threshold'};
        }
        // Attribution is supplied only by this rendered search or the explicit random draw.
        const {card_id,...attributes}=extra;
        queue.current.push({event:{id:eventId(),session_id:session.current,kind,surface,place_id,...attributes,...context},snapshot});
        if(queue.current.length>100)queue.current.shift();
    },[token,consent,present]);
    const expose=useCallback((surface,placeId,rank,decisionId,cardId)=>record('exposure',surface,placeId,{decision_id:decisionId||null,rank,card_id:cardId}),[record]);
    useEffect(()=>{
        if(!consent?.feedback||!token)return;
        const flush=async(keepalive=false)=>{
            if(inflight.current||!queue.current.length)return;
            inflight.current=true;const current=session.current,batch=queue.current.slice(0,50);
            try{
                for(const snapshot of new Set(batch.map(x=>x.snapshot).filter(Boolean))){
                    if(snapshot.uploaded)continue;
                    const result=await request(base,token,'/api/community/observations',{method:'POST',keepalive,body:JSON.stringify({snapshot_id:snapshot.id,search_session_id:snapshot.query,render_revision:snapshot.revision,place_ids:snapshot.ids,consent_version:consent.version})});
                    if(session.current!==current)return;
                    if(!result.id){queue.current=[];return;}
                    snapshot.uploaded=true;
                }
                if(session.current!==current)return;
                await request(base,token,'/api/community/feedback',{method:'POST',keepalive,body:JSON.stringify({events:batch.map(x=>x.event),consent_version:consent.version})});
                if(session.current===current){const ids=new Set(batch.map(x=>x.event.id));queue.current=queue.current.filter(x=>!ids.has(x.event.id));}
            }catch{/* Keep original IDs for a bounded retry on the next interval. */}
            finally{inflight.current=false;}
        };
        const timer=setInterval(()=>flush(),2000),exit=()=>flush(true);
        const visibility=()=>{if(document.visibilityState==='hidden')exit();};
        window.addEventListener('pagehide',exit);document.addEventListener('visibilitychange',visibility);
        return()=>{clearInterval(timer);window.removeEventListener('pagehide',exit);document.removeEventListener('visibilitychange',visibility);};
    },[base,token,consent]);
    return useMemo(()=>({consent,updateConsent,record,expose,present,beginSearch,queryEpoch,base,token}),[consent,updateConsent,record,expose,present,beginSearch,queryEpoch,base,token]);
}
// A result counts as exposed only after half its card is visible for 800 ms.
export function Exposure({feedback,placeId,surface,rank=null,decisionId=null,children,...props}) {
    const ref=useRef(null), seen=useRef(false),cardId=useRef(eventId());
    useEffect(()=>{
        seen.current=false;
        if(!feedback?.consent?.feedback||!ref.current||!Number.isSafeInteger(placeId)) return;
        if(surface==='search')feedback.present();
        let timer;
        const observer=new IntersectionObserver(entries=>{
            clearTimeout(timer);
            if(entries[0]?.intersectionRatio>=0.5&&!seen.current&&document.visibilityState==='visible') timer=setTimeout(()=>{
                if(document.visibilityState!=='visible') return;
                const rect=ref.current.getBoundingClientRect();
                const top=document.elementFromPoint(Math.max(0,Math.min(innerWidth-1,rect.left+rect.width/2)),Math.max(0,Math.min(innerHeight-1,rect.top+rect.height/2)));
                if(!top||!ref.current.contains(top))return;
                seen.current=true;feedback.expose(surface,placeId,rank,decisionId,cardId.current);
            },800);
        },{threshold:[0,0.5]});
        observer.observe(ref.current);
        const onVisibility=()=>{clearTimeout(timer);observer.unobserve(ref.current);observer.observe(ref.current);};
        document.addEventListener('visibilitychange',onVisibility);
        return()=>{clearTimeout(timer);observer.disconnect();document.removeEventListener('visibilitychange',onVisibility);};
    },[feedback,placeId,surface,rank,decisionId]);
    return <div ref={ref} data-feedback-card={cardId.current} data-feedback-surface={surface} data-feedback-place={Number.isSafeInteger(placeId)?placeId:undefined} {...props}>{children}</div>;
}
