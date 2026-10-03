import {state} from './model';
import {lightSpread,lightRatioLabel,lightConditions,lightSources} from './light-spread';
import {lightQuestion,lightLocked} from './light-guide';
import {icon} from './icons';
import './light-guide.css';
const steps=['explore','predict','sun','transfer','complete'] as const;
const button=(action:string,label:string,extra='',cls='ghost-button')=>`<button class="${cls}" data-action="light-guide-${action}" ${extra}>${label}</button>`;
const solar=()=>!!state.lightGuide&&['sun','transfer','complete'].includes(state.lightGuide.step);
const labels={half:'1/2',quarter:'1/4',same:'不变',third:'1/3',ninth:'1/9'};
function diagram(){
 const r=state.lightDistance,radius=38*r,x=230+radius;
 const source=solar()?'<circle cx="230" cy="185" r="13" fill="#fff"/><circle cx="230" cy="185" r="20" fill="none" stroke="#999"/>':'<path d="M224 193a12 12 0 1 1 12 0l-2 7h-8z" fill="#fff"/><path d="M225 204h10m-8 5h6" stroke="#fff" stroke-width="2"/>';
 return `<svg viewBox="0 0 520 390" role="img" aria-label="${solar()?'理想太阳':'理想灯光'}：距离${r.toFixed(1)}倍；球面分摊示意，固定接收面"><g fill="none" stroke="#62656b"><circle cx="230" cy="185" r="${radius}"/><ellipse cx="230" cy="185" rx="${radius}" ry="${radius*.31}"/><ellipse cx="230" cy="185" rx="${radius*.32}" ry="${radius}"/></g>${r>1?'<circle cx="230" cy="185" r="38" fill="none" stroke="#555" stroke-dasharray="3 5"/>':''}<path d="M230 185H${x}" stroke="#aaa" stroke-dasharray="3 5"/>${source}<path d="M${x} 170v30" stroke="#fff" stroke-width="4"/><text x="${x+12}" y="178">接收面</text><text x="${x+12}" y="198">面积不变</text><path d="M230 355H${x}M230 350v10M${x} 350v10" stroke="#888"/><text x="${230+radius/2}" y="341" text-anchor="middle">${r.toFixed(1)} × 距离</text><text x="28" y="30">同一份光，向外分摊</text></svg>`;
}
const copy={
 explore:{title:'把接收面，拉远一点。',text:'想象一盏向四周均匀发光的小灯。光源不变，这块接收面的大小和朝向也不变。只改变距离。',next:'先猜一个新位置'},
 predict:{title:'走到两倍远，会收到多少？',text:'从起点走到 2 倍远，同样大小的一块表面，每秒收到的光能会变成多少？先选，再揭晓。',next:'把目光移向太阳'},
 sun:{title:'换成太阳，这个关系还在。',text:'把太阳近似为远处的点光源。用同一个距离倍数试一试；各自起点都记为 1，不表示灯与太阳的绝对光能相等。',next:'用发现预测一次'},
 transfer:{title:'再走远一点：这次是三倍。',text:'太阳光度不变。在真空中，把同一块正对太阳的小接收面从起点移到 3 倍远。每秒收到的光能，会变成多少？',next:'带走这个发现'},
 complete:{title:'光没有变少，分给了更大的地方。',text:'距离变成几倍，球面面积就变成它的平方倍。同样大小的接收面，只收到其中更小的一份。',next:'返回原来的探索'},
};
export function lightGuideView(){
 const guide=state.lightGuide!,index=steps.indexOf(guide.step),c=copy[guide.step],locked=lightLocked();
 const options=guide.step==='predict'?['half','quarter','same'] as const:['third','ninth','same'] as const;
 const expected=guide.step==='predict'?'quarter':'ninth';
 return `<section class="light-guide" aria-label="光越走越散"><header class="light-guide-header"><div><p class="mission-label">FROM A LAMP / TO THE SUN</p><h1>光越走越散</h1></div>${button('exit','退出探索 '+icon('close',16),'','tool-link')}</header><div class="light-guide-workspace"><figure class="light-guide-scene"><div id="light-guide-diagram">${diagram()}</div><figcaption>${solar()?'太阳的理想点源近似':'理想小灯 · 各向均匀发光'}<span>教学几何 · 非观测 · 图标大小不按比例</span></figcaption></figure><article class="light-guide-card"><div class="light-guide-progress">0${index+1} / 05 <span>一个关系，两种尺度</span></div><h2 id="light-guide-heading" tabindex="-1">${c.title}</h2><p>${c.text}</p>${lightQuestion()?`<fieldset class="light-guide-choices"><legend>相对于各自起点，你的预测</legend>${options.map(a=>button('predict',labels[a],`data-answer="${a}" aria-pressed="${guide.answer===a}" ${guide.revealed?'disabled':''}`)).join('')}</fieldset>${button('reveal','揭晓，移动接收面',!guide.answer||guide.revealed?'disabled':'')}${guide.revealed?`<div class="light-guide-feedback" role="status"><strong>${guide.answer===expected?'你用对了这个关系。':'先看分摊面积，再看接收量。'}</strong><p>距离 ${guide.step==='predict'?2:3} 倍，球面面积 ${guide.step==='predict'?4:9} 倍，固定接收面收到起点的 ${labels[expected]}。${guide.answer!==expected?`你选的是「${labels[guide.answer!]}」。`:''}</p></div>`:'<p class="light-guide-feedback">先保留起点画面；选好后再揭晓目标位置。</p>'}`:''}<div class="light-guide-control"><label for="light-guide-distance">${locked?'起点距离 · 揭晓后可操作':'把接收面移到'}<output id="light-guide-distance-value" for="light-guide-distance">${state.lightDistance.toFixed(1)} ×</output></label><input id="light-guide-distance" type="range" min="1" max="4" step="0.1" value="${state.lightDistance}" ${locked?'disabled':''} aria-describedby="light-guide-control-help"><div class="light-guide-ticks"><span>1 ×</span><span>2 ×</span><span>3 ×</span><span>4 ×</span></div><p id="light-guide-control-help">面积固定、正对光源；可用方向键微调，Home / End 到两端。</p></div><div class="light-guide-quantities"><div><small>球面分摊面积</small><strong id="light-guide-area"></strong><span>相对起点</span></div><div><small>单位面积每秒收到</small><strong id="light-guide-received"></strong><div class="light-guide-meter" aria-hidden="true"><i id="light-guide-meter"></i></div></div></div><p class="light-guide-normalization">每种光源各自从 1 开始。条长表示接收比例，不模拟肉眼明暗。</p>${guide.step==='complete'?'<p class="light-guide-takeaway">两倍远，四分之一；三倍远，九分之一。<small>灯罩、遮挡、大气或倾斜接收面都会改变条件。它们共享理想传播规律，不是灯造成太阳的变化。</small></p>':''}<div class="light-guide-actions">${index>0?button('back','上一步','','tool-link'):''}${button(guide.step==='complete'?'exit':'next',c.next+icon('arrow',16),locked?'disabled':'')}</div><footer>${button('source','成立条件与来源 '+icon('external',13),'','tool-link')}${guide.step==='complete'?button('export','保存这次探索','','tool-link')+button('retry','再试一遍','','tool-link'):''}</footer><p class="sr-only" id="light-guide-live" role="status"></p></article></div></section>`;
}
export function lightGuideReadouts(){
 if(!state.lightGuide)return;
 const r=state.lightDistance,value=lightSpread(r)!;
 const text=(id:string,s:string)=>{const n=document.getElementById(id);if(n)n.textContent=s;};
 text('light-guide-distance-value',`${r.toFixed(1)} ×`);text('light-guide-area',`${value.sphereAreaRatio.toFixed(2)} ×`);text('light-guide-received',lightRatioLabel(r));
 const meter=document.getElementById('light-guide-meter');if(meter)meter.style.width=`${100*value.irradianceRatio}%`;
 const range=document.getElementById('light-guide-distance') as HTMLInputElement|null;
 if(range){if(document.activeElement!==range)range.value=String(r);range.setAttribute('aria-valuetext',`${r.toFixed(1)}倍距离；接收量为起点的${lightRatioLabel(r)}`);}
 const scene=document.getElementById('light-guide-diagram');if(scene)scene.innerHTML=diagram();
}
export function announceLightGuide(){const n=document.getElementById('light-guide-live');if(n&&state.lightGuide&&!lightLocked())n.textContent=`距离${state.lightDistance.toFixed(1)}倍，分摊面积${(state.lightDistance**2).toFixed(2)}倍，接收量为起点的${lightRatioLabel(state.lightDistance)}。`;}
export function lightGuideSource(){return `<div class="dialog-heading"><div class="eyebrow">CONSERVATION / SPHERICAL SPREAD</div><h2>光越走越散 · 成立条件与来源</h2><p>灯到太阳的对应来自相同的理想传播模型：固定光度分摊到球面。图形相似本身不是依据。</p></div><dl class="spec-list">${lightConditions.map((c,i)=>`<div><dt>${['光源','传播','接收面','归一化','边界'][i]}</dt><dd>${c}</dd></div>`).join('')}<div><dt>计算关系</dt><dd>球面面积 A = 4πr²；辐照度 E = L / (4πr²)。所以 A/A₀ = (r/r₀)²，E/E₀ = 1/(r/r₀)²。绝对 E 的单位为 W/m²；本体验只计算无量纲比值，未采集 W、m 或 lux。</dd></div><div><dt>常见反例</dt><dd>灯罩改变方向分布；激光近似准直不按这里的球面分摊；大气会吸收散射；倾斜接收面需考虑余弦投影。这里不推导温度、季节或行星实时轨道。</dd></div><div><dt>图像身份</dt><dd>程序绘制的球面二维投影，接收面的线段长度恒定。不是摄影、光线追踪或实测太阳图。科学条件核对日期：2026-10-01。</dd></div></dl><div class="light-guide-source-links">${lightSources.map((s,i)=>`<a class="ghost-button" href="${s}" target="_blank" rel="noopener">${i?'NASA JPL · 太空太阳能':'NASA · 电磁传播'} ${icon('external',14)}</a>`).join('')}</div>`;}
