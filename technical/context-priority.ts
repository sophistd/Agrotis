import {state} from './model';
import {orbitalRecord,orbitState,displayName} from './orbits';
import {escape} from './format';
import {icon} from './icons';
type Signal={key:string;tone:'warning'|'info';title:string;detail:string;action:string;label:string};
function currentSignal():Signal|undefined{
 const network=(state.view==='overview'&&state.orbitMode==='public')||(state.view==='satellites'&&state.satellitePage==='network');
 if(state.structureLoad.startsWith('模型尚未公开')&&state.view==='satellites'&&state.satellitePage==='structure')return {key:'structure/license',tone:'warning',title:'此模型尚未公开提供',detail:'再分发许可待核实；轨道资料仍可查看。',action:'satellite-page',label:'查看轨道'};
 if(state.celestialLoad.startsWith('模型尚未公开')&&state.view==='events'&&state.eventPage==='space')return {key:'celestial/license',tone:'warning',title:'此模型尚未公开提供',detail:'再分发许可待核实；原始来源与观测资料仍可阅读。',action:'celestial-source',label:'查看来源'};
 if(network&&!state.observationFocus&&(state.view!=='overview'||!!state.observerPosition)){const r=orbitalRecord(state.activeNorad);if(r&&!orbitState(r,state.orbitAt)){const expired=Math.abs(state.orbitAt-Date.parse(r.epoch))>72*3600000,nowValid=!!orbitState(r,Date.now());return {key:(expired?'expired/':'unavailable/')+r.norad_id,tone:'warning',title:expired?'这个时刻的轨道不能可靠展示':'这颗卫星的位置暂时无法推算',detail:displayName(r)+(expired?'的元素已超出 ±72 小时展示窗口；已停止位置展示。':'的元素未能生成有效位置；已停止位置展示。'),action:nowValid?'reset':'refresh-orbits',label:nowValid?'回到当前时间':'更新轨道元素'};}}
 if(state.view==='satellites'&&state.satellitePage==='structure'&&state.structureLoad.startsWith('模型暂未'))return {key:'structure/'+state.activeNorad,tone:'warning',title:'所选卫星模型没有加载成功',detail:'轨道资料仍可查看；恢复模型后继续旋转与缩放。',action:'structure-retry',label:'重新加载'};
 if(!state.moonGuide&&!state.lightGuide&&!state.marsGuide&&state.view==='events'&&state.eventPage==='space'&&state.celestialLoad.startsWith('模型暂未'))return {key:'celestial/'+state.celestialBody,tone:'warning',title:'当前对象的三维模型没有加载成功',detail:'原始数据与观测记录仍可阅读。',action:'home',label:'重试模型'};
 if(network&&state.orbitStatus)return {key:'source/'+state.orbitStatus,tone:'info',title:state.orbitStatus.startsWith('部分')?'部分轨道来源暂时未更新':'目前使用保留的轨道快照',detail:state.orbitStatus+'；元素有效窗口仍逐颗核对。',action:'orbit-source',label:'查看数据依据'};
 return undefined;
}
export class ContextPriority{
 private slot=document.createElement('aside');private key='';
 readonly report={changes:0,warningEntries:0};
 constructor(private enter:(node:Element)=>void){this.slot.id='context-signal';this.slot.className='context-signal';this.slot.hidden=true;document.querySelector('#app')!.insertBefore(this.slot,document.querySelector('#content'));}
 sync(){const signal=currentSignal(),key=signal?.key??'';if(key===this.key)return;this.key=key;this.report.changes++;document.body.dataset.attention=signal?.tone??'quiet';this.slot.hidden=!signal;
  if(!signal){this.slot.innerHTML='';return;}
  this.slot.dataset.tone=signal.tone;this.slot.setAttribute('role',signal.tone==='warning'?'alert':'status');
  this.slot.innerHTML=`<span class="signal-mark">${icon('info',21)}</span><div><strong>${escape(signal.title)}</strong><p>${escape(signal.detail)}</p><button data-action="${signal.action}" ${signal.key==='structure/license'?'data-page="network"':''}>${escape(signal.label)} ${icon('arrow',16)}</button></div>`;
  if(signal.tone==='warning'){this.report.warningEntries++;this.enter(this.slot);}
 }
 inspect(){return {...this.report,key:this.key,visible:!this.slot.hidden,tone:this.slot.dataset.tone};}
}
