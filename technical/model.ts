import eventData from '../data/events.json';
import catalogData from '../data/catalog.json';
import type {ObserverPosition,SkyType} from './observer-sky';
import type {PhaseKind} from './moon-phase';
import type {MarsGuide} from './mars-guide';

export const events = eventData.items;
export const catalog = catalogData.items;
export const EARTH_KM = 6378.137;
export const LIGHT_KM_S = 299792.458;
export const epoch = Date.parse('2026-09-30T09:00:00Z');
export type View = 'overview' | 'satellites' | 'events' | 'lab';
export type Layer = 'orbits' | 'clouds' | 'grid' | 'night';
export type SoundMode = 'off' | 'cues' | 'ambient';
export type MoonGuideStep = 'explore' | 'moon' | 'predict' | 'transfer' | 'complete';
export interface MoonGuide {
  step: MoonGuideStep; answer: PhaseKind | null; revealed: boolean; targetAngle: number;
  attempts:{step:'predict'|'transfer';targetAngle:number;answer:PhaseKind;expected:PhaseKind|null;firstAnswer:PhaseKind;reveals:number}[];
  saved: Pick<State,'celestialMode'|'celestialSpin'|'celestialWire'|'celestialEffects'|'celestialLight'|'celestialRecordsOpen'>;
}
export type LightGuideStep = 'explore'|'predict'|'sun'|'transfer'|'complete';
export type LightAnswer = 'half'|'quarter'|'same'|'third'|'ninth';
export interface LightGuide {
 step:LightGuideStep; answer:LightAnswer|null; revealed:boolean;
 attempts:{step:'predict'|'transfer';targetDistance:number;answer:LightAnswer;expected:LightAnswer;firstAnswer:LightAnswer;reveals:number}[];
 saved:Pick<State,'celestialSpin'|'playing'>;
}
export interface State {
  observerPosition:ObserverPosition|null; observerStatus:'idle'|'locating'|'ready'|'denied'|'error'; observerMessage:string; observerType:SkyType; orbitLive:boolean;
  view: View; seconds: number; playing: boolean; speed: number;
  altitude: number; inclination: number; separation: number; direction: number;
  selectedSatellite: number; eventId: string; tracking: boolean; exploded: boolean;
  filter: 'all' | 'long' | 'short'; query: string;
  orbitMode: 'public' | 'teaching'; orbitAt: number; orbitOrigin: number; activeNorad: number;
  satelliteQuery: string; visibleGroups: string[]; collapsedGroups: string[];
  favorites: number[]; favoritesOnly: boolean; payloadQuery: string;
  satellitePage: 'network' | 'catalog' | 'payload' | 'structure'; structureLoad: string; structureWire: boolean; satelliteGroup: string; satelliteTarget: string;
  eventPage: 'space' | 'observations' | 'grb'; observationDomain: string; observationQuery: string;
  celestialBody: 'earth' | 'moon' | 'meteors' | 'comets'; celestialMode: 'surface' | 'context';
  celestialSpin: boolean; celestialWire: boolean; celestialEffects: boolean; celestialLight: number;
  celestialLoad: string; celestialRecordsOpen: boolean; satelliteDrawer: boolean;
  lightGuide: LightGuide | null; lightDistance: number;
  marsGuide:MarsGuide|null; marsReveal:number; marsTolerance:number;
  moonGuide: MoonGuide | null; moonGuideAngle: number; moonGuideTexture: 'idle' | 'loading' | 'ready' | 'error';
  observationNorad: number | null; selectedObservationId: string; observationRevision: number;
  observationFocus: string | null; observationStatus: string;
  orbitRevision: number; orbitStatus: string;
  layers: Record<Layer, boolean>;
  soundMode: SoundMode; soundLevel: number; haptics: boolean; sensoryOpen: boolean;
}
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function savedFavorites(): number[] {try {const ids=JSON.parse(localStorage.getItem('tiange:favorites') || '[]');return Array.isArray(ids)?ids.filter(id=>Number.isInteger(id)&&id>0):[];}catch{return [];}}
function savedExperience(): {soundMode:SoundMode;soundLevel:number;haptics:boolean} {
  const defaults={soundMode:'off' as SoundMode,soundLevel:35,haptics:false};
  try {const p=JSON.parse(localStorage.getItem('star-ring:experience')||'{}');return {soundMode:['off','cues','ambient'].includes(p.soundMode)?p.soundMode:'off',soundLevel:typeof p.soundLevel==='number'&&Number.isFinite(p.soundLevel)?Math.min(100,Math.max(0,p.soundLevel)):35,haptics:p.haptics===true};}catch{return defaults;}
}
export const state: State = {
  view: (['overview', 'satellites', 'events', 'lab'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview') as View,
  observerPosition:null,observerStatus:'idle',observerMessage:'',observerType:'all',orbitLive:true,
  seconds: 0, playing: false, speed: 1, altitude: 550, inclination: 55,
  separation: 62, direction: 150, selectedSatellite: 0, eventId: 'GRB230307A',
  tracking: false, exploded: false, filter: 'all', query: '',
  orbitMode: 'public', orbitAt: Date.now(), orbitOrigin: Date.now(), activeNorad: 25544, satelliteQuery: '',
  visibleGroups: ['stations', 'science', 'weather'], collapsedGroups: ['science', 'weather'],
  favorites: savedFavorites(), favoritesOnly: false, payloadQuery: '', orbitRevision: 0, orbitStatus: '',
  satellitePage: 'network', structureLoad:'', structureWire:false, satelliteGroup: 'all', satelliteTarget: 'all',
  eventPage: 'space', observationDomain: 'all', observationQuery: '', observationNorad: null,
  celestialBody:'moon',celestialMode:'surface',celestialSpin:false,celestialWire:false,celestialEffects:true,celestialLight:35,
  celestialLoad:'',celestialRecordsOpen:false,satelliteDrawer:false,
  lightGuide:null,lightDistance:1,
  marsGuide:null,marsReveal:50,marsTolerance:1,
  moonGuide:null,moonGuideAngle:65,moonGuideTexture:'idle',
  selectedObservationId: 'HST-BORISOV-2019', observationRevision: 0, observationFocus: null, observationStatus: '',
  layers: {orbits: true, clouds: true, grid: false, night: true},
  ...savedExperience(), sensoryOpen:false,
};
const listeners = new Set<(changed: (keyof State)[]) => void>();
export function subscribe(fn: (changed: (keyof State)[]) => void) { listeners.add(fn); return () => listeners.delete(fn); }
export function update(patch: Partial<State>) {
  // -- 导航、对象和任务切换统一退出旧任务，显式操作覆盖恢复值 --------
  if(state.moonGuide && ((patch.view!==undefined&&patch.view!=='events') || (patch.eventPage!==undefined&&patch.eventPage!=='space') || (patch.celestialBody!==undefined&&patch.celestialBody!=='moon') || !!patch.lightGuide || !!patch.marsGuide)) {
    patch={...state.moonGuide.saved,...patch,moonGuide:null};
  }
  if(state.lightGuide && ((patch.view!==undefined&&patch.view!=='events') || (patch.eventPage!==undefined&&patch.eventPage!=='space') || patch.celestialBody!==undefined || !!patch.moonGuide || !!patch.marsGuide)) {
    patch={...state.lightGuide.saved,...patch,lightGuide:null};
  }
  if(state.marsGuide && ((patch.view!==undefined&&patch.view!=='events') || (patch.eventPage!==undefined&&patch.eventPage!=='space') || patch.celestialBody!==undefined || !!patch.moonGuide || !!patch.lightGuide)) {
    patch={...state.marsGuide.saved,...patch,marsGuide:null};
  }
  const changed = (Object.keys(patch) as (keyof State)[]).filter(key => patch[key] !== state[key]);
  Object.assign(state, patch);
  if(changed.includes('favorites')) {try {localStorage.setItem('tiange:favorites',JSON.stringify(state.favorites));}catch{}}
  if(changed.some(key=>['soundMode','soundLevel','haptics'].includes(key))) {try {localStorage.setItem('star-ring:experience',JSON.stringify({soundMode:state.soundMode,soundLevel:state.soundLevel,haptics:state.haptics}));}catch{}}
  if (changed.includes('view')) history.replaceState(null, '', `#${state.view}`);
  if (changed.length) listeners.forEach(fn => fn(changed));
}
export function period() { return 2 * Math.PI * Math.sqrt((EARTH_KM + state.altitude) ** 3 / 398600.4418); }
// -- x/y/z 是地球固定坐标；显示场景将北极转换到 Three 的 +y --------
export function position(index: number): [number, number, number] {
  const a = state.seconds / period() * Math.PI * 2 + 1.65 + index * state.separation * Math.PI / 180;
  const i = state.inclination * Math.PI / 180, r = EARTH_KM + state.altitude;
  return [r * Math.cos(a), r * Math.sin(a) * Math.cos(i), r * Math.sin(a) * Math.sin(i)];
}
export function sourceDirection(): [number, number, number] {
  const a = state.direction * Math.PI / 180;
  const z = 0.35, xy = Math.sqrt(1 - z * z);
  return [xy * Math.cos(a), xy * Math.sin(a), z];
}
export function geometry() {
  const points = [position(0), position(1)], d = sourceDirection(), axes = [EARTH_KM, EARTH_KM, 6356.752314245];
  return points.map((p, index) => {
    const pp = p.map((v, j) => v / axes[j]), dd = d.map((v, j) => v / axes[j]);
    const a = dd.reduce((sum, v) => sum + v * v, 0);
    const b = 2 * pp.reduce((sum, v, j) => sum + v * dd[j], 0);
    const c = pp.reduce((sum, v) => sum + v * v, 0) - 1;
    const disc = b * b - 4 * a * c;
    return {index, occulted: disc >= 0 && (-b + Math.sqrt(Math.max(0, disc))) / (2 * a) >= 0,
      arrival: -p.reduce((sum, v, j) => sum + (v - points[0][j]) * d[j], 0) / LIGHT_KM_S * 1000};
  });
}
export function metrics(index: number) {
  const p = position(index);
  return {latitude: Math.asin(p[2] / (EARTH_KM + state.altitude)) * 180 / Math.PI,
    longitude: Math.atan2(p[1], p[0]) * 180 / Math.PI,
    speed: Math.sqrt(398600.4418 / (EARTH_KM + state.altitude)), period: period() / 60};
}
export function clockText() { return new Date(epoch + state.seconds * 1000).toISOString().slice(11, 19); }
export function selectedEvent() { return events.find(e => e.id === state.eventId) ?? events[0]; }
