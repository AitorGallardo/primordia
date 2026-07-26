import { defineConfig } from 'vite';

// Embedded under the portfolio's /lab path.
export default defineConfig({
  base: '/lab/primordia/',
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
