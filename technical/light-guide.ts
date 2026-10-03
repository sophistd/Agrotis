import {state,update,type LightGuideStep,type LightAnswer} from './model';
import {lightSpread,lightConditions,lightSources} from './light-spread';
const steps:LightGuideStep[]=['explore','predict','sun','transfer','complete'];
export const lightQuestion=()=>state.lightGuide?.step==='predict'||state.lightGuide?.step==='transfer';
export const lightLocked=()=>lightQuestion()&&!state.lightGuide?.revealed;
export function startLightGuide() {
 if(state.view!=='events'||state.eventPage!=='space'||state.moonGuide)return;
 const saved=state.lightGuide?.saved??{celestialSpin:state.celestialSpin,playing:state.playing};
 update({lightGuide:{step:'explore',answer:null,revealed:false,attempts:[],saved},lightDistance:1,celestialSpin:false,playing:false});
}
export function exitLightGuide(){if(state.lightGuide)update({...state.lightGuide.saved,lightGuide:null});}
export function moveLightReceiver(distance:number){
 if(!state.lightGuide||lightLocked()||!lightSpread(distance))return;
 update({lightDistance:distance});
}
export function advanceLightGuide(back=false){
 const guide=state.lightGuide;if(!guide||(!back&&lightLocked()))return;
 const step=steps[Math.max(0,Math.min(steps.length-1,steps.indexOf(guide.step)+(back?-1:1)))];
 update({lightGuide:{...guide,step,answer:null,revealed:false},...(['predict','transfer'].includes(step)?{lightDistance:1}:{})});
}
export function predictLightGuide(answer:string|undefined){
 const guide=state.lightGuide;
 const answers=guide?.step==='predict'?['half','quarter','same']:['third','ninth','same'];
 if(!guide||!lightLocked()||!answers.includes(answer??''))return;
 update({lightGuide:{...guide,answer:answer as LightAnswer}});
}
export function revealLightGuide(){
 const guide=state.lightGuide;if(!guide||!lightLocked()||!guide.answer)return;
 const step=guide.step as 'predict'|'transfer',targetDistance=step==='predict'?2:3;
 const previous=guide.attempts.find(a=>a.step===step);
 const attempt={step,targetDistance,answer:guide.answer,expected:step==='predict'?'quarter' as const:'ninth' as const,firstAnswer:previous?.firstAnswer??guide.answer,reveals:(previous?.reveals??0)+1};
 update({lightGuide:{...guide,revealed:true,attempts:[...guide.attempts.filter(a=>a.step!==step),attempt]},lightDistance:targetDistance});
}
export function lightGuideRecord(){return {
 kind:'teaching-model',modelVersion:'halo-light-spread/1',createdAt:new Date().toISOString(),
 step:state.lightGuide?.step,sourceModel:state.lightGuide&&['sun','transfer','complete'].includes(state.lightGuide.step)?'ideal-sun':'ideal-lamp',
 units:{distanceRatio:'dimensionless',sphereAreaRatio:'dimensionless',irradianceRatio:'dimensionless'},
 receiver:{area:'fixed small area',orientation:'normal to incoming light'},
 normalization:'Each source has its own r0 and E0; no absolute watt, metre or lux measurement',
 ...lightSpread(state.lightDistance),attempts:state.lightGuide?.attempts??[],
 model:'E/E0=(r0/r)^2 from conservation of fixed isotropic luminosity across sphere area 4*pi*r^2',
 conditions:lightConditions,sources:lightSources,
};}
