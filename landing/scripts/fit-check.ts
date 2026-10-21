// Checks that every top-level section of the landing fits one viewport on its own, at five screen sizes:
// its height is at most the viewport's, and no text, table cell, field or button inside it spills out of it.
// Runs against the preview server with a headless Chrome over the DevTools protocol (reduced motion, so no
// entrance is mid-flight). Exits 1 on any failure.
//   npm run build:landing && npm run preview -w landing -- --port 4173   (in another terminal)
//   npx tsx landing/scripts/fit-check.ts [http://localhost:4173]
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] ?? "http://localhost:4173";
const chrome = process.env.CHROME ?? join(homedir(), ".cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell");
const VIEWPORTS: [number, number][] = [[1440, 900], [1366, 768], [1920, 1080], [768, 1024], [390, 844]];
const port = 9351;

/** Runs in the page: one row per section, with its height and the elements that spill out of it. */
const MEASURE = `(() => {
  const vh = innerHeight, vw = innerWidth;
  const sections = [...document.querySelectorAll("#root > header, main > section, #root > footer")];
  const TEXT = "h1,h2,h3,p,li,dt,dd,th,td,a,button,label,input,textarea,figcaption,legend,span.map-title";
  return sections.map((s) => {
    const r = s.getBoundingClientRect();
    // Visually hidden on purpose (a honeypot, .sr-only, a skip link at rest): clipped to 1 px somewhere up the tree,
    // or placed wholly off the screen; or folded away in a closed <details> (a chart's table of numbers). Those are
    // not spills.
    const hiddenOnPurpose = (el) => {
      const folded = el.closest("details:not([open])");
      if (folded && !el.closest("summary")) return true;
      for (let n = el; n && n !== s; n = n.parentElement) { const b = n.getBoundingClientRect(); if (b.width <= 1 && b.height <= 1) return true; }
      const e = el.getBoundingClientRect();
      return e.right <= 0 || e.left >= vw;
    };
    const spill = [...s.querySelectorAll(TEXT)].filter((el) => {
      const e = el.getBoundingClientRect();
      if (!e.width || !e.height || getComputedStyle(el).visibility === "hidden" || hiddenOnPurpose(el)) return false;
      return e.bottom > r.bottom + 1 || e.top < r.top - 1 || e.right > vw + 1 || e.left < -1;
    }).map((el) => el.tagName.toLowerCase() + ": " + (el.textContent || el.value || "").trim().slice(0, 40));
    return { id: s.id || s.tagName.toLowerCase(), h: Math.round(r.height), vh, fits: r.height <= vh + 0.5, spill };
  });
})()`;

const proc = spawn(chrome, ["--headless", "--no-sandbox", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "fit-"))}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = false;
try {
  let targets: { type: string; webSocketDebuggerUrl: string }[] | null = null;
  for (let i = 0; i < 50 && !targets; i++) { await sleep(200); targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => null); }
  if (!targets) throw new Error("Chrome não respondeu");
  const ws = new WebSocket(targets.find((t) => t.type === "page")!.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map<number, (m: { result?: { result?: { value?: unknown } } }) => void>();
  ws.onmessage = (ev: MessageEvent<string>) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); } };
  const send = (method: string, params: object = {}) => new Promise<{ result?: { result?: { value?: unknown } } }>((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

  const table: string[] = [];
  for (const [w, h] of VIEWPORTS) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
    await send("Page.navigate", { url: base + "/" });
    await sleep(1500);
    await send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });
    const rows = (await send("Runtime.evaluate", { expression: MEASURE, returnByValue: true })).result?.result?.value as
      { id: string; h: number; vh: number; fits: boolean; spill: string[] }[];
    for (const r of rows) {
      const ok = r.fits && !r.spill.length;
      if (!ok) failed = true;
      table.push(`${`${w}×${h}`.padEnd(10)} ${r.id.padEnd(14)} ${String(r.h).padStart(5)} / ${r.vh}  ${ok ? "ok" : "FAIL"}${r.spill.length ? "  spills: " + r.spill.slice(0, 3).join(" | ") : ""}`);
    }
  }
  // The two article pages (/motor, /calibracao) are long and scroll; they must only never scroll sideways.
  for (const path of ["/motor", "/calibracao"])
    for (const w of [1440, 390]) {
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 600 });
      await send("Page.navigate", { url: base + path });
      await sleep(1500);
      const over = (await send("Runtime.evaluate", { expression: "document.documentElement.scrollWidth - document.documentElement.clientWidth", returnByValue: true })).result?.result?.value as number;
      if (over > 0) failed = true;
      table.push(`${`${w}`.padEnd(10)} ${path.padEnd(14)} ${over > 0 ? `FAIL  ${over} px sideways` : "ok (no sideways scroll)"}`);
    }
  console.log(table.join("\n"));
  ws.close();
} finally {
  proc.kill();
}
process.exit(failed ? 1 : 0);
