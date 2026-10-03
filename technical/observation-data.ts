import snapshot from '../data/observations.json';
export type Domain = 'earth' | 'moon' | 'meteors' | 'comets';
export const domainNames: Record<Domain, string> = {earth:'地球',moon:'月球',meteors:'流星 / 陨石',comets:'彗星'};
export interface Observer {id:string;name:string;norad_id:number|null;domains:Domain[];description:string;source:string;}
export interface Observation {
  id:string;domain:Domain;object_id:string;title:string;category:string;observed_at:string;date_precision:string;date_label:string;kind:'observed'|'reported';summary:string;
  observer_ids:string[];observer_label:string;location:{latitude:number;longitude:number;altitude_km:number|null;label:string;frame:string}|null;
  metrics:{label:string;value:number|null;unit:string;kind:string}[];source_id:string;sources:{label:string;url:string}[];image:{url:string;credit:string;caption:string}|null;note:string;
}
export interface ObservationDataset {
  version:string;captured_at:string;objects:{id:string;domain:Domain;name:string;description:string}[];observers:Observer[];records:Observation[];
  sources:{id:string;url:string;captured_at:string;status:string;count:number;sha256?:string}[];refresh_status?:string;refresh_message?:string;
}
export let observationDataset = snapshot as unknown as ObservationDataset;
export function setObservations(next:ObservationDataset) {if(next.version!=='public-observations/1'||!Array.isArray(next.records)||!Array.isArray(next.observers))throw new Error('观测来源结构无效');observationDataset=next;}
export const observationTitle = (record:Observation) => record.domain==='meteors'?`${record.title} · ${record.observed_at.slice(11,19)} UTC`:record.title;
export const observationRecord = (id:string) => observationDataset.records.find(r=>r.id===id);
export const capabilities = (norad:number) => observationDataset.observers.filter(o=>o.norad_id===norad);
export function recordsForSatellite(norad:number) {const ids=capabilities(norad).map(o=>o.id);return observationDataset.records.filter(r=>r.observer_ids.some(id=>ids.includes(id)));}
export function matchesObservations(domain:string,query:string,norad:number|null=null) {
  const q=query.trim().toLowerCase(), related=norad===null?null:recordsForSatellite(norad).map(r=>r.id);
  return observationDataset.records.filter(r=>(domain==='all'||r.domain===domain)&&(!related||related.includes(r.id))&&`${r.title} ${r.observed_at} ${r.date_label} ${r.category} ${r.summary} ${r.observer_label} ${r.id}`.toLowerCase().includes(q)).sort((a,b)=>b.observed_at.localeCompare(a.observed_at));
}
