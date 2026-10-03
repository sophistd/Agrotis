import * as C from 'cesium';
import * as T from 'three/webgpu';
import './validation.css';

(window as unknown as {CESIUM_BASE_URL:string}).CESIUM_BASE_URL='/cesium';
const imagery = await C.TileMapServiceImageryProvider.fromUrl('/cesium/Assets/Textures/NaturalEarthII');
const viewer=new C.Viewer('globe',{baseLayer:new C.ImageryLayer(imagery),animation:false,timeline:false,baseLayerPicker:false,geocoder:false,homeButton:false,sceneModePicker:false,navigationHelpButton:false,fullscreenButton:false,selectionIndicator:false,infoBox:false,shouldAnimate:true});
viewer.scene.backgroundColor=C.Color.fromCssColorString('#0b0d10');
viewer.scene.globe.enableLighting=true;
viewer.scene.globe.showGroundAtmosphere=true;
viewer.scene.skyBox!.show=false;
viewer.scene.sun!.show=false;
viewer.scene.moon!.show=false;
viewer.scene.skyAtmosphere!.hueShift=-0.08;
viewer.resolutionScale=Math.min(window.devicePixelRatio,2);
const start=C.JulianDate.fromIso8601('2026-09-30T09:00:00Z');
viewer.clock.startTime=C.JulianDate.clone(start);
viewer.clock.currentTime=C.JulianDate.clone(start);
viewer.clock.multiplier=60;
viewer.camera.setView({destination:C.Cartesian3.fromDegrees(108,19,22500000)});

// -- 教学轨道：环绕地球的解析圆轨道，不是任何真实卫星 -----------------
function modelPosition(t:number,phase:number){
  const a=t/5700*Math.PI*2+phase,r=6928137,inc=56*Math.PI/180;
  return new C.Cartesian3(r*Math.cos(a),r*Math.sin(a)*Math.cos(inc),r*Math.sin(a)*Math.sin(inc));
}
for(const [i,phase] of [0,1.4].entries()){
  const points=Array.from({length:257},(_,n)=>modelPosition(n/256*5700,phase));
  const color=C.Color.fromCssColorString(i?'#e8bc79':'#91aaed');
  viewer.entities.add({polyline:{positions:points,width:1.5,material:color.withAlpha(0.75)}});
  viewer.entities.add({position:new C.CallbackPositionProperty(time=>modelPosition(C.JulianDate.secondsDifference(time!,start),phase),false),point:{pixelSize:9,color,outlineColor:C.Color.WHITE,outlineWidth:1},label:{text:`教学卫星 ${i?'B':'A'}`,font:'14px sans-serif',fillColor:C.Color.WHITE,pixelOffset:new C.Cartesian2(12,-12),horizontalOrigin:C.HorizontalOrigin.LEFT,showBackground:true,backgroundColor:C.Color.fromCssColorString('#171a1fe0')}});
}
let frames=0;
viewer.scene.postRender.addEventListener(()=>{frames++;});
const report={cesiumVersion:'1.145.0',threeRevision:T.REVISION,earth:'offline NaturalEarthII',orbit:'analytic teaching circular orbit',gpuBackend:'initializing',frames:0};
document.addEventListener('capture-earth',()=>{viewer.entities.show=false;});
(window as unknown as {__validation:typeof report}).__validation=report;
document.querySelector('#pause')!.addEventListener('click',()=>{viewer.clock.shouldAnimate=!viewer.clock.shouldAnimate;document.querySelector('#pause')!.textContent=viewer.clock.shouldAnimate?'暂停':'播放';});
document.querySelector('#reset')!.addEventListener('click',()=>{viewer.clock.currentTime=C.JulianDate.clone(start);viewer.clock.shouldAnimate=false;document.querySelector('#pause')!.textContent='播放';});
viewer.clock.onTick.addEventListener(()=>{
  document.querySelector('#time')!.textContent=C.JulianDate.toIso8601(viewer.clock.currentTime,0);
  report.frames=frames;
  document.querySelector('#report')!.textContent=JSON.stringify(report,null,2);
});

// -- 独立探测器：共享同一时间；WebGPU 不可用时明确回退 -----------------
const host=document.querySelector('#detector') as HTMLDivElement;
const renderer=new T.WebGPURenderer({antialias:true,alpha:true});
await renderer.init();
report.gpuBackend=(renderer.backend as unknown as {isWebGPUBackend?:boolean}).isWebGPUBackend?'WebGPU':'WebGL2 fallback';
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
host.appendChild(renderer.domElement);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(38,1,0.1,100);
camera.position.set(4,3,5);camera.lookAt(0,0,0);
scene.add(new T.HemisphereLight(0xcdd8ff,0x20242a,3));
const lamp=new T.DirectionalLight(0xffffff,4);lamp.position.set(3,4,5);scene.add(lamp);
const instrument=new T.Group();
instrument.add(new T.Mesh(new T.BoxGeometry(1.2,1.2,1.5),new T.MeshStandardMaterial({color:0xd2d6df,metalness:0.7,roughness:0.28})));
for(const side of [-1,1]){const panel=new T.Mesh(new T.BoxGeometry(1.6,.04,1.2),new T.MeshStandardMaterial({color:0x233858,metalness:.4,roughness:.4}));panel.position.x=side*1.6;instrument.add(panel);}
scene.add(instrument);
const resize=new ResizeObserver(()=>{renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();});resize.observe(host);
renderer.setAnimationLoop(()=>{instrument.rotation.y=C.JulianDate.secondsDifference(viewer.clock.currentTime,start)/1000;renderer.render(scene,camera);});
window.addEventListener('pagehide',()=>{resize.disconnect();renderer.setAnimationLoop(null);renderer.dispose();viewer.destroy();});
