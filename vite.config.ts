import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // MapLibre v6 ships its worker as a separate ES module. Vite's dep optimiser
  // rewrites the import and the worker 404s, which leaves the map blank with no
  // error. Excluding it makes Vite serve the package's own module graph.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' },
})
