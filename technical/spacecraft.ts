import * as T from 'three/webgpu';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {state,update} from './model';

export const spacecraftModels = [
  {norad:25544,name:'国际空间站',english:'INTERNATIONAL SPACE STATION',file:'iss.glb',source:'https://science.nasa.gov/resource/international-space-station-3d-model/',credit:'NASA / VTAD',description:'沿着桁架，认识太阳能阵列、居住舱与连接在一起的实验室。',note:'NASA 历史构型可视化模型；组件与当前在轨构型可能不同。',parts:[['太阳能阵列','把阳光变为电能'],['中央桁架','连接阵列与热控设备'],['增压舱段','生活与实验空间']]},
  {norad:20580,name:'哈勃空间望远镜',english:'HUBBLE SPACE TELESCOPE',file:'hubble-a.glb',source:'https://science.nasa.gov/3d-resources/hubble-space-telescope-a/',credit:'DigitalSpace Corporation / NASA 分发',description:'走近绕地球运行的观测者，认识镜筒、太阳能翼与仪器所在的舱体。',note:'NASA 分发的外观参考模型；不代表当前姿态或完整内部光学结构。',parts:[['光学镜筒','收集与聚焦远方的光'],['太阳能翼','为观测与通信供电'],['仪器与平台','记录光信号并维持运行']]},
] as const;
export const spacecraftModel=(norad=state.activeNorad)=>spacecraftModels.find(m=>m.norad===norad);

export class SpacecraftScene {
  readonly root=new T.Group();
  readonly report={active:0,visible:false,loads:[] as {norad:number;meshes:number;triangles:number;textures:number}[],errors:[] as string[]};
  private draco=new DRACOLoader().setDecoderPath('/assets/draco/');
  private loader=new GLTFLoader().setDRACOLoader(this.draco);
  private models=new Map<number,T.Group>();
  private pending=new Map<number,Promise<T.Group>>();
  private generation=0;
  private disposed=false;
  constructor(private invalidate:()=>void){}
  async setSelection(){
    const generation=++this.generation,active=state.view==='satellites'&&state.satellitePage==='structure',model=spacecraftModel();
    this.root.visible=active;this.models.forEach(m=>m.visible=false);this.report.active=active?state.activeNorad:0;this.report.visible=false;
    if(!active)return;
    if(!model){update({structureLoad:'尚未接入这颗卫星的可核实模型'});this.invalidate();return;}
    update({structureLoad:'正在加载 '+model.name+'的原始模型…'});
    try {
      const object=await this.load(model.norad,model.file);
      if(this.disposed||generation!==this.generation)return;
      object.visible=true;this.report.visible=true;this.configure();update({structureLoad:''});this.invalidate();
    }catch(error){if(this.disposed||generation!==this.generation)return;this.report.errors.push(String(error));update({structureLoad:'模型暂未加载，请重试'});this.invalidate();}
  }
  private load(norad:number,file:string):Promise<T.Group>{
    const cached=this.models.get(norad);if(cached)return Promise.resolve(cached);
    const pending=this.pending.get(norad);if(pending)return pending;
    const request=this.loader.loadAsync('/assets/'+file).then(gltf=>{
      const object=gltf.scene;object.updateMatrixWorld(true);
      const box=new T.Box3().setFromObject(object),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3()),scale=2.8/Math.max(size.x,size.y,size.z);
      const wrap=new T.Group();object.position.sub(center).multiplyScalar(scale);object.scale.multiplyScalar(scale);wrap.add(object);
      wrap.rotation.set(.2,-.5,.08);wrap.visible=false;
      let meshes=0,triangles=0;const maps=new Set<T.Texture>();
      object.traverse(node=>{if(!(node instanceof T.Mesh))return;meshes++;triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;node.castShadow=true;node.receiveShadow=true;
        for(const material of Array.isArray(node.material)?node.material:[node.material])for(const value of Object.values(material)){if(value instanceof T.Texture){value.anisotropy=8;maps.add(value);}}
      });
      if(this.disposed){this.release(wrap);throw new Error('场景已关闭');}
      this.models.set(norad,wrap);this.root.add(wrap);this.report.loads.push({norad,meshes,triangles,textures:maps.size});this.pending.delete(norad);return wrap;
    });
    this.pending.set(norad,request);void request.catch(()=>this.pending.delete(norad));return request;
  }
  configure(){this.models.forEach(model=>model.traverse(node=>{if(node instanceof T.Mesh)for(const material of Array.isArray(node.material)?node.material:[node.material])if(material instanceof T.MeshStandardMaterial){material.wireframe=state.structureWire;}}));this.invalidate();}
  private release(object:T.Object3D){const materials=new Set<T.Material>(),textures=new Set<T.Texture>();object.traverse(node=>{if(node instanceof T.Mesh){node.geometry.dispose();for(const m of Array.isArray(node.material)?node.material:[node.material])materials.add(m);}});materials.forEach(m=>{Object.values(m).forEach(v=>{if(v instanceof T.Texture)textures.add(v);});m.dispose();});textures.forEach(t=>t.dispose());}
  dispose(){this.draco.dispose();this.disposed=true;this.generation++;this.models.forEach(m=>this.release(m));this.models.clear();this.root.clear();}
}
