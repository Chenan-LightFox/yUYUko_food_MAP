import React,{useMemo,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import JourneyWorkspace from '../src/journey/JourneyWorkspace';
import {useMapFeedback,Exposure} from '../src/journey/feedback';
import {preserveJourneyBeforeLeave} from '../src/journey/navigation';
window.__TEST_LEAVE=preserveJourneyBeforeLeave;
class Marker {constructor(options){this.options=options;}on(event,handler){if(event==='click')this.options.content.addEventListener('click',handler);}}
class Polyline {constructor(options){this.options=options;}}
window.AMap={Marker,Polyline,Pixel:class {}};
function Harness(){
    const token=window.__TEST_TOKEN;
    const feedback=useMapFeedback('',token);
    window.__TEST_FEEDBACK=feedback;
    const map=useMemo(()=>({getCenter:()=>({getLng:()=>120,getLat:()=>30}),setCenter(){},setZoomAndCenter(){},
        add(items){const layer=document.getElementById('map-layer');items.forEach(i=>{if(i.options.content)layer.appendChild(i.options.content);});},
        remove(items){items.forEach(i=>i.options.content?.remove());},
        on(event,handler){if(event==='click')window.__TEST_MAP_CLICK=handler;},
        off(event){if(event==='click')delete window.__TEST_MAP_CLICK;}}),[]);
    const mapRef=useRef(map);
    return <main style={{position:'relative',width:'100vw',height:'100vh',background:'#e7eee9'}}><h1 style={{padding:20,font:'24px sans-serif'}}>地图日记 · 隔离测试</h1>
        <div style={{position:'absolute',left:20,top:90,width:230,height:65,overflow:'auto'}}>
            <Exposure feedback={feedback} placeId={1} surface="search" rank={0} style={{height:50,background:'#fff',padding:8}} onClick={()=>feedback.record('click','search',1)}>测试曝光卡片</Exposure>
            <div style={{height:600}}/><Exposure feedback={feedback} placeId={2} surface="search" rank={1}>屏幕外测试卡片</Exposure>
        </div><div id="map-layer" style={{position:'absolute',left:'15%',top:'25%'}}/><JourneyWorkspace backendUrl="" token={token} isAuthenticated mapRef={mapRef} mapReady feedback={feedback} selectedPlace={{id:1,name:'测试面馆',longitude:120,latitude:30}}/></main>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
