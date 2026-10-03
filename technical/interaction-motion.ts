type Animate=(node:Element,frames:Keyframe[],options:KeyframeAnimationOptions)=>Animation|undefined;
const groups=[
  ['primary','.topbar nav','.active',3],
  ['satellite','.satellite-modes','.selected',0],
  ['object-mode','.space-mode','.active',0],
  ['objects','.object-deck','.selected',0],
  ['structure','.structure-switcher','.selected',0],
  ['payload','.segmented','.selected',0],
] as const;
type Selection={box:DOMRect;identity:string;moving:boolean};
export class InteractionMotion {
  readonly report={selectionMoves:0,iconChanges:0,modelReveals:0};
  private previous=new Map<string,Selection>();
  private waiting=new Map<string,string>();
  constructor(private animate:Animate){window.addEventListener('resize',()=>this.layout(false));}
  capture(){
    this.previous.clear();
    for(const [key,selector,selected] of groups){const group=document.querySelector(selector),bar=group?.querySelector('.motion-indicator'),target=group?.querySelector<HTMLElement>(selected);if(bar&&target)this.previous.set(key,{box:bar.getBoundingClientRect(),identity:JSON.stringify(target.dataset),moving:bar.getAnimations().some(a=>a.playState==='running')});}
  }
  layout(transition=true){
    for(const [key,selector,selected,bottom] of groups){
      const group=document.querySelector<HTMLElement>(selector),target=group?.querySelector<HTMLElement>(selected);if(!group||!target)continue;
      group.classList.add('has-motion-indicator');const box=target.getBoundingClientRect(),parent=group.getBoundingClientRect();
      let bar=group.querySelector<HTMLElement>('.motion-indicator');if(!bar){bar=document.createElement('span');bar.className='motion-indicator';bar.setAttribute('aria-hidden','true');group.append(bar);}
      bar.getAnimations().forEach(a=>a.cancel());const x=box.left-parent.left-group.clientLeft;
      Object.assign(bar.style,{width:box.width+'px',bottom:(key==='structure'?parent.bottom-box.bottom:bottom)+'px',transform:`translateX(${x}px)`});
      const old=this.previous.get(key);if(!transition||!old||(old.identity===JSON.stringify(target.dataset)&&!old.moving))continue;
      const y=bar.getBoundingClientRect().top-old.box.top;
      const frames=Math.abs(y)<32?[{transform:`translateX(${old.box.left-parent.left-group.clientLeft}px) scaleX(${old.box.width/box.width})`},{transform:`translateX(${x}px) scaleX(1)`}]:[{opacity:.3},{opacity:1}];
      if(this.animate(bar,frames,{duration:220,easing:'cubic-bezier(.32,.72,0,1)'}))this.report.selectionMoves++;
    }
  }
  swapIcon(button:Element,html:string){
    button.querySelectorAll('.motion-icon-out').forEach(n=>n.remove());const old=button.querySelector('svg')?.cloneNode(true) as SVGElement|undefined;
    button.innerHTML=html;const fresh=button.querySelector('svg');if(!old||!fresh)return;
    old.classList.add('motion-icon-out');old.setAttribute('aria-hidden','true');old.setAttribute('focusable','false');button.append(old);
    const out=this.animate(old,[{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.92)'}],{duration:120});
    const incoming=this.animate(fresh,[{opacity:0,transform:'scale(.92)'},{opacity:1,transform:'scale(1)'}],{duration:160});
    if(incoming)this.report.iconChanges++;if(out)void out.finished.then(()=>old.remove(),()=>old.remove());else old.remove();
  }
  modelStatus(kind:string,loading:boolean,ready:boolean){
    const stage=document.querySelector<HTMLElement>('#stage')!;stage.setAttribute('aria-busy',String(loading));
    const identity=[document.body.dataset.view,document.body.dataset.satellitePage,document.body.dataset.celestialBody,document.querySelector('.structure-heading .mission-label')?.textContent].join('/');
    if(loading){this.waiting.set(kind,identity);return;}
    const pending=this.waiting.get(kind);this.waiting.delete(kind);if(pending!==identity||!ready)return;
    if(this.animate(stage,[{opacity:.45},{opacity:1}],{duration:240}))this.report.modelReveals++;
  }
  inspect(){return {...this.report};}
}
