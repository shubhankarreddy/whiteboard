import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" makes the built site work from any folder or sub-path
// (Netlify, Cloudflare Pages, GitHub Pages project sites, etc.)
export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    "process.env.IS_PREACT": JSON.stringify("false"),
  },
  build: {
    chunkSizeWarningLimit: 6000,
  },
});
