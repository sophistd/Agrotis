import {observerHomeView} from './observer-home-view';
import {brand} from './brand';
import {state, events, catalog, metrics, geometry, selectedEvent, period, clockText} from './model';
import {icon} from './icons';
import {escape} from './format';
import {orbitalRecord, orbitState, orbitDataset} from './orbits';
import {satellitePanel} from './satellite-panel';
import {spaceExplorer,networkView} from './space-explorer';
import {structureView} from './satellite-structure';
import {satelliteScopes, satelliteBrowser} from './satellite-browser';
import {observationScopes, observationView} from './observation-view';
import {observationRecord, observationTitle, observationDataset, domainNames, type Domain} from './observation-data';
export {escape} from './format';
const button = (action: string, label: string, cls = 'button', glyph = '', extra = '') => `<button class="${cls}" data-action="${action}" ${cls.includes('icon-button') ? `aria-label="${escape(label)}" title="${escape(label)}"` : ''} ${extra}>${glyph ? icon(glyph) : ''}${cls.includes('icon-button') ? '' : `<span>${label}</span>`}</button>`;
const eyebrow = (text: string) => `<div class="eyebrow">${text}</div>`;
const chip = (text: string, cls = '') => `<span class="chip ${cls}">${text}</span>`;
export function header() {
  const nav = [['overview', 'earth', '总览'], ['satellites', 'satellite', '卫星'], ['events', 'orbit', '探索'], ['lab', 'lab', '实验']];
  return `<a class="skip-link" href="#content">跳至内容</a><header class="topbar">
    <a class="brand" href="#overview" aria-label="${brand.name}总览"><svg viewBox="0 0 40 40" width="36" height="36" fill="none" aria-hidden="true"><ellipse cx="20" cy="20" rx="16" ry="7" transform="rotate(-40 20 20)" stroke="currentColor" stroke-width="1.2"/><path d="M12 28 20 10l8 18" stroke="currentColor" stroke-width="1.5"/><circle cx="20" cy="10" r="2.5" fill="currentColor"/><circle cx="12" cy="28" r="2.5" fill="currentColor"/><circle cx="28" cy="28" r="2.5" fill="currentColor"/></svg><span>${brand.name}${brand.english===brand.name?'':`<small>${brand.english}</small>`}</span></a>
    <nav aria-label="主导航">${nav.map(([view, glyph, label]) => `<button data-action="navigate" data-view="${view}" class="nav-item ${state.view === view ? 'active' : ''}" ${state.view === view ? 'aria-current="page"' : ''}>${icon(glyph, 18)}${label}</button>`).join('')}</nav>
    <div class="header-meta"><span class="status-dot"></span>${state.marsGuide ? '公开影像 · 手动测量' : state.moonGuide || state.lightGuide || state.view === 'lab' || (state.view === 'overview' && state.orbitMode === 'teaching') ? '教学场景' : state.view === 'overview' ? '公开轨道推算' : '公开资料'}<button class="sensory-toggle" data-action="sensory-settings" aria-label="声音与触感" aria-expanded="${state.sensoryOpen}" aria-controls="sensory-panel">${icon(state.soundMode==='off'?'sound-off':'sound',17)}<span>声音</span></button>${button('about', '数据与来源', 'source-button', 'info')}</div>
  </header>`;
}
export function timeline() {
  const live = (state.view==='overview'&&state.orbitMode==='public')||(state.view==='satellites'&&state.satellitePage==='network');
  const record = orbitalRecord(state.activeNorad), pv = record && orbitState(record, state.orbitAt);
  const minutes = live && record ? 1440 / Number(record.omm.MEAN_MOTION) : period() / 60;
  const progress = live ? 500 + (state.orbitAt - state.orbitOrigin) / (minutes * 60000) * 1000 : state.seconds / period() * 1000;
  return `<section class="timeline" aria-label="${live ? '公开轨道时间控制' : '模型时间控制'}"><div class="transport">
    <button class="play-button" data-action="play" aria-label="${live&&state.orbitLive?'暂停实时':state.playing ? '暂停' : '播放'}">${icon((live&&state.orbitLive)||state.playing ? 'pause' : 'play')}</button>
    <button class="icon-button" data-action="reset" aria-label="${live ? '回到当前时间' : '复位模型时间'}">${icon('reset', 18)}</button>
    <div class="clock"><strong id="clock">${live ? new Date(state.orbitAt).toISOString().slice(11,19) : clockText()}</strong><span id="clock-date">${live ? new Date(state.orbitAt).toISOString().slice(0,10) + ' · UTC · 轨道推算' : '模型时间 · UTC'}</span></div>
  </div><div class="time-track"><label for="time-slider" class="sr-only">${live ? '轨道时间偏移' : '轨道周期进度'}</label><input id="time-slider" type="range" min="0" max="1000" step="1" value="${progress}"><div class="ticks">${live ? '<span>−½ 圈</span><span>−¼ 圈</span><span>参考时刻</span><span>+¼ 圈</span>' : '<span>起点</span><span>¼ 周期</span><span>½ 周期</span><span>¾ 周期</span>'}<span id="period-label">${minutes.toFixed(1)} 分钟 / 圈</span></div></div><label class="speed-label">播放速度<select id="speed" aria-label="播放速度"><option value="1" ${state.speed === 1 ? 'selected' : ''}>1 ×</option><option value="60" ${state.speed === 60 ? 'selected' : ''}>60 ×</option><option value="300" ${state.speed === 300 ? 'selected' : ''}>300 ×</option></select></label></section>`;
}
export function sceneTools() {
  return `<div class="scene-tools"><div class="layer-panel" hidden id="layer-panel">${Object.entries({orbits: '选中卫星轨迹', clouds: '云层', night: '夜间灯光', grid: '经纬网'}).map(([key, label]) => `<label><span>${label}</span><input type="checkbox" data-layer="${key}" ${state.layers[key as keyof typeof state.layers] ? 'checked' : ''}></label>`).join('')}</div>${button('layers', '图层', 'button subtle', 'layers')}${button('zoom-in', '放大地球', 'icon-button', 'plus')}${button('zoom-out', '缩小地球', 'icon-button', 'minus')}${button('home', '复位视角', 'icon-button', 'focus')}<span class="drag-hint">拖动旋转 · 滚轮 / 双指缩放</span></div>`;
}
function observationTeaser() {
  const record=state.observationFocus?observationRecord(state.observationFocus):undefined;
  if(record) return `<aside class="event-teaser observation-focus-panel">${eyebrow('地球上的公开点位')}${chip(domainNames[record.domain], 'observed')}<h2>${escape(observationTitle(record))}</h2><p>${escape(record.location!.label)}</p><div class="teaser-date">${escape(record.date_label)}<span>${escape(record.category)}</span></div><p class="focus-frame-note">历史事件点位与当前卫星轨道分别显示，不据此判断当时哪颗卫星进行了观测。</p>${button('observation-evidence','查看原始证据','button primary','external',`data-id="${escape(record.id)}"`)}${button('focused-observation','返回事件详情','text-button','arrow')}${button('clear-observation-focus','结束点位定位','text-button','close')}</aside>`;
  return `<aside class="event-teaser observation-entry">${eyebrow('从卫星进入观测')}<div class="observation-entry-orbs"><span class="domain-orb orb-earth"></span><span class="domain-orb orb-moon"></span><span class="domain-orb orb-meteors"></span><span class="domain-orb orb-comets"></span></div><h2>一颗卫星，<br>能看见什么？</h2><p>从仪器能力，找到地球、月面、流星与彗星的公开记录。</p><div class="teaser-date">${observationDataset.records.length} 条记录<span>四类对象</span></div>${button('navigate','浏览对象与事件','button primary','arrow','data-view="events"')}</aside>`;
}
function publicOverview() {
  return `<section class="overview-view spatial-view public-overview">${satellitePanel()}<div class="public-scene-heading">${eyebrow('A REAL ORBITAL CATALOG')}<h1>地球上的观测网络。</h1><p>选择卫星，查看轨道与当前位置推算。</p></div>${observationTeaser()}${sceneTools()}<div class="scene-footnote public-footnote"><span>公开 OMM · SGP4 推算 · 非实时遥测</span><span>地球贴图 © Solar System Scope</span></div></section>${timeline()}`;
}
export function overview() {
  if (state.orbitMode === 'public') return (state.observationFocus?networkView(true):observerHomeView())+timeline();
  const m = metrics(state.selectedSatellite);
  return `<section class="overview-view spatial-view">
    <div class="scene-intro">${eyebrow('SPACE, MADE UNDERSTANDABLE')}<h1>从地球，<br>望向宇宙。</h1><p>跟随一颗卫星，<br>看见一次观测如何发生。</p>${button('orbit-mode', '返回公开卫星目录', 'text-button', 'arrow', 'data-mode="public"')}</div>
    <aside class="event-teaser">${eyebrow('一个值得探索的瞬间')}<div class="event-symbol">${burstGraphic('small')}</div>${chip('公开观测案例', 'observed')}<h2>GRB 230307A</h2><p>当远方的一次爆发，<br>抵达环绕地球的探测器。</p><div class="teaser-date">2023.03.07 <span>伽马射线暴</span></div>${button('replay', '进入观测几何', 'button primary', 'arrow', 'data-event="GRB230307A"')}</aside>
    <div class="orbit-inspector">${eyebrow('当前选择 · 教学轨道')}<div class="sat-switch" role="group" aria-label="选择教学卫星">${[0, 1].map(i => `<button class="sat-choice ${state.selectedSatellite === i ? 'selected' : ''}" data-action="select-satellite" data-index="${i}"><span class="sat-color color-${i}"></span>卫星 ${i ? 'B' : 'A'}${state.selectedSatellite === i ? icon('check', 14) : ''}</button>`).join('')}</div><div class="orbit-readout"><div><span>轨道高度</span><strong>${state.altitude}<small> km</small></strong></div><div><span>模型周期</span><strong id="overview-period">${m.period.toFixed(1)}<small> min</small></strong></div></div>${button('track', state.tracking ? '退出跟随' : '跟随卫星', 'button subtle', 'focus')}</div>
    ${sceneTools()}
    <div class="scene-footnote">圆轨道教学模型<span>地球贴图 © Solar System Scope</span></div>
  </section>${timeline()}`;
}
export function satellites() {
  if(state.satellitePage==='network')return networkView()+timeline();
  if(state.satellitePage==='structure')return structureView();
  if (state.satellitePage === 'catalog') return satelliteBrowser();
  const item = catalog[state.selectedSatellite];
  return `<section class="satellites-view document-view">${satelliteScopes()}<div class="page-heading">${eyebrow('THE INSTRUMENTS')}<h1>载荷，把宇宙信号<br>变成可读的观测。</h1><p>先认识平台，再认识它携带的探测器。</p></div>
    <div class="platform-list"><label class="payload-search">${icon('search',16)}<input id="payload-search" type="search" value="${escape(state.payloadQuery)}" placeholder="搜索载荷或平台" aria-label="搜索天格载荷"></label><div class="payload-group-label">天格载荷 <span>${catalog.length}</span></div><div id="payload-results">${payloadCards()}</div><button class="text-button" data-action="satellite-page" data-page="catalog">${icon('globe',16)}返回公开卫星目录</button></div>
    <div class="model-caption"><span>探测载荷 / 平台结构</span><small>可旋转的通用结构示意，非实物复刻</small><div class="segmented">${button('assemble', '整体', state.exploded ? '' : 'selected')}${button('explode', '拆分观察', state.exploded ? 'selected' : '')}</div></div>
    <aside class="instrument-info">${chip('公开资料')}<h2>${item.id}</h2><p class="instrument-description">探测载荷与卫星平台协同工作。平台负责运行与通信，载荷负责记录高能光子。</p><dl class="spec-list"><div><dt>搭载平台</dt><dd>${item.host_platform}</dd></div><div><dt>发射日期</dt><dd>${item.launch_date}</dd></div><div><dt>公开轨道映射</dt><dd class="muted">待核实${icon('info', 14)}</dd></div><div><dt>实时遥测</dt><dd class="muted">尚未接入</dd></div></dl><a class="text-button" href="${item.source}" target="_blank" rel="noopener">阅读四川大学原始资料 ${icon('external', 16)}</a><button class="text-button" data-action="tiange-status">查看候选编号的当前状态 ${icon('info',15)}</button><div class="instrument-note">总览中的 A / B 为教学卫星，不代表以上平台的实际位置。</div></aside>
    <div class="system-strip"><div><span class="strip-number">01</span><div><strong>卫星平台</strong><span>轨道 · 供电 · 通信</span></div></div><span class="strip-connector">${icon('arrow', 28)}</span><div><span class="strip-number gold">02</span><div><strong>探测载荷</strong><span>光子 · 探测 · 时间记录</span></div></div><span class="strip-connector">${icon('arrow', 28)}</span><div><span class="strip-number blue">03</span><div><strong>观测事件</strong><span>时间 · 方向 · 多星联合</span></div></div>${button('navigate', '寻找一个事件', 'button primary', 'arrow', 'data-view="events"')}</div>
  </section>`;
}
export function payloadCards() {
  const matched = catalog.map((c,i)=>({c,i})).filter(({c})=>`${c.id} ${c.display_name} ${c.host_platform}`.toLowerCase().includes(state.payloadQuery.toLowerCase()));
  return matched.length ? matched.map(({c,i})=>`<button data-action="catalog-select" data-index="${i}" class="platform-option ${state.selectedSatellite === i ? 'selected' : ''}"><span class="platform-index">${icon('detector',21)}</span><div><strong>${c.id}</strong><span>${c.host_platform}</span></div>${icon('chevron',16)}</button>`).join('') : '<p class="payload-empty">没有匹配的载荷。<button data-action="clear-payload-query">清除搜索</button></p>';
}
export function burstGraphic(size = 'large') {
  return `<svg class="burst-graphic ${size}" viewBox="0 0 600 340" fill="none" aria-hidden="true"><defs><radialGradient id="burst-${size}"><stop stop-color="#bfc8f4" stop-opacity=".65"/><stop offset=".17" stop-color="#8c9dca" stop-opacity=".12"/><stop offset="1" stop-color="#8c9dca" stop-opacity="0"/></radialGradient></defs><ellipse cx="300" cy="170" rx="180" ry="150" fill="url(#burst-${size})"/><g stroke="#8f9bc3" stroke-opacity=".35"><ellipse cx="300" cy="170" rx="215" ry="62" transform="rotate(-25 300 170)"/><ellipse cx="300" cy="170" rx="172" ry="90" transform="rotate(30 300 170)"/><circle cx="300" cy="170" r="110" stroke-dasharray="2 10"/><path d="M60 170h480M300 25v290" stroke-dasharray="3 10"/></g><path d="m300 72 7 88 45 10-45 8-7 89-8-88-45-9 45-10z" fill="#dbe1f9"/><circle cx="300" cy="170" r="5" fill="#fff"/><circle cx="480" cy="90" r="2" fill="#c4cbe5"/><circle cx="126" cy="230" r="2" fill="#c4cbe5"/><circle cx="403" cy="262" r="1.5" fill="#c4cbe5"/></svg>`;
}
export function eventCards() {
  const matches = events.filter(event => (state.filter === 'all' || event.classification === state.filter) && `${event.name} ${event.summary} ${event.date}`.toLowerCase().includes(state.query.toLowerCase()));
  return matches.length ? matches.map((event, i) => `<article class="event-row"><span class="event-row-index">0${i + 1}</span><div class="event-row-title"><h3>${event.name}</h3><span>${event.date}</span></div><span class="type-label">${event.classification === 'long' ? '长伽马暴' : '短伽马暴'}</span><p>${event.summary}</p><button class="icon-button" data-action="event-select" data-event="${event.id}" aria-label="查看 ${event.name}">${icon('arrow')}</button></article>`).join('') : `<div class="empty-state">${icon('search', 32)}<h3>没有匹配的事件</h3><p>试试事件名称、日期，或清除筛选。</p>${button('clear-filter', '显示全部事件', 'button primary')}</div>`;
}
export function eventView() {
  if(state.eventPage==='space')return spaceExplorer();
  if(state.eventPage==='observations') return observationView();
  const event = selectedEvent();
  return `<section class="events-view document-view">${observationScopes()}<div class="events-heading"><div>${eyebrow('MOMENTS FROM THE UNIVERSE')}<h1>宇宙的瞬间，<br>地球上的证据。</h1></div><p>从公开观测进入一个案例，<br>理解位置、时间与探测之间的关系。</p></div>
    <article class="featured-event"><div class="featured-content">${chip('公开观测', 'observed')}<div class="featured-date">${event.date.replaceAll('-', '.')} / ${event.classification === 'long' ? '长伽马暴' : '短伽马暴'}</div><h2>${event.name}</h2><p>${event.summary}</p><div class="featured-actions">${button('replay', '重放观测几何', 'button primary', 'play', `data-event="${event.id}"`)}${button('evidence', '阅读观测证据', 'text-button', 'external')}</div></div><div class="featured-visual">${burstGraphic()}<span>爆发概念图 · 非观测影像</span></div></article>
    <div class="event-browser"><div class="browser-toolbar"><div class="filter-tabs" role="group" aria-label="事件类型">${[['all', '全部事件'], ['long', '长伽马暴'], ['short', '短伽马暴']].map(([value, text]) => `<button data-action="filter" data-filter="${value}" class="${state.filter === value ? 'selected' : ''}" aria-pressed="${state.filter === value}">${text}</button>`).join('')}</div><label class="search-box">${icon('search', 18)}<span class="sr-only">搜索事件</span><input id="event-search" type="search" value="${escape(state.query)}" placeholder="名称、日期或关键词"></label></div><div id="event-results">${eventCards()}</div></div>
    <footer class="document-footer"><span>3 个公开案例 · NASA / GCN</span><span>公开事件事实与教学空间模拟分别呈现</span></footer></section>`;
}
export function waveDiagram() {
  const result = geometry(), delta = result[1].arrival;
  const bx = 135 + state.separation / 180 * 135;
  return `<svg viewBox="0 0 360 110" class="wave-diagram" role="img" aria-label="A与B接收平面波的时差示意"><defs><linearGradient id="wave-shade"><stop stop-color="#d7b07a" stop-opacity="0"/><stop offset="1" stop-color="#d7b07a" stop-opacity=".18"/></linearGradient></defs><path d="M25 55h310" stroke="currentColor" opacity=".18"/><g transform="translate(${Math.sin(state.direction * Math.PI / 180) * 20},0)" stroke="#c59d68"><path d="M45 15v80M65 15v80M85 15v80" opacity=".55"/><path d="M45 15h40v80H45" fill="url(#wave-shade)" stroke="none"/><path d="M95 55h26m-5-4 5 4-5 4"/></g><circle cx="150" cy="55" r="5" fill="#85aaff"/><circle cx="${bx + 40}" cy="55" r="5" fill="#d7b07a"/><path d="M150 78h${bx - 110}" stroke="currentColor" opacity=".25"/><text x="145" y="38" fill="currentColor" font-size="12">A</text><text x="${bx + 35}" y="38" fill="currentColor" font-size="12">B</text><text x="150" y="102" fill="currentColor" font-size="11" opacity=".65">${delta < 0 ? 'B 先到达' : 'A 先到达'} · 平面波几何示意</text></svg>`;
}
function slider(key: string, label: string, value: number, min: number, max: number, unit: string) {
  return `<div class="parameter"><label for="param-${key}">${label}<output id="value-${key}">${value}<span>${unit}</span></output></label><input type="range" id="param-${key}" data-param="${key}" value="${value}" min="${min}" max="${max}" step="1"><div class="range-extents"><span>${min}${unit}</span><span>${max}${unit}</span></div></div>`;
}
export function lab() {
  const event = selectedEvent();
  return `<section class="lab-view spatial-view"><div class="lab-heading">${eyebrow('LEARN BY CHANGING')}<h1>同一束光，<br>不同的到达时刻。</h1><p>改变来射方向与卫星间隔，<br>亲手观察时差如何产生。</p><button class="context-event" data-action="evidence">${icon('spark', 16)}案例背景 ${event.name}${icon('chevron', 14)}</button></div>
    <aside class="experiment-panel"><div class="panel-title"><h2>观测几何</h2>${chip('教学实验')}</div>${slider('direction', '来射方位角', state.direction, 0, 360, '°')}${slider('separation', '两星轨道相位差', state.separation, 5, 180, '°')}${slider('altitude', '轨道高度', state.altitude, 300, 1500, ' km')}<div class="result-rule"></div><div class="result-caption">B 相对 A 的到达时差 ${icon('info', 14)}</div><div class="experiment-result"><output id="arrival-result">${geometry()[1].arrival.toFixed(2)}</output><span>ms</span></div><p id="arrival-explanation" class="result-explanation"></p><div id="wave-diagram">${waveDiagram()}</div><div class="visibility-status" id="visibility-status"></div><div class="experiment-actions">${button('verify', '核对科学计算', 'button subtle', 'check')}${button('export', '导出参数', 'icon-button', 'download')}</div><div id="verification-status" class="verification-status" role="status"></div></aside>
    <div class="lab-legend"><span><i class="legend-line blue"></i>教学卫星 A</span><span><i class="legend-line gold"></i>教学卫星 B</span><span><i class="wave-line"></i>平面波前</span></div><div class="lab-hint">${icon('info', 15)}远场平面波模型；光路通畅不等于实际探测。${button('home', '复位视角', 'text-button', 'focus')}</div></section>${timeline()}`;
}
export function evidence() {
  const event = selectedEvent();
  return `<div class="dialog-heading">${eyebrow('FROM SOURCE TO UNDERSTANDING')}<h2>${event.name}</h2><p>${event.summary}</p></div><div class="evidence-facts"><div><span>事件日期</span><strong>${event.date}</strong></div><div><span>事件类型</span><strong>${event.classification === 'long' ? '长伽马暴' : '短伽马暴'}</strong></div>${event.trigger_time ? `<div><span>触发时刻 UTC</span><strong>${event.trigger_time.slice(11, 23)}</strong></div>` : ''}</div>${event.localization ? `<div class="localization-card"><h3>公开定位</h3><div><span>赤经</span><strong>${event.localization.ra_deg}°</strong><span>赤纬</span><strong>${event.localization.dec_deg}°</strong></div><p>FK5 / J2000 · 1° 为 1σ 统计误差，系统误差另列。</p></div>` : ''}<h3>这次实验怎样使用案例</h3><p>${event.geometry_explanation} 来射方向与两星位置均由实验参数指定，场景不重建历史实况。</p><h3>原始观测证据</h3><div class="source-links">${event.sources.map((source, i) => `<a href="${source}" target="_blank" rel="noopener"><span>0${i + 1}</span>${source.includes('circulars') ? `GCN Circular ${source.split('/').at(-1)}` : 'NASA / Fermi 公开资料'}${icon('external', 16)}</a>`).join('')}</div><p class="dialog-note">尚未接入公开光变曲线、天格历史轨道与姿态。页面没有用模拟曲线代替观测数据。</p>`;
}
export function about() {
  return `<div class="dialog-heading">${eyebrow('DATA, CLEARLY STATED')}<h2>看得见，也说得清。</h2><p>三个层次帮助你理解这里的信息。</p></div><div class="data-level"><span class="level-mark">01</span><div><h3>公开观测</h3><p>事件日期、公告与公开定位来自 GCN / NASA。每个案例可打开原始来源。</p></div></div><div class="data-level"><span class="level-mark">02</span><div><h3>教学计算</h3><p>A / B 使用解析圆轨道，时差使用远场平面波与地球遮挡模型。参数改变后重新计算；可与独立 Python 服务核对。</p></div></div><div class="data-level"><span class="level-mark">03</span><div><h3>真实平台资料</h3><p>天格载荷与平台关系来自四川大学。当前 NORAD 映射未核实，未显示其真实位置或遥测。</p></div></div><h3>公开卫星轨道</h3><p>总览已接入 ${orbitDataset.items.length} 个 CelesTrak 公开对象，按空间站、科学卫星和气象卫星分组。位置由真实 OMM 通过 SGP4 推算；可在每颗卫星的来源详情查看历元与取得时间。天格候选编号的当前元素不可用，原因与目录证据单独显示。</p><h3>对象与观测</h3><p>地球自然事件来自 NASA EONET 汇编；火流星来自 JPL/CNEOS，其具体传感器身份未公开。月球与彗星展示 NASA 任务历史观测及原始影像。仪器能力按来源逐条映射，不把轨道位置当成探测证据。</p><h3>视觉素材</h3><p>地球日景、夜景与合并云层贴图：Solar System Scope / INOVE，基于 NASA 地理影像，经 Three.js 官方示例分发。本 Demo 使用原图和节点材质进行渲染。</p><a class="text-button" href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noopener">贴图来源 · CC BY 4.0 ${icon('external', 16)}</a><p class="dialog-note">卫星模型与爆发图为结构示意；地球贴图和照明为视觉表达，非实时云图或太阳位置。</p>`;
}
export const viewTemplates = {overview, satellites, events: eventView, lab};
