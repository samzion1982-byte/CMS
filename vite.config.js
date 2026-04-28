import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: [
      'highcharts',
      'highcharts-react-official',
      'highcharts/highcharts-3d',
    ],
  },
})
