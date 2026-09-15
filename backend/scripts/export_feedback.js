// Read-only, explicit export. Does not load .env, migrate DBs, or alter online rankings.
const fs=require('fs');
const path=require('path');
const Database=require('better-sqlite3');
const {buildDataset,evaluateLoggedRandom}=require('../services/feedbackDataset');
const databasePath=process.argv[2],outputPath=process.argv[3];
if(!databasePath||!outputPath){console.error('Usage: node scripts/export_feedback.js <database.sqlite> <new-output.jsonl>');process.exitCode=1;}
else {
    let database;
    try {
        database=new Database(path.resolve(databasePath),{readonly:true,fileMustExist:true});
        const dataset=buildDataset(database,{secret:process.env.FEEDBACK_EXPORT_SECRET,localDataAllowed:process.env.TRAINING_LOCAL_PLACE_DATA_ALLOWED==='true'});
        fs.writeFileSync(path.resolve(outputPath),dataset.map(row=>JSON.stringify(row)).join('\n')+(dataset.length?'\n':''),{encoding:'utf8',flag:'wx'});
        console.log(JSON.stringify(evaluateLoggedRandom(dataset),null,2));
    }catch(e){console.error(e.message);process.exitCode=1;}finally{database?.close();}
}
