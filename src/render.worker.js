/**
 * Renders .scad source with an OpenSCAD WASM build (Manifold backend), off the
 * main thread.
 *
 * One renderer instance is reused across renders: instantiating the ~24 MB WASM
 * module costs about a second, a warm render costs 40–400 ms, and this build
 * survives re-entry. Older OpenSCAD WASM builds abort on the second callMain
 * (the package documents that, and it is why a fresh instance is created
 * whenever an abort is detected).
 */
import { createRenderer, isOpenScadWasmAbort } from '@loumalouomega/openscad-wasm';
import wasmUrl from '@loumalouomega/openscad-wasm/openscad-core.wasm?url';

const RECYCLE_AFTER = 50;

let renderer = null;
let renders = 0;

function getRenderer() {
  renderer ??= createRenderer({ reuse: true, wasmUrl, format: 'stl', backend: 'manifold' });
  return renderer;
}

function disposeRenderer() {
  try {
    renderer?.dispose();
  } catch {
    // A broken instance can throw on dispose; the reference is dropped anyway.
  }
  renderer = null;
}

self.onmessage = async ({ data }) => {
  const { id, code, defines = {} } = data;
  const started = performance.now();

  try {
    const result = await getRenderer().render(code, { format: 'stl', defines });
    const stl = result.output;
    const { warnings = [], errors = [] } = result.diagnostics ?? {};

    if (!(stl instanceof Uint8Array) || stl.length < 200) {
      throw new Error('OpenSCAD nie wygenerował geometrii — model jest pusty.');
    }

    renders += 1;
    self.postMessage(
      {
        id,
        ok: true,
        stl,
        warnings,
        errors,
        log: result.stderr ?? [],
        ms: Math.round(performance.now() - started),
      },
      [stl.buffer],
    );
  } catch (error) {
    const abort = typeof isOpenScadWasmAbort === 'function' && isOpenScadWasmAbort(error);
    if (abort) disposeRenderer();

    const diagnostics = error?.diagnostics ?? {};

    self.postMessage({
      id,
      ok: false,
      error: diagnostics.errors?.[0] ?? error?.message ?? 'Nie udało się wyrenderować modelu.',
      errors: diagnostics.errors ?? [],
      warnings: diagnostics.warnings ?? [],
      log: error?.stderr ?? [],
      ms: Math.round(performance.now() - started),
    });
  }

  if (renders >= RECYCLE_AFTER) {
    disposeRenderer();
    renders = 0;
  }
};
