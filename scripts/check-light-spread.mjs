import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const ts=createRequire(new URL('../technical/package.json',import.meta.url))('typescript');
const source=await readFile('technical/light-spread.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {lightSpread,lightRatioLabel}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
// -- 独立积分：各向点源在固定正对小方片上的辐射通量 --------
function flux(r){
 const n=80,width=.01,dx=width/n;let sum=0;
 for(let i=0;i<n;i++)for(let j=0;j<n;j++){
  const x=-width/2+(i+.5)*dx,y=-width/2+(j+.5)*dx;
  // 距离平方与投影余弦由每个面积元的空间位置单独取得。
  const length=Math.hypot(r,x,y),cos=r/length;
  sum+=cos/(4*Math.PI*length*length)*dx*dx;
 }
 return sum;
}
const baseline=flux(10),samples=[];
for(let i=0;i<=40;i++){
 const d=1+i*3/40,value=lightSpread(d),ratio=flux(10*d)/baseline;
 const relativeError=Math.abs(ratio-value.irradianceRatio)/ratio;
 assert.ok(relativeError<3e-7);assert.ok(Math.abs(value.sphereAreaRatio*value.irradianceRatio-1)<1e-12);
 samples.push({distanceRatio:d,independentPlaneFluxRatio:ratio,productRatio:value.irradianceRatio,relativeError});
}
for(const value of [NaN,Infinity,-Infinity,0,-1,.9,4.1])assert.equal(lightSpread(value),null);
assert.equal(lightRatioLabel(2),'1/4');assert.equal(lightRatioLabel(3),'1/9');assert.equal(lightRatioLabel(4),'1/16');
const report={status:'passed',capturedAt:new Date().toISOString(),sourceSha256:createHash('sha256').update(source).digest('hex'),samples,
 method:'Midpoint spatial flux integral across fixed 0.01 m square, normal to isotropic point source; baseline distance 10 m, 80x80 cells',
 maxRelativeError:Math.max(...samples.map(s=>s.relativeError)),limits:'Independent model calculation and small-area limit; no photometry or live Sun measurement'};
await writeFile('technical/evidence/light-spread-science.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,samples:samples.length,maxRelativeError:report.maxRelativeError}));
