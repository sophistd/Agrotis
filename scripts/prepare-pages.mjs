import {readFile,writeFile,cp,mkdir,rm,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const destination=process.argv[2],apiOrigin=process.argv[3];
if(!destination)throw new Error('Usage: prepare-pages.mjs NEW_OUTPUT_DIRECTORY [HTTPS_API_ORIGIN]');
if(apiOrigin&&!/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(apiOrigin))throw new Error('API origin must be an explicit HTTPS vercel.app project');
const out=resolve(destination);
await mkdir(out,{recursive:false});
await cp(join(root,'technical/dist'),out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const models={};
for(const file of ['iss.glb','moon.glb','moon-far.glb']){
 const source=await readFile(join(out,'assets',file)),digest=hash(source);
 if(file==='iss.glb'&&digest!=='26dba905b4b7555edbcb0c5f5a61b5c18659f5166076ab27dbb0e64025759fca')throw new Error('ISS input differs from verified NASA original');
 const parts=[];
 for(let offset=0,index=0;offset<source.length;offset+=2*1024*1024,index++){
  const bytes=source.subarray(offset,offset+2*1024*1024),path=`/assets/${file.slice(0,-4)}-part-${index}.bin`;
  await writeFile(join(out,path.slice(1)),bytes);parts.push({path,bytes:bytes.length,sha256:hash(bytes)});
 }
 const restored=Buffer.concat(await Promise.all(parts.map(p=>readFile(join(out,p.path.slice(1))))));
 if(hash(restored)!==digest)throw new Error('Model reconstruction mismatch');
 models['/assets/'+file]={parts,bytes:source.length,sha256:digest};
 await rm(join(out,'assets',file));
}
async function inspect(directory){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const p=join(directory,entry.name);
  if(entry.isDirectory())await inspect(p);
  else if(['CLAUDE.md','AGENTS.md'].includes(entry.name))await rm(p);
  else if((await stat(p)).size>25*1024*1024)throw new Error('Oversize Pages asset: '+p);
 }
}
await inspect(out);
const worker=`// Agrotis transport preserves original scientific model bytes.
const apiOrigin=${JSON.stringify(apiOrigin??null)};
const models=${JSON.stringify(models)};
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname.startsWith('/api/')){
  if(!apiOrigin)return Response.json({error:'API_NOT_DEPLOYED'},{status:503});
  if(!/^\\/api\\/v1\\/(health|events(?:\\/[A-Za-z0-9_-]+)?|catalog|satellites(?:\\/refresh)?|observations(?:\\/refresh)?|analyses\\/(?:orbit|geometry))$/.test(url.pathname))return new Response('Unknown API route',{status:404});
  if(!['GET','POST','OPTIONS'].includes(request.method))return new Response(null,{status:405});
  if(Number(request.headers.get('Content-Length')??0)>65536)return new Response('Request too large',{status:413});
  const upstream=new URL(url.pathname,apiOrigin);upstream.search=url.search;
  const headers=new Headers();if(request.headers.has('Content-Type'))headers.set('Content-Type',request.headers.get('Content-Type'));
  return fetch(new Request(upstream,{method:request.method,headers,body:request.method==='POST'?request.body:undefined,redirect:'manual'}));
 }
 const model=models[url.pathname];if(!model)return env.ASSETS.fetch(request);
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
 const etag='"'+model.sha256+'"';
 const headers={'Content-Type':'model/gltf-binary','Content-Length':String(model.bytes),'Cache-Control':'public, max-age=86400',ETag:etag};
 if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers:{ETag:etag}});
 if(request.method==='HEAD')return new Response(null,{headers});
 const stream=new ReadableStream({async start(controller){try{
  for(const part of model.parts){
   const response=await env.ASSETS.fetch(new Request(new URL(part.path,url)));
   if(!response.ok||response.headers.get('Content-Type')?.includes('text/html'))throw new Error('Model part unavailable');
   const reader=response.body.getReader();let received=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;received+=value.byteLength;controller.enqueue(value);}if(received!==part.bytes)throw new Error('Model part length mismatch');}finally{reader.releaseLock();}
  }controller.close();
 }catch(error){controller.error(error);}}});
 return new Response(stream,{headers});
}};
`;
await writeFile(join(out,'_worker.js'),worker);
await writeFile(join(out,'_routes.json'),JSON.stringify({version:1,include:[...Object.keys(models),'/api/*'],exclude:[]},null,2)+'\n');
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const manifest={project:'Agrotis',revision,builtAt:new Date().toISOString(),apiOrigin:apiOrigin??null,omittedModels:['67p.glb','hubble-a.glb','bennu-near.glb','bennu-far.glb'],models};
await writeFile(join(out,'deployment.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({output:out,revision,apiOrigin,models:Object.fromEntries(Object.entries(models).map(([path,m])=>[path,{bytes:m.bytes,sha256:m.sha256,parts:m.parts.length}]))},null,2));
