import snapshot from '../data/orbit-catalog.json';
import {json2satrec, propagate, gstime, eciToEcf, eciToGeodetic, type OMMJsonObject, type SatRec} from 'satellite.js';

export interface OrbitalRecord {
  norad_id: number; name: string; object_id: string; groups: string[];
  epoch: string; source_url: string; captured_at: string; omm: OMMJsonObject;
}
export interface OrbitDataset {
  version: string; captured_at: string; valid_window_hours: number;
  items: OrbitalRecord[];
  sources: {group: string; label: string; url: string; captured_at: string; status: string; count: number; error?: string}[];
  tiange_candidates: {norad_id: number; source_url: string; satcat: {DECAY_DATE: string; OBJECT_NAME: string}; identity_mapping: string}[];
  refresh_status?: string; refresh_message?: string;
}
export const groupNames: Record<string, string> = {stations: '空间站', science: '科学卫星', weather: '气象卫星'};
const aliases: Record<number, string> = {25544: '国际空间站 ISS', 48274: '中国空间站 · 天和', 20580: '哈勃空间望远镜'};
export const displayName = (record: OrbitalRecord) => aliases[record.norad_id] || record.name;
export let orbitDataset = snapshot as unknown as OrbitDataset;
const satrecs = new Map<number, SatRec>();
export function setOrbitDataset(next: OrbitDataset) {
  if (next.version !== 'public-orbits/1' || !Array.isArray(next.items) || !next.items.length) throw new Error('来源尚无可用轨道');
  orbitDataset = next; satrecs.clear();
  for (const record of next.items) {try {satrecs.set(record.norad_id, json2satrec(record.omm));} catch { /* 单个来源无效不会阻断其余目录。 */ }}
}
setOrbitDataset(orbitDataset);
export const orbitalRecord = (id: number) => orbitDataset.items.find(r => r.norad_id === id);
export function matchRecords(query: string, groups: string[], favoritesOnly: boolean, favorites: number[]) {
  const q = query.trim().toLowerCase();
  return orbitDataset.items.filter(r => r.groups.some(g => groups.includes(g)) && (!favoritesOnly || favorites.includes(r.norad_id))
    && `${displayName(r)} ${r.name} ${r.norad_id} ${r.object_id}`.toLowerCase().includes(q));
}
export function orbitState(record: OrbitalRecord, at: number) {
  const age = Math.abs(at - Date.parse(record.epoch)) / 3600000;
  if (age > orbitDataset.valid_window_hours) return null;
  const satrec = satrecs.get(record.norad_id); if (!satrec) return null;
  const date = new Date(at), pv = propagate(satrec, date); if (!pv) return null;
  const theta = gstime(date), p = eciToEcf(pv.position, theta), geo = eciToGeodetic(pv.position, theta);
  const teme = [pv.position.x, pv.position.y, pv.position.z];
  const position: [number, number, number] = [p.x, p.y, p.z];
  if (!position.every(Number.isFinite) || !Number.isFinite(geo.height) || geo.height < 0) return null;
  return {position, teme, latitude: geo.latitude * 180 / Math.PI, longitude: geo.longitude * 180 / Math.PI,
    altitude: geo.height, speed: Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z), period: 1440 / Number(record.omm.MEAN_MOTION), at, age};
}
export function orbitPath(record: OrbitalRecord, at: number) {
  const periodMs = 86400000 / Number(record.omm.MEAN_MOTION);
  const points: [number, number, number][] = [];
  for (let i = 0; i <= 160; i++) {const pv = orbitState(record, at + (i / 160 - 0.2) * periodMs); if (pv) points.push(pv.position);}
  return points;
}
