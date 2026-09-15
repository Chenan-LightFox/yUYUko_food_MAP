const {createHash}=require('crypto');
const {sql,fail,now,ownedMedia,getJourney,saveJourney}=require('./journeyStore');

function draftRow(userId,id) {
    const row=sql.prepare('SELECT * FROM JourneyDraft WHERE id=? AND user_id=?').get(id,userId);
    if(!row)fail('草稿不存在',404);
    return row;
}
function unpack(row) {return {id:row.id,revision:row.revision,journey_id:row.journey_id,base_revision:row.base_revision,document:JSON.parse(row.document),updated_at:row.updated_at};}
function getDraft(userId,id) {
    const row=draftRow(userId,id);if(row.status!=='active')fail('草稿已保存或丢弃',410);return unpack(row);
}
function draftDocument(input,userId) {
    if(!input||typeof input!=='object'||Array.isArray(input)||!Array.isArray(input.stops)||input.stops.length>60)fail('草稿格式无效');
    if(Buffer.byteLength(JSON.stringify(input))>160000)fail('草稿内容过大',413);
    const document=JSON.parse(JSON.stringify(input));
    for(const key of ['title','summary','start_date','end_date'])if(typeof document[key]!=='string')fail('草稿文本格式无效');
    for(const stop of document.stops){
        if(!stop||typeof stop!=='object'||Array.isArray(stop)||!Array.isArray(stop.expenses)||stop.expenses.length>30)fail('草稿途经点格式无效');
        for(const key of ['id','name','note','at','mood'])if(typeof stop[key]!=='string')fail('草稿地点文本格式无效');
        stop.media_ids=ownedMedia(userId,stop.media_ids||[]);
        if(stop.candidates!==undefined&&(!Array.isArray(stop.candidates)||stop.candidates.length>5))fail('草稿候选格式无效');
        if(process.env.AMAP_JOURNAL_STORAGE_ALLOWED!=='true'&&(stop.source==='amap'||stop.candidates?.some(c=>c?.source==='amap')))fail('尚未配置高德数据存储授权，请使用站内地点或手动标记');
        for(const e of stop.expenses)if(!e||typeof e!=='object'||!['string','number'].includes(typeof e.amount)||typeof e.note!=='string')fail('草稿费用格式无效');
    }
    // Preserve incomplete dates/amounts and correction reasons while typing.
    // The stricter canonical diary validation runs only at publication.
    return document;
}
function putDraft(userId,id,body) {
    if(!/^[A-Za-z0-9_-]{16,80}$/.test(id)||!Number.isInteger(body.draft_revision)||body.draft_revision<0)fail('草稿版本无效');
    const document=draftDocument(body.document,userId),journeyId=body.journey_id||null,baseRevision=body.base_revision||0;
    if(journeyId){getJourney(userId,journeyId);if(!Number.isInteger(baseRevision)||baseRevision<1)fail('日记基础版本无效');}
    else if(baseRevision!==0)fail('新日记的基础版本无效');
    const encoded=JSON.stringify(document),hash=createHash('sha256').update(JSON.stringify([journeyId,baseRevision,document])).digest('hex');
    return sql.transaction(()=>{
        const old=sql.prepare('SELECT * FROM JourneyDraft WHERE id=?').get(id);
        if(old){
            if(old.user_id!==userId)fail('草稿不存在',404);
            if(old.status!=='active')fail('草稿已保存或丢弃，请打开新的编辑草稿',410);
            if(old.content_hash===hash&&[old.revision,old.revision-1].includes(body.draft_revision))return unpack(old);
            if(old.revision!==body.draft_revision)fail('草稿已在其他窗口修改，当前内容仍在本页，可另存草稿或重新载入',409);
            sql.prepare('UPDATE JourneyDraft SET journey_id=?,base_revision=?,revision=revision+1,document=?,content_hash=?,updated_at=? WHERE id=?').run(journeyId,baseRevision,encoded,hash,now(),id);
        }else{
            if(body.draft_revision!==0)fail('草稿已不存在，请另存草稿',409);
            if(sql.prepare("SELECT COUNT(*) AS n FROM JourneyDraft WHERE user_id=? AND status='active'").get(userId).n>=30)fail('最多保留 30 份未完成草稿，请先整理',413);
            const time=now();
            sql.prepare('INSERT INTO JourneyDraft(id,user_id,journey_id,base_revision,revision,document,content_hash,created_at,updated_at) VALUES(?,?,?,?,1,?,?,?,?)').run(id,userId,journeyId,baseRevision,encoded,hash,time,time);
        }
        return getDraft(userId,id);
    }).immediate();
}
function publishDraft(userId,id,body) {
    return sql.transaction(()=>{
        const row=draftRow(userId,id);
        if(row.status==='published')return getJourney(userId,row.published_id);
        if(row.status!=='active')fail('草稿已丢弃',410);
        if(row.revision!==body.draft_revision)fail('草稿版本已变化，请重新载入草稿',409);
        const saved=saveJourney(userId,JSON.parse(row.document),body.as_copy===true?null:row.journey_id,body.as_copy===true?null:row.base_revision);
        sql.prepare("UPDATE JourneyDraft SET status='published',document='{}',published_id=?,updated_at=? WHERE id=?").run(saved.id,now(),id);
        return saved;
    }).immediate();
}
function discardDraft(userId,id,revision) {
    return sql.transaction(()=>{
        const row=draftRow(userId,id);
        if(row.status==='discarded')return;
        if(row.status!=='active'||row.revision!==revision)fail('草稿已更新，请重新载入',409);
        sql.prepare("UPDATE JourneyDraft SET status='discarded',document='{}',updated_at=? WHERE id=?").run(now(),id);
    }).immediate();
}
module.exports={getDraft,putDraft,publishDraft,discardDraft};
