import { defineConfig } from 'vite';

// Deployed on a custom domain through GitHub Pages.
export default defineConfig({
  base: '/',
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
