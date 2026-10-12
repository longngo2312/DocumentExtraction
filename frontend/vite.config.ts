import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
// plugin-react v6 moved to oxc and dropped its own `babel` option, so the React
// Compiler is wired as a separate rolldown plugin.
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
})
