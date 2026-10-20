// Captures the hero posters (landing/public/hero/hero-a.webp, hero-b.webp and the split hero.webp) from the `/?poster` page with a headless Chrome,
// driven over the DevTools protocol so it can wait for the map to finish drawing.
//   npm run build -w landing && npm run preview -w landing -- --port 4173   (in another terminal)
//   npx tsx landing/scripts/hero-poster.ts [http://localhost:4173] [path/to/chrome]
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] ?? "http://localhost:4173";
const chrome =
  process.argv[3] ??
  process.env.CHROME ??
  join(homedir(), ".cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell");
const port = 9333;

const proc = spawn(chrome, [
  "--headless", "--no-sandbox", "--hide-scrollbars",
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
  `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "hero-"))}`,
  "--window-size=1600,1000", "about:blank",
], { stdio: "ignore" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
try {
  let targets: { type: string; webSocketDebuggerUrl: string }[] | null = null;
  for (let i = 0; i < 50 && !targets; i++) {
    await sleep(200);
    targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => null);
  }
  if (!targets) throw new Error("Chrome não respondeu");
  const ws = new WebSocket(targets.find((t) => t.type === "page")!.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map<number, (msg: { result?: { result?: { value?: string } } }) => void>();
  ws.onmessage = (ev: MessageEvent<string>) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)!(msg); pending.delete(msg.id); }
  };
  const send = (method: string, params: object = {}) =>
    new Promise<{ result?: { result?: { value?: string } } }>((resolve) => { pending.set(++id, resolve); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression: string) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.result?.value;

  await send("Emulation.setDeviceMetricsOverride", { width: 800, height: 500, deviceScaleFactor: 2, mobile: false });
  await send("Page.navigate", { url: `${base}/?poster` });
  let dataUrl = "";
  for (let i = 0; i < 300 && !dataUrl; i++) {
    await sleep(500);
    dataUrl = (await evaluate("document.getElementById('poster')?.textContent ?? ''")) || "";
  }
  if (!dataUrl) throw new Error("O mapa não ficou pronto em 150 s");
  // The frame of decision A, the frame of decision B, and the two split (the small map in the scenario panel).
  const frames = JSON.parse(dataUrl) as Record<"a" | "b" | "split", string>;
  for (const [key, name] of [["a", "hero-a.webp"], ["b", "hero-b.webp"], ["split", "hero.webp"]] as const) {
    writeFileSync(new URL(`../public/hero/${name}`, import.meta.url), Buffer.from(frames[key].split(",")[1], "base64"));
    console.log(`${name}: ${Math.round((frames[key].length * 0.75) / 1024)} KB`);
  }
  ws.close();
} finally {
  proc.kill();
}
