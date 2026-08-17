/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    /* Vite does not read PORT on its own — it defaults to 5173 and quietly
       increments when that is taken. The harness assigns a free port through
       this variable, so honouring it is what lets two sessions run the same
       prototype side by side instead of one silently landing on 5174 while
       the tooling still points at 5173. */
    port: Number(process.env.PORT) || 5173,
  },
  test: {
    /* Off by default, which makes a `?inline` stylesheet import resolve to an
       empty string rather than fail — so an assertion about CSS silently passes
       nothing. The suite asserts where two shared utilities are defined, and
       that assertion is only worth having if it can actually read them. */
    css: true,
  },
})
