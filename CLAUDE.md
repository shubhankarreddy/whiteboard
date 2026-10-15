# My Whiteboard

Multi-page infinite whiteboard in the browser, built on Excalidraw. Static site, no backend.
Used by one person on one device, for teaching/recording and note-taking.

## Commands
- `npm install`: install dependencies
- `npm run dev`: dev server
- `npm run build`: production build into `dist/` (upload that folder to a static host)
- `npm run preview`: serve the built site locally (port 4173)

## Stack
React 18, Vite, `@excalidraw/excalidraw` 0.18.x, `idb-keyval` (IndexedDB). Plain JavaScript (no TypeScript).

## Files
- `src/App.jsx`: UI and logic: page tabs (new, rename, duplicate, delete, drag to reorder), debounced autosave, dark mode, backup/import, Export PDF.
- `src/storage.js`: IndexedDB helpers (`wb:meta` = page list, active page, theme; `wb:page:<id>` = `{ elements, appState, files }`).
- `src/styles.css`: layout and theme.
- `index.html`: sets `window.EXCALIDRAW_ASSET_PATH = "./"` so fonts load from `public/fonts` (copied from `node_modules/@excalidraw/excalidraw/dist/prod/fonts`), not a public CDN.
- `vite.config.js`: `base: "./"` so the build works from any sub-path (e.g. GitHub Pages project sites); defines `process.env.IS_PREACT`.

## Design decisions
- One `<Excalidraw>` instance, remounted with `key={pageId}` on page switch (clean undo history per page).
- Autosave: `onChange` -> 700 ms debounce -> IndexedDB; also flushed on page switch and when the tab is hidden/closed.
- Only a small part of `appState` is saved (scroll, zoom, background colour, grid). Only image `files` still used by an element are saved.
- Import adds the backup's pages as new pages (never overwrites existing ones).
- Export PDF: one PDF page per non-empty whiteboard page, sized to its drawing, always light theme. Each page is a PNG (2x, max 4000 px long side) via Excalidraw `exportToCanvas`, assembled with `jspdf` (lazy-loaded on click).
- Data lives in one browser profile only; different browsers/profiles do not share it. Backup/import is the way to move data.

## Verified
Headless Chromium (Playwright) test: drawings stay separate per page, persist across reload, duplicate/delete work, backup JSON contains all pages, no console errors.

## Ideas not built yet
- Autosave to a file in a shared folder (File System Access API) to sync Chrome and Edge.
- Page thumbnails / page list.

## Deploy
Repo: https://github.com/shubhankarreddy/whiteboard. Every push to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml`. Live at https://shubhankarreddy.github.io/whiteboard/.
