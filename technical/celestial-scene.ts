import * as T from 'three/webgpu';
import {vec3,instancedBufferAttribute,texture} from 'three/tsl';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {state,update,reducedMotion} from './model';
import {bodyRecords} from './celestial-objects';
import {observationRecord,type Domain} from './observation-data';

export class CelestialScene {
  readonly root=new T.Group();
  private models=new Map<string,T.Object3D>();
  private pending=new Map<string,Promise<T.Object3D>>();
  private moonTexture?:T.Texture;
  private generation=0;
  private selected?:T.Object3D;
  private tail?:T.Group;
  private markers=new T.Group();
  private loader=new GLTFLoader();
  private active=false;
  private annotations: {node:HTMLSpanElement;position:T.Vector3}[]=[];
  readonly report={loads:[] as {object:string;vertices:number;triangles:number;textures:number}[],errors:[] as string[],active:'',mode:'',pointIds:[] as string[],lod:'far'};
  constructor(private invalidate:()=>void){this.root.add(this.markers);}
  attachLabels(host:HTMLElement){for(const [text,p] of [['离子尾 / ION TAIL',[3.5,.18,0]],['尘埃尾 / DUST TAIL',[4,1.15,0]]] as const){const node=document.createElement('span');node.className='comet-annotation';node.textContent=text;node.hidden=true;host.append(node);this.annotations.push({node,position:new T.Vector3(...p)});}}
  projectLabels(camera:T.Camera,width:number,height:number){this.annotations.forEach(({node,position})=>{const show=this.active&&state.celestialBody==='comets'&&state.celestialMode==='context'&&state.celestialEffects;const p=this.tail?this.tail.localToWorld(position.clone()).project(camera):position.clone();node.hidden=!show||p.z>1||Math.abs(p.x)>.8||Math.abs(p.y)>.85;if(!node.hidden)node.style.transform=`translate(${(p.x+1)*width/2}px,${(1-p.y)*height/2}px)`;});}
  async setBody(){
    const current=++this.generation,body=state.celestialBody,context=state.celestialMode==='context';
    this.active=state.view==='events'&&state.eventPage==='space'&&!state.moonGuide;this.root.visible=this.active;
    this.models.forEach(m=>{m.visible=false;});if(this.tail)this.tail.visible=false;this.markers.visible=false;this.selected=undefined;
    this.report.active=body;this.report.mode=state.celestialMode;
    this.annotations.forEach(({node})=>node.hidden=true);
    if(!this.active||body==='earth'||(body==='meteors'&&context)){update({celestialLoad:''});this.updateMarkers();this.invalidate();return;}
    update({celestialLoad:body==='moon'?'正在加载 LRO 月面与地形…':body==='meteors'?'正在加载 Bennu 实测网格…':'正在加载 OSIRIS 彗核网格…'});
    try{
      const key=body==='moon'?'moon-far':body==='meteors'?'bennu-far':'67p',mesh=await this.load(key);
      if(current!==this.generation)return;
      mesh.visible=true;mesh.scale.setScalar(body==='moon'&&context ? .2725:body==='comets'&&context ? .42:1);
      mesh.position.set(body==='moon'&&context?2.5:0,0,0);this.selected=mesh;
      if(body==='comets'&&context){this.tail??=this.createComa();this.tail.visible=state.celestialEffects;}
      update({celestialLoad:''});this.configureMaterials();this.invalidate();
      if(body==='meteors'||body==='moon')void this.load(body==='moon'?'moon':'bennu-near').then(()=>this.invalidate()).catch(()=>{});
    }catch(error){if(current!==this.generation)return;this.report.errors.push(String(error));update({celestialLoad:'模型暂未加载，重试或打开原始数据'});this.invalidate();}
  }
  private load(key:string):Promise<T.Object3D>{
    const loaded=this.models.get(key);if(loaded)return Promise.resolve(loaded);const request=this.pending.get(key);if(request)return request;
    const promise=this.loader.loadAsync(`/assets/${key}.glb`).then(gltf=>{
      const object=gltf.scene;object.updateMatrixWorld(true);const box=new T.Box3().setFromObject(object),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
      const wrap=new T.Group();object.position.sub(center);wrap.add(object);const norm=2/Math.max(size.x,size.y,size.z);object.scale.setScalar(norm);object.position.multiplyScalar(norm);
      let vertices=0,triangles=0,textures=0;
      object.traverse(node=>{if(!(node instanceof T.Mesh))return;vertices+=node.geometry.attributes.position.count;triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;
        const original=Array.isArray(node.material)?node.material[0]:node.material,material=new T.MeshStandardNodeMaterial({color:key.startsWith('moon')?0xffffff:key==='67p'?0x292725:0x303133,roughness:.97,metalness:0,wireframe:state.celestialWire});
        let map=(original as T.MeshStandardMaterial).map;
        if(map&&key.startsWith('moon')){if(this.moonTexture){if(map!==this.moonTexture)map.dispose();map=this.moonTexture;}else this.moonTexture=map;}
        if(map){map.anisotropy=8;material.map=map;textures++;}
        node.material=material;node.castShadow=true;node.receiveShadow=true;original.dispose();
      });
      wrap.rotation.set(key==='67p' ? .3:0,key.startsWith('moon')?Math.PI*.35:-.5,key==='67p' ? -.5:.08);
      wrap.visible=false;this.root.add(wrap);this.models.set(key,wrap);this.report.loads.push({object:key,vertices,triangles,textures});this.pending.delete(key);return wrap;
    });this.pending.set(key,promise);promise.catch(()=>this.pending.delete(key));return promise;
  }
  configureMaterials(){
    this.models.forEach(model=>model.traverse(node=>{if(node instanceof T.Mesh){const materials=Array.isArray(node.material)?node.material:[node.material];materials.forEach(m=>{if(m instanceof T.MeshStandardNodeMaterial)m.wireframe=state.celestialWire;});}}));
    if(this.tail)this.tail.visible=this.active&&state.celestialBody==='comets'&&state.celestialMode==='context'&&state.celestialEffects;
  }
  update(camera:T.PerspectiveCamera,dt:number){
    if(!this.active)return false;let changed=false;
    if(state.celestialBody==='moon'||(state.celestialBody==='meteors'&&state.celestialMode==='surface')){
      const moon=state.celestialBody==='moon',near=this.models.get(moon?'moon':'bennu-near'),far=this.models.get(moon?'moon-far':'bennu-far'),useNear=camera.position.distanceTo(new T.Vector3())<5.6&&!!near;
      if(near&&far){const target=useNear?near:far;if(this.selected!==target){if(this.selected){target.rotation.copy(this.selected.rotation);target.position.copy(this.selected.position);target.scale.copy(this.selected.scale);}near.visible=useNear;far.visible=!useNear;this.selected=target;this.report.lod=useNear?'near':'far';changed=true;}}
    }
    if(state.celestialSpin&&!reducedMotion.matches&&this.selected){this.selected.rotation.y+=dt*.13;changed=true;}
    return changed;
  }
  private createComa(){
    const group=new T.Group(),canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const ctx=canvas.getContext('2d')!,gradient=ctx.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.2,'rgba(255,255,255,.4)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);const map=new T.CanvasTexture(canvas);
    let seed=612;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    for(const kind of ['dust','ion','coma']){
      const count=kind==='coma'?6500:18000,p=new Float32Array(count*3),c=new Float32Array(count*3);
      for(let i=0;i<count;i++){
        const t=random(),a=random()*Math.PI*2,r=Math.sqrt(random()),spread=kind==='coma'?.5:kind==='ion'?.015+t*.14:.025+t*.72;
        const x=kind==='coma'?(random()-.5)*.85:t*5.5;
        p.set([x,kind==='dust'?t*t*.75+Math.cos(a)*r*spread:Math.cos(a)*r*spread,Math.sin(a)*r*spread],i*3);
        const intensity=(1-t)*.6+.08,col=kind==='ion'?new T.Color(.18,.42,.9):new T.Color(.77,.69,.56);c.set([col.r*intensity,col.g*intensity,col.b*intensity],i*3);
      }
      const material=new T.PointsNodeMaterial({size:kind==='coma' ? .22:kind==='dust' ? .14:.07,transparent:true,opacity:kind==='coma' ? .028:kind==='dust' ? .08:.24,depthWrite:false,blending:T.AdditiveBlending});
      material.positionNode=instancedBufferAttribute(new T.InstancedBufferAttribute(p,3));
      material.colorNode=vec3(instancedBufferAttribute(new T.InstancedBufferAttribute(c,3)));material.opacityNode=texture(map).a.mul(material.opacity);
      const points=new T.Sprite(material);points.count=count;points.frustumCulled=false;group.add(points);

    }
    group.rotation.z=.16;this.root.add(group);return group;
  }
  updateMarkers(){
    this.markers.children.forEach(node=>{if(node instanceof T.Mesh){node.geometry.dispose();(node.material as T.Material).dispose();}});this.markers.clear();
    const show=this.active&&(state.celestialBody==='earth'||state.celestialBody==='meteors')&&state.celestialMode==='context';this.markers.visible=show;this.report.pointIds=[];
    if(!show)return;
    for(const record of bodyRecords(state.celestialBody as Domain)){
      if(!record.location)continue;const {latitude,longitude,altitude_km}=record.location,a=latitude*Math.PI/180,b=longitude*Math.PI/180,r=1+(altitude_km??0)/6378.137;
      const point=new T.Vector3(Math.cos(a)*Math.cos(b),Math.sin(a),-Math.cos(a)*Math.sin(b)).multiplyScalar(r+.003);
      const marker=new T.Mesh(new T.SphereGeometry(record.id===state.selectedObservationId ? .022:.012,12,8),new T.MeshBasicMaterial({color:state.celestialBody==='meteors'?0xffbb72:0xffffff}));marker.position.copy(point);marker.userData.recordId=record.id;this.markers.add(marker);this.report.pointIds.push(record.id);
    }this.invalidate();
  }
  pick(ray:T.Raycaster,earth:T.Object3D){const hit=ray.intersectObjects(this.markers.children)[0],ground=ray.intersectObject(earth)[0];if(hit&&(!ground||hit.distance<ground.distance))update({selectedObservationId:hit.object.userData.recordId,celestialRecordsOpen:true});}
  focusPoint(){const r=observationRecord(state.selectedObservationId);if(!r?.location||r.domain!==state.celestialBody)return null;const a=r.location.latitude*Math.PI/180,b=r.location.longitude*Math.PI/180;return new T.Vector3(Math.cos(a)*Math.cos(b),Math.sin(a),-Math.cos(a)*Math.sin(b)).multiplyScalar(4.3);}
}
