import {state,update} from './model';
import pair from '../data/mars-time-pair.json';
import {measureDisplacement,type PixelPoint,type MeasurementCalibration} from './mars-measure';
export type MarsPeriod='before'|'after';
export interface MarsGuide {
 step:'compare'|'measure'|'complete'; mode:'swipe'|MarsPeriod; activePoint:MarsPeriod;
 points:Record<MarsPeriod,PixelPoint|null>; images:Record<MarsPeriod,'loading'|'ready'|'error'>;
 imageAttempt:number; saved:{celestialSpin:boolean;playing:boolean};
}
export const marsPair=pair;
export const marsCalibration:MeasurementCalibration={width:pair.width,height:pair.height,scaleBarMeters:pair.scale.meters,scaleBarPixels:pair.scale.pixels,scaleBarPixelTolerance:pair.scale.pixelTolerance,startDate:pair.frames[0].date,endDate:pair.frames[1].date};
export const marsFrame=(period:MarsPeriod)=>pair.frames.find(f=>f.key===period)!;
export const marsReady=()=>state.marsGuide?.images.before==='ready'&&state.marsGuide.images.after==='ready';
export function marsMeasurement(){const g=state.marsGuide;return g?.points.before&&g.points.after&&marsReady()?measureDisplacement(g.points.before,g.points.after,marsCalibration,state.marsTolerance):null;}
let attempt=0;
export function startMarsGuide(){
 if(state.view!=='events'||state.eventPage!=='space'||state.moonGuide||state.lightGuide)return;
 const saved=state.marsGuide?.saved??{celestialSpin:state.celestialSpin,playing:state.playing};
 update({marsGuide:{step:'compare',mode:'swipe',activePoint:'before',points:{before:null,after:null},images:{before:'loading',after:'loading'},imageAttempt:++attempt,saved},marsReveal:50,marsTolerance:1,celestialSpin:false,playing:false});
}
export function exitMarsGuide(){if(state.marsGuide)update({...state.marsGuide.saved,marsGuide:null});}
export function advanceMarsGuide(back=false){
 const g=state.marsGuide;if(!g)return;
 if(back){update({marsGuide:{...g,step:g.step==='complete'?'measure':'compare',mode:g.step==='complete'?'before':'swipe',activePoint:'before'}});return;}
 if(!marsReady()||(g.step==='measure'&&!marsMeasurement()))return;
 if(g.step==='compare')update({marsGuide:{...g,step:'measure',mode:'before',activePoint:'before'}});
 else if(g.step==='measure')update({marsGuide:{...g,step:'complete',mode:'swipe'}});
}
export function setMarsMode(mode:string|undefined){const g=state.marsGuide;if(!g||!['swipe','before','after'].includes(mode??'')||(g.step==='measure'&&mode==='swipe'))return;update({marsGuide:{...g,mode:mode as MarsGuide['mode'],...(g.step==='measure'?{activePoint:mode as MarsPeriod}:{})}});}
export function setMarsReveal(value:number){if(state.marsGuide&&Number.isFinite(value)&&value>=0&&value<=100)update({marsReveal:value});}
export function setMarsTolerance(value:number){if(state.marsGuide&&Number.isFinite(value)&&value>=.5&&value<=5)update({marsTolerance:value});}
export function selectMarsPoint(which:string|undefined){const g=state.marsGuide;if(!g||g.step!=='measure'||!['before','after'].includes(which??''))return;update({marsGuide:{...g,activePoint:which as MarsPeriod,mode:which as MarsPeriod}});}
export function placeMarsPoint(point:PixelPoint){
 const g=state.marsGuide;if(!g||g.step!=='measure'||!marsReady()||![point.x,point.y].every(Number.isFinite)||point.x<0||point.x>pair.width||point.y<55||point.y>pair.height)return;
 // -- 顶部题签与比例尺不是地貌；图像坐标保留亚像素操作但不暗示亚像素精度 --------
 update({marsGuide:{...g,points:{...g.points,[g.activePoint]:{x:point.x,y:point.y}}}});
}
export function resetMarsMeasurement(){const g=state.marsGuide;if(g)update({marsGuide:{...g,points:{before:null,after:null},activePoint:'before',...(g.step==='complete'?{step:'measure' as const}:{}),mode:'before'}});}
export function retryMarsImages(){const g=state.marsGuide;if(g)update({marsGuide:{...g,images:{before:'loading',after:'loading'},imageAttempt:++attempt}});}
export function marsImageStatus(which:MarsPeriod,status:'ready'|'error',version:number){const g=state.marsGuide;if(!g||g.imageAttempt!==version||g.images[which]===status)return;update({marsGuide:{...g,images:{...g.images,[which]:status}}});}
export function marsGuideRecord(){return {
 kind:'manual-image-measurement',version:'halo-mars-time/1',createdAt:new Date().toISOString(),sampleId:pair.id,
 observation:pair,calibration:marsCalibration,points:state.marsGuide?.points??null,pointTolerancePixels:state.marsTolerance,
 result:marsMeasurement(),frameReadiness:state.marsGuide?.images??null,
 interpretation:'User-selected apparent displacement on registered publication images; not an official migration measurement, wind speed, sand-grain trajectory or current Mars state',
 uncertainty:'Interval covers picking and scale-bar reading only. Total registration/orthorectification uncertainty is unknown, not zero.',
 formula:{distance:'hypot(dx,dy) * scaleBarMeters / scaleBarPixels',interval:'[max(0,d-2r)*M/(L+e), (d+2r)*M/(L-e)]',apparentAnnualRate:'distanceMeters * 365.25 / elapsedDays'},
 units:{points:'native image pixels',distance:'m',elapsed:'Earth days',apparentRate:'m per 365.25 Earth days'},
 };}
