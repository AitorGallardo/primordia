import { defineConfig } from 'vite';

// Deployed under a subpath on GitHub Pages.
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
