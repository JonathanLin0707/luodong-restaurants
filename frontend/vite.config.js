import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 建置時把 dist/sw.js 裡的 __SW_VERSION__ 換成這次部署的版本：
// Render 上用 RENDER_GIT_COMMIT，本機用建置時間戳。每次部署版本不同，舊快取才會被清掉。
function swVersionPlugin() {
  let outDir = 'dist'
  return {
    name: 'luodong-sw-version',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const swPath = path.join(outDir, 'sw.js')
      if (!fs.existsSync(swPath)) return
      const version = (process.env.RENDER_GIT_COMMIT || '').slice(0, 12) || `build-${Date.now()}`
      const source = fs.readFileSync(swPath, 'utf8')
      fs.writeFileSync(swPath, source.replaceAll('__SW_VERSION__', version))
    },
  }
}

export default defineConfig({
  plugins: [react(), swVersionPlugin()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
  },
})
