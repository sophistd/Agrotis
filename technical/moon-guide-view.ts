import {brand} from './brand';
import {state} from './model';
import {phaseAt,phaseKind,phasePath,type PhaseKind} from './moon-phase';
import {celestialObjects} from './celestial-objects';
import {icon} from './icons';
import {escape} from './format';
import './moon-guide.css';

const labels:Record<PhaseKind,string>={crescent:'一弯',half:'一半',gibbous:'大半'};
const steps=['explore','moon','predict','transfer','complete'] as const;
const button=(action:string,label:string,extra='',className='ghost-button')=>`<button class="${className}" data-action="moon-guide-${action}" ${extra}>${label}</button>`;
const isQuestion=()=>state.moonGuide?.step==='predict'||state.moonGuide?.step==='transfer';
const isLocked=()=>isQuestion()&&!state.moonGuide?.revealed;

function appearance(){
  const step=state.moonGuide?.step;
  if(step==='explore')return '橘子外观 · 理想球体';
  if(step==='transfer')return '陌生球体 · 几何示意';
  return state.moonGuideTexture==='ready'?'真实月面素材 · 理想球体':state.moonGuideTexture==='error'?'月面素材未加载 · 中性球体示意':'中性球体 · 月面素材准备中';
}

function observerDiagram(){
  const guide=state.moonGuide!;
  const {observer}=phaseAt(state.moonGuideAngle),x=100+observer[0]*49,y=94-observer[2]*49;
  const target=phaseAt(guide.targetAngle).observer,tx=100+target[0]*49,ty=94-target[2]*49;
  return `<svg viewBox="0 0 200 164" aria-hidden="true" class="moon-guide-diagram"><defs><marker id="moon-guide-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0L5 2.5L0 5" fill="#B8BCC2"/></marker></defs><circle cx="100" cy="94" r="49" fill="none" stroke="#55585d" stroke-dasharray="2 5"/><circle cx="100" cy="94" r="15" fill="#303236"/><path d="M85 94 A15 15 0 0 1 115 94Z" fill="#ddd"/><circle cx="100" cy="13" r="5" fill="#fff"/><text x="114" y="17">灯 / 太阳</text><path d="M100 27V65" stroke="#B8BCC2" marker-end="url(#moon-guide-arrow)"/><text x="122" y="98">球</text><line id="moon-guide-sightline" x1="${x}" y1="${y}" x2="100" y2="94" stroke="#aaa" stroke-width="1"/>${isQuestion()?`<circle cx="${tx}" cy="${ty}" r="9" fill="none" stroke="#fff" stroke-dasharray="3 3"/><text x="${tx>100?tx+12:tx-35}" y="${ty+4}">目标</text>`:''}<circle id="moon-guide-observer" cx="${x}" cy="${y}" r="5" fill="#fff" stroke="#000" stroke-width="2"/><text id="moon-guide-observer-label" x="${x+9}" y="${y-9}">你</text><text x="100" y="159" text-anchor="middle">从上方看 · 距离不按比例</text></svg>`;
}

function question(){
  const guide=state.moonGuide!;
  const result=phaseKind(guide.targetAngle),correct=guide.answer===result;
  return `<fieldset class="moon-guide-choices"><legend>到了虚线标记的位置，会看见多少亮面？<span class="sr-only">目标观察位置 ${guide.targetAngle} 度；0 度是光源方向，180 度是背光方向。</span></legend>${(Object.keys(labels) as PhaseKind[]).map(kind=>button('predict',labels[kind],`data-answer="${kind}" aria-pressed="${guide.answer===kind}" ${guide.revealed?'disabled':''}`,'control-button')).join('')}</fieldset>${guide.revealed?`<div id="moon-guide-feedback" class="moon-guide-feedback" role="status"><strong>${correct?'你找到了这段关系。':'让这个结果，修正一次直觉。'}</strong><p>目标位置看见${result?labels[result]:'完整或全暗的'}亮面。${guide.step==='transfer'?'换了外观，光源、球体与你的关系仍然成立。':'球体始终有一半朝着光；你只看到了其中一部分。'}</p></div>`:`<p class="moon-guide-feedback" id="moon-guide-feedback">${guide.answer?'预测已经选好。现在亲眼核对。':'先选一个直觉，再揭晓；没有计分。'}</p>${button('reveal','移动到目标，揭晓 '+icon('arrow',16),guide.answer?'':'disabled')}`}`;
}

