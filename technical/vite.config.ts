import {defineConfig} from 'vite';
const commonJsDependencies=['bitmap-sdf','draco3d','grapheme-splitter','lerc','mersenne-twister','protobufjs','urijs'];
const legacyIncludes=[...commonJsDependencies.map(name=>`cesium > @cesium/engine > ${name}`),'cesium > @cesium/widgets > nosleep.js'];
export default defineConfig({server:{proxy:{'^/api/':{target:'http://127.0.0.1:8000',changeOrigin:true}}},
  preview:{proxy:{'^/api/':{target:'http://127.0.0.1:8000',changeOrigin:true}}},
  build:{rollupOptions:{input:{main:'index.html',validation:'validation.html'}}},
  optimizeDeps:{exclude:['cesium'],include:legacyIncludes}});
