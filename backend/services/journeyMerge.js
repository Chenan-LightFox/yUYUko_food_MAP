const {createHash}=require('crypto');
const {getJourney,saveJourney,sql,fail}=require('./journeyStore');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

function planMerge(a,b,options={}) {
    if(a.id===b.id)fail('请选择两个不同的行程');
    const pair=[a,b].sort((x,y)=>x.document.start_date.localeCompare(y.document.start_date));
    if((Date.parse(pair[1].document.start_date)-Date.parse(pair[0].document.end_date))/86400000>1)fail('只能合并日期重叠或连续的行程');
    const policy=options.order_policy||'constraints';
    if(!['constraints','source','time'].includes(policy))fail('合并顺序策略无效');
    const resolutions=options.expense_resolutions||{};
    if(typeof resolutions!=='object'||Array.isArray(resolutions))fail('费用选择无效');
    const nodes=pair.flatMap(j=>j.document.stops.map((s,i)=>({
        ref:`${j.id}/${s.id}`,journey_id:j.id,source_title:j.document.title,index:i,
        stop:{...s,id:`merge_${digest([j.id,s.id]).slice(0,32)}`,expenses:s.expenses.map(e=>({...e}))}
    })));
    if(nodes.length>60)fail('合并后超过 60 个途经点，请先分段整理');
    const edges=nodes.map(()=>new Set()),degree=nodes.map(()=>0);
    const addEdge=(i,j)=>{if(i!==j&&!edges[i].has(j)){edges[i].add(j);degree[j]++;}};
    if(policy!=='time')for(let i=1;i<nodes.length;i++)if(nodes[i].journey_id===nodes[i-1].journey_id)addEdge(i-1,i);
    if(policy!=='source')for(let i=0;i<nodes.length;i++)for(let j=0;j<nodes.length;j++){
        if(nodes[i].stop.at&&nodes[j].stop.at&&nodes[i].stop.at<nodes[j].stop.at)addEdge(i,j);
    }
    const sorted=[],remaining=new Set(nodes.map((_,i)=>i));
    while(remaining.size){
        const available=[...remaining].filter(i=>degree[i]===0);
        if(!available.length)break;
        const i=available[0];sorted.push(nodes[i]);remaining.delete(i);for(const j of edges[i])degree[j]--;
    }
    const conflicts=[],warnings=[];
    if(remaining.size)conflicts.push({type:'time_order',message:'原有顺序与已填写时间相互矛盾，请选择保留原顺序或按时间重排。'});
    const ordered=remaining.size?nodes:sorted;
    if(policy!=='constraints')warnings.push('已按你选择的顺序规则处理冲突，请核对预览。');
    if(nodes.some(n=>!n.stop.at))warnings.push('没有精确时间的地点按所选规则稳定排布，请核对；未知时间不代表推测的到访时间。');
    const expenses=new Map();
    for(const n of ordered)n.stop.expenses.forEach((e,i)=>{
        if(!expenses.has(e.id))expenses.set(e.id,[]);
        expenses.get(e.id).push({ref:`${n.ref}/${i}`,node:n,expense:e,index:i});
    });
    let removed=0;
    for(const [id,group] of expenses){
        if(group.length<2)continue;
        const identical=group.every(g=>JSON.stringify(g.expense)===JSON.stringify(group[0].expense));
        let choice=resolutions[id];
        if(choice==='separate'){
            group.forEach(g=>{g.expense.id=`expense_${digest([id,g.ref]).slice(0,32)}`;});
            warnings.push('已按你的选择，将冲突费用保留为不同的消费记录。');continue;
        }
        if(choice&&!group.some(g=>g.ref===choice))fail('费用冲突选择已失效，请重新预览',409);
        if(!choice&&!identical){
            conflicts.push({type:'expense',id,message:'同一费用 ID 出现不同金额或说明，请选择正确版本或确认为不同消费。',options:group.map(g=>({ref:g.ref,title:g.node.source_title,place:g.node.stop.name,at:g.node.stop.at,...g.expense}))});continue;
        }
        choice=choice||group[0].ref;
        for(const g of group)if(g.ref!==choice){g.expense._drop=true;removed++;}
    }
    for(const n of ordered)n.stop.expenses=n.stop.expenses.filter(e=>!e._drop);
    if(removed)warnings.push(`已识别 ${removed} 条同一费用的重复引用，合并后只计一次。`);
    const document={title:pair.map(j=>j.document.title).join(' · ').slice(0,120),
        start_date:pair[0].document.start_date,end_date:pair.map(j=>j.document.end_date).sort().pop(),
        summary:pair.map(j=>j.document.summary).filter(Boolean).join('\n').slice(0,5000),stops:ordered.map(n=>n.stop)};
    const sources=pair.map(j=>({id:j.id,revision:j.revision}));
    const total_minor=document.stops.flatMap(s=>s.expenses).reduce((n,e)=>n+Math.round(e.amount*100),0);
    const preview_hash=digest({document,sources,policy,resolutions:Object.entries(resolutions).sort(),conflicts});
    return {document,sources,conflicts,warnings,total_minor,preview_hash,order_policy:policy};
}
function previewMerge(userId,aId,bId,revisions,options={}) {
    const a=getJourney(userId,aId),b=getJourney(userId,bId);
    if(a.revision!==revisions?.[0]||b.revision!==revisions?.[1])fail('来源行程已更新，请重新选择',409);
    return planMerge(a,b,options);
}
function mergeJourneys(userId,aId,bId,revisions,options={}) {
    return sql.transaction(()=>{
        const preview=previewMerge(userId,aId,bId,revisions,options);
        if(preview.conflicts.length)fail('请先处理合并预览中的冲突',409);
        if(options.preview_hash!==preview.preview_hash)fail('请先预览合并结果；来源或选择变化后需要重新预览',409);
        const requestId=options.request_id||preview.preview_hash;
        if(!/^[A-Za-z0-9_-]{16,80}$/.test(requestId))fail('合并请求 ID 无效');
        const previous=sql.prepare('SELECT journey_id,preview_hash FROM JourneyMergeRequest WHERE user_id=? AND request_id=?').get(userId,requestId);
        if(previous){
            if(previous.preview_hash!==preview.preview_hash)fail('同一合并请求不能用于不同预览，请重新打开预览',409);
            if(!sql.prepare('SELECT id FROM Journey WHERE id=? AND user_id=?').get(previous.journey_id,userId))fail('此合并请求的结果已被删除，请重新打开预览',410);
            return getJourney(userId,previous.journey_id);
        }
        const merged=saveJourney(userId,preview.document);
        merged.document.sources=preview.sources;
        const encoded=JSON.stringify(merged.document);
        sql.prepare('UPDATE Journey SET document=? WHERE id=?').run(encoded,merged.id);
        sql.prepare('UPDATE JourneyRevision SET document=? WHERE journey_id=? AND revision=1').run(encoded,merged.id);
        sql.prepare('INSERT INTO JourneyMergeRequest VALUES(?,?,?,?,?)').run(userId,requestId,preview.preview_hash,merged.id,merged.created_at);
        return merged;
    }).immediate();
}
module.exports={planMerge,previewMerge,mergeJourneys};
