// Worker entry for calibration-pool.ts: registers tsx in the worker thread (Node 20 does not pass the
// parent's --import loader to workers), then loads the pool module, which serves tasks.
import { register } from "tsx/esm/api";

register();
await import("./calibration-pool.ts");
