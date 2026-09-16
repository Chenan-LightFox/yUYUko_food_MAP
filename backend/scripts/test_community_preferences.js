const assert=require('assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {randomUUID}=require('crypto');
const express=require('express');
const jwt=require('jsonwebtoken');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yuyuko-community-'));
process.env.DB_FILE=path.join(temp,'test.sqlite');
process.env.LOG_TO_FILE='false';process.env.LOG_TO_CONSOLE='false';
process.env.SILICONFLOW_API_KEY='';process.env.DEEPSEEK_API_KEY='';
require.cache[require.resolve('../redis')]={exports:{isReady:()=>false}};
const {db,init}=require('../db');
const {initJourneySchema}=require('../services/journeySchema');
const {EMBEDDING_MODEL,EMBEDDING_DIMENSIONS}=require('../services/aiClients');
const {ALGORITHM_VERSION,changeFavorite}=require('../services/userPreferenceService');
const sql=db._raw;
let server;
function user(name){const id=randomUUID();sql.prepare('INSERT INTO User(id,username,password) VALUES(?,?,?)').run(id,name,'unused');return id;}
function vector(id,values=[1,0],patch={}){
    const floats=new Float32Array(EMBEDDING_DIMENSIONS);floats.set(values);
    sql.prepare(`INSERT OR REPLACE INTO UserPreference(user_id,vector,model,dimensions,algorithm_version,status,
        source_place_count,vector_place_count,total_weight,updated_at,dirty) VALUES(?,?,?,?,?,'ready',1,1,5,?,0)`)
        .run(id,Buffer.from(floats.buffer),patch.model||EMBEDDING_MODEL,patch.dimensions||EMBEDDING_DIMENSIONS,ALGORITHM_VERSION,Date.now());
}
async function main(){
    init();
    const viewer=user('当前用户'),peer=user('仅有向量的同好'),off=user('已保存关闭'),fresh=user('没有设置的旧用户');
    // Exercise upgrade from the old table defaults, including a saved opt-out and a missing row.
    sql.exec(`DROP TABLE MapConsent;
        CREATE TABLE MapConsent(user_id TEXT PRIMARY KEY REFERENCES User(id) ON DELETE CASCADE,
          feedback INTEGER NOT NULL DEFAULT 0,research INTEGER NOT NULL DEFAULT 0,discovery INTEGER NOT NULL DEFAULT 0,
          tags TEXT NOT NULL DEFAULT '[]',version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);`);
    sql.prepare("INSERT INTO MapConsent VALUES(?,0,0,0,'[\"面食\"]',7,'saved')").run(off);
    initJourneySchema(sql);initJourneySchema(sql);
    const saved=sql.prepare('SELECT * FROM MapConsent WHERE user_id=?').get(off);
    assert.equal(saved.feedback,0);assert.equal(saved.discovery,0);assert.equal(saved.research,0);
    assert.equal(saved.version,7);assert.equal(saved.tags,'["面食"]');assert.equal(saved.updated_at,'saved');
    for(const id of [viewer,peer,fresh,user('新注册用户')]){
        const c=sql.prepare('SELECT * FROM MapConsent WHERE user_id=?').get(id);
        assert.equal(c.feedback,1);assert.equal(c.research,1);assert.equal(c.discovery,1);assert.equal(c.version,0);
    }
    const app=express();app.use(express.json());app.use('/api/community',require('../routes/community'));
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    async function call(method,route,body,id=viewer,status=200){
        const response=await fetch(`http://127.0.0.1:${server.address().port}/api/community${route}`,{method,
            headers:{Authorization:`Bearer ${jwt.sign({id},process.env.JWT_SECRET||'yuyuko_secret_key')}`,'Content-Type':'application/json'},
            body:body===undefined?undefined:JSON.stringify(body)});
        assert.equal(response.status,status,await (response.status!==status?response.clone().text():Promise.resolve(route)));
        return response.json();
    }
    assert.equal((await call('GET','/neighbors')).profile_status,'empty');
    vector(viewer);vector(peer,[0.8,0.6]);vector(off);
    const banned=user('封禁用户');vector(banned);sql.prepare('UPDATE User SET is_banned=1 WHERE id=?').run(banned);
    const opposite=user('相反向量');vector(opposite,[-1,0]);
    const unrelated=user('正交向量');vector(unrelated,[0,1]);
    const broken=user('无效向量');vector(broken,[0,0]);
    const mismatch=user('旧模型');vector(mismatch,[1,0],{model:'obsolete-model'});
    const wrongDimensions=user('旧维度');vector(wrongDimensions,[1,0],{dimensions:2});
    const dirty=user('需要刷新');vector(dirty);sql.prepare('UPDATE UserPreference SET dirty=1 WHERE user_id=?').run(dirty);
    const stale=user('已过期');vector(stale);sql.prepare('UPDATE UserPreference SET updated_at=0 WHERE user_id=?').run(stale);
    const result=await call('GET','/neighbors');
    assert.equal(result.profile_status,'ready');assert.equal(result.algorithm,'user-preference-cosine-v1');
    assert.deepEqual(result.neighbors.map(p=>p.id),[peer]);
    assert.ok(Math.abs(result.neighbors[0].similarity-0.8)<1e-6);
    assert.equal(result.neighbors[0].confidence,'参考数据较少');
    assert.deepEqual(result.neighbors[0].shared,[]);
    assert.deepEqual(Object.keys(result.neighbors[0]).sort(),['id','username','similarity','x','y','confidence','shared'].sort());
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM Favorite').get().n,0,'Matching needs only ready vectors');
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM PublicCollection').get().n,0);
    assert.deepEqual((await call('GET',`/users/${peer}/collections`)).collections,[]);
    const collection=await call('POST','/collections',{title:'私密名称'},peer,201);
    assert.deepEqual((await call('GET',`/users/${peer}/collections`)).collections,[]);
    await call('PUT',`/collections/${collection.id}`,{title:'可选公开内容',place_ids:[],is_public:true},peer);
    assert.equal((await call('GET',`/users/${peer}/collections`)).collections[0].title,'可选公开内容');
    assert.deepEqual((await call('GET','/neighbors')).neighbors,result.neighbors,'Public visibility cannot affect ranking or coordinates');
    await call('PUT','/consent',{version:0,feedback:true,research:true,discovery:false},peer);
    assert.equal((await call('GET','/neighbors')).neighbors.length,0);
    await call('GET',`/users/${peer}/collections`,undefined,viewer,404);
    await call('PUT','/consent',{version:0,feedback:true,research:true,discovery:false});
    assert.equal((await call('GET','/neighbors')).profile_status,'disabled');
    // Default feedback applies even before opening settings; authoritative favorite events remain deduplicated.
    const place=Number(sql.prepare("INSERT INTO Place(name,category) VALUES('默认采集测试','面食')").run().lastInsertRowid);
    changeFavorite(fresh,place,true);changeFavorite(fresh,place,true);
    const events=sql.prepare('SELECT kind,research_allowed FROM MapInteraction WHERE user_id=?').all(fresh);
    assert.deepEqual(events,[{kind:'favorite',research_allowed:1}]);
    await call('PUT','/consent',{version:0,feedback:false,research:false,discovery:true},fresh);
    changeFavorite(fresh,place,false);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM MapInteraction WHERE user_id=?').get(fresh).n,0);
    console.log('Community tests passed: vector-only matching, optional collections, opt-outs, legacy/new defaults, private data boundary, default feedback.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
    if(server)await new Promise(resolve=>server.close(resolve));
    // Let queued local vector refresh callbacks finish before closing the temporary database.
    await new Promise(resolve=>setImmediate(resolve));db._raw.close();
    const resolved=path.resolve(temp);
    if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('yuyuko-community-'))fs.rmSync(resolved,{recursive:true,force:true});
});