function copy(){
  switch(state.moonGuide!.step){
    case 'explore':return {title:'怎样让一颗橘子，\n变成一弯月亮？',description:'灯和球都不动。挪动你的位置，看看亮面怎样变化。',next:'把这个发现带到月球'};
    case 'moon':return {title:'换了一个世界。\n刚才的关系还在。',description:'表面换成月面，光源与观察位置的关系保持不变。试着再做出一弯月亮。',next:'先猜一次，再看结果'};
    case 'predict':return {title:'还没过去，\n能先知道会看见什么吗？',description:'小图里的虚线圆，标出了下一处观察位置。',next:'换一颗球，再试一次'};
    case 'transfer':return {title:'没有熟悉的月海。\n你还能认出这段关系吗？',description:'这是一颗没有身份的教学球体。用刚才的发现，预测另一个位置。',next:'把这个发现带回夜空'};
    case 'complete':return {title:'月亮没有少。\n是你看见的亮面变了。',description:'从掌心到夜空，留下同一个问题：谁在照亮它，我又站在哪里？',next:'回到我的月球现场'};
  }
}

export function moonGuideView(){
  if(!state.moonGuide)return '';
  const guide=state.moonGuide,c=copy(),index=steps.indexOf(guide.step),locked=isLocked();
  return `<section class="moon-guide" aria-label="掌心里的月亮引导"><header class="moon-guide-header"><div><span class="mission-label">${brand.english.toUpperCase()} / A CHANGE OF VIEW</span><h1>掌心里的月亮</h1></div>${button('exit',icon('close',16)+'退出引导','','tool-link')}</header><div class="moon-guide-scene-note"><span id="moon-guide-appearance">${appearance()}</span><span>演示照明 · 非当日月相</span></div><article class="moon-guide-card"><div class="moon-guide-progress" aria-label="第 ${index+1} 步，共 5 步"><span>0${index+1} / 05</span><div aria-hidden="true">${steps.map((_,i)=>`<i class="${i<=index?'done':''}"></i>`).join('')}</div><small>按自己的节奏</small></div><h2 id="moon-guide-heading" tabindex="-1">${c.title.replace('\n','<br>')}</h2><p class="moon-guide-description">${c.description}</p>${isQuestion()?question():''}<div class="moon-guide-observe ${locked?'is-locked':''}"><div class="moon-guide-position"><label for="moon-guide-angle">挪动观察位置</label><output id="moon-guide-angle-value" for="moon-guide-angle">${Math.round(state.moonGuideAngle)}°</output></div><input id="moon-guide-angle" type="range" min="0" max="360" step="1" value="${state.moonGuideAngle}" ${locked?'disabled':''} aria-describedby="moon-guide-angle-help"><div class="moon-guide-range-labels" aria-hidden="true"><span>0°</span><span>绕球一周</span><span>360°</span></div><p id="moon-guide-angle-help">${locked?'先做出预测并揭晓，之后可以自由挪动。':'拖动滑块；也可用方向键微调，Home / End 到两端。'}</p></div><div class="moon-guide-relation"><div id="moon-guide-observer-diagram" role="img" aria-label="俯视示意：光源固定，观察者绕球移动">${observerDiagram()}</div><div class="moon-guide-result"><svg viewBox="-50 -50 100 100" aria-hidden="true"><circle r="40" fill="#25272a"/><path id="moon-guide-phase-path" d="${phasePath(state.moonGuideAngle)}" fill="#eee"/></svg><span>此刻看到的轮廓</span><p id="moon-guide-observation"></p></div></div>${guide.step==='complete'?'<p class="moon-guide-takeaway">下次看月亮，试着找太阳在哪一边。<small>普通月相不是地球的影子；地球遮住阳光是月食。</small></p>':''}<div class="moon-guide-actions">${index>0?button('back',icon('arrow',14)+'上一步','','tool-link moon-guide-back'):''}${button(guide.step==='complete'?'exit':'next',c.next+icon('arrow',16),locked?'disabled':'')}</div><footer class="moon-guide-footer">${button('source','为什么可信 '+icon('external',13),'','tool-link')}${guide.step==='complete'?button('export','保存这次探索','','tool-link')+button('retry','再试一遍','','tool-link'):''}<span id="moon-guide-texture-status">${textureStatus()}</span></footer></article></section>`;
}

