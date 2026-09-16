// Runs real React + API routes against an isolated DB. Only the AMap SDK is replaced.
const assert=require('assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {randomUUID}=require('crypto');
const express=require('express');
const jwt=require('jsonwebtoken');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yuyuko-journey-ui-'));
process.env.DB_FILE=path.join(temp,'ui.sqlite');process.env.LOG_TO_FILE='false';process.env.LOG_TO_CONSOLE='false';
process.env.JOURNEY_LLM_API_KEY='';process.env.DEEPSEEK_API_KEY='';process.env.AMAP_WEB_SERVICE_KEY='';process.env.JOURNEY_LLM_VISION='false';
require.cache[require.resolve('../redis')]={exports:{isReady:()=>false}};
const {db,init}=require('../db');
const nativeFetch=global.fetch;let browser,server,vite,stopWorker;
async function main(){
    init();const id=randomUUID();db._raw.prepare('INSERT INTO User(id,username,password) VALUES(?,?,?)').run(id,'浏览器测试用户','unused');
    // Preserve a previously saved opt-out while exercising the existing enable/disable flow.
    db._raw.prepare('UPDATE MapConsent SET feedback=0,research=0,discovery=0,version=1 WHERE user_id=?').run(id);
    db._raw.prepare('INSERT INTO Place(id,name,category,longitude,latitude) VALUES(1,?,?,?,?)').run('测试面馆','面食',120,30);
    db._raw.prepare('INSERT INTO Place(id,name,category,longitude,latitude) VALUES(2,?,?,?,?)').run('屏幕外餐馆','面食',120,30);
    db._raw.prepare('INSERT INTO Favorite(user_id,place_id) VALUES(?,1)').run(id);
    const token=jwt.sign({id},process.env.JWT_SECRET||'yuyuko_secret_key');
    const app=express();app.use(express.json({limit:'256kb'}));app.use('/api/journeys',require('../routes/journeys'));app.use('/api/community',require('../routes/community'));app.use('/api/favorites',require('../routes/favorites'));
    const frontend=path.resolve(__dirname,'../../frontend');
    const {createServer}=await import(require('url').pathToFileURL(path.join(frontend,'node_modules/vite/dist/node/index.js')).href);
    vite=await createServer({root:frontend,server:{middlewareMode:true},appType:'custom'});
    const themeCss=(fs.readFileSync(path.join(frontend,'index.html'),'utf8').match(/:root(?:\[data-theme='dark'\])?\s*\{[^}]*\}/g)||[]).join('\n');
    app.get('/__journey_ui',async(req,res)=>res.type('html').send(await vite.transformIndexHtml(req.url,`<!doctype html><html lang="zh"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${themeCss}body{margin:0}</style></head><body><div id="root"></div><script>window.__TEST_TOKEN=${JSON.stringify(token)}</script><script type="module" src="/tests/journey-harness.jsx"></script></body></html>`)));
    app.use(vite.middlewares);server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const playwrightPath=process.env.PLAYWRIGHT_MODULE||'playwright';
    const {chromium}=require(playwrightPath);browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
    const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/__journey_ui`);
    await page.getByRole('button',{name:'✦ 日记 · 同好'}).click();
    await page.getByRole('button',{name:'＋ 手动新建'}).click();
    await page.getByLabel('日记标题').fill('周末的面食散步');
    await page.getByRole('button',{name:'加入当前选中地点'}).click();
    await page.getByRole('button',{name:'在地图上点选位置'}).click();
    await page.evaluate(()=>window.__TEST_MAP_CLICK({lnglat:{lng:120.02,lat:30.03}}));
    await page.getByText(/120.02000, 30.03000/).waitFor();
    await page.getByLabel('补充描述').fill('和朋友吃了一碗面，聊了很多。');
    await page.getByRole('combobox',{name:/^经历状态/}).selectOption('visited');
    await page.getByLabel('我已核对这个地点与经历状态').check();
    await page.getByRole('button',{name:'＋ 记一笔'}).click();
    await page.getByLabel('支出 1 金额').fill('28.50');
    await page.getByLabel('支出 1 说明').fill('晚饭');
    await page.waitForFunction(()=>document.querySelector('[aria-label="草稿同步状态"]')?.textContent.startsWith('草稿已同步'));
    assert.equal(db._raw.prepare("SELECT COUNT(*) AS n FROM Journey WHERE user_id=?").get(id).n,0);
    assert.equal(db._raw.prepare("SELECT COUNT(*) AS n FROM JourneyDraft WHERE user_id=? AND status='active'").get(id).n,1);
    await page.reload();
    await page.getByRole('button',{name:'✦ 日记 · 同好'}).click();
    await page.getByRole('button',{name:'恢复草稿：周末的面食散步',exact:true}).click();
    assert.equal(await page.getByLabel('支出 1 金额').inputValue(),'28.50');
    assert.equal(await page.getByLabel('补充描述').inputValue(),'和朋友吃了一碗面，聊了很多。');
    const draftUrl=/\/api\/journeys\/drafts\/[^/]+$/;
    await page.route(draftUrl,route=>route.request().method()==='PUT'?route.abort('failed'):route.continue());
    await page.getByLabel('补充描述').fill('断网期间继续记录。');
    await page.getByText('草稿尚未同步，将自动重试；请暂时保留此页面。',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>window.__TEST_LEAVE()),false,'navigation is blocked while latest edits cannot be saved');
    await page.unroute(draftUrl);
    let draftAckLost=false;
    await page.route(draftUrl,async route=>{if(route.request().method()==='PUT'&&!draftAckLost){draftAckLost=true;await route.fetch();await route.abort('failed');}else await route.continue();});
    await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    for(let i=0;i<20&&!draftAckLost;i++)await page.waitForTimeout(100);
    assert.equal(draftAckLost,true);
    await page.getByLabel('补充描述').fill('响应丢失期间仍可继续补充。');
    await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await page.waitForFunction(()=>document.querySelector('[aria-label="草稿同步状态"]')?.textContent.startsWith('草稿已同步'));
    await page.unroute(draftUrl);
    assert.equal(await page.getByLabel('补充描述').inputValue(),'响应丢失期间仍可继续补充。');
    await page.getByLabel('补充描述').fill('和朋友吃了一碗面，聊了很多。');
    assert.equal(await page.evaluate(()=>window.__TEST_LEAVE()),true,'navigation flushes without waiting for debounce');
    let publishAckLost=false;
    await page.route('**/api/journeys/drafts/*/publish',async route=>{if(!publishAckLost){publishAckLost=true;await route.fetch();await route.abort('failed');}else await route.continue();});
    await page.getByRole('button',{name:'保存日记',exact:true}).click();
    await page.getByText('保存结果待确认，请再次点击保存日记；当前修改仍保留在本页。',{exact:false}).waitFor();
    await page.getByLabel('补充描述').fill('保存回复丢失后又补充。');
    await page.getByRole('button',{name:'保存日记',exact:true}).click();
    await page.getByText('前一个版本已保存，还有新修改待保存。',{exact:false}).waitFor();
    assert.equal(await page.getByLabel('补充描述').inputValue(),'保存回复丢失后又补充。');
    assert.equal(db._raw.prepare('SELECT COUNT(*) AS n FROM Journey WHERE user_id=?').get(id).n,1);
    await page.unroute('**/api/journeys/drafts/*/publish');
    await page.getByLabel('补充描述').fill('和朋友吃了一碗面，聊了很多。');
    await page.getByRole('button',{name:'保存日记',exact:true}).click();
    await page.getByText('日记已保存，仅自己可见。').waitFor();
    await page.getByRole('button',{name:'生成分享',exact:true}).click();
    await page.getByRole('button',{name:'生成贴文与首图'}).click();
    await page.getByAltText('行程分享首图预览').waitFor();
    assert.ok(!(await page.getByLabel('贴文（可以直接修改）').inputValue()).includes('28.5'));
    await page.getByLabel('首图风格').selectOption('夜色');
    await page.getByRole('button',{name:'更新首图预览'}).click();
    await page.getByRole('button',{name:'日历',exact:true}).click();
    await page.getByRole('button',{name:/周末的面食散步/}).click();
    assert.equal(await page.getByLabel('支出 1 金额').inputValue(),'28.5');
    assert.equal(await page.getByLabel('补充描述').inputValue(),'和朋友吃了一碗面，聊了很多。');
    // A second, overlapping diary retains the same expense identity.
    const first=db._raw.prepare('SELECT * FROM Journey WHERE user_id=? ORDER BY created_at LIMIT 1').get(id);
    const duplicate={...JSON.parse(first.document),title:'午后补记'};
    duplicate.stops[0].expenses[0].amount=38.5;
    require('../services/journeyStore').saveJourney(id,duplicate);
    await page.getByRole('button',{name:'收起日记',exact:true}).click();
    await page.getByRole('button',{name:'✦ 日记 · 同好'}).click();
    await page.getByRole('button',{name:'日历',exact:true}).click();
    await page.getByLabel('选择 周末的面食散步 以合并',{exact:true}).check();
    await page.getByLabel('选择 午后补记 以合并',{exact:true}).check();
    await page.getByRole('button',{name:'预览合并',exact:true}).click();
    await page.getByRole('combobox',{name:/^这笔支出如何保留/}).waitFor();
    assert.equal(await page.getByRole('button',{name:'确认合并',exact:true}).isDisabled(),true);
    await page.getByRole('combobox',{name:/^这笔支出如何保留/}).selectOption('separate');
    await page.getByText('合计 ¥67.00',{exact:true}).waitFor();
    const out=process.env.JOURNEY_UI_ARTIFACT_DIR;
    if(out){fs.mkdirSync(out,{recursive:true});await page.locator('[aria-label="合并预览"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'journey-merge-preview.png'),fullPage:true});}
    await page.getByRole('button',{name:'确认合并',exact:true}).click();
    await page.getByLabel('日记标题').waitFor();
    assert.equal(db._raw.prepare('SELECT COUNT(*) AS n FROM Journey WHERE user_id=?').get(id).n,3);
    await page.getByRole('button',{name:'同好',exact:true}).click();
    await page.getByRole('button',{name:'＋ 新建收藏夹'}).click();
    await page.getByLabel('收藏夹名称').fill('我的面食地图');
    await page.getByLabel('测试面馆',{exact:true}).check();
    await page.getByLabel('公开此收藏夹').check();
    await page.getByRole('button',{name:'保存收藏夹'}).click();
    await page.getByLabel('记录搜索操作', {exact:false}).check();
    await page.getByRole('button',{name:'保存设置'}).click();
    // Await the response/UI update before reading persisted state.
    await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));
    assert.equal(db._raw.prepare('SELECT feedback FROM MapConsent WHERE user_id=?').get(id).feedback,1);
    for(let i=0;i<24;i++){if(db._raw.prepare("SELECT COUNT(*) AS n FROM MapInteraction WHERE user_id=? AND kind='exposure'").get(id).n)break;await page.waitForTimeout(250);}
    assert.equal(db._raw.prepare("SELECT COUNT(*) AS n FROM MapInteraction WHERE user_id=? AND kind='exposure' AND place_id=1").get(id).n,1);
    assert.equal(db._raw.prepare("SELECT COUNT(*) AS n FROM MapInteraction WHERE user_id=? AND kind='exposure' AND place_id=2").get(id).n,0);
    const snapshot=db._raw.prepare("SELECT id,snapshot FROM MapDecision WHERE user_id=? ORDER BY created_at DESC LIMIT 1").get(id);
    assert.equal(JSON.parse(snapshot.snapshot).candidates.length,2);
    const beforeClick=db._raw.prepare("SELECT COUNT(*) AS n FROM MapInteraction WHERE kind='click'").get().n;
    let aborted=false;const sent=[];
    await page.route('**/api/community/feedback',async route=>{
        const body=route.request().postDataJSON();sent.push(body.events.map(e=>e.id));
        if(!aborted){aborted=true;await route.fetch();await route.abort('failed');}else await route.continue();
    });
    // Same ordered result set, new query; click before the 800 ms exposure threshold.
    await page.evaluate(()=>{window.__TEST_FEEDBACK.beginSearch();window.__TEST_FEEDBACK.record('click','search',1);window.__TEST_FEEDBACK.record('click','map',1);});
    for(let i=0;i<32;i++){if(sent.length>=2)break;await page.waitForTimeout(250);}
    assert.ok(sent.length>=2,'failed acknowledgement must be retried');assert.ok(sent[1].includes(sent[0][0]),'retry preserves event ID');
    for(let i=0;i<12;i++){if(db._raw.prepare("SELECT COUNT(*) AS n FROM MapInteraction WHERE kind='click'").get().n>=beforeClick+2)break;await page.waitForTimeout(250);}
    assert.equal(db._raw.prepare("SELECT COUNT(*) AS n FROM MapInteraction WHERE kind='click'").get().n,beforeClick+2);
    const clicked=db._raw.prepare("SELECT e.*,c.context FROM MapInteraction e JOIN MapInteractionContext c ON c.event_id=e.id WHERE e.kind='click' AND e.surface='search' ORDER BY e.created_at DESC LIMIT 1").get();
    assert.notEqual(clicked.decision_id,snapshot.id);assert.equal(JSON.parse(clicked.context).impression_status,'clicked_before_threshold');
    assert.equal(db._raw.prepare("SELECT decision_id FROM MapInteraction WHERE kind='click' AND surface='map'").get().decision_id,null);
    await page.unroute('**/api/community/feedback');
    await page.getByRole('button',{name:'编辑',exact:true}).click();
    if(out){fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'journey-desktop.png'),fullPage:true});}
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
    if(out)await page.screenshot({path:path.join(out,'journey-mobile.png'),fullPage:true});
    // Exercise the new clarification UI with a real worker and a stubbed provider boundary.
    const store=require('../services/journeyStore'),draftStore=require('../services/journeyDrafts');
    db._raw.prepare('INSERT INTO Place(id,name,longitude,latitude) VALUES(3,?,80,30)').run('同名面馆');
    db._raw.prepare('INSERT INTO Place(id,name,longitude,latitude) VALUES(4,?,120,30)').run('同名面馆');
    const resolutionDoc=store.normalizeDocument({title:'地点澄清回归',start_date:'2026-09-16',end_date:'2026-09-16',summary:'',stops:[
        {id:randomUUID(),name:'同名面馆',lng:null,lat:null,confirmed:false,visit_status:'visited',note:'原始描述',candidates:[{id:'local_3',place_id:3,name:'同名面馆',lng:80,lat:30,source:'local',score:3},{id:'local_4',place_id:4,name:'同名面馆',lng:120,lat:30,source:'local',score:3}]},
        {id:randomUUID(),name:'固定锚点',lng:120.01,lat:30,confirmed:true,visit_status:'visited'}
    ]},id);
    draftStore.putDraft(id,randomUUID(),{document:resolutionDoc,draft_revision:0,base_revision:0});
    process.env.JOURNEY_LLM_API_KEY='ui-resolution-test';process.env.JOURNEY_LLM_BASE_URL='https://ui-resolution.test';
    global.fetch=async url=>{assert.equal(String(url),'https://ui-resolution.test/chat/completions');return new Response(JSON.stringify({choices:[{message:{content:'{"query":"同名面馆","city":"杭州"}'}}]}),{headers:{'Content-Type':'application/json'}});};
    stopWorker=require('../services/journeyAI').startJourneyWorker();
    await page.setViewportSize({width:1280,height:900});await page.reload();
    await page.getByRole('button',{name:'✦ 日记 · 同好'}).click();
    await page.getByRole('button',{name:'恢复草稿：地点澄清回归',exact:true}).click();
    await page.getByLabel('补充地点线索').fill('在杭州，靠近刚刚确认的地点');
    await page.getByLabel('线索中的城市（选填）').fill('杭州');
    await page.getByRole('button',{name:'根据线索继续找店',exact:true}).click();
    await page.getByRole('button',{name:'应用这次候选建议',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('[aria-label="草稿同步状态"]')?.textContent.startsWith('草稿已同步'));
    await page.reload();await page.getByRole('button',{name:'✦ 日记 · 同好'}).click();
    await page.getByRole('button',{name:/\d{4}-\d{2}-\d{2} · 可编辑/}).click();
    await page.getByRole('button',{name:'应用这次候选建议',exact:true}).waitFor();
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
    await page.getByLabel('补充描述').fill('等待过程中补写的描述');
    await page.getByLabel('地点名称',{exact:true}).fill('后来修改的店名');
    await page.getByRole('button',{name:'应用这次候选建议',exact:true}).click();
    await page.getByText('地点、确认状态或顺序已变化，旧建议未应用，请重新评估候选。',{exact:false}).waitFor();
    await page.getByLabel('地点名称',{exact:true}).fill('同名面馆');
    await page.getByRole('button',{name:'应用这次候选建议',exact:true}).click();
    const candidates=page.getByRole('combobox',{name:/^候选分店/});
    assert.equal(await candidates.locator('option').nth(1).getAttribute('value'),'local_4');
    if(out){await page.locator('[aria-label="地点澄清"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'journey-clarification-mobile.png'),fullPage:true});}
    await candidates.selectOption('local_4');
    assert.equal(await page.getByLabel('补充描述').inputValue(),'等待过程中补写的描述');
    await page.getByLabel('我已核对这个地点与经历状态').check();
    await page.getByRole('button',{name:'保存日记',exact:true}).click();
    await page.getByText('日记已保存，仅自己可见。').waitFor();
    const resolutionSaved=db._raw.prepare("SELECT document FROM Journey WHERE user_id=? AND json_extract(document,'$.title')='地点澄清回归'").get(id);
    const resolved=JSON.parse(resolutionSaved.document);assert.equal(resolved.stops[0].place_id,4);assert.equal(resolved.stops[1].lng,120.01);assert.equal(resolved.stops[0].note,'等待过程中补写的描述');
    stopWorker();stopWorker=null;global.fetch=nativeFetch;
    // Both users have ready vectors; the peer has no favorites or public collections.
    const peer=randomUUID();db._raw.prepare('INSERT INTO User(id,username,password) VALUES(?,?,?)').run(peer,'只有向量的同好','unused');
    const {EMBEDDING_MODEL,EMBEDDING_DIMENSIONS}=require('../services/aiClients');
    const {ALGORITHM_VERSION}=require('../services/userPreferenceService');
    const embedding=new Float32Array(EMBEDDING_DIMENSIONS);embedding[0]=1;
    for(const userId of [id,peer])db._raw.prepare(`INSERT OR REPLACE INTO UserPreference
        (user_id,vector,model,dimensions,algorithm_version,status,source_place_count,vector_place_count,total_weight,updated_at,dirty)
        VALUES(?,?,?,?,?,'ready',1,1,5,?,0)`).run(userId,Buffer.from(embedding.buffer),EMBEDDING_MODEL,EMBEDDING_DIMENSIONS,ALGORITHM_VERSION,Date.now());
    await page.getByRole('button',{name:'同好',exact:true}).click();
    await page.getByLabel('允许使用我的用户向量匹配同好',{exact:false}).check();
    await page.getByRole('button',{name:'保存设置',exact:true}).click();
    await page.getByRole('button',{name:/只有向量的同好.*向量相似度 100%/}).click();
    await page.getByText('暂时没有公开收藏夹。',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
    if(out){
        await page.locator('.journey-body').evaluate(el=>{el.scrollTop=0;});
        await page.screenshot({path:path.join(out,'community-vector-only-mobile.png'),fullPage:true});
        await page.evaluate(()=>window.__TEST_THEME(true));
        await page.screenshot({path:path.join(out,'community-theme-dark-mobile.png'),fullPage:true});
        await page.setViewportSize({width:1280,height:900});
        await page.screenshot({path:path.join(out,'community-theme-dark-desktop.png'),fullPage:true});
        await page.evaluate(()=>window.__TEST_THEME(false,{theme_color:'#315DA8',theme_color_secondary:'#397569'}));
        await page.screenshot({path:path.join(out,'community-theme-custom-desktop.png'),fullPage:true});
        await page.evaluate(()=>window.__TEST_THEME(false));
        await page.screenshot({path:path.join(out,'community-theme-light-desktop.png'),fullPage:true});
    }
    await page.getByLabel('允许使用我的用户向量匹配同好',{exact:false}).uncheck();
    await page.getByRole('button',{name:'保存设置',exact:true}).click();
    await page.getByText('请先开启同好发现。',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:/只有向量的同好.*向量相似度/}).count(),0);
    assert.deepEqual(errors,[]);
    console.log('Browser journey tests passed: map workspace, stop editing, persistence, share cover, private/public collections, consent, desktop and mobile.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
    global.fetch=nativeFetch;if(stopWorker)stopWorker();if(browser)await browser.close();if(vite)await vite.close();if(server)await new Promise(r=>server.close(r));db._raw.close();
    const resolved=path.resolve(temp);if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('yuyuko-journey-ui-'))fs.rmSync(resolved,{recursive:true,force:true});
});
