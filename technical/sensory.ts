import {state,update,subscribe,reducedMotion,type State,type SoundMode} from './model';
import {icon} from './icons';
import {Soundscape,type Cue} from './soundscape';
import {InteractionMotion} from './interaction-motion';
const ease='cubic-bezier(.22,.8,.22,1)';
const modes:Record<SoundMode,string>={off:'静音',cues:'交互提示',ambient:'沉浸音景'};
export class SensoryDirector {
  readonly sound=new Soundscape();
  readonly report={animations:0,flashes:0,hoverApproaches:0,hapticSupported:typeof navigator.vibrate==='function',hapticRequests:0,hapticAccepted:0,gestureCloses:0,lastAction:''};
  private animations=new WeakMap<Element,Animation>();
  private motion=new InteractionMotion((node,frames,options)=>this.animate(node,frames,options));
  private panel=document.createElement('aside');
  private fx=document.createElement('div');
  private reticle=document.createElement('div');
  private hoverTimer=0;
  private pointFrame=0;
  private cursor={x:0,y:0};
  private lastTick=0;
  private dragging=false;
  private gestureExit=false;
  private panelAnimation?:Animation;
  private closingDialog?:Promise<void>;
  private drawerStarts=new Map<string,{box:DOMRect;opacity:string}>();
  constructor(private light:()=>void){
    this.panel.id='sensory-panel';this.panel.className='sensory-panel';this.panel.hidden=true;this.panel.inert=true;this.panel.setAttribute('role','dialog');this.panel.setAttribute('aria-labelledby','sensory-title');
    this.panel.innerHTML=`<div class="sensory-title"><span><small>THE OBSERVATORY</small><h2 id="sensory-title">让探索有回应。</h2></span><button class="icon-button" data-action="sensory-settings" aria-label="关闭声音与触感">${icon('close',17)}</button></div><p>轮廓回应靠近，光回应选择。<br>声音随你的探索展开。</p><div class="sound-modes" role="group" aria-label="声音模式">${Object.entries(modes).map(([key,text])=>`<button data-action="sound-mode" data-mode="${key}" aria-pressed="false">${text}</button>`).join('')}</div><label class="sound-volume" for="sound-level"><span>音量 <output id="sound-value">${state.soundLevel}%</output></span><input id="sound-level" type="range" min="0" max="100" value="${state.soundLevel}" aria-label="音景音量"></label><label class="haptic-setting" ${this.report.hapticSupported?'':'hidden'}><span>设备触感</span><input id="haptic-setting" type="checkbox" ${state.haptics?'checked':''}></label><div class="sensory-footnote"><span>原创界面音景 · 非天体实录</span><span id="sound-status">点击声音模式开启</span></div>`;
    this.fx.id='sensory-effects';this.fx.setAttribute('aria-hidden','true');this.reticle.className='scene-reticle';this.reticle.hidden=true;this.reticle.innerHTML='<i></i><i></i><i></i><i></i><span></span>';this.fx.append(this.reticle);document.querySelector('#app')!.append(this.fx,this.panel);
    this.bind();subscribe(changed=>{
      if(changed.some(k=>['soundMode','soundLevel','celestialBody','view'].includes(k)))this.sound.sync(state.soundMode,state.soundLevel,this.theme());
      if(changed.some(k=>['soundMode','soundLevel','haptics','sensoryOpen'].includes(k)))this.syncUI();
    });this.sound.sync(state.soundMode,state.soundLevel,this.theme());this.syncUI();
  }
  private theme(){return state.view==='events'&&state.eventPage==='space'?state.celestialBody:'earth';}
  private moving(){return !reducedMotion.matches&&document.body.dataset.input!=='keyboard'&&!document.hidden;}
  private animate(node:Element,frames:Keyframe[],options:KeyframeAnimationOptions){this.animations.get(node)?.cancel();if(!this.moving())return;this.report.animations++;const a=node.animate(frames,{easing:ease,fill:'none',...options});this.animations.set(node,a);return a;}
  noticeChanged(node:Element){this.animate(node,[{transform:'translateY(-4px)',opacity:.4},{transform:'translateY(0)',opacity:1}],{duration:190});}
  swapIcon(button:Element,html:string){this.motion.swapIcon(button,html);}
  modelStatus(kind:string,loading:boolean,ready:boolean){this.motion.modelStatus(kind,loading,ready);}
  private haptic(length=9){if(state.haptics&&this.report.hapticSupported&&document.body.dataset.input==='touch'&&!document.hidden){this.report.hapticRequests++;try {if(navigator.vibrate(length))this.report.hapticAccepted++;}catch{}}}
  private flash(x:number,y:number){
    if(!this.moving())return;const node=document.createElement('span');node.className='interaction-flash';node.style.left=`${x-22}px`;node.style.top=`${y-22}px`;this.fx.append(node);this.report.flashes++;
    const animation=this.animate(node,[{transform:'scale(.45)',opacity:.55},{transform:'scale(1.65)',opacity:0}],{duration:300});void animation?.finished.then(()=>node.remove()).catch(()=>node.remove());
  }
  action(target:HTMLElement,event:MouseEvent){
    const action=target.dataset.action!;this.report.lastAction=action;
    if(action==='sensory-settings'){this.sound.cue(state.sensoryOpen?'close':'open');update({sensoryOpen:!state.sensoryOpen});return true;}
    if(action==='sound-mode'){
      update({soundMode:target.dataset.mode as SoundMode});if(state.soundMode!=='off')void this.sound.unlock().then(ok=>{if(ok)this.sound.cue('confirm');this.syncUI();});return true;
    }
    const closing=(action==='celestial-records'&&state.celestialRecordsOpen)||(action==='satellite-drawer'&&state.satelliteDrawer);
    const cue:Cue=closing?'close':action==='navigate'||action==='event-page'||action==='satellite-page'?'navigate':action==='favorite'?'confirm':action.includes('close')?'close':action==='verify'||action==='celestial-records'||action==='satellite-drawer'||action==='about'||action.includes('source')||action.includes('evidence')?'open':action==='zoom-in'||action==='zoom-out'?'tick':'select';
    this.sound.cue(cue,event.detail?(event.clientX/innerWidth-.5)*1.3:0,target.dataset.body??this.theme());this.haptic(cue==='confirm'?14:8);
    if(event.detail&&this.moving()){this.flash(event.clientX,event.clientY);if(['structure-select','celestial-body','public-select','observation-select','celestial-mode','home','track'].includes(action))this.light();}
    if(state.sensoryOpen&&!target.closest('#sensory-panel'))update({sensoryOpen:false});return false;
  }
  beforeRender(changed:(keyof State)[]){
    this.motion.capture();
    for(const [key,selector,direction] of [['satelliteDrawer','.network-drawer',-1],['celestialRecordsOpen','.space-records',1]] as const){
      if(changed.includes(key)&&state[key]){const ghost=this.fx.querySelector<HTMLElement>(selector);if(ghost){this.drawerStarts.set(key,{box:ghost.getBoundingClientRect(),opacity:getComputedStyle(ghost).opacity});ghost.remove();}}
      if(changed.includes(key)&&!state[key]){const old=document.querySelector<HTMLElement>(`#content ${selector}`);if(old&&this.moving())this.exitCopy(old,direction);}
    }
  }
  private exitCopy(old:HTMLElement,direction:number){
    const visual=getComputedStyle(old),opacity=visual.opacity,box=old.getBoundingClientRect(),copy=old.cloneNode(true) as HTMLElement;copy.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));copy.removeAttribute('id');copy.inert=true;copy.setAttribute('aria-hidden','true');copy.classList.add('motion-ghost');Object.assign(copy.style,{position:'fixed',inset:'auto',left:`${box.left}px`,top:`${box.top}px`,width:`${box.width}px`,height:`${box.height}px`,margin:'0',pointerEvents:'none',zIndex:'24',animation:'none'});copy.style.transform='none';this.fx.append(copy);
    const a=this.animate(copy,[{transform:'translate(0)',opacity},{transform:this.gestureExit?'translateY(18px)':`translateX(${direction*12}px)`,opacity:0}],{duration:150});void a?.finished.then(()=>copy.remove()).catch(()=>copy.remove());
  }
  afterRender(changed:(keyof State)[]){
    this.syncUI();this.motion.layout();const main=document.querySelector('#content')!;
    if(changed.some(k=>['view','celestialBody','celestialMode','eventPage','satellitePage','activeNorad'].includes(k))){
      const parts=[...main.querySelectorAll('.structure-heading>h1,.structure-heading>.object-english,.structure-heading>p,.structure-heading>.ghost-button,.celestial-heading>h1,.celestial-heading>.object-english,.celestial-heading>p,.celestial-measure,.celestial-heading>.ghost-button,.network-heading>h1,.network-heading>p,.network-heading>.ghost-button,.lab-heading>h1,.lab-heading>p')];
      parts.forEach((node,i)=>this.animate(node,[{transform:'translateY(7px)',opacity:.35},{transform:'translateY(0)',opacity:1}],{duration:220,delay:Math.min(i,4)*12}));
      const stage=document.querySelector('#stage')!;if(!changed.includes('activeNorad')&&getComputedStyle(stage).display!=='none')this.animate(stage,[{opacity:.65},{opacity:1}],{duration:280});
    }
    for(const [key,selector,trigger,direction] of [['satelliteDrawer','.network-drawer','[data-action="satellite-drawer"]',-1],['celestialRecordsOpen','.space-records','[data-action="celestial-records"]',1]] as const){
      if(!changed.includes(key))continue;const panel=main.querySelector(selector);if(state[key]&&panel){const start=this.drawerStarts.get(key),box=panel.getBoundingClientRect();this.drawerStarts.delete(key);this.animate(panel,[start?{transform:`translate(${start.box.left-box.left}px,${start.box.top-box.top}px)`,opacity:start.opacity}:{transform:`translateX(${direction*16}px)`,opacity:0},{transform:'translate(0)',opacity:1}],{duration:240});}else main.querySelector<HTMLElement>(trigger)?.focus({preventScroll:true});
    }
  }
  dialogOpened(dialog:HTMLDialogElement){this.animate(dialog,[{transform:'scale(.975)',opacity:0},{transform:'scale(1)',opacity:1}],{duration:210});}
  closeDialog(dialog:HTMLDialogElement){
    if(this.closingDialog||!dialog.open)return;dialog.inert=true;dialog.classList.add('is-closing');const visual=getComputedStyle(dialog);const a=this.animate(dialog,[{transform:visual.transform,opacity:visual.opacity},{transform:'scale(.985)',opacity:0}],{duration:155});
    const finish=()=>{dialog.close();dialog.inert=false;dialog.classList.remove('is-closing');this.closingDialog=undefined;};if(a)this.closingDialog=a.finished.then(finish,finish);else finish();
  }
  private syncUI(){
    const toggle=document.querySelector<HTMLElement>('.sensory-toggle');if(toggle){toggle.setAttribute('aria-expanded',String(state.sensoryOpen));toggle.setAttribute('aria-label',`声音与触感，${modes[state.soundMode]}`);toggle.innerHTML=`${icon(state.soundMode==='off'?'sound-off':'sound',17)}<span>声音</span>`;toggle.dataset.enabled=String(state.soundMode!=='off');}
    const wasOpen=!this.panel.hidden;const previous=this.panelAnimation?.playState==='running'?this.panelAnimation:undefined,visual=wasOpen?{opacity:getComputedStyle(this.panel).opacity,transform:getComputedStyle(this.panel).transform}:undefined;previous?.cancel();this.panelAnimation=undefined;
    if(state.sensoryOpen){this.panel.hidden=false;this.panel.inert=false;if(!wasOpen||previous){this.panelAnimation=this.animate(this.panel,[visual??{opacity:0,transform:'translateY(-5px) scale(.98)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:190});this.panel.querySelector<HTMLElement>(`[data-mode="${state.soundMode}"]`)?.focus({preventScroll:true});}}
    else if(wasOpen){this.panel.inert=true;this.panelAnimation=this.animate(this.panel,[visual??{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-4px)'}],{duration:140});const a=this.panelAnimation;if(a)void a.finished.then(()=>{if(!state.sensoryOpen)this.panel.hidden=true;}).catch(()=>{});else this.panel.hidden=true;}
    this.panel.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(n=>{n.setAttribute('aria-pressed',String(n.dataset.mode===state.soundMode));n.disabled=!this.sound.report.supported&&n.dataset.mode!=='off';});
    const volume=this.panel.querySelector<HTMLInputElement>('#sound-level')!;if(document.activeElement!==volume)volume.value=String(state.soundLevel);this.panel.querySelector('#sound-value')!.textContent=`${state.soundLevel}%`;this.panel.querySelector('#sound-status')!.textContent=!this.sound.report.supported?'此设备无法播放音景':state.soundMode==='off'?'声音已关闭':this.sound.report.unlocked?'声音已开启 · 随对象变化':'点击声音模式开启';
  }
  private bind(){
    document.addEventListener('click',e=>{const summary=(e.target as HTMLElement).closest('summary'),detail=summary?.closest<HTMLDetailsElement>('details[data-detail]');if(!detail)return;this.sound.cue(detail.open?'close':'open');requestAnimationFrame(()=>{if(detail.open){const body=detail.querySelector('.disclosure-body');if(body)this.animate(body,[{opacity:.4,transform:'translateY(-4px)'},{opacity:1,transform:'translateY(0)'}],{duration:180});}});});
    document.addEventListener('keydown',e=>{document.body.dataset.input='keyboard';this.reticle.hidden=true;document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).forEach(a=>a.finish());if(e.key==='Escape'&&state.sensoryOpen){e.preventDefault();update({sensoryOpen:false});document.querySelector<HTMLElement>('.sensory-toggle')?.focus({preventScroll:true});}else if(e.key==='Escape'&&!document.querySelector('dialog[open]')){if(state.satelliteDrawer)update({satelliteDrawer:false});else if(state.celestialRecordsOpen)update({celestialRecordsOpen:false});}});
    document.addEventListener('pointerdown',e=>{document.body.dataset.input=e.pointerType==='touch'?'touch':'pointer';this.dragging=true;this.reticle.hidden=true;if(state.soundMode!=='off'&&!this.sound.report.unlocked)void this.sound.unlock().then(()=>this.syncUI());const range=(e.target as HTMLElement).closest('input[type="range"]');range?.closest('.experiment-panel,.object-tools,.time-track')?.classList.add('is-tuning');if(state.sensoryOpen&&!this.panel.contains(e.target as Node)&&!(e.target as HTMLElement).closest('.sensory-toggle'))update({sensoryOpen:false});});
    const release=()=>{this.dragging=false;document.querySelectorAll('.is-tuning').forEach(n=>n.classList.remove('is-tuning'));};document.addEventListener('pointerup',release);document.addEventListener('pointercancel',release);
    document.addEventListener('pointerover',e=>{
      if(e.pointerType!=='mouse'||!matchMedia('(hover:hover) and (pointer:fine)').matches)return;document.body.dataset.input='pointer';const target=(e.target as HTMLElement).closest<HTMLElement>('.object-deck>button,.nav-item');if(target&&!target.contains(e.relatedTarget as Node)){clearTimeout(this.hoverTimer);this.hoverTimer=window.setTimeout(()=>{if(target.matches(':hover')){this.report.hoverApproaches++;this.sound.cue('approach',(e.clientX/innerWidth-.5)*1.3,target.dataset.body??this.theme());}},110);}
    });
    document.addEventListener('pointerout',e=>{if(!(e.target as HTMLElement).closest('.object-deck>button,.nav-item')?.contains(e.relatedTarget as Node))clearTimeout(this.hoverTimer);});
    document.addEventListener('pointermove',e=>{
      if(e.pointerType==='mouse')document.body.dataset.input='pointer';const onCanvas=(e.target as HTMLElement).closest('#stage canvas');if(e.pointerType!=='mouse'||!onCanvas||this.dragging||!this.moving()){this.reticle.hidden=true;return;}
      this.cursor={x:e.clientX,y:e.clientY};this.reticle.hidden=false;if(!this.pointFrame)this.pointFrame=requestAnimationFrame(()=>{this.reticle.style.transform=`translate(${this.cursor.x-25}px,${this.cursor.y-25}px)`;this.pointFrame=0;});
    });
    document.addEventListener('input',e=>{const target=e.target as HTMLInputElement;if(target.id==='sound-level'){update({soundLevel:Number(target.value)});return;}if(target.type==='range'&&performance.now()-this.lastTick>95){this.lastTick=performance.now();this.sound.cue('tick');this.haptic(5);}});
    document.addEventListener('change',e=>{const target=e.target as HTMLInputElement;if(target.id==='haptic-setting')update({haptics:target.checked});});
    document.addEventListener('visibilitychange',()=>{this.reticle.hidden=true;clearTimeout(this.hoverTimer);if(this.pointFrame){cancelAnimationFrame(this.pointFrame);this.pointFrame=0;}void this.sound.visibility().then(()=>this.syncUI()).catch(()=>{});});
    reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches){this.fx.querySelectorAll('.interaction-flash,.motion-ghost').forEach(n=>n.remove());document.getAnimations().forEach(a=>{if(Number.isFinite(a.effect?.getComputedTiming().endTime))a.finish();else a.cancel();});this.reticle.hidden=true;}});
    this.bindDrawers();window.addEventListener('pagehide',()=>this.sound.dispose(),{once:true});
  }
  private bindDrawers(){
    let gesture:{panel:HTMLElement;header:HTMLElement;id:number;y:number;at:number;distance:number}|undefined;
    document.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'||(e.target as HTMLElement).closest('button,input,a'))return;const header=(e.target as HTMLElement).closest<HTMLElement>('.drawer-heading,.sat-panel-header'),panel=header?.closest<HTMLElement>('.space-records,.network-drawer');if(!header||!panel)return;gesture={panel,header,id:e.pointerId,y:e.clientY,at:performance.now(),distance:0};header.setPointerCapture(e.pointerId);});
    document.addEventListener('pointermove',e=>{if(!gesture||e.pointerId!==gesture.id)return;gesture.distance=Math.max(0,e.clientY-gesture.y);if(!reducedMotion.matches)gesture.panel.style.transform=`translateY(${gesture.distance*.75}px)`;});
    const end=(e:PointerEvent)=>{if(!gesture||e.pointerId!==gesture.id)return;const g=gesture;gesture=undefined;const dismiss=e.type!=='pointercancel'&&(g.distance>75||(g.distance>24&&g.distance/(performance.now()-g.at)>.4));
      if(dismiss){this.report.gestureCloses++;this.sound.cue('close');this.haptic(10);this.gestureExit=true;update(g.panel.classList.contains('network-drawer')?{satelliteDrawer:false}:{celestialRecordsOpen:false});this.gestureExit=false;}
      else {const a=this.animate(g.panel,[{transform:g.panel.style.transform||'translateY(0)'},{transform:'translateY(0)'}],{duration:180});if(a)void a.finished.then(()=>g.panel.style.transform='').catch(()=>{});else g.panel.style.transform='';}};
    document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);
  }
  inspect(){return {...this.report,motion:this.motion.inspect(),audio:this.sound.inspect(),reducedMotion:reducedMotion.matches};}
}
