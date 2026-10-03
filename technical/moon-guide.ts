import {state,update,type MoonGuideStep} from './model';
import {phaseAt,phaseKind,type PhaseKind} from './moon-phase';
const steps:MoonGuideStep[]=['explore','moon','predict','transfer','complete'];
export function startMoonGuide() {
  if(state.view!=='events'||state.eventPage!=='space'||state.celestialBody!=='moon')return;
  const saved=state.moonGuide?.saved??{celestialMode:state.celestialMode,celestialSpin:state.celestialSpin,celestialWire:state.celestialWire,celestialEffects:state.celestialEffects,celestialLight:state.celestialLight,celestialRecordsOpen:state.celestialRecordsOpen};
  update({moonGuide:{step:'explore',answer:null,revealed:false,targetAngle:120,attempts:[],saved},moonGuideAngle:65,playing:false});
}
export function exitMoonGuide() {if(state.moonGuide)update({...state.moonGuide.saved,moonGuide:null});}
export function moveMoonObserver(degrees:number) {
  const guide=state.moonGuide;
  if(!guide||!Number.isFinite(degrees)||(['predict','transfer'].includes(guide.step)&&!guide.revealed))return;
  update({moonGuideAngle:Math.max(0,Math.min(360,degrees))});
}
export function advanceMoonGuide(back=false) {
  const guide=state.moonGuide;if(!guide)return;
  if(!back&&['predict','transfer'].includes(guide.step)&&!guide.revealed)return;
  const step=steps[Math.max(0,Math.min(steps.length-1,steps.indexOf(guide.step)+(back?-1:1)))];
  update({moonGuide:{...guide,step,answer:null,revealed:false,targetAngle:step==='transfer'?300:120},...(step==='transfer'?{moonGuideAngle:120}:step==='predict'?{moonGuideAngle:65}:{})});
}
export function predictMoonGuide(answer:string|undefined) {
  const guide=state.moonGuide;
  if(!guide||guide.revealed||!['predict','transfer'].includes(guide.step)||!['crescent','half','gibbous'].includes(answer??''))return;
  update({moonGuide:{...guide,answer:answer as PhaseKind}});
}
export function revealMoonGuide() {
  const guide=state.moonGuide;
  if(!guide||!guide.answer||guide.revealed||!['predict','transfer'].includes(guide.step))return;
  const previous=guide.attempts.find(a=>a.step===guide.step);
  const attempt={step:guide.step as 'predict'|'transfer',targetAngle:guide.targetAngle,answer:guide.answer,expected:phaseKind(guide.targetAngle),firstAnswer:previous?.firstAnswer??guide.answer,reveals:(previous?.reveals??0)+1};
  update({moonGuide:{...guide,revealed:true,attempts:[...guide.attempts.filter(a=>a.step!==guide.step),attempt]},moonGuideAngle:guide.targetAngle});
}
export function moonGuideRecord() {
  const guide=state.moonGuide;
  return {kind:'teaching-model',modelVersion:'halo-moon-phase/1',createdAt:new Date().toISOString(),
    geometry:'Ideal sphere, parallel light +z, orthographic projection, observer=(sin(theta),0,cos(theta))',
    units:{angle:'deg',illuminatedProjectedAreaFraction:'dimensionless'},observerAngle:state.moonGuideAngle,...phaseAt(state.moonGuideAngle),
    attempts:guide?.attempts??[],
    question:guide&&guide.revealed?{targetAngle:guide.targetAngle,answer:guide.answer,expected:phaseKind(guide.targetAngle)}:null,
    sources:['https://science.nasa.gov/moon/moon-phases/','https://svs.gsfc.nasa.gov/14959/'],
    limits:['受照圆盘面积比例，不是亮度或光度','月面影像是外观素材，球体几何不是LRO地形','不表示当前月相、日期星历或月食','普通月相不需要地球挡住太阳光']};
}
