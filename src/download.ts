// The tracker's first start downloads ~15–21 MB (the wasm runtime and a pose model). These fetch them by hand so the
// bytes can be counted — the Start screen shows them arriving, and the page can tell a slow download that is still
// moving from one that has stalled. Shared by the worker and the main-thread fallback.

// Bytes so far and, once every response has said how big it is, the total (0 while unknown). A compressed response
// counts its decompressed bytes, so its Content-Length is no use as a total: that file's size stays unknown.
export type Progress = { got: number; total: number };

export async function fetchAll(urls: string[], onProgress: (p: Progress) => void) {
  const got = urls.map(() => 0), size: (number | null | undefined)[] = urls.map(() => undefined);
  let last = 0;
  const tell = (force = false) => {
    const now = performance.now();
    if (!force && now - last < 100) return; // ten updates a second is plenty for a progress bar
    last = now;
    onProgress({ got: got.reduce((a, b) => a + b, 0), total: size.every((s) => s) ? (size as number[]).reduce((a, b) => a + b, 0) : 0 });
  };
  const one = async (url: string, i: number) => {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
    const length = Number(res.headers.get('content-length'));
    size[i] = !res.headers.get('content-encoding') && length > 0 ? length : null;
    const parts: Uint8Array[] = [], reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      got[i] += value.length;
      tell();
    }
    const bytes = new Uint8Array(got[i]);
    let at = 0;
    for (const p of parts) bytes.set(p, at), (at += p.length);
    return bytes;
  };
  const files = await Promise.all(urls.map(one));
  tell(true);
  return files;
}
