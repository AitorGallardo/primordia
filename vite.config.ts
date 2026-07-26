import { defineConfig } from 'vite';

// Served from the primordia repo's GitHub Pages at aitorgallardo.github.io/primordia/.
export default defineConfig({
  base: '/primordia/',
  build: {
    target: 'esnext',
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // transformers.js ships large wasm/onnx runtime bits; let it resolve at runtime.
    exclude: ['@huggingface/transformers'],
  },
});
