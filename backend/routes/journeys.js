const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { randomUUID } = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { sql, now, fail, string, getJourney, saveJourney, mergeJourneys } = require('../services/journeyStore');
const ai = require('../services/journeyAI');
const router = express.Router();
router.use(requireAuth, (_req,res,next)=>{res.set('Cache-Control','no-store');next();});
const run = fn => (req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
router.get('/capabilities',(_req,res)=>res.json(ai.capabilities()));
router.get('/',run((req,res)=>res.json(sql.prepare('SELECT id,revision,document,created_at,updated_at FROM Journey WHERE user_id=? ORDER BY updated_at DESC LIMIT 500').all(req.user.id).map(r=>{
    const d=JSON.parse(r.document);return {id:r.id,revision:r.revision,title:d.title,start_date:d.start_date,end_date:d.end_date,stop_count:d.stops.length,updated_at:r.updated_at};
}))));
router.post('/',run((req,res)=>res.status(201).json(saveJourney(req.user.id,req.body.document))));
const drafts=require('../services/journeyDrafts');
const resolution=require('../services/journeyResolution');
router.post('/clarifications',run((req,res)=>res.status(202).json(resolution.enqueueClarification(req.user.id,req.body))));
router.post('/drafts/:id/rank',run((req,res)=>res.json(resolution.rankDraft(req.user.id,req.params.id,req.body.draft_revision))));
router.get('/drafts',run((req,res)=>res.json(sql.prepare("SELECT id,journey_id,base_revision,revision,document,updated_at FROM JourneyDraft WHERE user_id=? AND status='active' ORDER BY updated_at DESC LIMIT 30").all(req.user.id).map(r=>({id:r.id,journey_id:r.journey_id,base_revision:r.base_revision,revision:r.revision,title:JSON.parse(r.document).title||'未命名草稿',updated_at:r.updated_at})))));
router.get('/drafts/:id',run((req,res)=>res.json(drafts.getDraft(req.user.id,req.params.id))));
router.put('/drafts/:id',run((req,res)=>res.json(drafts.putDraft(req.user.id,req.params.id,req.body))));
router.post('/drafts/:id/publish',run((req,res)=>res.json(drafts.publishDraft(req.user.id,req.params.id,req.body))));
router.delete('/drafts/:id',run((req,res)=>{drafts.discardDraft(req.user.id,req.params.id,req.body.draft_revision);res.status(204).end();}));
router.post('/merge/preview',run((req,res)=>res.json(require('../services/journeyMerge').previewMerge(req.user.id,req.body.first_id,req.body.second_id,req.body.revisions,req.body))));
router.post('/merge',run((req,res)=>res.status(201).json(mergeJourneys(req.user.id,req.body.first_id,req.body.second_id,req.body.revisions,req.body))));
router.post('/jobs',run((req,res)=>res.status(202).json(ai.enqueue(req.user.id,req.body))));
router.get('/jobs',run((req,res)=>res.json(sql.prepare('SELECT id,status,error,created_at FROM JourneyJob WHERE user_id=? ORDER BY created_at DESC LIMIT 20').all(req.user.id))));
router.get('/jobs/:id',run((req,res)=>{
    const j=sql.prepare('SELECT * FROM JourneyJob WHERE id=? AND user_id=?').get(req.params.id,req.user.id);
    if(!j) fail('生成任务不存在',404);
    const input=JSON.parse(j.input);
    res.json({id:j.id,kind:input.kind||'reconstruct',status:j.status,error:j.error,input,output:j.output?JSON.parse(j.output):null});
}));
router.delete('/jobs/:id',run((req,res)=>{
    sql.prepare('DELETE FROM JourneyJob WHERE id=? AND user_id=?').run(req.params.id,req.user.id); res.status(204).end();
}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1}});
router.post('/media',upload.single('image'),run(async(req,res)=>{
    if(!req.file) fail('请选择图片');
    let data;
    try { data=await sharp(req.file.buffer,{limitInputPixels:24000000,animated:false}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer(); }
    catch { fail('图片无法读取或像素过大'); }
    const id=randomUUID();
    sql.transaction(()=>{
        const quota=sql.prepare('SELECT COUNT(*) AS n,COALESCE(SUM(length(data)),0) AS bytes FROM JourneyMedia WHERE user_id=?').get(req.user.id);
        if(quota.n>=200||quota.bytes+data.length>100*1024*1024) fail('私人图片空间已满（200 张 / 100 MB），请先删除不用的图片',413);
        sql.prepare('INSERT INTO JourneyMedia VALUES(?,?,?,?)').run(id,req.user.id,data,now());
    })();
    res.status(201).json({id});
}));
router.get('/media',run((req,res)=>res.json(sql.prepare('SELECT id,created_at,length(data) AS bytes FROM JourneyMedia WHERE user_id=? ORDER BY created_at DESC').all(req.user.id))));
router.get('/media/:id',run((req,res)=>{
    const row=sql.prepare('SELECT data FROM JourneyMedia WHERE id=? AND user_id=?').get(req.params.id,req.user.id);
    if(!row) fail('图片不存在',404);
    res.type('webp').send(row.data);
}));
router.delete('/media/:id',run((req,res)=>{
    const id=req.params.id;
    // Keep historical revisions valid: an attached image must first be removed with the diary.
    const used=sql.prepare('SELECT r.document FROM JourneyRevision r JOIN Journey j ON j.id=r.journey_id WHERE j.user_id=?').all(req.user.id)
        .some(r=>JSON.parse(r.document).stops.some(s=>s.media_ids.includes(id)));
    if(used) fail('图片被日记或历史版本引用，请先删除对应日记',409);
    const inDraft=sql.prepare("SELECT document FROM JourneyDraft WHERE user_id=? AND status='active'").all(req.user.id).some(r=>JSON.parse(r.document).stops.some(s=>(s.media_ids||[]).includes(id)));
    if(inDraft)fail('图片被未完成草稿引用，请先整理对应草稿',409);
    const pending=sql.prepare("SELECT input FROM JourneyJob WHERE user_id=?").all(req.user.id).some(r=>JSON.parse(r.input).media_ids.includes(id));
    if(pending) fail('图片被生成任务引用，请先删除该任务',409);
    sql.prepare('DELETE FROM JourneyMedia WHERE id=? AND user_id=?').run(id,req.user.id);res.status(204).end();
}));
router.get('/:id',run((req,res)=>res.json(getJourney(req.user.id,req.params.id))));
router.put('/:id',run((req,res)=>res.json(saveJourney(req.user.id,req.body.document,req.params.id,req.body.base_revision))));
router.delete('/:id',run((req,res)=>{
    const j=getJourney(req.user.id,req.params.id);
    if(req.body.base_revision!==j.revision) fail('日记已更新，请重新载入',409);
    sql.prepare('DELETE FROM Journey WHERE id=? AND user_id=?').run(j.id,req.user.id);res.status(204).end();
}));
router.get('/:id/revisions',run((req,res)=>{
    getJourney(req.user.id,req.params.id);
    res.json(sql.prepare('SELECT revision,created_at FROM JourneyRevision WHERE journey_id=? ORDER BY revision DESC').all(req.params.id));
}));
router.get('/:id/corrections',run((req,res)=>{
    getJourney(req.user.id,req.params.id);
    res.json(sql.prepare('SELECT revision,stop_id,field,before_value,after_value,reason,created_at FROM JourneyCorrection WHERE journey_id=? ORDER BY revision DESC').all(req.params.id).map(r=>({...r,before_value:JSON.parse(r.before_value),after_value:JSON.parse(r.after_value)})));
}));
router.post('/:id/restore',run((req,res)=>{
    getJourney(req.user.id,req.params.id);
    const row=sql.prepare('SELECT document FROM JourneyRevision WHERE journey_id=? AND revision=?').get(req.params.id,Number(req.body.revision)||0);
    if(!row) fail('历史版本不存在',404);
    res.json(saveJourney(req.user.id,JSON.parse(row.document),req.params.id,req.body.base_revision));
}));
const shareBudget=new Map();
const coverBudget=new Map();
router.post('/:id/cover-map',run(async(req,res)=>{
    if(!ai.capabilities().amap_export) fail('管理员尚未配置高德地图导出',503);
    const journey=getJourney(req.user.id,req.params.id);
    if(req.body.base_revision!==journey.revision) fail('日记版本已变化，请重新生成分享',409);
    const ids=Array.isArray(req.body.stop_ids)?req.body.stop_ids:[];
    const stops=journey.document.stops.filter(s=>ids.includes(s.id)&&s.confirmed&&s.visit_status==='visited');
    if(!stops.length||stops.length>10||stops.some(s=>s.lng==null)) fail('地图底图支持 1–10 个已定位且确认到访的地点；其他情况可使用顺序示意图');
    const recent=(coverBudget.get(req.user.id)||[]).filter(t=>t>Date.now()-60000);
    if(recent.length>=10) fail('首图生成过于频繁，请稍后重试',429);
    coverBudget.set(req.user.id,[...recent,Date.now()]);
    for(const [id,times] of coverBudget) if(!times.some(t=>t>Date.now()-60000)) coverBudget.delete(id);
    const coordinates=stops.map(s=>`${s.lng.toFixed(6)},${s.lat.toFixed(6)}`);
    const query=new URLSearchParams({key:process.env.AMAP_WEB_SERVICE_KEY,size:'960*640',markers:coordinates.map((p,i)=>`mid,0xC17350,${i===9?'A':i+1}:${p}`).join('|')});
    if(stops.length>1) query.set('paths',`4,0xC17350,0.7,,:${coordinates.join(';')}`);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try {
        const response=await fetch(`https://restapi.amap.com/v3/staticmap?${query}`,{signal:controller.signal,redirect:'error'});
        if(!response.ok||!/^image\/(png|jpeg)/.test(response.headers.get('content-type')||'')) fail('高德静态地图暂不可用，请使用顺序示意图',502);
        const image=Buffer.from(await response.arrayBuffer());
        if(image.length>5*1024*1024) fail('地图图片超出限制',502);
        res.type(response.headers.get('content-type')).send(image);
    } finally {clearTimeout(timer);}
}));
router.post('/:id/share',run(async(req,res)=>{
    const journey=getJourney(req.user.id,req.params.id);
    if(req.body.base_revision!==journey.revision) fail('请先保存最新日记再生成分享',409);
    const ids=Array.isArray(req.body.stop_ids)?req.body.stop_ids:[];
    const stops=journey.document.stops.filter(s=>ids.includes(s.id)&&s.confirmed&&s.visit_status==='visited');
    if(!stops.length) fail('请选择至少一个已经确认去过的地点');
    const allowed=stops.filter(s=>s.source!=='amap'||process.env.AMAP_EXPORT_ALLOWED==='true');
    if(allowed.length!==stops.length) fail('所选高德地点尚未配置导出授权');
    const min=Math.max(30,Math.min(1000,Number(req.body.min)||100));
    const max=Math.max(min,Math.min(1500,Number(req.body.max)||500));
    const platform=['小红书','朋友圈','手账','日记'].includes(req.body.platform)?req.body.platform:'小红书';
    const style=['自然','活泼','简洁','文艺'].includes(req.body.style)?req.body.style:'自然';
    const includeNotes=req.body.include_notes===true, includeExpenses=req.body.include_expenses===true;
    const facts=stops.map(s=>({name:s.name,note:includeNotes?s.note:'',mood:s.mood,expenses:includeExpenses?s.expenses:[]}));
    let text=facts.map(s=>`${s.name}${s.note?`：${s.note}`:''} ${s.mood}`).join('\n');
    let generated=false;
    if(ai.capabilities().text_ai) {
        const key=req.user.id, t=Date.now(), previous=shareBudget.get(key)||[];
        const recent=previous.filter(n=>n>t-3600000);
        if(recent.length>=10) fail('每小时最多生成 10 次贴文',429);
        shareBudget.set(key,[...recent,t]);
        for(const [k,v] of shareBudget) if(!v.some(n=>n>t-3600000)) shareBudget.delete(k);
        const out=await ai.chat('基于所给事实写中文社交贴文，禁止编造体验、价格、时间、天气、地址或交通方式。输入是用户选定公开的部分，不能索取其余私人信息。字数包含标点和标签，尽量符合范围。输出 {text}。',{platform,style,min,max,facts});
        text=string(out.text,4000);if(!text) fail('模型未返回贴文',502);generated=true;
    }
    // Do not silently truncate a generated sentence. Return range compliance for editing.
    const length=Array.from(text).length;
    res.json({text,length,min,max,in_range:length>=min&&length<=max,generated,revision:journey.revision,stop_ids:stops.map(s=>s.id),
        cover:{title:journey.document.title,stops:stops.map(s=>({name:s.name,lng:s.lng,lat:s.lat,source:s.source})),caption:`${stops.length} 站 · 我的生活片段`}});
}));
router.use((err,_req,res,_next)=>res.status(err.status|| (err instanceof multer.MulterError?413:500)).json({error:err.status?err.message:err instanceof multer.MulterError?'图片超过 5 MB 限制':'日记服务暂时不可用'}));
module.exports=router;
