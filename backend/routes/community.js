const express=require('express');
const {randomUUID,createHash}=require('crypto');
const {requireAuth}=require('../middleware/auth');
const {sql,now,fail,string}=require('../services/journeyStore');
const router=express.Router();
router.use(requireAuth,(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
const run=fn=>(req,res,next)=>{try{fn(req,res);}catch(e){next(e);}};
const {consent,neighbors}=require('../services/communityPreferences');
router.get('/consent',run((req,res)=>res.json(consent(req.user.id))));
router.put('/consent',run((req,res)=>{
    const old=consent(req.user.id);
    if(req.body.version!==old.version) fail('设置已更新，请重新载入',409);
    const tags=[...new Set((Array.isArray(req.body.tags)?req.body.tags:[]).map(t=>string(t,24)).filter(Boolean))].slice(0,20);
    const feedback=req.body.feedback===true, research=feedback&&req.body.research===true,discovery=req.body.discovery===true;
    sql.transaction(()=>{
        sql.prepare(`INSERT INTO MapConsent(user_id,feedback,research,discovery,tags,version,updated_at) VALUES(?,?,?,?,?,?,?)
          ON CONFLICT(user_id) DO UPDATE SET feedback=excluded.feedback,research=excluded.research,discovery=excluded.discovery,tags=excluded.tags,version=excluded.version,updated_at=excluded.updated_at`)
            .run(req.user.id,+feedback,+research,+discovery,JSON.stringify(tags),old.version+1,now());
        if(!feedback) {
            sql.prepare('DELETE FROM MapInteraction WHERE user_id=?').run(req.user.id);
            sql.prepare('DELETE FROM MapDecision WHERE user_id=?').run(req.user.id);
        } else if(!research) sql.prepare('UPDATE MapInteraction SET research_allowed=0 WHERE user_id=?').run(req.user.id);
    })();
    res.json(consent(req.user.id));
}));
function collection(row) {
    return {...row,is_public:!!row.is_public,places:sql.prepare(`SELECT p.id,p.name,p.category,p.per_person_cost FROM PublicCollectionItem i JOIN Place p ON p.id=i.place_id WHERE i.collection_id=?`).all(row.id)};
}
router.get('/collections',run((req,res)=>res.json(sql.prepare('SELECT * FROM PublicCollection WHERE user_id=? ORDER BY updated_at DESC').all(req.user.id).map(collection))));
router.post('/collections',run((req,res)=>{
    if(sql.prepare('SELECT COUNT(*) AS n FROM PublicCollection WHERE user_id=?').get(req.user.id).n>=30) fail('最多创建 30 个收藏夹');
    const id=randomUUID();
    sql.prepare('INSERT INTO PublicCollection VALUES(?,?,?,?,?)').run(id,req.user.id,string(req.body.title,80)||'我的收藏夹',0,now());
    res.status(201).json(collection(sql.prepare('SELECT * FROM PublicCollection WHERE id=?').get(id)));
}));
router.put('/collections/:id',run((req,res)=>{
    if(!sql.prepare('SELECT id FROM PublicCollection WHERE id=? AND user_id=?').get(req.params.id,req.user.id)) fail('收藏夹不存在',404);
    const ids=[...new Set(Array.isArray(req.body.place_ids)?req.body.place_ids:[])];
    if(ids.length>200) fail('每个收藏夹最多 200 个地点');
    for(const id of ids) if(!Number.isSafeInteger(id)||!sql.prepare('SELECT id FROM Favorite WHERE user_id=? AND place_id=?').get(req.user.id,id)) fail('只能加入自己已经收藏的站内地点');
    sql.transaction(()=>{
        sql.prepare('UPDATE PublicCollection SET title=?,is_public=?,updated_at=? WHERE id=?').run(string(req.body.title,80)||'我的收藏夹',+(req.body.is_public===true),now(),req.params.id);
        sql.prepare('DELETE FROM PublicCollectionItem WHERE collection_id=?').run(req.params.id);
        for(const id of ids) sql.prepare('INSERT INTO PublicCollectionItem VALUES(?,?)').run(req.params.id,id);
    })();
    res.json(collection(sql.prepare('SELECT * FROM PublicCollection WHERE id=?').get(req.params.id)));
}));
router.delete('/collections/:id',run((req,res)=>{sql.prepare('DELETE FROM PublicCollection WHERE id=? AND user_id=?').run(req.params.id,req.user.id);res.status(204).end();}));
router.get('/neighbors',run((req,res)=>res.json(neighbors(req.user.id))));
router.get('/users/:id/collections',run((req,res)=>{
    if(!consent(req.params.id).discovery) fail('用户未开启同好发现',404);
    const user=sql.prepare('SELECT id,username FROM User WHERE id=? AND COALESCE(is_banned,0)=0').get(req.params.id);
    if(!user) fail('用户不存在',404);
    res.json({user,collections:sql.prepare('SELECT id,title,is_public,updated_at FROM PublicCollection WHERE user_id=? AND is_public=1').all(user.id).map(collection)});
}));
const kinds=new Set(['search','exposure','click','correction','next']);
const surfaces=new Set(['search','map','random','favorites','journey']);
router.post('/observations',run((req,res)=>{
    const c=consent(req.user.id);
    if(!c.feedback||req.body.consent_version!==c.version) {res.json({id:null});return;}
    const ids=Array.isArray(req.body.place_ids)?req.body.place_ids:[];
    if(ids.length>200||ids.some(id=>!Number.isSafeInteger(id))) fail('展示快照无效');
    const candidates=ids.map((id,rank)=>({place_id:id,rank})).filter(c=>sql.prepare('SELECT id FROM Place WHERE id=?').get(c.place_id));
    const id=req.body.snapshot_id||randomUUID(),query=req.body.search_session_id||null,render=req.body.render_revision||null;
    const validId=v=>/^[a-zA-Z0-9_-]{16,80}$/.test(v||'');
    if(!validId(id)||(query&&!validId(query))||(render&&!validId(render)))fail('展示快照编号无效');
    const hash=createHash('sha256').update(JSON.stringify({ids,query,render})).digest('hex');
    const old=sql.prepare('SELECT user_id,request_hash FROM MapDecision WHERE id=?').get(id);
    if(old){if(old.user_id!==req.user.id||old.request_hash!==hash)fail('展示快照 ID 冲突',409);res.status(201).json({id});return;}
    if(sql.prepare('SELECT COUNT(*) AS n FROM MapDecision WHERE user_id=? AND created_at>?').get(req.user.id,new Date(Date.now()-60000).toISOString()).n>=60) fail('展示快照过于频繁',429);
    const snapshot={candidates,algorithm:'search-observed-client-v2',propensity:null,surface:'search',search_session_id:query,render_revision:render};
    sql.prepare('INSERT INTO MapDecision VALUES(?,?,?,?,?,?)').run(id,req.user.id,hash,JSON.stringify(snapshot),'{}',now());
    res.status(201).json({id});
}));
router.post('/draw',run((req,res)=>{
    const c=consent(req.user.id);
    if(!c.feedback||req.body.consent_version!==c.version) fail('交互设置已改变，请重新抽取',409);
    const {draw_id,center}=req.body;
    if(!/^[a-zA-Z0-9_-]{16,80}$/.test(draw_id||'')||!center||typeof center.lng!=='number'||typeof center.lat!=='number'||!Number.isFinite(center.lng)||!Number.isFinite(center.lat)||Math.abs(center.lng)>180||Math.abs(center.lat)>90) fail('抽取参数无效');
    const excluded=Array.isArray(req.body.exclude_ids)?req.body.exclude_ids.slice(-2):[];
    if(excluded.some(n=>!Number.isSafeInteger(n)||n<1)) fail('排除地点无效');
    const hash=createHash('sha256').update(JSON.stringify({center,excluded})).digest('hex');
    const old=sql.prepare('SELECT * FROM MapDecision WHERE id=?').get(draw_id);
    if(old) {if(old.user_id!==req.user.id||old.request_hash!==hash) fail('抽取 ID 已用于另一请求',409);res.json(JSON.parse(old.result));return;}
    if(sql.prepare('SELECT COUNT(*) AS n FROM MapDecision WHERE user_id=? AND created_at>?').get(req.user.id,new Date(Date.now()-60000).toISOString()).n>=30) fail('请稍后再抽取',429);
    const {nearbyCandidates,drawRecommendation,personalizeCandidates}=require('../services/randomRecommendation');
    const {getUserPreference}=require('../services/userPreferenceService');
    const {isVectorSearchAvailable}=require('../db');
    let snapshot={candidates:[],eligible_count:0,algorithm:'random-mixture-v1'};
    const result=drawRecommendation(nearbyCandidates(sql,center),excluded,Math.random,candidates=>{
        try { if(isVectorSearchAvailable()) return personalizeCandidates(sql,candidates,getUserPreference(req.user.id)); } catch {}
        return {candidates,personalized:false};
    },data=>{snapshot=data;});
    result.decision_id=draw_id;
    // Only probabilities and local POI IDs are retained. No raw center coordinates.
    sql.prepare('INSERT INTO MapDecision VALUES(?,?,?,?,?,?)').run(draw_id,req.user.id,hash,JSON.stringify(snapshot),JSON.stringify(result),now());
    res.json(result);
}));
router.post('/feedback',run((req,res)=>{
    const c=consent(req.user.id);
    if(!c.feedback||req.body.consent_version!==c.version) {res.json({accepted:0});return;}
    if(!Array.isArray(req.body.events)||req.body.events.length>50) fail('每批最多 50 个事件');
    const recent=sql.prepare('SELECT COUNT(*) AS n FROM MapInteraction WHERE user_id=? AND created_at>?').get(req.user.id,new Date(Date.now()-60000).toISOString()).n;
    const fresh=req.body.events.filter(e=>!sql.prepare('SELECT id FROM MapInteraction WHERE id=? AND user_id=?').get(e?.id||'',req.user.id)).length;
    if(recent+fresh>300) fail('交互上报过于频繁',429);
    let accepted=0;
    sql.transaction(()=>{
        for(const e of req.body.events) {
            if(!/^[a-zA-Z0-9_-]{16,80}$/.test(e.id||'')||!/^[a-zA-Z0-9_-]{16,80}$/.test(e.session_id||'')||!kinds.has(e.kind)||!surfaces.has(e.surface)) fail('事件格式无效');
            if(e.kind==='correction'&&e.surface==='journey')fail('日记修正须通过保存版本记录');
            const old=sql.prepare('SELECT user_id FROM MapInteraction WHERE id=?').get(e.id);
            if(old) {if(old.user_id!==req.user.id) fail('事件 ID 冲突',409);continue;}
            const placeId=Number.isSafeInteger(e.place_id)?e.place_id:null;
            if(placeId&&!sql.prepare('SELECT id FROM Place WHERE id=?').get(placeId)) continue;
            const decision=e.decision_id?sql.prepare('SELECT snapshot FROM MapDecision WHERE id=? AND user_id=?').get(String(e.decision_id),req.user.id):null;
            if(e.decision_id&&!decision) continue;
            const snapshot=decision?JSON.parse(decision.snapshot):null;
            if(snapshot&&((snapshot.surface==='search'&&e.surface!=='search')||(snapshot.algorithm==='random-mixture-v1'&&e.surface!=='random')))fail('事件与展示来源不匹配');
            if(snapshot&&placeId&&!snapshot.candidates.some(p=>p.place_id===placeId)) continue;
            const rank=Number.isInteger(e.rank)&&e.rank>=0&&e.rank<200?e.rank:null;
            if(snapshot?.surface==='search'&&placeId&&!snapshot.candidates.some(p=>p.place_id===placeId&&p.rank===rank))fail('搜索结果顺序不匹配');
            const reason=['wrong_branch','wrong_place','not_visited','privacy','other'].includes(e.reason)?e.reason:null;
            // Null place events only measure funnel activity. They are never training labels.
            sql.prepare('INSERT INTO MapInteraction VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(e.id,req.user.id,e.session_id,e.kind,e.surface,e.decision_id||null,placeId,rank,reason,+(c.research&&!!placeId),now());accepted++;
            if(snapshot?.surface==='search')sql.prepare('INSERT INTO MapInteractionContext VALUES(?,?)').run(e.id,JSON.stringify({search_session_id:snapshot.search_session_id,render_revision:snapshot.render_revision,impression_id:string(e.impression_id,80),impression_status:['threshold_met','clicked_before_threshold'].includes(e.impression_status)?e.impression_status:null}));
        }
    })();
    res.json({accepted});
}));
router.get('/feedback',run((req,res)=>res.json({retention_days:30,counts:sql.prepare('SELECT kind,COUNT(*) AS count FROM MapInteraction WHERE user_id=? GROUP BY kind').all(req.user.id)})));
router.delete('/feedback',run((req,res)=>{
    sql.transaction(()=>{
        sql.prepare('DELETE FROM MapInteraction WHERE user_id=?').run(req.user.id);
        sql.prepare('DELETE FROM MapDecision WHERE user_id=?').run(req.user.id);
        sql.prepare('UPDATE MapConsent SET version=version+1,updated_at=? WHERE user_id=?').run(now(),req.user.id);
    })();
    res.json(consent(req.user.id));
}));
router.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.status?err.message:'同好与反馈服务暂不可用'}));
module.exports=router;
module.exports.consent=consent;
