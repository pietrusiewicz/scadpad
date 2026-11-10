/**
 * Main-thread client for the render worker: request/response matching, a hard
 * timeout for pathological models, and a fresh worker after a recycle.
 */
const RENDER_TIMEOUT_MS = 120_000;

export class Renderer {
  constructor() {
    this.worker = null;
    this.pending = null;
    this.nextId = 1;
  }

  get isBusy() {
    return this.pending !== null;
  }

  /**
   * @param {string} code .scad source
   * @param {Record<string, unknown>} defines `-D` values, one entry per parameter
   * @returns {Promise<{ stl: Uint8Array, ms: number, warnings: string[] }>}
   */
  render(code, defines = {}) {
    if (this.pending) {
      return Promise.reject(new Error('Render już trwa.'));
    }

    const worker = this.ensureWorker();
    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.discard();
        reject(new Error(`Render przekroczył ${RENDER_TIMEOUT_MS / 1000} s i został przerwany.`));
      }, RENDER_TIMEOUT_MS);

      this.pending = { id, resolve, reject, timer };
      worker.postMessage({ id, code, defines });
    });
  }

  ensureWorker() {
    if (this.worker) return this.worker;

    const worker = new Worker(new URL('./render.worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event) => this.onMessage(event.data));
    worker.addEventListener('error', (event) => {
      this.fail(new Error(`Worker padł: ${event.message || 'nieznany błąd'}`));
    });
    this.worker = worker;
    return worker;
  }

  onMessage(data) {
    if (data.recycled) {
      // The worker closed itself after N renders; next render spawns a new one.
      this.worker = null;
      return;
    }

    if (!this.pending || data.id !== this.pending.id) return;
    const { resolve, reject, timer } = this.pending;
    clearTimeout(timer);
    this.pending = null;

    if (!data.ok) {
      const error = new Error(data.error || 'Nie udało się wyrenderować modelu.');
      error.log = data.log;
      error.warnings = data.warnings;
      error.errors = data.errors;
      reject(error);
      return;
    }

    resolve({
      stl: data.stl,
      ms: data.ms,
      warnings: data.warnings ?? [],
      log: data.log ?? [],
    });
  }

  fail(error) {
    if (!this.pending) return;
    const { reject, timer } = this.pending;
    clearTimeout(timer);
    this.pending = null;
    this.discard();
    reject(error);
  }

  discard() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
