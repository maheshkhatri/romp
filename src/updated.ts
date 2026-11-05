// After a rebuild or redeploy, a tab that was already open still runs the old build, and the old build's hashed
// chunks (each game, the renderer, the tracker) are gone from the server: the next one it asks for fails to load.
// Then the only cure is the new build, so say so and reload — once. If the page reloaded for this a moment ago and it
// is failing again, the server is not simply newer (it is down, or the network is): reloading again would only loop.
const KEY = 'romp.updatedReload', AGAIN_MS = 60_000;

// True when the error is a script chunk that would not load (each browser words it its own way).
export const chunkFailed = (err: unknown) =>
  /dynamically imported module|importing a module script failed|failed to load module script|unable to preload|error loading dynamically imported/i.test(String((err as Error)?.message ?? err));

// Shows the message and reloads; false (and does nothing) when it already did so moments ago.
export function reloadForUpdate() {
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < AGAIN_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { return false; } // no way to remember having tried: never risk a loop
  if (!document.querySelector('.updated')) {
    const note = document.createElement('div');
    note.className = 'updated';
    note.textContent = 'Romp was updated — reloading…';
    document.body.append(note);
  }
  setTimeout(() => location.reload(), 1200);
  return true;
}

// Vite's own signal that a chunk's preload failed. Handled here, it does not also surface as an error.
addEventListener('vite:preloadError', (e) => { if (reloadForUpdate()) e.preventDefault(); });
