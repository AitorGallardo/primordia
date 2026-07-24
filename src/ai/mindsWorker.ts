/// <reference lib="webworker" />
import { pipeline, env, type TextGenerationPipeline } from '@huggingface/transformers';

// Keep everything remote-fetched from the HF hub; no local model files bundled.
env.allowLocalModels = false;

const MODEL_ID = 'onnx-community/SmolLM2-135M-Instruct';

let generator: TextGenerationPipeline | null = null;
let backend: 'webgpu' | 'wasm' = 'wasm';

type InMsg =
  | { type: 'init' }
  | { type: 'generate'; id: number; system: string; user: string };

function hasWebGPU(): boolean {
  try {
    return typeof navigator !== 'undefined' && 'gpu' in navigator && !!(navigator as unknown as { gpu: unknown }).gpu;
  } catch {
    return false;
  }
}

async function load(): Promise<void> {
  const progress = (p: unknown) => {
    const d = p as { status?: string; file?: string; progress?: number; loaded?: number; total?: number };
    self.postMessage({ type: 'progress', ...d });
  };

  const tryDevice = async (device: 'webgpu' | 'wasm') => {
    backend = device;
    // The pipeline() option union is enormous; cast to keep tsc from choking.
    const build = pipeline as unknown as (
      task: string,
      model: string,
      opts: Record<string, unknown>,
    ) => Promise<TextGenerationPipeline>;
    generator = await build('text-generation', MODEL_ID, {
      device,
      dtype: device === 'webgpu' ? 'q4f16' : 'q8',
      progress_callback: progress,
    });
  };

  if (hasWebGPU()) {
    try {
      await tryDevice('webgpu');
    } catch (err) {
      self.postMessage({ type: 'warn', message: `webgpu failed, falling back to wasm: ${String(err)}` });
      generator = null;
      await tryDevice('wasm');
    }
  } else {
    await tryDevice('wasm');
  }

  self.postMessage({ type: 'ready', backend });
}

async function generate(id: number, system: string, user: string): Promise<void> {
  if (!generator) {
    self.postMessage({ type: 'result', id, ok: false, error: 'not-loaded' });
    return;
  }
  try {
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    const out = (await generator(messages as never, {
      max_new_tokens: 48,
      do_sample: true,
      temperature: 0.75,
      top_p: 0.9,
      repetition_penalty: 1.2,
    })) as Array<{ generated_text: unknown }>;

    let text = '';
    const gt = out?.[0]?.generated_text;
    if (typeof gt === 'string') {
      text = gt;
    } else if (Array.isArray(gt)) {
      const last = gt[gt.length - 1] as { content?: string };
      text = last?.content ?? '';
    }
    self.postMessage({ type: 'result', id, ok: true, text });
  } catch (err) {
    self.postMessage({ type: 'result', id, ok: false, error: String(err) });
  }
}

self.addEventListener('message', (ev: MessageEvent<InMsg>) => {
  const msg = ev.data;
  if (msg.type === 'init') void load();
  else if (msg.type === 'generate') void generate(msg.id, msg.system, msg.user);
});
