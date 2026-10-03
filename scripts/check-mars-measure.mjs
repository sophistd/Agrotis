import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const ts=createRequire(new URL('../technical/package.json',import.meta.url))('typescript');
const source=await readFile('technical/mars-measure.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {measureDisplacement,imagePoint}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<=1e-10*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`);
const checks=[];
const check=(name,test)=>{const detail=test();checks.push({name,status:'passed',...detail});};
// 170 px只是算术夹具，不是NASA出版图的标尺测量值。
const calibration={width:400,height:300,scaleBarMeters:85,scaleBarPixels:170,scaleBarPixelTolerance:1,startDate:'2007-06-30',endDate:'2007-10-13'};
const from={x:100,y:100},to={x:130,y:140};
const baseline=measureDisplacement(from,to,calibration);
assert.ok(baseline);
check('解析勾股案例与105个地球日',()=>{
 assert.deepEqual(baseline.deltaPixels,{x:30,y:40});close(baseline.pixelDistance,50);close(baseline.distanceMeters,25);
 close(baseline.intervalMeters.min,4080/171);close(baseline.intervalMeters.max,4420/169);
 assert.equal(baseline.elapsedDays,105);close(baseline.apparentMetersPerEarthYear,9131.25/105);
 close(baseline.rateInterval.min,(4080*365.25)/(171*105));close(baseline.rateInterval.max,(4420*365.25)/(169*105));
 assert.equal(baseline.uncertaintyScope,'picking-and-scale-only');assert.equal(baseline.registrationErrorMeters,null);
 return {distanceMeters:25,elapsedDays:105,intervalMeters:baseline.intervalMeters};
});
check('零容差、零位移与区间下限',()=>{
 const exact=measureDisplacement(from,to,{...calibration,scaleBarPixelTolerance:0},0);
 assert.deepEqual(exact.intervalMeters,{min:25,max:25});
 const coincident=measureDisplacement(from,from,calibration);
 assert.equal(coincident.pixelDistance,0);assert.equal(coincident.distanceMeters,0);assert.equal(coincident.intervalMeters.min,0);close(coincident.intervalMeters.max,170/169);
 assert.equal(measureDisplacement(from,{x:101,y:100},calibration).intervalMeters.min,0);
 return {coincidentIntervalMeters:coincident.intervalMeters};
});
check('原生像素重采样的尺度不变性',()=>{
 for(const factor of [.25,.5,2,4]){
  const scaled=measureDisplacement({x:from.x*factor,y:from.y*factor},{x:to.x*factor,y:to.y*factor},{...calibration,
   width:calibration.width*factor,height:calibration.height*factor,scaleBarPixels:calibration.scaleBarPixels*factor,scaleBarPixelTolerance:factor},factor);
  close(scaled.distanceMeters,baseline.distanceMeters);close(scaled.intervalMeters.min,baseline.intervalMeters.min);close(scaled.intervalMeters.max,baseline.intervalMeters.max);
  close(scaled.apparentMetersPerEarthYear,baseline.apparentMetersPerEarthYear);
 }
 return {factors:[.25,.5,2,4]};
});
check('旋转、反射和交换起终点的对称性',()=>{
 for(const target of [{x:140,y:70},{x:70,y:60},{x:60,y:130},{x:70,y:140}]){
  const transformed=measureDisplacement(from,target,calibration);close(transformed.distanceMeters,25);assert.deepEqual(transformed.intervalMeters,baseline.intervalMeters);
 }
 const reversed=measureDisplacement(to,from,calibration);assert.deepEqual(reversed.deltaPixels,{x:-30,y:-40});close(reversed.distanceMeters,25);
 return {transforms:5};
});
check('屏幕分辨率映射与真实内容矩形边界',()=>{
 const image={width:800,height:600};
 for(const width of [320,390,834,1440]){
  const rect={x:17,y:43,width,height:width*.75};
  const point=imagePoint(17+width*.25,43+width*.75*.5,rect,image);
  close(point.x,200);close(point.y,300);
  assert.deepEqual(imagePoint(17,43,rect,image),{x:0,y:0});assert.deepEqual(imagePoint(17+width,43+rect.height,rect,image),{x:800,y:600});
 }
 const content={x:20,y:90,width:400,height:300};
 assert.deepEqual(imagePoint(120,165,content,image),{x:200,y:150});
 for(const point of [{x:20,y:89},{x:19,y:90},{x:421,y:100},{x:200,y:391}])assert.equal(imagePoint(point.x,point.y,content,image),null);
 return {screenWidths:[320,390,834,1440],boundaryPolicy:'Continuous native-image edges included; outside actual image content rejected'};
});
check('UTC日期、闰年与365.25天地球年',()=>{
 const oneDay=measureDisplacement(from,to,{...calibration,startDate:'2007-06-30',endDate:'2007-07-01'});
 assert.equal(oneDay.elapsedDays,1);close(oneDay.apparentMetersPerEarthYear,9131.25);
 const leap=measureDisplacement(from,to,{...calibration,startDate:'2000-01-01',endDate:'2001-01-01'});
 assert.equal(leap.elapsedDays,366);
 const fourYears=measureDisplacement(from,to,{...calibration,startDate:'2000-01-01',endDate:'2004-01-01'});
 assert.equal(fourYears.elapsedDays,1461);close(fourYears.apparentMetersPerEarthYear,6.25);
 return {daysPerEarthYear:365.25,dateBoundary:'UTC midnight',fourCalendarYearsDays:1461};
});
check('两个点选圆与标尺长度误差的独立扰动包络',()=>{
 let samples=0;
 // 独立改变两个圆内点的位置和标尺长度；逐个实际距离必须落入解析保守界。
 for(const radius of [0,.5,1])for(let a=0;a<24;a++)for(let b=0;b<24;b++)for(const scaleLength of [169,170,171]){
  const first={x:100+radius*Math.cos(a*Math.PI/12),y:100+radius*Math.sin(a*Math.PI/12)};
  const second={x:130+radius*Math.cos(b*Math.PI/12),y:140+radius*Math.sin(b*Math.PI/12)};
  const dx=second.x-first.x,dy=second.y-first.y,value=Math.sqrt(dx*dx+dy*dy)*85/scaleLength;
  assert.ok(value>=baseline.intervalMeters.min-1e-10&&value<=baseline.intervalMeters.max+1e-10);samples++;
 }
 // 沿3:4方向的反向扰动恰好达到两端；随机/网格采样不能替代端点证明。
 close(Math.sqrt((30-1.2)**2+(40-1.6)**2)*85/171,baseline.intervalMeters.min);
 close(Math.sqrt((30+1.2)**2+(40+1.6)**2)*85/169,baseline.intervalMeters.max);
 return {samples,endpointCases:2,registrationErrorMeters:null};
});
check('有限值、量纲正值、出界和日期失败守卫',()=>{
 let cases=0;
 const rejects=(value)=>{assert.equal(value,null);cases++;};
 for(const value of [NaN,Infinity,-Infinity]){
  for(const key of ['width','height','scaleBarMeters','scaleBarPixels','scaleBarPixelTolerance'])rejects(measureDisplacement(from,to,{...calibration,[key]:value}));
  for(const key of ['x','y']){rejects(measureDisplacement({...from,[key]:value},to,calibration));rejects(measureDisplacement(from,{...to,[key]:value},calibration));}
  rejects(measureDisplacement(from,to,calibration,value));
  rejects(imagePoint(value,10,{x:0,y:0,width:400,height:300},calibration));rejects(imagePoint(10,value,{x:0,y:0,width:400,height:300},calibration));
  for(const key of ['x','y','width','height'])rejects(imagePoint(10,10,{x:0,y:0,width:400,height:300,[key]:value},calibration));
  for(const key of ['width','height'])rejects(imagePoint(10,10,{x:0,y:0,width:400,height:300},{...calibration,[key]:value}));
 }
 for(const key of ['width','height','scaleBarMeters','scaleBarPixels'])for(const value of [0,-1])rejects(measureDisplacement(from,to,{...calibration,[key]:value}));
 for(const value of [-1,170,171])rejects(measureDisplacement(from,to,{...calibration,scaleBarPixelTolerance:value}));
 rejects(measureDisplacement(from,to,{...calibration,scaleBarPixels:501}));rejects(measureDisplacement(from,to,calibration,-1));
 for(const point of [{x:-.1,y:10},{x:10,y:-.1},{x:400.1,y:10},{x:10,y:300.1}]){rejects(measureDisplacement(point,to,calibration));rejects(measureDisplacement(from,point,calibration));}
 for(const invalid of ['', 'bad-date','2007-02-29','2007-06-31','2007-13-01','2007-06-30T00:00:00Z']){
  rejects(measureDisplacement(from,to,{...calibration,startDate:invalid}));rejects(measureDisplacement(from,to,{...calibration,endDate:invalid}));
 }
 rejects(measureDisplacement(from,to,{...calibration,endDate:calibration.startDate}));
 rejects(measureDisplacement(from,to,{...calibration,startDate:calibration.endDate,endDate:calibration.startDate}));
 for(const dimension of ['width','height'])for(const value of [0,-1]){
  rejects(imagePoint(10,10,{x:0,y:0,width:400,height:300,[dimension]:value},calibration));
  rejects(imagePoint(10,10,{x:0,y:0,width:400,height:300},{width:400,height:300,[dimension]:value}));
 }
 rejects(measureDisplacement({x:0,y:0},{x:400,y:300},{...calibration,scaleBarMeters:Number.MAX_VALUE}));rejects(measureDisplacement(from,to,calibration,1e308));
 return {cases};
});
const report={status:'passed',capturedAt:new Date().toISOString(),sourceSha256:createHash('sha256').update(source).digest('hex'),checks,
 method:'Independent analytical triangles, image resampling and rotation invariants, UTC calendar examples, and 5184 independently perturbed point/scale combinations plus exact interval endpoints',
 fixture:{...calibration,note:'Synthetic arithmetic fixture; 170 px is not a measured NASA publication scale bar'},
 limits:'Only image-plane arithmetic and picking/scale tolerance propagation are verified. NASA crop scale calibration, orthorectification, image registration, feature matching, physical ground motion, and wind speed are not validated. Registration error remains unknown; interval is not total measurement uncertainty.'};
await writeFile('technical/evidence/mars-measure-science.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:checks.length,envelopeSamples:5184,guardCases:checks.at(-1).cases,sourceSha256:report.sourceSha256}));
