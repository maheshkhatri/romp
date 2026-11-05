#!/usr/bin/env node
// fit — every menu control must sit on-screen, because every screen is fixed and the hand cursor cannot scroll.
// (No dependencies; Node 22+ for the built-in WebSocket, and a Chrome or Chromium on this machine.)
//
//   npm run build && npm run fit           serve dist/ with `vite preview`, open it in headless Chrome with ?sim (no camera),
//                                          and at 1280x720, 1280x800, 1920x1080 and 1024x768 check Home (Solo, Together,
//                                          Take turns), Tracking, Stats and Badges: no screen scrolls, and every button and
//                                          table row lies inside the viewport. Exits 1 and lists what spills if anything does.
//   node tools/fit.mjs --url http://…      check a server that is already running instead
//   CHROME=/path/to/chrome                 pick the browser (default: the first of google-chrome, chromium, … on PATH)
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VIEWPORTS = [[1280, 720], [1280, 800], [1920, 1080], [1024, 768]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const kids = [];
const quit = (code) => { for (const k of kids) k.kill(); process.exit(code); };

const chrome = process.env.CHROME || ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome']
  .find((b) => { try { execFileSync('which', [b], { stdio: 'ignore' }); return true; } catch { return false; } });
if (!chrome) { console.error('fit: no Chrome found; set CHROME=/path/to/chrome'); process.exit(2); }

let url = arg('--url');
if (!url) {
  const port = 4190 + Math.floor(Math.random() * 400);
  kids.push(spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' }));
  url = `http://127.0.0.1:${port}`;
}
for (let i = 0; ; i++) { try { await fetch(url); break; } catch { if (i > 100) { console.error(`fit: ${url} did not answer`); quit(2); } await sleep(100); } }

const profile = mkdtempSync(join(tmpdir(), 'romp-fit-'));
const debugPort = 9300 + Math.floor(Math.random() * 400);
kids.push(spawn(chrome, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--mute-audio',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', 'about:blank'], { stdio: 'ignore' }));
process.on('exit', () => { try { rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } catch {} }); // Chrome may still be writing as it dies
let target;
for (let i = 0; !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find((t) => t.type === 'page'); } catch {}
  if (!target) { if (i > 100) { console.error('fit: Chrome did not start'); quit(2); } await sleep(100); }
}

// The smallest CDP client: send a command, await its reply.
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0; const waiting = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); waiting.get(m.id)?.(m); waiting.delete(m.id); });
const cdp = (method, params = {}) => new Promise((r) => { waiting.set(++seq, r); ws.send(JSON.stringify({ id: seq, method, params })); });
const js = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const press = async (text) => {
  const ok = await js(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(text)})); b?.click(); return !!b; })()`);
  if (!ok) throw new Error(`no button "${text}"`);
  await sleep(900); // past the screen-in and card-in animations, which move things while they play
};
// What spills: the screen scrolls, or a button or table row is not wholly inside the viewport.
const spills = () => js(`(() => {
  const s = document.querySelector('.screen'), bad = [];
  if (s.scrollHeight > s.clientHeight + 1) bad.push('screen scrolls ' + s.scrollHeight + ' > ' + s.clientHeight);
  for (const el of s.querySelectorAll('button, tr')) {
    const r = el.getBoundingClientRect();
    if (r.top < -0.5 || r.left < -0.5 || r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5)
      bad.push('"' + el.textContent.trim().slice(0, 24) + '" at ' + Math.round(r.left) + ',' + Math.round(r.top) + '-' + Math.round(r.right) + ',' + Math.round(r.bottom));
  }
  return bad;
})()`);

let failed = 0;
const check = async (where) => { const bad = await spills(); console.log(`${bad.length ? 'SPILL' : 'ok   '} ${where}${bad.map((b) => '\n        ' + b).join('')}`); failed += bad.length ? 1 : 0; };
try {
  await cdp('Page.enable'); await cdp('Runtime.enable');
  for (const [w, h] of VIEWPORTS) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: `${url}/?sim` });
    for (let i = 0; !(await js(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Start'))`)); i++) { if (i > 100) throw new Error('the start screen never showed'); await sleep(100); }
    await press('Start');
    for (const mode of ['Together', 'Take turns', 'Solo']) { await press(mode); await check(`${w}x${h} home · ${mode}`); }
    for (const screen of ['Tracking', 'Stats', 'Badges']) { await press(screen); await check(`${w}x${h} ${screen.toLowerCase()}`); await press('Back'); }
  }
} catch (e) { console.error('fit:', e.message); quit(2); }
console.log(failed ? `fit: ${failed} screen(s) spill off the viewport` : 'fit: every menu fits');
quit(failed ? 1 : 0);
