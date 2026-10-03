import {state,update} from './model';
import {skyCatalog,validObserver,type ObserverPosition} from './observer-sky';
let requestVersion=0;
let memo:{position:ObserverPosition;at:number;revision:number;result:ReturnType<typeof skyCatalog>}|undefined;
export function currentSky(){
 const position=state.observerPosition;if(!position)return null;
 if(memo?.position===position&&memo.at===state.orbitAt&&memo.revision===state.orbitRevision)return memo.result;
 const result=skyCatalog(position,state.orbitAt);memo={position,at:state.orbitAt,revision:state.orbitRevision,result};return result;
}
function applyPosition(position:ObserverPosition){
 if(!validObserver(position)){update({observerStatus:'error',observerMessage:'位置数值不在可计算范围内，请手动设置。'});return false;}
 requestVersion++;const at=Date.now(),sky=skyCatalog(position,at);
 update({observerPosition:position,observerStatus:'ready',observerMessage:'',orbitAt:at,orbitOrigin:at,orbitLive:true,playing:false,tracking:false,observationFocus:null,activeNorad:sky.above[0]?.record.norad_id??0});return true;
}
export function requestObserverLocation(){
 if(state.observerStatus==='locating')return;
 if(!navigator.geolocation||!isSecureContext){update({observerStatus:'error',observerMessage:'当前浏览器无法定位，请手动设置经纬度。'});return;}
 const version=++requestVersion;update({observerStatus:'locating',observerMessage:'正在获取位置…'});
 navigator.geolocation.getCurrentPosition(p=>{
  if(version!==requestVersion)return;
  applyPosition({latitude:p.coords.latitude,longitude:p.coords.longitude,altitudeMeters:p.coords.altitude??0,altitudeAssumed:p.coords.altitude===null,accuracyMeters:p.coords.accuracy,acquiredAt:p.timestamp,source:'browser',label:'浏览器定位'});
 },error=>{if(version!==requestVersion)return;update({observerStatus:error.code===1?'denied':'error',observerMessage:error.code===1?'定位未获授权。你可以手动设置位置。':error.code===3?'定位超时，请重试或手动设置位置。':'暂时无法取得位置，请重试或手动设置。'});},{enableHighAccuracy:false,timeout:10000,maximumAge:60000});
}
export function setManualObserver(latitude:number,longitude:number,label='手动位置'){
 return applyPosition({latitude,longitude,altitudeMeters:0,altitudeAssumed:true,accuracyMeters:null,acquiredAt:Date.now(),source:'manual',label});
}
export function clearObserver(){requestVersion++;memo=undefined;update({observerPosition:null,observerStatus:'idle',observerMessage:'',tracking:false});}
export async function restoreGrantedObserver(){
 // -- 仅在已获定位权限时自动取得；首次访问交由明确按钮触发权限请求 --------
 if(!navigator.permissions)return;
 try{const permission=await navigator.permissions.query({name:'geolocation'});if(permission.state==='granted'&&!state.observerPosition&&state.observerStatus==='idle')requestObserverLocation();}catch{/* 旧浏览器仍可使用显式定位或手动输入。 */}
}
export function liveOrbitNow(){const now=Date.now();update({orbitLive:true,orbitAt:now,orbitOrigin:now,playing:false});}
export function toggleOrbitTime(){if(state.orbitLive)update({orbitLive:false,playing:false});else update({playing:!state.playing});}
export function selectSkySatellite(norad:number){
 if(!currentSky()?.above.some(s=>s.record.norad_id===norad))return;
 update({activeNorad:norad,tracking:false,observationFocus:null,layers:{...state.layers,orbits:true}});
}
