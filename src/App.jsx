import React, { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw, exportToCanvas } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import {
  loadMeta,
  saveMeta,
  loadPage,
  savePage,
  deletePage,
  pickAppState,
  pickFiles,
  exportAll,
  newId,
} from "./storage.js";

const SAVE_DELAY_MS = 700;

export default function App() {
  const [meta, setMeta] = useState(null); // { pages:[{id,name}], activeId, theme }
  const [scene, setScene] = useState(null); // { id, data } for the open page
  const [status, setStatus] = useState("");
  const [dragId, setDragId] = useState(null);

  const latest = useRef(null); // latest unsaved { id, elements, appState, files }
  const timer = useRef(null);
  const fileInput = useRef(null);
  const metaRef = useRef(null);
  metaRef.current = meta;

  // ---------- startup ----------
  useEffect(() => {
    (async () => {
      try {
        // Ask the browser not to clear our data when disk space is low
        navigator.storage?.persist?.();
      } catch {}
      let m = await loadMeta();
      if (!m || !m.pages?.length) {
        const id = newId();
        m = { pages: [{ id, name: "Page 1" }], activeId: id, theme: "light" };
        await saveMeta(m);
      }
      const data = await loadPage(m.activeId);
      setMeta(m);
      setScene({ id: m.activeId, data });
    })();
  }, []);

  // ---------- saving ----------
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const l = latest.current;
    if (!l) return;
    latest.current = null;
    try {
      await savePage(l.id, {
        elements: l.elements,
        appState: pickAppState(l.appState),
        files: pickFiles(l.elements, l.files),
      });
      setStatus("Saved");
    } catch (e) {
      console.error(e);
      setStatus("Could not save!");
    }
  }, []);

  const onChange = useCallback(
    (elements, appState, files) => {
      if (!scene) return;
      latest.current = { id: scene.id, elements, appState, files };
      setStatus("Saving…");
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    [scene, flush]
  );

  // Save when the tab is hidden or closed
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flush]);

  const updateMeta = async (next) => {
    setMeta(next);
    await saveMeta(next);
  };

  // ---------- pages ----------
  const openPage = async (id) => {
    if (id === scene?.id) return;
    await flush();
    const data = await loadPage(id);
    await updateMeta({ ...metaRef.current, activeId: id });
    setScene({ id, data });
  };

  const addPage = async () => {
    await flush();
    const id = newId();
    const m = metaRef.current;
    const name = `Page ${m.pages.length + 1}`;
    await savePage(id, { elements: [], appState: {}, files: {} });
    await updateMeta({ ...m, pages: [...m.pages, { id, name }], activeId: id });
    setScene({ id, data: { elements: [], appState: {}, files: {} } });
  };

  const renamePage = async (id) => {
    const m = metaRef.current;
    const page = m.pages.find((p) => p.id === id);
    const name = window.prompt("Rename page:", page.name);
    if (!name || !name.trim()) return;
    await updateMeta({
      ...m,
      pages: m.pages.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)),
    });
  };

  const duplicatePage = async (id) => {
    await flush();
    const m = metaRef.current;
    const page = m.pages.find((p) => p.id === id);
    const data = await loadPage(id);
    const nid = newId();
    await savePage(nid, data);
    const idx = m.pages.findIndex((p) => p.id === id);
    const pages = [...m.pages];
    pages.splice(idx + 1, 0, { id: nid, name: `${page.name} (copy)` });
    await updateMeta({ ...m, pages, activeId: nid });
    setScene({ id: nid, data });
  };

  const removePage = async (id) => {
    const m = metaRef.current;
    if (m.pages.length <= 1) {
      window.alert("You need at least one page.");
      return;
    }
    const page = m.pages.find((p) => p.id === id);
    if (!window.confirm(`Delete "${page.name}"? This cannot be undone.`)) return;
    if (id === scene.id) latest.current = null; // don't re-save a deleted page
    const idx = m.pages.findIndex((p) => p.id === id);
    const pages = m.pages.filter((p) => p.id !== id);
    await deletePage(id);
    if (id === scene.id) {
      const nextId = pages[Math.max(0, idx - 1)].id;
      const data = await loadPage(nextId);
      await updateMeta({ ...m, pages, activeId: nextId });
      setScene({ id: nextId, data });
    } else {
      await updateMeta({ ...m, pages });
    }
  };

  const dropOn = async (targetId) => {
    if (!dragId || dragId === targetId) return;
    const m = metaRef.current;
    const pages = [...m.pages];
    const from = pages.findIndex((p) => p.id === dragId);
    const to = pages.findIndex((p) => p.id === targetId);
    const [moved] = pages.splice(from, 1);
    pages.splice(to, 0, moved);
    setDragId(null);
    await updateMeta({ ...m, pages });
  };

  // ---------- theme ----------
  const toggleTheme = () =>
    updateMeta({ ...metaRef.current, theme: metaRef.current.theme === "dark" ? "light" : "dark" });

  // ---------- backup / import ----------
  const downloadBackup = async () => {
    await flush();
    const all = await exportAll();
    const blob = new Blob([JSON.stringify(all)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `whiteboard-backup-${stamp}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // ---------- PDF ----------
  // One PDF page per whiteboard page (empty pages skipped), each sized to its drawing.
  const exportPdf = async () => {
    await flush();
    setStatus("Making PDF…");
    try {
      const { jsPDF } = await import("jspdf"); // loaded only when needed
      let pdf = null;
      for (const p of metaRef.current.pages) {
        const data = await loadPage(p.id);
        const elements = (data.elements || []).filter((el) => !el.isDeleted);
        if (!elements.length) continue;
        let scale = 1;
        const canvas = await exportToCanvas({
          elements,
          appState: {
            exportBackground: true,
            exportWithDarkMode: false,
            viewBackgroundColor: data.appState?.viewBackgroundColor || "#ffffff",
          },
          files: data.files || {},
          exportPadding: 24,
          // Sharp but bounded: 2x, capped at 4000 px on the long side
          getDimensions: (w, h) => {
            scale = Math.min(2, 4000 / Math.max(w, h));
            return { width: w * scale, height: h * scale, scale };
          },
        });
        // 1 CSS px = 0.75 pt
        const w = (canvas.width / scale) * 0.75;
        const h = (canvas.height / scale) * 0.75;
        const orientation = w > h ? "landscape" : "portrait";
        if (!pdf) pdf = new jsPDF({ unit: "pt", format: [w, h], orientation });
        else pdf.addPage([w, h], orientation);
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h, undefined, "FAST");
      }
      if (!pdf) {
        setStatus("");
        window.alert("Nothing to export: all pages are empty.");
        return;
      }
      pdf.save(`whiteboard-${new Date().toISOString().slice(0, 10)}.pdf`);
      setStatus("PDF ready");
    } catch (err) {
      console.error(err);
      setStatus("");
      window.alert("Could not make the PDF.");
    }
  };

  const importBackup = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const all = JSON.parse(await file.text());
      if (all?.app !== "my-whiteboard" || !Array.isArray(all.pages)) {
        window.alert("This file is not a backup from this whiteboard.");
        return;
      }
      await flush();
      const added = [];
      for (const p of all.pages) {
        const id = newId();
        await savePage(id, p.data);
        added.push({ id, name: `${p.name} (imported)` });
      }
      const m = metaRef.current;
      const firstId = added[0]?.id;
      await updateMeta({ ...m, pages: [...m.pages, ...added], activeId: firstId ?? m.activeId });
      if (firstId) setScene({ id: firstId, data: await loadPage(firstId) });
      window.alert(`Imported ${added.length} page(s). Your existing pages were kept.`);
    } catch (err) {
      console.error(err);
      window.alert("Could not read that file.");
    }
  };

  if (!meta || !scene) return <div className="loading">Loading…</div>;

  const dark = meta.theme === "dark";

  return (
    <div className={`app ${dark ? "dark" : ""}`}>
      <header className="topbar">
        <div className="title">My Whiteboard</div>
        <div className="spacer" />
        <span className="status">{status}</span>
        <button onClick={toggleTheme}>{dark ? "Light mode" : "Dark mode"}</button>
        <button onClick={exportPdf}>Export PDF</button>
        <button onClick={downloadBackup}>Download backup</button>
        <button onClick={() => fileInput.current?.click()}>Import backup</button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={importBackup}
        />
      </header>

      <nav className="tabs">
        {meta.pages.map((p) => (
          <div
            key={p.id}
            className={`tab ${p.id === scene.id ? "active" : ""}`}
            draggable
            onDragStart={() => setDragId(p.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dropOn(p.id)}
            onClick={() => openPage(p.id)}
            onDoubleClick={() => renamePage(p.id)}
            title="Click to open · double-click to rename · drag to reorder"
          >
            <span className="tab-name">{p.name}</span>
            {p.id === scene.id && (
              <span className="tab-actions">
                <button
                  title="Rename"
                  onClick={(e) => {
                    e.stopPropagation();
                    renamePage(p.id);
                  }}
                >
                  ✎
                </button>
                <button
                  title="Duplicate"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicatePage(p.id);
                  }}
                >
                  ⧉
                </button>
                <button
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    removePage(p.id);
                  }}
                >
                  ✕
                </button>
              </span>
            )}
          </div>
        ))}
        <button className="new-tab" onClick={addPage}>
          + New page
        </button>
      </nav>

      <main className="canvas">
        {/* key = page id → each page gets a clean editor (and its own undo history) */}
        <Excalidraw
          key={scene.id}
          initialData={{
            elements: scene.data.elements || [],
            appState: scene.data.appState || {},
            files: scene.data.files || {},
            scrollToContent: !scene.data.appState?.scrollX && (scene.data.elements || []).length > 0,
          }}
          theme={dark ? "dark" : "light"}
          onChange={onChange}
        />
      </main>
    </div>
  );
}
