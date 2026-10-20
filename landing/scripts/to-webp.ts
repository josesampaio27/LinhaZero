// Re-encodes a picture served by the preview server as a WebP of a given width, through headless Chrome
// (no image tools needed here). Usage: npx tsx landing/scripts/to-webp.ts <url> <out.webp> [width] [quality]
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

const [url, out, width = "1600", quality = "0.8"] = process.argv.slice(2);
const chrome = process.env.CHROME ?? join(homedir(), ".cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell");
const port = 9340;
const proc = spawn(chrome, ["--headless", "--no-sandbox", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "webp-"))}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
try {
  let targets: { type: string; webSocketDebuggerUrl: string }[] | null = null;
  for (let i = 0; i < 50 && !targets; i++) { await sleep(200); targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => null); }
  const ws = new WebSocket(targets!.find((t) => t.type === "page")!.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map<number, (m: { result?: { result?: { value?: string } } }) => void>();
  ws.onmessage = (ev: MessageEvent<string>) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); } };
  const send = (method: string, params: object = {}) => new Promise<{ result?: { result?: { value?: string } } }>((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send("Page.navigate", { url: new URL(url).origin + "/" });
  await sleep(1000);
  const r = await send("Runtime.evaluate", {
    awaitPromise: true, returnByValue: true,
    expression: `new Promise((res, rej) => { const img = new Image(); img.onload = () => { const w = Math.min(${+width}, img.naturalWidth); const h = Math.round(img.naturalHeight * w / img.naturalWidth); const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h); res(c.toDataURL("image/webp", ${+quality})); }; img.onerror = () => rej(new Error("não carregou")); img.src = ${JSON.stringify(url)}; })`,
  });
  const data: unknown = r.result?.result?.value;
  // A rejected promise comes back as an object (or nothing), never as the data URL.
  if (typeof data !== "string" || !data.startsWith("data:image/webp")) throw new Error(`sem imagem: ${JSON.stringify(r).slice(0, 300)}`);
  writeFileSync(out, Buffer.from(data.split(",")[1], "base64"));
  console.log(`${out}: ${Math.round(data.length * 0.75 / 1024)} KB`);
  ws.close();
} finally { proc.kill(); }
