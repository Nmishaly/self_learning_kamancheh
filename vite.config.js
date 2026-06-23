import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind to all interfaces so you can open the app from your phone
    // on the same network (e.g. http://<your-computer-ip>:5173).
    host: true,
    port: 5173,
  },
})
