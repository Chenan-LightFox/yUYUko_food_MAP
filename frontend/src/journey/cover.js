import {pickContrastTextColor} from '../utils/theme';
const themes={奶油:{bg:'#fff8eb',ink:'#473d31',line:'#c36b43'},薄荷:{bg:'#e9f7ef',ink:'#224f43',line:'#32836d'},夜色:{bg:'#182a3b',ink:'#edf3fa',line:'#f3bd66'}};
function wrap(ctx,text,x,y,width,lineHeight,maxLines=5) {
    let line='',row=0;
    for(const char of Array.from(text||'')) {
        if(ctx.measureText(line+char).width>width&&line) {ctx.fillText(line,x,y+row++*lineHeight);line='';if(row>=maxLines)return;}
        line+=char;
    }
    ctx.fillText(line,x,y+row*lineHeight);
}
export async function makeCover(cover,style='主站',caption='',mapBlob=null) {
    const root=getComputedStyle(document.documentElement);
    const siteTheme={bg:root.getPropertyValue('--color-bg-base').trim()||'#F9F8FA',ink:root.getPropertyValue('--color-text-primary').trim()||'#2B2533',line:root.getPropertyValue('--theme-primary').trim()||'#E2789F'};
    const theme=style==='主站'?siteTheme:themes[style]||themes.奶油, canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1440;
    const ctx=canvas.getContext('2d');ctx.fillStyle=theme.bg;ctx.fillRect(0,0,1080,1440);
    ctx.fillStyle=theme.ink;ctx.font='bold 64px sans-serif';wrap(ctx,cover.title,72,112,936,80,2);
    const stops=cover.stops||[], valid=stops.filter(s=>Number.isFinite(s.lng)&&Number.isFinite(s.lat));
    if(mapBlob) {
        const url=URL.createObjectURL(mapBlob);
        try {const image=new Image();image.src=url;await image.decode();ctx.drawImage(image,60,270,960,640);}finally{URL.revokeObjectURL(url);}
        ctx.fillStyle=theme.ink;ctx.font='22px sans-serif';ctx.fillText('连线为顺序示意，非实际道路；第 10 站标为 A',72,946);
    } else {
        // Longitude is locally corrected for latitude. This is a route sketch, not a basemap.
        const meanLat=valid.length?valid.reduce((n,s)=>n+s.lat,0)/valid.length:0;
        const xs=valid.map(s=>s.lng*Math.cos(meanLat*Math.PI/180)),ys=valid.map(s=>s.lat);
        const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
        const span=Math.max(maxX-minX,maxY-minY,0.001);
        const point=s=>[540+(s.lng*Math.cos(meanLat*Math.PI/180)-(minX+maxX)/2)/span*750,600-(s.lat-(minY+maxY)/2)/span*560];
        ctx.strokeStyle=theme.line;ctx.lineWidth=8;ctx.setLineDash([14,12]);
        for(let i=1;i<stops.length;i++) {
            const a=stops[i-1],b=stops[i];
            if(a.lng==null||b.lng==null)continue;
            const p=point(a),q=point(b);ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.stroke();
        }
        ctx.setLineDash([]);
        stops.forEach((s,i)=>{if(s.lng==null)return;const p=point(s);ctx.fillStyle=theme.line;ctx.beginPath();ctx.arc(...p,25,0,2*Math.PI);ctx.fill();ctx.fillStyle=pickContrastTextColor(theme.line);ctx.font='bold 25px sans-serif';ctx.textAlign='center';ctx.fillText(String(i+1),p[0],p[1]+9);ctx.textAlign='left';});
        ctx.fillStyle=theme.ink;ctx.font='24px sans-serif';ctx.fillText('顺序示意 · 非实际道路 / GPS 轨迹',72,930);
    }
    ctx.fillStyle=theme.ink;ctx.font='30px sans-serif';wrap(ctx,stops.map((s,i)=>`${i+1}. ${s.name}`).join('  →  '),72,1010,936,45,4);
    ctx.font='36px sans-serif';wrap(ctx,caption||cover.caption,72,1250,936,50,3);
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('图片生成失败')),'image/png'));
}
export function downloadBlob(blob,name) {const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
