import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
   optimizeDeps: {
  //   exclude: ['@aws-amplify/ui-react-liveness'],
     include: ['@aws-amplify/ui-react', 'aws-amplify']
   },
  server: {
    port: 5173,
    strictPort: false
  }
})
