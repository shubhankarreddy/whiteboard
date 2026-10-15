import { get, set, del, keys } from "idb-keyval";

const META_KEY = "wb:meta";
const pageKey = (id) => `wb:page:${id}`;

export const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export async function loadMeta() {
  return (await get(META_KEY)) || null;
}

export async function saveMeta(meta) {
  await set(META_KEY, meta);
}

export async function loadPage(id) {
  return (await get(pageKey(id))) || { elements: [], appState: {}, files: {} };
}

export async function savePage(id, data) {
  await set(pageKey(id), data);
}

export async function deletePage(id) {
  await del(pageKey(id));
}

// Keep only the parts of Excalidraw's appState worth restoring.
// (The full appState holds temporary UI state like the active tool.)
export function pickAppState(appState) {
  return {
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    zoom: appState.zoom,
    viewBackgroundColor: appState.viewBackgroundColor,
    gridModeEnabled: appState.gridModeEnabled,
  };
}

// Keep only image files that are still used by a drawing element.
export function pickFiles(elements, files) {
  const out = {};
  for (const el of elements) {
    if (!el.isDeleted && el.type === "image" && el.fileId && files?.[el.fileId]) {
      out[el.fileId] = files[el.fileId];
    }
  }
  return out;
}

// Everything in one object, for the "Download backup" button.
export async function exportAll() {
  const meta = await loadMeta();
  const pages = [];
  for (const p of meta?.pages || []) {
    pages.push({ ...p, data: await loadPage(p.id) });
  }
  return {
    app: "my-whiteboard",
    version: 1,
    exportedAt: new Date().toISOString(),
    theme: meta?.theme || "light",
    pages,
  };
}

export async function listAllKeys() {
  return keys();
}
