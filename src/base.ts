// Where the site is served from: '' at a domain root, '/romp' under a subpath (BASE_PATH at build time, vite.config.ts).
// Every runtime path to a public/ file starts with this. Outside Vite (`npm run check` in node) there is no env: root.
export const ROOT = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '');
