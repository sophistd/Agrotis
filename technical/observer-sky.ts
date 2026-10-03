import {ecfToLookAngles,geodeticToEcf} from 'satellite.js';
import {orbitDataset,orbitState,type OrbitalRecord} from './orbits';
export interface ObserverPosition {
 latitude:number; longitude:number; altitudeMeters:number; altitudeAssumed:boolean;
 accuracyMeters:number|null; acquiredAt:number; source:'browser'|'manual'; label:string;
}
export type SkyType='all'|'stations'|'science'|'weather';
export const skyTypeNames={stations:'空间站',science:'科学卫星',weather:'气象卫星'};
export function validObserver(p:Pick<ObserverPosition,'latitude'|'longitude'|'altitudeMeters'>){
 return Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180&&Number.isFinite(p.altitudeMeters)&&p.altitudeMeters>=-500&&p.altitudeMeters<=100000;
}
export function observerEcf(p:Pick<ObserverPosition,'latitude'|'longitude'|'altitudeMeters'>){
 if(!validObserver(p))return null;
 return geodeticToEcf({latitude:p.latitude*Math.PI/180,longitude:p.longitude*Math.PI/180,height:p.altitudeMeters/1000});
}
export function observerLook(p:Pick<ObserverPosition,'latitude'|'longitude'|'altitudeMeters'>,position:number[]){
 if(!validObserver(p)||position.length!==3||!position.every(Number.isFinite))return null;
 const a=ecfToLookAngles({latitude:p.latitude*Math.PI/180,longitude:p.longitude*Math.PI/180,height:p.altitudeMeters/1000},{x:position[0],y:position[1],z:position[2]});
 if(![a.azimuth,a.elevation,a.rangeSat].every(Number.isFinite)||a.rangeSat<=0)return null;
 return {azimuthDeg:(a.azimuth*180/Math.PI+360)%360,elevationDeg:a.elevation*180/Math.PI,rangeKm:a.rangeSat};
}
export function satelliteSkyType(record:OrbitalRecord):Exclude<SkyType,'all'>{return record.groups.includes('stations')?'stations':record.groups.includes('science')?'science':'weather';}
export function skyCatalog(observer:ObserverPosition,at:number){
 const above:{record:OrbitalRecord;elevationDeg:number;azimuthDeg:number;rangeKm:number}[]=[];
 let valid=0,unavailable=0;
 if(!validObserver(observer)||!Number.isFinite(at))return {above,valid,unavailable:orbitDataset.items.length};
 for(const record of orbitDataset.items){
  const pv=orbitState(record,at);if(!pv){unavailable++;continue;}const look=observerLook(observer,pv.position);if(!look){unavailable++;continue;}
  valid++;if(look.elevationDeg>0)above.push({record,...look});
 }
 above.sort((a,b)=>b.elevationDeg-a.elevationDeg||a.record.norad_id-b.record.norad_id);
 return {above,valid,unavailable};
}
export function skyDirection(azimuth:number){return ['北','东北','东','东南','南','西南','西','西北'][Math.round(azimuth/45)%8];}
