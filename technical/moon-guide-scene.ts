import * as T from 'three/webgpu';
import {color,mix,normalWorldGeometry,texture,uniform,uv,vec3} from 'three/tsl';
import {state,update} from './model';
import {phaseAt} from './moon-phase';

export class MoonGuideScene {
  readonly root=new T.Group();
  readonly camera=new T.OrthographicCamera(-1.7,1.7,1.7,-1.7,.1,40);
  private globe:T.Mesh;
  private geometry=new T.SphereGeometry(1,128,96);
  private appearance='';
  private material=new T.MeshBasicNodeMaterial();
  private map?:T.Texture;
  private pending=false;
  private disposed=false;
  private appearanceMix=uniform(0);
  constructor(private invalidate:()=>void) {
    this.root.visible=false;
    this.globe=new T.Mesh(this.geometry,this.material);
    this.root.add(this.globe);
    this.makeMaterial();
  }
  private makeMaterial() {
    const old=this.material;
    this.material=new T.MeshBasicNodeMaterial();
    // -- 入射方向固定+z；节点材质避免环境补光污染明暗边界 ------------
    const incidence=normalWorldGeometry.dot(vec3(0,0,1)).max(0);
    const grain=uv().x.mul(740).sin().mul(uv().y.mul(560).sin()).mul(.025).add(.975);
    const orange=color('#e6a056').mul(grain);
    const moon=this.map?texture(this.map).rgb:color('#c5c5c0');
    const base=mix(orange,mix(moon,color('#cbd7dc'),this.appearanceMix.sub(1).max(0)),this.appearanceMix.min(1));
    this.material.colorNode=base.mul(incidence.pow(.55));
    this.material.toneMapped=false;
    this.globe.material=this.material;
    old.dispose();this.invalidate();
  }
  sync() {
    this.root.visible=!!state.moonGuide;
    if(!state.moonGuide)return;
    this.appearance=state.moonGuide.step==='explore'?'orange':state.moonGuide.step==='transfer'?'neutral':'moon';
    this.appearanceMix.value=this.appearance==='orange'?0:this.appearance==='moon'?1:2;
    const geometry=phaseAt(state.moonGuideAngle);
    this.camera.position.set(...geometry.observer).multiplyScalar(6);
    this.camera.up.set(0,1,0);this.camera.lookAt(0,0,0);this.camera.updateMatrixWorld();
    if(this.appearance==='moon'&&!this.map&&!this.pending&&state.moonGuideTexture!=='error')void this.loadTexture();
    this.invalidate();
  }
  fit(width:number,height:number) {
    const aspect=width/height,vertical=aspect<1?1.35/aspect:1.5;
    this.camera.left=-vertical*aspect;this.camera.right=vertical*aspect;
    this.camera.top=vertical;this.camera.bottom=-vertical;this.camera.updateProjectionMatrix();this.invalidate();
  }
  async loadTexture() {
    if(this.map||this.pending)return;
    this.pending=true;update({moonGuideTexture:'loading'});
    try {
      const map=await new T.TextureLoader().loadAsync('/assets/moon-color.jpg');
      if(this.disposed){map.dispose();return;}
      map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;this.map=map;this.makeMaterial();
      update({moonGuideTexture:'ready'});
    } catch {if(!this.disposed)update({moonGuideTexture:'error'});}
    finally {this.pending=false;this.invalidate();}
  }
  inspect() {return {active:this.root.visible,angle:state.moonGuideAngle,fraction:phaseAt(state.moonGuideAngle).fraction,appearance:this.appearance,textureStatus:state.moonGuideTexture,projection:'orthographic'};}
  dispose(){this.disposed=true;this.map?.dispose();}
}
