import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../technical/package.json',import.meta.url)),ts=require('typescript');
const snapshot=JSON.parse(await readFile('data/orbit-catalog.json','utf8'));
const satUrl=pathToFileURL(require.resolve('satellite.js')).href;
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const moduleUrl=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const orbitsSource=await readFile('technical/orbits.ts','utf8'),source=await readFile('technical/observer-sky.ts','utf8');
const orbitsUrl=moduleUrl(compile(orbitsSource).replace(/import snapshot from .*?;/,`const snapshot=${JSON.stringify(snapshot)};`).replace(/from 'satellite.js'/g,`from '${satUrl}'`));
const orbits=await import(orbitsUrl);
const model=await import(moduleUrl(compile(source).replace(/from '.\/orbits'/g,`from '${orbitsUrl}'`).replace(/from 'satellite.js'/g,`from '${satUrl}'`)));
function reference(p,position){
 const lat=p.latitude*Math.PI/180,lon=p.longitude*Math.PI/180,a=6378.137,f=1/298.257223563,e2=f*(2-f),n=a/Math.sqrt(1-e2*Math.sin(lat)**2),h=p.altitudeMeters/1000;
 const ground=[(n+h)*Math.cos(lat)*Math.cos(lon),(n+h)*Math.cos(lat)*Math.sin(lon),(n*(1-e2)+h)*Math.sin(lat)];
 const d=position.map((v,i)=>v-ground[i]);
 const east=-Math.sin(lon)*d[0]+Math.cos(lon)*d[1],north=-Math.sin(lat)*Math.cos(lon)*d[0]-Math.sin(lat)*Math.sin(lon)*d[1]+Math.cos(lat)*d[2],up=Math.cos(lat)*Math.cos(lon)*d[0]+Math.cos(lat)*Math.sin(lon)*d[1]+Math.sin(lat)*d[2];
 return {azimuthDeg:(Math.atan2(east,north)*180/Math.PI+360)%360,elevationDeg:Math.atan2(up,Math.hypot(east,north))*180/Math.PI,rangeKm:Math.hypot(...d)};
}
const at=Date.parse(snapshot.captured_at),samples=[],checks=[];
for(const [latitude,longitude,altitudeMeters] of [[39.9042,116.4074,0],[37.7749,-122.4194,0],[0,0,0],[90,180,0],[-90,-180,500],[45,179.9999,3000]]){
 const p={latitude,longitude,altitudeMeters,altitudeAssumed:false,source:'manual',accuracyMeters:null,acquiredAt:at,label:'calculation fixture'};
 const expected=[];let valid=0;
 for(const record of orbits.orbitDataset.items){const pv=orbits.orbitState(record,at);if(!pv)continue;valid++;
  const got=model.observerLook(p,pv.position),ref=reference(p,pv.position);
  const azError=Math.min(Math.abs(got.azimuthDeg-ref.azimuthDeg),360-Math.abs(got.azimuthDeg-ref.azimuthDeg));
  assert.ok(azError<1e-6);assert.ok(Math.abs(got.elevationDeg-ref.elevationDeg)<1e-6);assert.ok(Math.abs(got.rangeKm-ref.rangeKm)<1e-6);
  if(ref.elevationDeg>0)expected.push(record.norad_id);samples.push({latitude,longitude,norad:record.norad_id,azError,elevationError:Math.abs(got.elevationDeg-ref.elevationDeg),rangeErrorKm:Math.abs(got.rangeKm-ref.rangeKm)});
 }
 const sky=model.skyCatalog(p,at);assert.equal(sky.valid,valid);assert.deepEqual(sky.above.map(s=>s.record.norad_id).sort((a,b)=>a-b),expected.sort((a,b)=>a-b));
 assert.equal(sky.valid+sky.unavailable,snapshot.items.length);
}
checks.push('六处观察者位置，含两极/日期变更线/海拔；全部有效目录观察角与独立ENU矩阵一致');
const p={latitude:0,longitude:0,altitudeMeters:0};
assert.ok(Math.abs(model.observerLook(p,[6378.137+500,0,0]).elevationDeg-90)<1e-8);
for(const [point,az] of [[[6378.137,500,0],90],[[6378.137,0,500],0]]){const look=model.observerLook(p,point);assert.ok(Math.abs(look.elevationDeg)<1e-8);assert.ok(Math.abs(look.azimuthDeg-az)<1e-8);}
assert.ok(model.observerLook(p,[-7000,0,0]).elevationDeg<0);checks.push('天顶90度、东90度/北0度与地平线以下方向');
for(const bad of [{...p,latitude:91},{...p,longitude:181},{...p,latitude:NaN},{...p,altitudeMeters:Infinity}])assert.equal(model.observerLook(bad,[7000,0,0]),null);
assert.equal(model.observerLook(p,[NaN,0,0]),null);assert.equal(model.observerLook(p,[6378.137,0,0]),null);
const expired=model.skyCatalog({...p,source:'manual'},at+365*86400000);assert.equal(expired.valid,0);assert.equal(expired.above.length,0);assert.equal(expired.unavailable,snapshot.items.length);checks.push('未知数值/位置守卫、超窗不伪造凌空名单');
const report={status:'passed',capturedAt:new Date().toISOString(),at:new Date(at).toISOString(),checks,sampleCount:samples.length,maxAzimuthErrorDeg:Math.max(...samples.map(s=>s.azError)),maxElevationErrorDeg:Math.max(...samples.map(s=>s.elevationError)),maxRangeErrorKm:Math.max(...samples.map(s=>s.rangeErrorKm)),sourceSha256:{'technical/observer-sky.ts':createHash('sha256').update(source).digest('hex'),'technical/orbits.ts':createHash('sha256').update(orbitsSource).digest('hex')},method:'Independent WGS84 observer ECEF and explicit ENU projection; atan2 elevation/azimuth; same SGP4 positions as inputs',limits:'ENU correctness, not independent SGP4 or physical position accuracy; no atmospheric refraction, terrain, optical visibility or live telemetry'};
await writeFile('technical/evidence/observer-sky-science.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:checks.length,samples:samples.length,maxElevationErrorDeg:report.maxElevationErrorDeg}));
