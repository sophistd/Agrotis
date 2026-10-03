import * as T from 'three/webgpu';
import {normalWorldGeometry, positionWorld, cameraPosition, color, uniform, mix, texture, vec3, vec4, output, uv, bumpMap} from 'three/tsl';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {state, update, subscribe, position, sourceDirection, period, EARTH_KM, reducedMotion, type View} from './model';
import {orbitDataset, orbitalRecord, orbitState, orbitPath, matchRecords, displayName, type OrbitalRecord} from './orbits';
import {observationRecord, observationTitle} from './observation-data';
import {SpacecraftScene} from './spacecraft';
import {Line2} from 'three/addons/lines/webgpu/Line2.js';
import {LineGeometry} from 'three/addons/lines/LineGeometry.js';
import {CelestialScene} from './celestial-scene';
import {MoonGuideScene} from './moon-guide-scene';
import {currentSky} from './observer-home';
import {observerEcf,satelliteSkyType} from './observer-sky';
import {moveMoonObserver} from './moon-guide';

export const renderReport = {backend: 'initializing', frames: 0, firstFrameMs: 0, frameTimes: [] as number[], textureFailures: [] as string[]};
const world = (p: number[]) => new T.Vector3(p[0] / EARTH_KM, p[2] / EARTH_KM, -p[1] / EARTH_KM);
export class SpaceScene {
  private renderer!: T.WebGPURenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(32, 1, 0.05, 100);
  private controls!: OrbitControls;
  private globeGroup = new T.Group();
  private observerMarker=new T.Mesh(new T.SphereGeometry(.012,12,8),new T.MeshBasicMaterial({color:0xffffff}));
  private spacecraft = new SpacecraftScene(()=>{this.dirty=true;});
  private celestial = new CelestialScene(()=>{this.dirty=true;});
  private moonGuide = new MoonGuideScene(()=>{this.dirty=true;});
  private moonSnapshot?:{camera:T.Vector3;quaternion:T.Quaternion;target:T.Vector3};
  private moonPointer?:{id:number;x:number;angle:number};
  private sun = new T.DirectionalLight(0xffffff, 2.4);
  private sunDirection = uniform(new T.Vector3(-3,2,-1).normalize());
  private fill = new T.DirectionalLight(0xa7c8ff, 1.4);
  private ambient = new T.HemisphereLight(0xbddaff, 0x151921, 1.2);
  private model = new T.Group();
  private satellites: T.Mesh[] = [];
  private orbitLines: T.Line[] = [];
  private grid = new T.Group();
  private wave = new T.Group();
  private publicPoints = new T.Points(new T.BufferGeometry(), new T.PointsMaterial({size: 0.042, vertexColors: true, sizeAttenuation: true}));
  private publicMarkers?:T.InstancedMesh;
  private publicLine = new Line2(new LineGeometry(),new T.Line2NodeMaterial({color:0xc7dcff,linewidth:2,transparent:true,opacity:.9}));
  private publicSelected = new T.Mesh(new T.SphereGeometry(0.012, 12, 8), new T.MeshBasicMaterial({color: 0xe1ecff}));
  private publicLabel!: HTMLButtonElement;
  private observationPin = new T.Mesh(new T.SphereGeometry(0.018, 16, 10), new T.MeshBasicMaterial({color:0xffbb70}));
  private observationLabel!: HTMLButtonElement;
  private publicRecords: OrbitalRecord[] = [];
  private publicAt = 0;
  private publicPathKey = '';
  private pointerStart?: {x: number; y: number};
  private labels: HTMLButtonElement[] = [];
  private partLabels: {node: HTMLSpanElement; anchor: T.Vector3; offset: number}[] = [];
  private nightStrength = uniform(1);
  private cloudsStrength = uniform(1);
  private resize!: ResizeObserver;
  private previous = performance.now();
  private dirty = true;
  private focusLight = 0;
  private dragging = false;
  private fly?: {from: T.Vector3; to: T.Vector3; at: number};
  constructor(private host: HTMLElement, private onFrame: () => void) {}
  async init() {
    this.renderer = new T.WebGPURenderer({antialias: true, alpha: true});
    await this.renderer.init();
    renderReport.backend = (this.renderer.backend as unknown as {isWebGPUBackend: boolean}).isWebGPUBackend ? 'WebGPU' : 'WebGL2';
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(max-width: 700px)').matches ? 1.5 : 1.8));
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFShadowMap;
    this.host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', '可拖动旋转的三维空间场景');
    this.renderer.domElement.setAttribute('role', 'img');
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !reducedMotion.matches; this.controls.enablePan = false;
    reducedMotion.addEventListener('change',()=>{this.controls.enableDamping=!reducedMotion.matches;if(reducedMotion.matches){this.focusLight=0;this.sun.intensity=this.isExplorer()?3.4:2.4;}this.dirty=true;});
    this.controls.minDistance = 2.4; this.controls.maxDistance = 7;
    this.controls.addEventListener('change', () => {this.dirty = true;});
    this.controls.addEventListener('start', () => {this.dragging = true; this.fly = undefined; update({tracking: false});});
    this.controls.addEventListener('end', () => {this.dragging = false;});
    this.renderer.domElement.addEventListener('pointerdown', event => {this.pointerStart = {x: event.clientX, y: event.clientY};});
    this.renderer.domElement.addEventListener('pointerup', event => this.pickPublicSatellite(event));
    this.renderer.domElement.addEventListener('pointerdown',event=>{if(!state.moonGuide)return;this.moonPointer={id:event.pointerId,x:event.clientX,angle:state.moonGuideAngle};this.renderer.domElement.setPointerCapture(event.pointerId);});
    this.renderer.domElement.addEventListener('pointermove',event=>{if(this.moonPointer?.id===event.pointerId)moveMoonObserver(this.moonPointer.angle+(event.clientX-this.moonPointer.x)*.5);});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])this.renderer.domElement.addEventListener(name,()=>{this.moonPointer=undefined;});
    this.scene.add(this.ambient);
    const sun=this.sun;sun.castShadow=true;sun.position.set(-3,2,-1);sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-4;sun.shadow.camera.right=4;sun.shadow.camera.top=4;sun.shadow.camera.bottom=-4;sun.shadow.camera.near=.1;sun.shadow.camera.far=20;sun.shadow.bias=-.00015;sun.shadow.normalBias=.001;this.scene.add(sun);
    this.fill.position.set(3,1,3);this.scene.add(this.fill);
    const pmrem = new T.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room).texture; room.dispose(); pmrem.dispose();
    this.scene.add(this.globeGroup, this.model, this.celestial.root,this.spacecraft.root,this.moonGuide.root);
    this.createStars();
    await this.createEarth();
    this.createOrbits(); this.createGrid(); this.createInstrument(); this.createWave();
    this.createPublicSatellites();this.globeGroup.add(this.observerMarker);this.observerMarker.visible=false;this.celestial.attachLabels(this.host);
    this.resize = new ResizeObserver(() => this.fit()); this.resize.observe(this.host);
    this.setView(state.view, false); if(state.moonGuide)this.syncMoonGuide(false); this.fit(); this.updatePublicSatellites();
    subscribe(changed => {
      if(changed.every(key=>['soundMode','soundLevel','haptics','sensoryOpen'].includes(key)))return;
      if(changed.length===1&&changed[0]==='structureLoad')return;
      this.dirty = true;
      if(changed.includes('structureWire'))this.spacecraft.configure();
      if(changed.includes('activeNorad')&&state.satellitePage==='structure')void this.spacecraft.setSelection();
      const changedView=changed.some(key=>['observerPosition','view','satellitePage','observationFocus','eventPage','celestialBody','celestialMode'].includes(key));
      if(changed.includes('moonGuide'))this.syncMoonGuide(changedView);
      else if(changedView)this.setView(state.view,true);
      if(changed.includes('moonGuideAngle'))this.moonGuide.sync();
      if(changed.some(key=>['celestialWire','celestialEffects'].includes(key)))this.celestial.configureMaterials();
      if(changed.includes('celestialLight'))this.setLight();
      if(changed.some(key=>['selectedObservationId','observationRevision'].includes(key)))this.celestial.updateMarkers();
      if (changed.includes('altitude') || changed.includes('inclination')) this.createOrbits();
      if (changed.includes('tracking') && state.tracking) this.focusSatellite();
      if (changed.some(key => ['observerPosition','observerType','satelliteQuery', 'visibleGroups', 'favorites', 'favoritesOnly', 'orbitRevision'].includes(key))) this.publicAt = 0;
      if (changed.some(key => ['activeNorad', 'orbitRevision', 'orbitMode'].includes(key))) {this.publicPathKey = ''; this.publicAt = 0;}
      if (changed.includes('activeNorad') && !changed.includes('observerPosition') && this.isNetwork()) this.focusSatellite();
    });
    await this.renderer.compileAsync(this.scene, this.camera);
    this.renderer.setAnimationLoop(() => this.frame());
    document.addEventListener('visibilitychange', () => {this.previous = performance.now();});
    window.addEventListener('pagehide', () => this.dispose(), {once: true});
  }
  private async createEarth() {
    const loader = new T.TextureLoader();
    const load = async (url: string, srgb = false) => {
      try { const map = await loader.loadAsync(url); map.anisotropy = 8; if (srgb) map.colorSpace = T.SRGBColorSpace; return map; }
      catch (error) {renderReport.textureFailures.push(url); throw error;}
    };
    const [day, night, surface] = await Promise.all([load('/assets/earth-day.jpg', true), load('/assets/earth-night.jpg', true), load('/assets/earth-surface.jpg')]);
    const view = positionWorld.sub(cameraPosition).normalize();
    const fresnel = view.dot(normalWorldGeometry).abs().oneMinus();
    const orientation = normalWorldGeometry.dot(this.sunDirection);
    const atmosphereColor = mix(color('#b06335'), color('#5599de'), orientation.smoothstep(-0.25, 0.75));
    const material = new T.MeshStandardNodeMaterial();
    material.envMapIntensity = 0.08;
    const clouds = texture(surface, uv()).b.smoothstep(0.2, 1).mul(this.cloudsStrength);
    material.colorNode = mix(texture(day), vec3(1), clouds.mul(0.95));
    material.roughnessNode = texture(surface).g.mul(0.25).add(0.5);
    material.normalNode = bumpMap(texture(surface).r.mul(0.2));
    const nightColor = texture(night).rgb.mul(this.nightStrength).mul(0.8);
    const final = mix(nightColor, output.rgb, orientation.smoothstep(-0.2, 0.3));
    material.outputNode = vec4(mix(final, atmosphereColor, fresnel.pow(3).mul(orientation.smoothstep(-0.5, 1)).mul(0.45)), output.a);
    const sphere = new T.SphereGeometry(1, 96, 64);
    this.globeGroup.add(new T.Mesh(sphere, material));
    const atmosphere = new T.MeshBasicNodeMaterial({side: T.BackSide, transparent: true, depthWrite: false});
    atmosphere.outputNode = vec4(atmosphereColor, fresnel.remap(0.73, 1, 1, 0).pow(3).mul(orientation.smoothstep(-0.5, 1)).mul(0.65));
    const shell = new T.Mesh(sphere, atmosphere); shell.scale.setScalar(1.035); this.globeGroup.add(shell);
  }
  private createStars() {
    let seed = 2917; const rand = () => {seed = (seed * 16807) % 2147483647; return seed / 2147483647;};
    const positions = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {const a = rand() * Math.PI * 2, z = rand() * 2 - 1, r = Math.sqrt(1 - z * z); positions.set([20 * r * Math.cos(a), 20 * z, 20 * r * Math.sin(a)], i * 3);}
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    const stars = new T.Points(geometry, new T.PointsMaterial({color: 0x9baabf, size: 0.018, transparent: true, opacity: 0.5, sizeAttenuation: true}));
    stars.name = 'stars'; this.scene.add(stars);
  }
  private createOrbits() {
    this.orbitLines.forEach(line => {this.globeGroup.remove(line); line.geometry.dispose(); (line.material as T.Material).dispose();}); this.orbitLines = [];
    const inc = state.inclination * Math.PI / 180, radius = (EARTH_KM + state.altitude) / EARTH_KM;
    const points = Array.from({length: 241}, (_, n) => {const a = n / 240 * Math.PI * 2; return new T.Vector3(radius * Math.cos(a), radius * Math.sin(a) * Math.sin(inc), -radius * Math.sin(a) * Math.cos(inc));});
    const line = new T.Line(new T.BufferGeometry().setFromPoints(points), new T.LineBasicMaterial({color: 0x85aaff, transparent: true, opacity: 0.65}));
    this.orbitLines.push(line); this.globeGroup.add(line);
    if (!this.satellites.length) for (let i = 0; i < 2; i++) {
      const dot = new T.Mesh(new T.SphereGeometry(0.013, 12, 12), new T.MeshBasicMaterial({color: i ? 0xe9ba7b : 0x94b6ff}));
      this.satellites.push(dot); this.globeGroup.add(dot);
      const label = document.createElement('button'); label.className = `sat-label sat-${i}`; label.textContent = `教学卫星 ${i ? 'B' : 'A'}`;
      label.dataset.action = 'select-satellite'; label.dataset.index = String(i); this.host.append(label); this.labels.push(label);
    }
  }
  private createGrid() {
    for (let lat = -60; lat <= 60; lat += 30) {
      const a = lat * Math.PI / 180;
      const points = Array.from({length: 181}, (_, i) => {const b = i / 180 * Math.PI * 2; return new T.Vector3(Math.cos(a) * Math.cos(b), Math.sin(a), Math.cos(a) * Math.sin(b)).multiplyScalar(1.002);});
      this.grid.add(new T.Line(new T.BufferGeometry().setFromPoints(points), new T.LineBasicMaterial({color: 0x8aa3ba, opacity: 0.16, transparent: true})));
    }
    for (let lon = 0; lon < 180; lon += 30) {
      const b = lon * Math.PI / 180;
      const points = Array.from({length: 181}, (_, i) => {const a = i / 180 * Math.PI * 2; return new T.Vector3(Math.cos(a) * Math.cos(b), Math.sin(a), Math.cos(a) * Math.sin(b)).multiplyScalar(1.002);});
      this.grid.add(new T.Line(new T.BufferGeometry().setFromPoints(points), new T.LineBasicMaterial({color: 0x8aa3ba, opacity: 0.16, transparent: true})));
    }
    this.globeGroup.add(this.grid);
  }
  private createInstrument() {
    const gold = new T.MeshStandardMaterial({color: 0xb69455, metalness: 0.8, roughness: 0.34});
    const metal = new T.MeshStandardMaterial({color: 0xc5cbd2, metalness: 0.75, roughness: 0.27});
    const body = new T.Mesh(new T.BoxGeometry(0.65, 0.9, 0.65), gold); this.model.add(body);
    const edge = new T.LineSegments(new T.EdgesGeometry(body.geometry), new T.LineBasicMaterial({color: 0xddd7b1})); this.model.add(edge);
    for (const side of [-1, 1]) {
      const panel = new T.Group(); panel.position.x = side * 1.0; panel.name = 'panel';
      panel.add(new T.Mesh(new T.BoxGeometry(1.2, 0.035, 0.78), metal));
      for (let x = 0; x < 8; x++) for (let z = 0; z < 5; z++) {
        const cell = new T.Mesh(new T.BoxGeometry(0.137, 0.009, 0.135), new T.MeshStandardMaterial({color: 0x142742, metalness: 0.55, roughness: 0.25}));
        cell.position.set((x - 3.5) * 0.144, 0.027, (z - 2) * 0.147); panel.add(cell);
      }
      const hinge = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 0.9, 8), metal); hinge.rotation.z = Math.PI / 2; hinge.position.x = side * 0.6; this.model.add(hinge, panel);
    }
    const detectors = new T.Group(); detectors.name = 'detectors'; detectors.position.y = 0.46;
    for (const x of [-0.15, 0.15]) for (const z of [-0.15, 0.15]) {
      const housing = new T.Mesh(new T.CylinderGeometry(0.118, 0.13, 0.14, 32), metal); housing.position.set(x, 0.04, z); detectors.add(housing);
      const cap = new T.Mesh(new T.CylinderGeometry(0.094, 0.094, 0.01, 32), new T.MeshStandardMaterial({color: 0x33424e, metalness: 0.2, roughness: 0.4})); cap.position.set(x, 0.115, z); detectors.add(cap);
    }
    this.model.add(detectors);
    for (const x of [-0.3, 0.3]) {const rod = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, 0.8, 8), metal); rod.position.set(x, 0.65, 0.3); rod.rotation.z = x > 0 ? -0.3 : 0.3; this.model.add(rod);}
    this.model.rotation.set(0.18, -0.4, 0.18);
    for (const [title, detail, anchor, offset] of [
      ['探测器阵列', '记录到达时间', new T.Vector3(0, 1.0, 0), -128],
      ['太阳能板', '为平台供电', new T.Vector3(1.5, 0, 0), 12],
      ['平台舱体', '运行与通信', new T.Vector3(0, -0.35, 0.35), -142],
    ] as const) {
      const node = document.createElement('span'); node.className = 'part-label'; node.innerHTML = `${title}<small>${detail}</small>`;
      this.host.append(node); this.partLabels.push({node, anchor, offset});
    }
  }
  private createWave() {
    for (let i = 0; i < 4; i++) {
      const plane = new T.Group();
      for (const y of [-0.9, -0.3, 0.3, 0.9]) {
        const line = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(-1.8, y, 0), new T.Vector3(-0.7, y, 0), new T.Vector3(0.7, y, 0), new T.Vector3(1.8, y, 0)]), new T.LineBasicMaterial({vertexColors: true, transparent: true, opacity: 0.25}));
        line.geometry.setAttribute('color', new T.Float32BufferAttribute([0.1,0.08,0.05, 0.85,0.68,0.4, 0.85,0.68,0.4, 0.1,0.08,0.05], 3)); plane.add(line);
      }
      this.wave.add(plane);
    }
    this.globeGroup.add(this.wave);
  }
  // -- 教学相机独立于自由浏览现场；共享渲染器与资源生命周期 --------
  private syncMoonGuide(changedView:boolean) {
    if(state.moonGuide) {
      if(!this.moonSnapshot) {
        this.moonSnapshot={camera:this.camera.position.clone(),quaternion:this.camera.quaternion.clone(),target:this.controls.target.clone()};
        this.fly=undefined;this.controls.enabled=false;this.dragging=false;
        this.globeGroup.visible=false;this.model.visible=false;this.spacecraft.root.visible=false;
        void this.celestial.setBody();
      }
      this.moonGuide.sync();
    } else if(this.moonSnapshot) {
      const saved=this.moonSnapshot;this.moonSnapshot=undefined;this.moonPointer=undefined;
      this.controls.enabled=true;this.moonGuide.sync();this.setView(state.view,false);
      if(!changedView){this.camera.position.copy(saved.camera);this.camera.quaternion.copy(saved.quaternion);this.controls.target.copy(saved.target);}
    } else if(changedView)this.setView(state.view,true);
    this.fit();this.dirty=true;
  }
  retryMoonTexture(){void this.moonGuide.loadTexture();}
  private isLocalSky(){return state.view==='overview'&&state.orbitMode==='public'&&!state.observationFocus;}
  private isNetwork(){return (state.view==='overview'&&state.orbitMode==='public')||(state.view==='satellites'&&state.satellitePage==='network');}
  private isStructure(){return state.view==='satellites'&&state.satellitePage==='structure';}
  retryStructure(){void this.spacecraft.setSelection();}
  private isExplorer(){return state.view==='events'&&state.eventPage==='space';}
  private setLight(){
    const explorer=this.isExplorer(),a=(state.celestialLight+40)*Math.PI/180;
    this.sun.position.set(explorer?Math.sin(a)*4:-3,explorer?2.5:2,explorer?Math.cos(a)*4:-1);
    this.sunDirection.value.copy(this.sun.position).normalize();
    this.scene.environmentIntensity=explorer ? .02 : 1;
    this.sun.intensity=explorer?3.4:2.4;this.fill.intensity=explorer ? .035:1.4;this.ambient.intensity=explorer ? .02:1.2;this.dirty=true;
  }
  private setView(view: View, animate: boolean) {
    const explorer=this.isExplorer(),context=state.celestialMode==='context',body=state.celestialBody;
    this.globeGroup.rotation.set(0,0,0);
    this.dirty = true; this.globeGroup.visible = view === 'overview' || view === 'lab'||this.isNetwork()||(explorer&&(body==='earth'||(body==='moon'&&context)||(body==='meteors'&&context)));
    this.model.visible = view === 'satellites' && state.satellitePage === 'payload';
    this.scene.getObjectByName('stars')!.visible = this.globeGroup.visible||explorer||this.isStructure();
    this.labels.forEach(label => {label.hidden = true;});this.publicLabel.hidden=true;this.observationLabel.hidden=true;
    this.controls.minDistance=this.isStructure()?1.5:explorer?1.35:view==='satellites'?2.8:2.4;
    this.controls.maxDistance=this.isStructure()?14:this.isNetwork()?50:explorer?14:9;
    let target=view==='satellites'&&!this.isNetwork()?new T.Vector3(3.2,2.2,4):new T.Vector3(-2.8,1.6,-3.2);
    this.controls.target.set(0,0,0);
    if(this.isNetwork()){const record=orbitalRecord(state.activeNorad),pv=record&&orbitState(record,state.orbitAt);if(pv)target=world(pv.position).normalize().multiplyScalar(4.8);}
    const point=this.observationPosition();if(this.isNetwork()&&point)target=point.normalize().multiplyScalar(4.8);
    if(this.isLocalSky()&&state.observerPosition){const p=observerEcf(state.observerPosition);if(p)target=world([p.x,p.y,p.z]).normalize().multiplyScalar(4.4);}
    if(this.isStructure())target.set(3,2.2,5.3);
    if(explorer){target.set(.9,.65,4.4);if(body==='moon'&&context){target.set(1.1,.8,8);this.controls.target.set(1.1,0,0);}if(body==='comets'&&context){target.set(2,.8,9.5);this.controls.target.set(2,0,0);}if(body==='earth'||(body==='meteors'&&context))target=this.celestial.focusPoint()??new T.Vector3(-3,1.6,-3);}
    if (animate && !reducedMotion.matches && document.body.dataset.input!=='keyboard') this.fly={from:this.camera.position.clone(),to:target,at:performance.now()};else this.camera.position.copy(target);
    this.camera.lookAt(this.controls.target);this.setLight();void this.celestial.setBody();void this.spacecraft.setSelection();requestAnimationFrame(()=>this.fit());
  }
  home() {if(state.moonGuide)return;update({tracking: false}); this.setView(state.view, true);}
  pulseFocus(){if(reducedMotion.matches)return;this.focusLight=1;this.dirty=true;}
  zoom(factor: number) {
    if(state.moonGuide)return;
    update({tracking: false}); this.fly = undefined;
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.setLength(T.MathUtils.clamp(offset.length() * factor, this.controls.minDistance, this.controls.maxDistance));
    this.camera.position.copy(this.controls.target).add(offset); this.controls.update(); this.dirty = true;
  }
  inspection() {return {observer:{active:this.isLocalSky(),position:state.observerPosition,markerVisible:this.observerMarker.visible},moonGuide:this.moonGuide.inspect(),camera: this.camera.position.toArray(), distance: this.controls?this.camera.position.distanceTo(this.controls.target):this.camera.position.length(), focusLight:this.focusLight, selectedNorad: state.activeNorad, publicCount: this.publicRecords.length, publicDrawCount:this.publicMarkers?.count??0, observationFocus:state.observationFocus, observationPosition:this.observationPosition()?.toArray()??null,celestial:this.celestial.report,spacecraft:this.spacecraft.report,trajectory:{visible:this.isNetwork()&&this.publicLine.visible,segments:this.publicLine.geometry.getAttribute('instanceStart')?.count??0,width:2},teachingModel:this.model.visible};}
  private observationPosition() {
    const location=state.observationFocus?observationRecord(state.observationFocus)?.location:null;if(!location)return null;
    const latitude=location.latitude*Math.PI/180,longitude=location.longitude*Math.PI/180,radius=1+(location.altitude_km??0)/EARTH_KM;
    return new T.Vector3(Math.cos(latitude)*Math.cos(longitude),Math.sin(latitude),-Math.cos(latitude)*Math.sin(longitude)).multiplyScalar(radius);
  }
  private updateObservationPin() {
    const point=this.observationPosition(), visible=!!point&&state.view==='overview'&&state.orbitMode==='public';
    this.observationPin.visible=visible;this.observationLabel.hidden=true;if(!point||!visible)return;
    this.observationPin.position.copy(point.clone().multiplyScalar(1.004));
    const projected=point.clone().project(this.camera),normal=point.clone().normalize(),toCamera=this.camera.position.clone().sub(point).normalize();
    if(normal.dot(toCamera)<=.02||Math.abs(projected.x)>.94||Math.abs(projected.y)>.94||projected.z>1)return;
    this.observationLabel.hidden=false;this.observationLabel.dataset.id=state.observationFocus!;
    this.observationLabel.textContent=observationTitle(observationRecord(state.observationFocus!)!);
    this.placeLabel(this.observationLabel, projected);
  }
  focusSatellite() {
    const p = this.trackingPosition(); if (!p) return;
    if (reducedMotion.matches||document.body.dataset.input==='keyboard') {this.camera.position.copy(p); this.dirty = true;}
    else this.fly = {from: this.camera.position.clone(), to: p, at: performance.now()};
  }
  private trackingPosition() {
    if (this.isNetwork()) {
      const record = orbitalRecord(state.activeNorad), pv = record && orbitState(record, state.orbitAt); if (!pv) return null;
      const p = world(pv.position); return p.clone().add(p.clone().normalize().multiplyScalar(2.8));
    }
    return world(position(state.selectedSatellite)).normalize().multiplyScalar(3.1);
  }
  private createPublicSatellites() {
    this.globeGroup.add(this.publicPoints, this.publicLine, this.publicSelected);
    this.publicLabel = document.createElement('button'); this.publicLabel.className = 'sat-label public-sat-label';
    this.publicLabel.dataset.action = 'public-select'; this.publicLabel.hidden = true; this.host.append(this.publicLabel);
    this.observationPin.visible=false;this.globeGroup.add(this.observationPin);
    this.observationLabel=document.createElement('button');this.observationLabel.className='sat-label observation-pin-label';this.observationLabel.dataset.action='observation-evidence';this.observationLabel.hidden=true;this.host.append(this.observationLabel);
  }
  private updatePublicSatellites() {
    const visible = this.isNetwork();
    this.publicPoints.visible = false;if(this.publicMarkers)this.publicMarkers.visible=visible; this.publicLine.visible = visible && state.layers.orbits; this.publicSelected.visible = visible;
    this.publicLabel.hidden = true;
    const observer=this.isLocalSky()&&state.observerPosition?observerEcf(state.observerPosition):null;this.observerMarker.visible=!!observer;if(observer)this.observerMarker.position.copy(world([observer.x,observer.y,observer.z]).multiplyScalar(1.004));
    if (!visible) return;
    if (Math.abs(state.orbitAt - this.publicAt) >= 200 || !this.publicAt) {
      const matched = this.isLocalSky()&&state.observerPosition?(currentSky()?.above.filter(s=>state.observerType==='all'||satelliteSkyType(s.record)===state.observerType).map(s=>s.record)??[]):matchRecords(state.satelliteQuery, state.visibleGroups, state.favoritesOnly, state.favorites);
      const positions: number[] = [], colors: number[] = []; this.publicRecords = [];
      for (const record of matched) {const pv = orbitState(record, state.orbitAt); if (!pv) continue;
        this.publicRecords.push(record); positions.push(...world(pv.position).toArray());
        const tint = new T.Color(record.groups.includes('stations') ? '#9dbdff' : record.groups.includes('science') ? '#d6b17c' : '#87bfa9'); colors.push(tint.r, tint.g, tint.b);
      }
      const capacity = Math.max(orbitDataset.items.length, 1);
      if(!this.publicMarkers||this.publicMarkers.instanceMatrix.count<capacity){
        if(this.publicMarkers){this.globeGroup.remove(this.publicMarkers);this.publicMarkers.geometry.dispose();(this.publicMarkers.material as T.Material).dispose();this.publicMarkers.dispose();}
        this.publicMarkers=new T.InstancedMesh(new T.SphereGeometry(.007,8,6),new T.MeshBasicMaterial(),capacity);this.publicMarkers.frustumCulled=false;this.globeGroup.add(this.publicMarkers);
      }
      this.publicMarkers.count=this.publicRecords.length;this.publicMarkers.visible=true;
      const markerMatrix=new T.Matrix4(),markerColor=new T.Color();
      for(let i=0;i<this.publicRecords.length;i++){this.publicMarkers.setMatrixAt(i,markerMatrix.makeTranslation(positions[i*3],positions[i*3+1],positions[i*3+2]));this.publicMarkers.setColorAt(i,markerColor.setRGB(colors[i*3],colors[i*3+1],colors[i*3+2]));}
      this.publicMarkers.instanceMatrix.needsUpdate=true;if(this.publicMarkers.instanceColor)this.publicMarkers.instanceColor.needsUpdate=true;
      if (!this.publicPoints.geometry.getAttribute('position') || this.publicPoints.geometry.getAttribute('position').count < capacity) {
        this.publicPoints.geometry.dispose(); this.publicPoints.geometry = new T.BufferGeometry();
        this.publicPoints.geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(capacity * 3), 3));
        this.publicPoints.geometry.setAttribute('color', new T.BufferAttribute(new Float32Array(capacity * 3), 3));
      }
      const attribute = this.publicPoints.geometry.getAttribute('position') as T.BufferAttribute, tint = this.publicPoints.geometry.getAttribute('color') as T.BufferAttribute;
      (attribute.array as Float32Array).set(positions); (tint.array as Float32Array).set(colors); attribute.needsUpdate = true; tint.needsUpdate = true;
      this.publicPoints.geometry.setDrawRange(0, this.publicRecords.length); this.publicPoints.geometry.computeBoundingSphere(); this.publicAt = state.orbitAt;
    }
    const record = orbitalRecord(state.activeNorad), pv = record && orbitState(record, state.orbitAt);
    const selectedVisible = !!pv && this.publicRecords.some(r => r.norad_id === state.activeNorad);
    this.publicSelected.visible = selectedVisible; this.publicLine.visible = selectedVisible && state.layers.orbits;
    if (!record || !pv || !selectedVisible) return;
    this.publicSelected.position.copy(world(pv.position));
    const key = `${record.norad_id}/${Math.floor(state.orbitAt / 60000)}/${orbitDataset.captured_at}`;
    if (key !== this.publicPathKey) {this.publicLine.geometry.dispose(); this.publicLine.geometry = new LineGeometry().setPositions(orbitPath(record, state.orbitAt).map(world).flatMap(p=>p.toArray())); this.publicPathKey = key;}
    const p = this.publicSelected.position.clone(), view = this.camera.position.clone().sub(p), ray = p.clone().negate();
    const closest = p.clone().addScaledVector(view, T.MathUtils.clamp(ray.dot(view) / view.lengthSq(), 0, 1));
    const projected = p.project(this.camera);
    const labelVisible = closest.length() > 1.002 && projected.z < 1 && projected.z > -1 && Math.abs(projected.x) < 0.95 && Math.abs(projected.y) < 0.95;
    this.publicLabel.hidden = !labelVisible; this.publicLabel.textContent = displayName(record); this.publicLabel.dataset.norad = String(record.norad_id);
    this.placeLabel(this.publicLabel, projected);
  }
  private pickPublicSatellite(event: PointerEvent) {
    if(state.moonGuide||state.lightGuide||state.marsGuide)return;
    if (!this.pointerStart || Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > 6 ) return;
    const box=this.renderer.domElement.getBoundingClientRect(),mouse=new T.Vector2((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1);
    if(this.isExplorer()){const ray=new T.Raycaster();ray.setFromCamera(mouse,this.camera);this.celestial.pick(ray,this.globeGroup.children[0]);return;}
    if(!this.isNetwork())return;
    const ray = new T.Raycaster(); ray.params.Points.threshold = 0.04; ray.setFromCamera(mouse, this.camera);
    const hit = ray.intersectObject(this.publicPoints)[0], earth = ray.intersectObject(this.globeGroup.children[0])[0];
    if (hit?.index !== undefined && (!earth || hit.distance < earth.distance)) {const record = this.publicRecords[hit.index]; if (record) update({activeNorad: record.norad_id, tracking: false,observationFocus:null});}
  }
  private placeLabel(label: HTMLElement, projected: T.Vector3) {
    if (label.hidden) return;
    const width = this.host.clientWidth, height = this.host.clientHeight;
    const x = (projected.x + 1) * width / 2, y = (1 - projected.y) * height / 2;
    const labelWidth = label.offsetWidth, halfHeight = label.offsetHeight / 2;
    const side = x + 12 + labelWidth <= width - 8 ? x + 12 : x - labelWidth - 12;
    const left = T.MathUtils.clamp(side, 8, Math.max(8, width - labelWidth - 8));
    const top = T.MathUtils.clamp(y, halfHeight + 8, Math.max(halfHeight + 8, height - halfHeight - 8));
    label.style.transform = `translate(${left}px,${top}px) translateY(-50%)`;
  }
  private fit() {const {width, height} = this.host.getBoundingClientRect(); if (!width || !height) return; this.dirty = true; this.camera.aspect = width / height; if(width>760&&!this.isLocalSky()&&(this.isNetwork()||this.isExplorer()))this.camera.setViewOffset(width,height,-width*.14,0,width,height);else this.camera.clearViewOffset();this.camera.updateProjectionMatrix(); this.moonGuide.fit(width,height); this.renderer.setSize(width, height);}
  private frame() {
    const now = performance.now(), rawMs = now - this.previous, dt = Math.min(rawMs / 1000, 0.1); this.previous = now;
    if (state.lightGuide || state.marsGuide || document.hidden || (state.view === 'events' && state.eventPage!=='space') || (state.view === 'satellites' && state.satellitePage === 'catalog')) return;
    if (state.playing) {if (this.isNetwork()&&!state.orbitLive) state.orbitAt += dt * state.speed * 1000; else state.seconds = (state.seconds + dt * state.speed) % period();}
    if (this.fly) {if(reducedMotion.matches){this.camera.position.copy(this.fly.to);this.fly=undefined;this.dirty=true;}else{const t = Math.min((now - this.fly.at) / 360, 1), ease = 1 - (1 - t) ** 3; this.camera.position.lerpVectors(this.fly.from, this.fly.to, ease); if (t === 1) this.fly = undefined;}}
    if (state.tracking && !this.dragging && !this.fly) {const p = this.trackingPosition(); if (p) {if(reducedMotion.matches)this.camera.position.copy(p);else this.camera.position.lerp(p, 1-Math.exp(-4.3*dt));}}
    const moved = state.moonGuide?false:this.controls.update();
    let celestialMoved=state.moonGuide?false:this.celestial.update(this.camera,dt);
    if(this.isExplorer()&&state.celestialBody==='earth'&&state.celestialMode==='surface'&&state.celestialSpin&&!reducedMotion.matches){this.globeGroup.rotation.y+=dt*.13;celestialMoved=true;}
    const partsMoving = this.model.visible && this.model.children.some(child => (child.name === 'detectors' && Math.abs(child.position.y - (state.exploded ? 0.9 : 0.46)) > 0.001) || (child.name === 'panel' && Math.abs(Math.abs(child.position.x) - (state.exploded ? 1.4 : 1)) > 0.001));
    if(reducedMotion.matches&&this.focusLight>0){this.focusLight=0;this.sun.intensity=this.isExplorer()?3.4:2.4;this.dirty=true;}
    const lightActive=this.focusLight>0;
    if(lightActive){this.focusLight=Math.max(0,this.focusLight-dt/.32);this.sun.intensity=(this.isExplorer()?3.4:2.4)*(1+this.focusLight*.06);}
    if (!this.dirty && !state.playing && !this.fly && !moved && !partsMoving && !state.tracking && !celestialMoved && !lightActive) return;
    this.grid.visible = state.layers.grid; this.nightStrength.value = Number(state.layers.night); this.cloudsStrength.value = Number(state.layers.clouds);
    const teaching = state.view === 'lab' || (state.view==='overview'&&state.orbitMode === 'teaching');
    this.orbitLines[0].visible = state.layers.orbits && teaching;
    const vp = this.camera.position.clone().normalize();
    this.satellites.forEach((dot, i) => {
      dot.position.copy(world(position(i))); dot.scale.setScalar(i === state.selectedSatellite ? 1.2 : 1);
      dot.visible = teaching;
      const projected = dot.position.clone().project(this.camera);
      const visible = dot.position.clone().normalize().dot(vp) > 0.03 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1;
      this.labels[i].hidden = !this.globeGroup.visible || !visible || !teaching;
      this.placeLabel(this.labels[i], projected);
    });
    this.updatePublicSatellites();
    this.updateObservationPin();
    this.wave.visible = state.view === 'lab';
    if (this.wave.visible) {const direction = world(sourceDirection()).normalize(); this.wave.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), direction); this.wave.children.forEach((plane, i) => {plane.position.z = 2.3 - ((state.seconds / 20 + i * 0.8) % 3.2);});}
    if (this.model.visible) this.model.children.forEach(child => {if (child.name === 'detectors') child.position.y = T.MathUtils.lerp(child.position.y, state.exploded ? 0.9 : 0.46, reducedMotion.matches || document.body.dataset.input==='keyboard' ? 1 : 1-Math.exp(-18*dt)); if (child.name === 'panel') child.position.x = T.MathUtils.lerp(child.position.x, Math.sign(child.position.x) * (state.exploded ? 1.4 : 1), reducedMotion.matches || document.body.dataset.input==='keyboard' ? 1 : 1-Math.exp(-18*dt));});
    this.renderer.render(this.scene, state.moonGuide?this.moonGuide.camera:this.camera);
    this.celestial.projectLabels(this.camera,this.host.clientWidth,this.host.clientHeight);
    this.dirty = false;
    renderReport.frames++; if (!renderReport.firstFrameMs) renderReport.firstFrameMs = now;
    this.partLabels.forEach(({node, anchor, offset}) => {
      node.hidden = !this.model.visible || !state.exploded || this.host.clientWidth < 500;
      if (!node.hidden) {const p = this.model.localToWorld(anchor.clone()).project(this.camera); node.style.transform = `translate(${(p.x + 1) * this.host.clientWidth / 2 + offset}px,${(1 - p.y) * this.host.clientHeight / 2}px)`;}
    });
    if (renderReport.frameTimes.length < 1800 && renderReport.frames > 30) renderReport.frameTimes.push(rawMs);
    this.onFrame();
  }
  dispose() {
    this.spacecraft.dispose();this.moonGuide.dispose();
    this.renderer.setAnimationLoop(null); this.resize.disconnect(); this.controls.dispose();
    this.scene.traverse(object => {if (object instanceof T.Mesh || object instanceof T.Line || object instanceof T.Points) {object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => material.dispose());}});
    this.renderer.dispose();
  }
}
