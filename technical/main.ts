import {brand} from './brand';
import {state, update, subscribe, geometry, sourceDirection, position, period, metrics, clockText, type View, type Layer, type State} from './model';
import {header, viewTemplates, eventCards, about, evidence, waveDiagram, payloadCards} from './views';
import {icon} from './icons';
import {checkGeometry, request} from './api';
import {orbitalRecord, orbitState, orbitDataset, setOrbitDataset, type OrbitDataset} from './orbits';
import {orbitSource, tiangeStatus} from './satellite-panel';
import {observationDataset, observationRecord, setObservations, type ObservationDataset} from './observation-data';
import {observationEvidence} from './observation-view';
import {celestialSource,celestialLoadStatus} from './space-explorer';
import {structureSource,structureStatus} from './satellite-structure';
import {SensoryDirector} from './sensory';
import {ContextPriority} from './context-priority';
import {startMoonGuide,exitMoonGuide,moveMoonObserver,advanceMoonGuide,predictMoonGuide,revealMoonGuide,moonGuideRecord} from './moon-guide';
import {moonGuideReadouts,moonGuideSource} from './moon-guide-view';
import {startLightGuide,exitLightGuide,moveLightReceiver,advanceLightGuide,predictLightGuide,revealLightGuide,lightGuideRecord} from './light-guide';
import {lightGuideReadouts,lightGuideSource,announceLightGuide} from './light-guide-view';
import {startMarsGuide,exitMarsGuide,advanceMarsGuide,setMarsMode,setMarsReveal,setMarsTolerance,selectMarsPoint,resetMarsMeasurement,retryMarsImages,marsGuideRecord} from './mars-guide';
import {marsGuideReadouts,marsGuideSource,bindMarsImages} from './mars-guide-view';
import {requestObserverLocation,restoreGrantedObserver,setManualObserver,clearObserver,liveOrbitNow,toggleOrbitTime,selectSkySatellite} from './observer-home';
import {observerHomeReadouts,observerHomeSource} from './observer-home-view';
import './styles.css';
import './spacex.css';
import './sensory.css';
import './satellite-workspace.css';
import './information-hierarchy.css';
document.querySelector('#app')!.innerHTML = `<div id="header"></div><div id="stage"><div id="scene-loading" role="status"><span class="loading-orbit"></span><span>正在展开空间场景…</span></div></div><main id="content" tabindex="-1"></main><dialog id="details" aria-labelledby="dialog-title"><button class="dialog-close icon-button" data-action="close-dialog" aria-label="关闭详情">${icon('close')}</button><div id="dialog-content"></div></dialog><div class="toast" id="toast" role="status" hidden></div>`;
const main = document.querySelector<HTMLElement>('#content')!;
const dialog = document.querySelector<HTMLDialogElement>('#details')!;
let space: import('./scene').SpaceScene | undefined;
let renderReport: typeof import('./scene').renderReport | undefined;
const sensory = new SensoryDirector(()=>space?.pulseFocus());
const priority = new ContextPriority(node=>sensory.noticeChanged(node));
let lastUI = 0, verificationVersion = 0;
const titleNames = {overview: '总览', satellites: '卫星', events: '探索', lab: '实验'};
const publicClock = () => (state.view==='overview'&&state.orbitMode==='public')||(state.view==='satellites'&&state.satellitePage==='network');
function renderView(focus = false, changed:(keyof State)[] = []) {
  sensory.beforeRender(changed);
  if(changed.some(k=>['view','celestialBody','satellitePage','activeNorad'].includes(k)))document.querySelector<HTMLElement>('#toast')!.hidden=true;
  const disclosureIds=changed.some(k=>['view','celestialBody','celestialMode','satellitePage','activeNorad'].includes(k))?[]:[...main.querySelectorAll<HTMLDetailsElement>('details[open][id]')].map(n=>n.id);
  const active = document.activeElement as HTMLElement;
  const focusData = main.contains(active) ? {...active.dataset} : undefined;
  const focusId = main.contains(active) ? active.id : '';
  const caret = active instanceof HTMLInputElement ? [active.selectionStart,active.selectionEnd] : undefined;
  document.body.dataset.lightGuide=String(!!state.lightGuide);
  document.body.dataset.marsGuide=String(!!state.marsGuide);
  document.body.dataset.moonGuide=String(!!state.moonGuide);
  document.body.dataset.view = state.view; document.body.dataset.orbitMode = state.orbitMode; document.body.dataset.satellitePage = state.satellitePage; document.body.dataset.eventPage=state.eventPage;document.body.dataset.celestialBody=state.celestialBody; document.title = `${titleNames[state.view]} · ${brand.name}`;
  document.querySelector('#header')!.innerHTML = header(); main.innerHTML = viewTemplates[state.view](); updateReadouts();
  disclosureIds.forEach(id=>{const n=document.getElementById(id);if(n instanceof HTMLDetailsElement)n.open=true;});
  const list=main.querySelector<HTMLElement>('.observation-results'),selected=list?.querySelector<HTMLElement>('.selected');
  if(list&&selected){const rowBox=selected.getBoundingClientRect(),listBox=list.getBoundingClientRect();if(rowBox.bottom>listBox.bottom)list.scrollTop=rowBox.bottom-listBox.bottom+18;}
  if (focus) {window.scrollTo(0, 0); main.focus({preventScroll: true});}
  else {
    const replacement = focusId ? document.getElementById(focusId) : focusData && Object.keys(focusData).length ? Array.from(main.querySelectorAll<HTMLElement>('[data-action],input,select')).find(node => Object.entries(focusData).every(([key,value])=>node.dataset[key]===value)) : undefined;
    replacement?.focus({preventScroll:true}); if(replacement instanceof HTMLInputElement && caret?.[0]!=null && caret[1]!=null) replacement.setSelectionRange(caret[0],caret[1]);
  }
  sensory.afterRender(changed);
  bindMarsImages();
}
function updateReadouts() {
  priority.sync();moonGuideReadouts();lightGuideReadouts();marsGuideReadouts();observerHomeReadouts();
  const task=document.querySelector('.task-context');if(task)task.textContent=state.tracking?'正在跟随这颗卫星 · 拖动即可接管视角':state.playing?`正在以 ${state.speed}× 推演轨道运动`:'旋转地球看轨道，播放时间看它怎样运动。';
  const live = publicClock(), record = orbitalRecord(state.activeNorad), pv = record && orbitState(record, state.orbitAt);
  const time = document.querySelector('#clock'); if (time) time.textContent = live ? new Date(state.orbitAt).toISOString().slice(11,19) : clockText();
  const minutes = live && record ? 1440 / Number(record.omm.MEAN_MOTION) : period() / 60;
  const slider = document.querySelector<HTMLInputElement>('#time-slider'); if (slider && document.activeElement !== slider) slider.value = String(live ? 500 + (state.orbitAt - state.orbitOrigin) / (minutes * 60000) * 1000 : state.seconds / period() * 1000);
  if (live) {
    const dateLabel=document.querySelector('#clock-date');if(dateLabel)dateLabel.textContent=new Date(state.orbitAt).toISOString().slice(0,10)+' · UTC · 轨道推算';
    const tracker=document.querySelector<HTMLButtonElement>('.track-public');if(tracker)tracker.disabled=!pv;
    for(const control of document.querySelectorAll<HTMLButtonElement>('.orbit-actions [data-action="orbit-path"],.orbit-actions [data-action="track"]')){control.disabled=!pv&&!(control.dataset.action==='track'&&state.tracking);control.title=pv?'':'当前轨道元素无法提供位置';}
    const readouts = {'real-altitude': pv?.altitude.toFixed(1), 'network-altitude': pv?.altitude.toFixed(1), 'real-latitude': pv?.latitude.toFixed(2), 'real-longitude': pv?.longitude.toFixed(2)};
    for (const [id,value] of Object.entries(readouts)) {const node=document.querySelector(`#${id}`); if(node) node.innerHTML=`${value ?? '—'}<small>${id.endsWith('altitude')?' km':'°'}</small>`;}
    const label=document.querySelector('#period-label'); if(label) label.textContent=`${minutes.toFixed(1)} 分钟 / 圈`;
    const status=document.querySelector('#real-orbit-status'); if(status) status.textContent=pv?'SGP4 位置推算 · 非实时遥测':'元素已超出 ±72 小时窗口，暂停位置展示。';
  }
  if (state.view === 'lab') {
    const values = geometry(), dt = values[1].arrival;
    document.querySelector('#arrival-result')!.textContent = `${dt < 0 ? '−' : ''}${Math.abs(dt).toFixed(2)}`;
    document.querySelector('#arrival-explanation')!.textContent = values.some(value => value.occulted) ? '存在地球遮挡；此数值仅表达几何时差。' : `${dt < 0 ? 'B' : 'A'} 比 ${dt < 0 ? 'A' : 'B'} 提前 ${Math.abs(dt).toFixed(2)} 毫秒到达。`;
    document.querySelector('#visibility-status')!.innerHTML = values.map(value => `<span class="${value.occulted ? 'blocked' : ''}"><i></i>${value.index ? 'B' : 'A'} · ${value.occulted ? '地球遮挡' : '光路通畅'}</span>`).join('');
    document.querySelector('#wave-diagram')!.innerHTML = waveDiagram();
  }
}
function openDialog(html: string) {
  document.querySelector('#dialog-content')!.innerHTML = html; document.querySelector('#dialog-content h2')!.id = 'dialog-title';
  dialog.showModal(); dialog.scrollTop = 0;sensory.dialogOpened(dialog);
}
function toast(text: string) {
  const node = document.querySelector<HTMLElement>('#toast')!; node.textContent = text; node.hidden = false;
  setTimeout(() => {node.hidden = true;}, 2800);
}
async function loadOrbits(refresh = false) {
  const button = document.querySelector<HTMLButtonElement>('[data-action="refresh-orbits"]'); if (button) button.disabled = true;
  try {
    const dataset = await request<OrbitDataset>(refresh ? '/satellites/refresh' : '/satellites', refresh ? {} : undefined);
    setOrbitDataset(dataset);
    const failed=dataset.sources.some(s=>s.status==='refresh_failed');
    update({orbitRevision:state.orbitRevision+1,orbitStatus:failed?'部分来源刷新失败 · 保留上次成功元素':''});
    if (failed) {if(refresh)toast('部分来源暂不可用，已保留上次成功取得的元素。');}
    else if (refresh) toast(dataset.refresh_message || '公开轨道目录已更新。');
  } catch {
    update({orbitStatus:'服务暂不可用 · 已使用有来源的本地轨道快照'});
    if (refresh) toast('刷新暂不可用，已有轨道快照仍可查看。');
  } finally {const current = document.querySelector<HTMLButtonElement>('[data-action="refresh-orbits"]'); if(current) current.disabled=false;}
}
async function loadObservations(refresh = false) {
  const button = document.querySelector<HTMLButtonElement>('[data-action="refresh-observations"]'); if(button) button.disabled=true;
  try {
    const dataset=await request<ObservationDataset>(refresh?'/observations/refresh':'/observations',refresh?{}:undefined);
    setObservations(dataset);
    const failed=dataset.sources.some(s=>s.status==='refresh_failed');
    update({observationRevision:state.observationRevision+1,observationStatus:failed?'部分来源更新失败 · 保留上次成功记录':''});
    if(refresh) toast(failed?'部分来源暂不可用，已保留上次成功的记录。':dataset.refresh_message||'公开事件目录已更新。');
  } catch {update({observationStatus:'服务暂不可用 · 正在使用有来源的本地观测快照'});if(refresh)toast('更新暂不可用，已有观测快照仍可查看。');}
  finally {const current=document.querySelector<HTMLButtonElement>('[data-action="refresh-observations"]');if(current)current.disabled=false;}
}
async function verify() {
  update({playing: false});
  const node = document.querySelector('#verification-status')!, local = geometry(), version = ++verificationVersion;
  node.textContent = '正在与独立科学服务核对…';
  try {
    const result = await checkGeometry(); if (version !== verificationVersion || state.view !== 'lab') return;
    const difference = Math.max(...result.satellites.map((value, i) => Math.abs(value.relative_arrival_ms - local[i].arrival)));
    const matched = result.satellites.every((value, i) => value.earth_occulted === local[i].occulted);
    const confirmed=difference < 1e-8 && matched;
    node.textContent = confirmed ? '已核对：时差与地球遮挡结果一致。' : '核对存在差异，请复位参数后重试。';
    if(confirmed)sensory.sound.cue('confirm');
  } catch {if (version === verificationVersion && state.view === 'lab') node.textContent = '科学服务暂不可用；本地教学计算仍可操作。';}
}
function exportParameters() {
  const payload = {kind: 'simulated', model_version: 'teaching-geometry/1', event_context: state.eventId,
    coordinate_frame: 'ITRS', units: {position: 'km', time_difference: 'ms', angle: 'deg'},
    parameters: {seconds: state.seconds, altitude_km: state.altitude, inclination_deg: state.inclination, phase_separation_deg: state.separation, source_azimuth_deg: state.direction},
    positions_km: [position(0), position(1)], source_direction: sourceDirection(), result: geometry(),
    limits: ['解析圆轨道教学模型', '不代表真实卫星遥测或历史探测', '远场平面波，忽略时钟与仪器响应']};
  downloadJson(`${brand.name}-观测几何-教学参数.json`,payload);toast('实验参数与计算结果已导出。');
}
function downloadJson(filename:string,payload:unknown) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  const panel=document.querySelector<HTMLElement>('#layer-panel');if(panel&&!panel.hidden&&!panel.contains(event.target as Node)&&target?.dataset.action!=='layers'){panel.hidden=true;document.querySelector('[data-action="layers"]')?.setAttribute('aria-expanded','false');}
  if (!target) return;
  if (sensory.action(target,event)) return;
  switch (target.dataset.action) {
    case 'observer-locate': requestObserverLocation();break;
    case 'observer-clear': clearObserver();break;
    case 'observer-city': setManualObserver(Number(target.dataset.lat),Number(target.dataset.lon),target.dataset.label);break;
    case 'observer-live': liveOrbitNow();break;
    case 'observer-source': openDialog(observerHomeSource());break;
    case 'sky-type': update({observerType:target.dataset.type as typeof state.observerType});break;
    case 'sky-select': selectSkySatellite(Number(target.dataset.norad));break;
    case 'mars-guide-start': startMarsGuide();break;
    case 'mars-guide-exit': exitMarsGuide();break;
    case 'mars-guide-next': advanceMarsGuide();break;
    case 'mars-guide-back': advanceMarsGuide(true);break;
    case 'mars-guide-mode': setMarsMode(target.dataset.mode);break;
    case 'mars-guide-point': selectMarsPoint(target.dataset.point);break;
    case 'mars-guide-reset': resetMarsMeasurement();break;
    case 'mars-guide-retry': retryMarsImages();break;
    case 'mars-guide-source': openDialog(marsGuideSource());break;
    case 'mars-guide-export': downloadJson('Agrotis-mars-time.json',marsGuideRecord());toast('两期来源、手动选点、测量条件与未知项已导出。');break;
    case 'light-guide-start': case 'light-guide-retry': startLightGuide();break;
    case 'light-guide-exit': exitLightGuide();break;
    case 'light-guide-next': advanceLightGuide();break;
    case 'light-guide-back': advanceLightGuide(true);break;
    case 'light-guide-predict': predictLightGuide(target.dataset.answer);break;
    case 'light-guide-reveal': revealLightGuide();break;
    case 'light-guide-source': openDialog(lightGuideSource());break;
    case 'light-guide-export': downloadJson('Agrotis-light-spread.json',lightGuideRecord());toast('距离、接收比例、首次答案和科学条件已导出。');break;
    case 'moon-guide-start': case 'moon-guide-retry': startMoonGuide();break;
    case 'moon-guide-exit': exitMoonGuide();break;
    case 'moon-guide-next': advanceMoonGuide();break;
    case 'moon-guide-back': advanceMoonGuide(true);break;
    case 'moon-guide-predict': predictMoonGuide(target.dataset.answer);break;
    case 'moon-guide-reveal': revealMoonGuide();break;
    case 'moon-guide-source': openDialog(moonGuideSource());break;
    case 'moon-guide-texture-retry': space?.retryMoonTexture();break;
    case 'moon-guide-export': downloadJson('Agrotis-moon-phase.json',moonGuideRecord());toast('这次观察的位置、计算和来源已导出。');break;
    case 'navigate': update({view: target.dataset.view as View, satelliteDrawer:false, tracking: false,...(target.dataset.view==='overview'?{orbitMode:'public',orbitLive:true,orbitAt:Date.now(),orbitOrigin:Date.now(),playing:false,observationFocus:null}:{}), ...(target.dataset.view === 'satellites' ? {satellitePage: 'network', playing: false,activeNorad:state.activeNorad||25544} : {}), ...(target.dataset.view==='events'?{eventPage:'space',playing:false}: {})}); break;
    case 'celestial-body': update({celestialBody:target.dataset.body as typeof state.celestialBody,celestialMode:'surface',celestialWire:false,celestialRecordsOpen:false,celestialSpin:false});break;
    case 'celestial-mode': update({celestialMode:target.dataset.mode as typeof state.celestialMode,celestialWire:false,celestialSpin:false});break;
    case 'celestial-records': update({celestialRecordsOpen:!state.celestialRecordsOpen});break;
    case 'celestial-record': update({selectedObservationId:target.dataset.id!});break;
    case 'celestial-spin': update({celestialSpin:!state.celestialSpin});break;
    case 'celestial-wire': update({celestialWire:!state.celestialWire});break;
    case 'celestial-effects': update({celestialEffects:!state.celestialEffects});break;
    case 'celestial-source': openDialog(celestialSource());break;
    case 'satellite-drawer': update({satelliteDrawer:!state.satelliteDrawer});break;
    case 'play': if(publicClock())toggleOrbitTime();else update({playing: !state.playing}); break;
    case 'reset': {const now=Date.now(); update(publicClock()?{orbitAt:now,orbitOrigin:now,playing:false,orbitLive:true}:{seconds:0,playing:false}); break;}
    case 'home': space?.home(); break;
    case 'zoom-in': space?.zoom(0.8); break;
    case 'zoom-out': space?.zoom(1.25); break;
    case 'orbit-path': update({layers:{...state.layers,orbits:!state.layers.orbits}});break;
    case 'structure-wire': update({structureWire:!state.structureWire});break;
    case 'structure-source': openDialog(structureSource());break;
    case 'structure-retry': space?.retryStructure();break;
    case 'structure-select': {const norad=Number(target.dataset.norad),record=orbitalRecord(norad);if(record)update({activeNorad:norad,structureWire:false,structureLoad:'',satelliteQuery:'',favoritesOnly:false,visibleGroups:Array.from(new Set([...state.visibleGroups,...record.groups]))});break;}
    case 'track': update({tracking: !state.tracking}); break;
    case 'select-satellite': case 'catalog-select': update({selectedSatellite: Number(target.dataset.index)}); break;
    case 'public-select': {const norad=Number(target.dataset.norad),record=orbitalRecord(norad);if(record)update({activeNorad:norad,tracking:false,observationFocus:null,visibleGroups:Array.from(new Set([...state.visibleGroups,...record.groups]))});break;}
    case 'locate-public': update({view:'overview',orbitMode:'public',tracking:false,playing:false,satelliteQuery:'',favoritesOnly:false,speed:1,observationFocus:null});space?.home();break;
    case 'satellite-page': update({view:'satellites',satellitePage:target.dataset.page as typeof state.satellitePage,tracking:false,playing:false,satelliteDrawer:false,observationFocus:null,...(target.dataset.page==='network'?{satelliteQuery:'',favoritesOnly:false}:{}),...(target.dataset.page==='structure'?{structureWire:false}: {})});window.scrollTo(0,0);break;
    case 'catalog-group': update({satelliteGroup:target.dataset.group!});break;
    case 'satellite-target': update({satelliteTarget:target.dataset.domain!});break;
    case 'clear-catalog-filter': update({satelliteQuery:'',favoritesOnly:false,satelliteGroup:'all',satelliteTarget:'all'});break;
    case 'orbit-mode': update({orbitMode:target.dataset.mode as typeof state.orbitMode,view:'overview',tracking:false,playing:false,speed:target.dataset.mode==='public'?1:60});space?.home();break;
    case 'satellite-filter': update({favoritesOnly:target.dataset.filter==='favorites'});break;
    case 'clear-satellite-filter': update({satelliteQuery:'',favoritesOnly:false});break;
    case 'favorite': {const id=Number(target.dataset.norad);update({favorites:state.favorites.includes(id)?state.favorites.filter(n=>n!==id):[...state.favorites,id]});break;}
    case 'collapse-group': {const group=target.dataset.group!;update({collapsedGroups:state.collapsedGroups.includes(group)?state.collapsedGroups.filter(g=>g!==group):[...state.collapsedGroups,group]});break;}
    case 'refresh-orbits': void loadOrbits(true);break;
    case 'refresh-observations': void loadObservations(true);break;
    case 'event-page': update({eventPage:target.dataset.page as typeof state.eventPage,playing:false});break;
    case 'observation-domain': update({observationDomain:target.dataset.domain!,observationQuery:'',observationNorad:null});break;
    case 'observation-select': update({selectedObservationId:target.dataset.id!});break;
    case 'clear-observation-filter': update({observationDomain:'all',observationQuery:'',observationNorad:null});break;
    case 'observe-domain': update({view:'events',eventPage:'observations',observationDomain:target.dataset.domain!,observationQuery:'',observationNorad:null,playing:false});break;
    case 'satellite-observations': update({view:'events',eventPage:'observations',observationDomain:'all',observationQuery:'',observationNorad:Number(target.dataset.norad),playing:false});break;
    case 'observer-orbit': update({view:'satellites',satellitePage:'catalog',satelliteQuery:target.dataset.norad!,activeNorad:Number(target.dataset.norad),satelliteGroup:'all',satelliteTarget:'all',favoritesOnly:false,playing:false,tracking:false});break;
    case 'observation-evidence': openDialog(observationEvidence(target.dataset.id!));break;
    case 'locate-observation': {const r=observationRecord(target.dataset.id!);if(r?.location&&['earth','meteors'].includes(r.domain)){update({view:'overview',orbitMode:'public',observationFocus:r.id,selectedObservationId:r.id,playing:false,tracking:false,satelliteQuery:'',favoritesOnly:false});space?.home();}break;}
    case 'focused-observation': {const r=observationRecord(state.observationFocus!);if(r)update({view:'events',eventPage:'observations',observationDomain:r.domain,observationQuery:'',observationNorad:null,selectedObservationId:r.id,playing:false});break;}
    case 'clear-observation-focus': update({observationFocus:null});space?.home();break;
    case 'orbit-source': openDialog(orbitSource());break;
    case 'tiange-status': openDialog(tiangeStatus());break;
    case 'clear-payload-query': update({payloadQuery:''});break;
    case 'assemble': update({exploded: false}); break;
    case 'explode': update({exploded: true}); break;
    case 'event-select': update({eventId: target.dataset.event}); break;
    case 'replay': update({eventId: target.dataset.event ?? state.eventId, view: 'lab', playing: false, tracking: false}); break;
    case 'filter': update({filter: target.dataset.filter as typeof state.filter}); break;
    case 'clear-filter': update({filter: 'all', query: ''}); break;
    case 'evidence': openDialog(evidence()); break;
    case 'about': openDialog(about()); break;
    case 'close-dialog': sensory.closeDialog(dialog); break;
    case 'layers': {const panel = document.querySelector<HTMLElement>('#layer-panel')!; panel.hidden = !panel.hidden; target.setAttribute('aria-expanded', String(!panel.hidden)); break;}
    case 'verify': void verify(); break;
    case 'export': exportParameters(); break;
  }
});
document.addEventListener('input', event => {
  const target = event.target as HTMLInputElement;
  if(target.id==='light-guide-distance')moveLightReceiver(Number(target.value));
  if(target.id==='mars-reveal')setMarsReveal(Number(target.value));
  if(target.id==='mars-tolerance')setMarsTolerance(Number(target.value));
  if(target.id==='moon-guide-angle')moveMoonObserver(Number(target.value));
  if(target.id==='celestial-light')update({celestialLight:Number(target.value)});
  if (target.id === 'event-search') {state.query = target.value; document.querySelector('#event-results')!.innerHTML = eventCards();}
  if (target.id === 'satellite-search' || target.id === 'catalog-search') update({satelliteQuery:target.value});
  if (target.id === 'observation-search') update({observationQuery:target.value});
  if (target.id === 'payload-search') {state.payloadQuery=target.value;document.querySelector('#payload-results')!.innerHTML=payloadCards();}
  if (target.id === 'time-slider') {const record=orbitalRecord(state.activeNorad);update(publicClock()?{orbitLive:false,orbitAt:state.orbitOrigin+(Number(target.value)/1000-.5)*(record ? 1440 / Number(record.omm.MEAN_MOTION) : period()/60)*60000,playing:false}:{seconds:Number(target.value)/1000*period(),playing:false});}
  if (target.dataset.param) {
    verificationVersion++; const key = target.dataset.param as 'direction' | 'separation' | 'altitude'; update({[key]: Number(target.value)});
    document.querySelector(`#value-${key}`)!.innerHTML = `${target.value}<span>${key === 'altitude' ? ' km' : '°'}</span>`;
    document.querySelector('#period-label')!.textContent = `${metrics(0).period.toFixed(1)} 分钟 / 圈`; document.querySelector('#verification-status')!.textContent = '';
  }
});
document.addEventListener('change', event => {
  const target = event.target as HTMLInputElement;
  if (target.id === 'speed') update({speed: Number(target.value)});
  if (target.dataset.layer) update({layers: {...state.layers, [target.dataset.layer as Layer]: target.checked}});
  if (target.dataset.orbitGroup) {const g=target.dataset.orbitGroup;update({visibleGroups:target.checked?[...state.visibleGroups,g]:state.visibleGroups.filter(group=>group!==g),tracking:false});}
});
document.addEventListener('keydown', event => {
  if(event.key==='Escape'&&!dialog.open){const panel=document.querySelector<HTMLElement>('#layer-panel');if(panel){panel.hidden=true;document.querySelector('[data-action="layers"]')?.setAttribute('aria-expanded','false');}}
  if (event.code === 'Space' && !dialog.open && !['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes((event.target as HTMLElement).tagName) && ['overview', 'lab'].includes(state.view)) {event.preventDefault(); if(publicClock())toggleOrbitTime();else update({playing: !state.playing});}
});
dialog.addEventListener('cancel',event=>{event.preventDefault();sensory.sound.cue('close');sensory.closeDialog(dialog);});
dialog.addEventListener('click', event => {if (event.target === dialog) {const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) sensory.closeDialog(dialog);}});
document.addEventListener('change',event=>{if((event.target as HTMLElement).id==='light-guide-distance')announceLightGuide();});
window.addEventListener('hashchange', () => {const view = location.hash.slice(1) as View; if (view in viewTemplates) update({view,...(view==='overview'?{orbitMode:'public',orbitLive:true,orbitAt:Date.now(),orbitOrigin:Date.now(),playing:false,observationFocus:null}:{})});});
subscribe(changed => {
  if(changed.every(key=>['soundMode','soundLevel','haptics','sensoryOpen'].includes(key)))return;
  if(changed.length===1&&changed[0]==='moonGuideTexture'){moonGuideReadouts();return;}
  if(changed.length===1&&changed[0]==='structureLoad'){const status=document.querySelector('.structure-status');if(status){status.innerHTML=structureStatus();sensory.modelStatus('structure',state.structureLoad.startsWith('正在'),!state.structureLoad);priority.sync();}return;}
  if(changed.length===1&&changed[0]==='celestialLoad'){const status=document.querySelector('.object-display-status');if(status){status.innerHTML=celestialLoadStatus();sensory.modelStatus('celestial',state.celestialLoad.startsWith('正在'),!state.celestialLoad);priority.sync();}return;}
  if (changed.some(key => ['observerPosition','observerStatus','observerMessage','observerType','orbitLive','marsGuide','lightGuide','moonGuide','structureWire','layers','celestialBody','celestialMode','celestialSpin','celestialWire','celestialEffects','celestialLoad','celestialRecordsOpen','satelliteDrawer','view', 'selectedSatellite', 'eventId', 'filter', 'exploded', 'tracking', 'activeNorad', 'orbitMode', 'favorites', 'favoritesOnly', 'collapsedGroups', 'visibleGroups', 'orbitRevision', 'orbitStatus', 'payloadQuery', 'satelliteQuery', 'satellitePage', 'satelliteGroup', 'satelliteTarget', 'eventPage', 'observationDomain', 'observationQuery', 'observationNorad', 'selectedObservationId', 'observationRevision', 'observationFocus', 'observationStatus'].includes(key))) renderView(changed.includes('view'),changed);
  else if (changed.includes('playing')) {const button = document.querySelector('.play-button'); if (button) {sensory.swapIcon(button,icon(state.playing ? 'pause' : 'play')); button.setAttribute('aria-label', state.playing ? '暂停' : '播放');}}
  updateReadouts();
  if(changed.includes('lightGuide')&&state.lightGuide&&document.activeElement===document.body)document.querySelector<HTMLElement>('#light-guide-heading')?.focus({preventScroll:true});
  if(changed.includes('marsGuide')&&state.marsGuide&&document.activeElement===document.body)document.querySelector<HTMLElement>('#mars-guide-heading')?.focus({preventScroll:true});
  if(changed.includes('marsGuide')&&!state.marsGuide&&state.view==='events'&&state.eventPage==='space'&&document.activeElement===document.body)document.querySelector<HTMLElement>('[data-action="mars-guide-start"]')?.focus({preventScroll:true});
  if(changed.includes('moonGuide')&&state.moonGuide&&document.activeElement===document.body)document.querySelector<HTMLElement>('#moon-guide-heading')?.focus({preventScroll:true});
});
document.addEventListener('submit',event=>{
 const form=event.target;if(!(form instanceof HTMLFormElement)||form.id!=='observer-location-form')return;
 event.preventDefault();const data=new FormData(form),lat=String(data.get('latitude')??''),lon=String(data.get('longitude')??'');
 if(!lat.trim()||!lon.trim()||!form.reportValidity())return;
 if(setManualObserver(Number(lat),Number(lon))){const details=document.getElementById('observer-position-edit');if(details instanceof HTMLDetailsElement)details.open=false;}
});
function syncLiveOrbit(){if(!document.hidden&&state.orbitLive&&publicClock())update({orbitAt:Date.now()});}
setInterval(syncLiveOrbit,1000);document.addEventListener('visibilitychange',syncLiveOrbit);
renderView();
void restoreGrantedObserver();
void loadOrbits();
void loadObservations();
document.addEventListener('error', event=>{const img=event.target;if(img instanceof HTMLImageElement&&img.closest('.observation-figure,.space-record-figure')){img.hidden=true;img.closest('figure')?.classList.add('image-unavailable');}},true);
void import('./scene').then(async module => {
  renderReport = module.renderReport;
  space = new module.SpaceScene(document.querySelector('#stage')!, () => {const now = performance.now(); if (now - lastUI > 120) {updateReadouts(); lastUI = now;}});
  await space.init(); document.querySelector('#scene-loading')!.remove();
}).catch(error => {
  const node = document.querySelector('#scene-loading')!; node.innerHTML = '<strong>空间场景未能加载</strong><p>刷新重试，或先浏览事件与资料。</p>'; node.classList.add('load-error');
  (window as unknown as {__sceneError: string}).__sceneError = String(error);
});
(window as unknown as {__tiange: unknown}).__tiange = {state, geometry, metrics, orbitDataset:()=>orbitDataset, observationDataset:()=>observationDataset, observationRecord, orbitalRecord, orbitState, get priority(){return priority.inspect();}, get experience(){return sensory.inspect();}, get scene(){return space?.inspection();}, get render() {return renderReport;}};

// Recheck source age while an active visitor keeps the page open.
window.setInterval(()=>{if(!document.hidden){void loadOrbits();void loadObservations();}},5*60*1000);
