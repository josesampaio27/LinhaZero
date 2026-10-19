import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeGrid, gridLayerNames } from "../src/grid";
import type { GridData, GridHeader, LayerBuffers } from "../src/types";

/** Reads a grid directory (header.json + layer binaries) from disk. */
export function loadGridFromDir(dir: string): GridData {
  const header: GridHeader = JSON.parse(readFileSync(join(dir, "header.json"), "utf8"));
  const buffers = {} as LayerBuffers;
  for (const name of gridLayerNames(header)) {
    const buf = readFileSync(join(dir, header.layers[name]!));
    buffers[name] = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  return decodeGrid(header, buffers);
}