function textureStatus(){
  if(state.moonGuide?.step==='explore'||state.moonGuide?.step==='transfer')return '';
  return state.moonGuideTexture==='error'?`月面素材暂不可用。${button('texture-retry','重试','','tool-link')}`:state.moonGuideTexture==='loading'?'正在加载月面素材…':'';
}

/** 连续参数只改稳定节点，保留拖动与键盘焦点；阶段和预测交给整体视图重绘。 */
export function moonGuideReadouts(){
  if(!state.moonGuide)return;
  const angle=state.moonGuideAngle,{observer,fraction}=phaseAt(angle),kind=phaseKind(angle);
  const x=100+observer[0]*49,y=94-observer[2]*49;
  const value=document.getElementById('moon-guide-angle-value');if(value)value.textContent=`${Math.round(angle)}°`;
  const range=document.getElementById('moon-guide-angle') as HTMLInputElement|null;
  if(range){if(document.activeElement!==range)range.value=String(angle);range.setAttribute('aria-valuetext',`${Math.round(angle)} 度`);}
  const dot=document.getElementById('moon-guide-observer');dot?.setAttribute('cx',String(x));dot?.setAttribute('cy',String(y));
  const line=document.getElementById('moon-guide-sightline');line?.setAttribute('x1',String(x));line?.setAttribute('y1',String(y));
  document.getElementById('moon-guide-observer-diagram')?.setAttribute('aria-label',`俯视关系：光源位于 0 度方向，你在 ${Math.round(angle)} 度位置。${isQuestion()?`目标位置 ${state.moonGuide.targetAngle} 度。`:''}距离不按比例。`);
  const label=document.getElementById('moon-guide-observer-label');label?.setAttribute('x',String(x+9));label?.setAttribute('y',String(y-9));
  document.getElementById('moon-guide-phase-path')?.setAttribute('d',phasePath(angle));
  const observation=document.getElementById('moon-guide-observation');if(observation)observation.textContent=kind?`${labels[kind]}亮面`:fraction>.5?'完整亮面':'亮面背向你';
  const identity=document.getElementById('moon-guide-appearance');if(identity)identity.textContent=appearance();
  const status=document.getElementById('moon-guide-texture-status');if(status){const html=textureStatus();if(status.innerHTML!==html)status.innerHTML=html;}
}

export function moonGuideSource(){
  const moon=celestialObjects.moon;
  return `<div class="dialog-heading"><div class="eyebrow">ONE RELATION / THREE APPEARANCES</div><h2>掌心里的月亮 · 依据与边界</h2><p>一盏灯、一颗球、一个观察者。外观可以更换，受光几何不随之改变。</p></div><dl class="spec-list"><div><dt>几何前提</dt><dd>理想球体，固定平行光，正交投影，忽略遮挡与其他光源；观察者绕球运动。熟悉的灯要离球足够远，才可近似平行光。没有调用当前星历。</dd></div><div><dt>橘子与陌生球体</dt><dd>程序生成的教学外观，不是实拍、测量或已发现天体。</dd></div><div><dt>月面外观</dt><dd>${escape(moon.credit)}。真实月面素材映射到理想球体；材质明暗不作光度测量。</dd></div><div><dt>可计算的关系</dt><dd>设光源与观察者在球心的夹角为 α，受照圆盘面积比例 f = (1 + cos α) / 2。这是面积比例，不是亮度或温度。实际画面也受月面外观与显示映射影响。</dd></div><div><dt>如何读角度</dt><dd>0° 朝向光源一侧，180° 位于背光一侧，360° 回到起点。小图为俯视关系示意，大小与距离不按比例。</dd></div><div><dt>这里没有模拟什么</dt><dd>月食、潮汐锁定、真实轨道及特定日期的月相。普通月相并非地球影子遮住月球。</dd></div></dl><div class="moon-guide-source-links"><a class="ghost-button" href="https://science.nasa.gov/moon/moon-phases/" target="_blank" rel="noopener">NASA · 月相如何形成 ${icon('external',16)}</a><a class="tool-link" href="${escape(moon.source)}" target="_blank" rel="noopener">月面素材来源 ${icon('external',14)}</a></div>`;
}
