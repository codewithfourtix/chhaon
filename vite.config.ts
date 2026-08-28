import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Emit MapLibre's worker next to the bundle.
 *
 * MapLibre 6 builds the worker URL at runtime:
 *
 *     new Worker(new URL(`./${isDev ? 'maplibre-gl-worker-dev' : 'maplibre-gl-worker'}.mjs`,
 *                        import.meta.url), { type: 'module' })
 *
 * The filename comes from a ternary, so Vite cannot statically analyse it and
 * never emits the file. In the production bundle `import.meta.url` is the
 * hashed chunk in /assets/, so the browser requests
 * `/assets/maplibre-gl-worker.mjs`, a static host answers with the SPA's
 * index.html, and `new Worker` hangs on HTML forever.
 *
 * The symptom is nasty because it is silent and asymmetric: raster basemaps
 * (satellite imagery) never touch the worker and render fine, while the vector
 * basemap — which needs the worker to parse tiles — renders nothing at all. No
 * console error, no failed request; just one entry stuck pending.
 *
 * So copy the worker and the shared chunk it imports into assets/, unhashed,
 * under the exact names MapLibre asks for.
 */
function maplibreWorker(): Plugin {
  const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']
  return {
    name: 'chhaon:maplibre-worker',
    apply: 'build',
    generateBundle() {
      const require = createRequire(import.meta.url)
      const dist = dirname(require.resolve('maplibre-gl/dist/maplibre-gl.mjs'))
      for (const file of FILES) {
        this.emitFile({
          type: 'asset',
          fileName: `assets/${file}`,
          source: readFileSync(join(dist, file), 'utf8'),
        })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), maplibreWorker()],
  // In dev, Vite's dep optimiser rewrites the same worker import and it 404s,
  // which leaves the map blank with no error. Excluding it makes Vite serve
  // the package's own module graph, where the relative URL resolves.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' },
})
