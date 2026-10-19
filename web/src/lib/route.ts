import { useSyncExternalStore } from "react";

// Two pages in one static page, chosen by the URL hash, so it works offline and needs no server rules:
//   #/            simulation (optionally #/?variante=<id> to open a grid variant)
//   #/grelha      grid editor

export type Page = "simulacao" | "grelha";

export interface Route {
  page: Page;
  params: URLSearchParams;
}

function parse(hash: string): Route {
  const [path, query = ""] = hash.replace(/^#/, "").split("?");
  return { page: path === "/grelha" ? "grelha" : "simulacao", params: new URLSearchParams(query) };
}

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

/** The current page and its query parameters; re-renders on navigation. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parse(hash);
}

export function navigate(hash: string): void {
  window.location.hash = hash;
}

/** Drops the query from the hash without adding a history entry. */
export function clearRouteParams(): void {
  const path = window.location.hash.split("?")[0] || "#/";
  history.replaceState(null, "", `${window.location.pathname}${window.location.search}${path}`);
}
