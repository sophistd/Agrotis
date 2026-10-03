import {readFile,writeFile,cp,mkdir,rm,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const destination=process.argv[2];
if(!destination)throw new Error('Usage: node scripts/prepare-pages.mjs NEW_OUTPUT_DIRECTORY');
const out=resolve(destination);
const apiOrigin=process.argv[3];
if(apiOrigin&&(!/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(apiOrigin)))throw new Error('API origin must be an explicit HTTPS vercel.app project');
await mkdir(out,{recursive:false});
await cp(join(root,'technical/dist'),out,{recursive:true});
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const source=await readFile(join(out,'assets/iss.glb'));
const expected='26dba905b4b7555edbcb0c5f5a61b5c18659f5166076ab27dbb0e64025759fca';
if(hash(source)!==expected)throw new Error('ISS input differs from verified NASA original');
const parts=[];
for(let offset=0,index=0;offset<source.length;offset+=16*1024*1024,index++){
 const bytes=source.subarray(offset,offset+16*1024*1024),path=`/assets/iss-part-${index}.bin`;
 await writeFile(join(out,path.slice(1)),bytes);parts.push({path,bytes:bytes.length,sha256:hash(bytes)});
}
const reconstructed=Buffer.concat(await Promise.all(parts.map(p=>readFile(join(out,p.path.slice(1))))));
if(hash(reconstructed)!==expected)throw new Error('ISS part reconstruction mismatch');
await rm(join(out,'assets/iss.glb'));
async function stripMaps(directory){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const p=join(directory,entry.name);
  if(entry.isDirectory())await stripMaps(p);
  else if(entry.name==='CLAUDE.md'||entry.name==='AGENTS.md')await rm(p);
 }
}
await stripMaps(out);
const worker=`// Agrotis Pages transport; original NASA bytes, no substitute geometry.\nconst apiOrigin=${JSON.stringify(apiOrigin??null)};\nconst parts=${JSON.stringify(parts)};\nconst total=${source.length};\nconst etag='"${expected}"';\nexport default {async fetch(request,env){\n const url=new URL(request.url);\n if(url.pathname.startsWith('/api/')){\n  if(!apiOrigin)return Response.json({error:'API_NOT_DEPLOYED',detail:'Science API not configured.'},{status:503});\n  const allowed=/^\\/api\\/v1\\/(health|events(?:\\/[A-Za-z0-9_-]+)?|catalog|satellites(?:\\/refresh)?|observations(?:\\/refresh)?|analyses\\/(?:orbit|geometry))$/.test(url.pathname);\n  if(!allowed)return new Response('Unknown API route',{status:404});\n  if(!['GET','POST','OPTIONS'].includes(request.method))return new Response(null,{status:405});\n  if(Number(request.headers.get('Content-Length')??0)>65536)return new Response('Request too large',{status:413});\n  const upstream=new URL(url.pathname,apiOrigin);upstream.search=url.search;\n  const headers=new Headers();if(request.headers.has('Content-Type'))headers.set('Content-Type',request.headers.get('Content-Type'));\n  return fetch(new Request(upstream,{method:request.method,headers,body:request.method==='POST'?request.body:undefined,redirect:'manual'}));\n }\n if(url.pathname!=='/assets/iss.glb')return env.ASSETS.fetch(request);\n if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});\n const headers={'Content-Type':'model/gltf-binary','Content-Length':String(total),'Cache-Control':'public, max-age=86400',ETag:etag};\n if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers:{ETag:etag}});\n if(request.method==='HEAD')return new Response(null,{headers});\n const responses=await Promise.all(parts.map(p=>env.ASSETS.fetch(new Request(new URL(p.path,url)))));\n if(responses.some((r,i)=>!r.ok||r.headers.get('Content-Type')?.includes('text/html')||(r.headers.has('Content-Length')&&Number(r.headers.get('Content-Length'))!==parts[i].bytes)))return new Response('Model parts unavailable',{status:503});\n const stream=new ReadableStream({async start(controller){try{for(let i=0;i<responses.length;i++){const reader=responses[i].body.getReader();let received=0;try{for(;;){const {done,value}=await reader.read();if(done)break;received+=value.byteLength;controller.enqueue(value);}if(received!==parts[i].bytes)throw new Error("Model part length mismatch");}finally{reader.releaseLock();}}controller.close();}catch(error){controller.error(error);}}});\n return new Response(stream,{headers});\n}};\n`;
await writeFile(join(out,'_worker.js'),worker);
await writeFile(join(out,'_routes.json'),JSON.stringify({version:1,include:['/assets/iss.glb','/api/*'],exclude:[]},null,2)+'\n');
const manifest={version:'agrotis-pages-transport/1',originalBytes:source.length,originalSha256:expected,parts,reconstructedSha256:hash(reconstructed),apiHosted:!!apiOrigin,apiOrigin:apiOrigin??null};
await writeFile(join(out,'assets/iss-transport.json'),JSON.stringify(manifest,null,2)+'\n');
const oversized=[];
async function inspect(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const p=join(directory,entry.name);if(entry.isDirectory())await inspect(p);else if((await stat(p)).size>25*1024*1024)oversized.push(p);}}
await inspect(out);if(oversized.length)throw new Error('Oversize Pages files: '+oversized.join(', '));
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
await writeFile(join(out,'deployment.json'),JSON.stringify({project:'Agrotis',revision,builtAt:new Date().toISOString(),apiOrigin:apiOrigin??null,omittedModels:['67p.glb','hubble-a.glb','bennu-near.glb','bennu-far.glb']},null,2)+'\n');
console.log(JSON.stringify({output:out,...manifest,revision,oversized},null,2));
