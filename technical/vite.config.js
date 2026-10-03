import {defineConfig} from 'vite';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const models=readdirSync(fileURLToPath(new URL('./public/assets',import.meta.url))).filter(file=>file.endsWith('.glb'));
const commonJsDependencies=['bitmap-sdf','draco3d','grapheme-splitter','lerc','mersenne-twister','protobufjs','urijs'];
const legacyIncludes=[...commonJsDependencies.map(name=>`cesium > @cesium/engine > ${name}`),'cesium > @cesium/widgets > nosleep.js'];
export default defineConfig({define:{__AGROTIS_MODELS__:JSON.stringify(models)},server:{proxy:{'^/api/':{target:'http://127.0.0.1:8000',changeOrigin:true}}},
  preview:{proxy:{'^/api/':{target:'http://127.0.0.1:8000',changeOrigin:true}}},
  build:{rollupOptions:{input:{main:'index.html',validation:'validation.html'}}},
  optimizeDeps:{exclude:['cesium'],include:legacyIncludes}});
