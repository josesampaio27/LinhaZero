import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { App } from "./App";
import { GridEditor } from "./GridEditor";
import { ApiError, meApi } from "./lib/api";
import { useRoute, type Page } from "./lib/route";
import { isDemo, setSession } from "./lib/session";

/** Both pages stay mounted once visited, so switching keeps what was drawn on each. */
function Root() {
  const { page } = useRoute();
  const [visited, setVisited] = useState<Set<Page>>(() => new Set([page]));
  if (!visited.has(page)) setVisited(new Set(visited).add(page));
  return (
    <>
      {visited.has("simulacao") && (
        <div className="page" hidden={page !== "simulacao"}>
          <App />
        </div>
      )}
      {visited.has("grelha") && (
        <div className="page" hidden={page !== "grelha"}>
          <GridEditor />
        </div>
      )}
    </>
  );
}

// Offline support (production builds only: in development the worker would serve stale modules).
// Files loaded before the worker took control are sent to it to cache; later requests go through it anyway.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const sendLoaded = () =>
    navigator.serviceWorker.controller?.postMessage({
      cache: [
        "/",
        ...performance
          .getEntriesByType("resource")
          .map((r) => r.name)
          .filter((u) => u.startsWith(location.origin) && !u.includes("/api/")),
      ],
    });
  // A new worker takes over on the first visit and after each deploy.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    sendLoaded();
    setTimeout(sendLoaded, 10_000); // requests that were still in flight when it took over
  });
  // The build's own file name (hashed) versions the worker: a new deploy installs a new one with a fresh cache.
  const build = new URL(import.meta.url).pathname.split("/").pop() ?? "dev";
  navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(build)}`).catch((e) => console.warn("service worker indisponível", e));
}

/**
 * Asks the API who is signed in before showing anything, so a visitor without a session goes to the login without
 * first seeing the app. The demo opens anyway, and so does the app when the API does not answer (offline).
 */
async function start() {
  try {
    setSession({ state: "signed-in", me: await meApi.get() });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      if (!isDemo()) return; // apiFetch is already sending the browser to the login
      setSession({ state: "anonymous" });
    } else {
      setSession({ state: "offline" });
    }
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}

void start();
