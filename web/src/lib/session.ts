import { useSyncExternalStore } from "react";
import type { MeResponse } from "../api/client";

// Who is signed in. The session itself is an HttpOnly cookie the API sets after the Keycloak login
// (docs/decisoes/0061): this code never sees a token, it only asks the API who it is.

/** Signed in; no session (the demo); or the API did not answer (offline: the browser engine still works). */
export type Session =
  | { state: "signed-in"; me: MeResponse }
  | { state: "anonymous" }
  | { state: "offline" }
  | { state: "loading" };

/** The CSRF header every non-GET call carries (the API refuses those without it). */
export const CSRF_HEADER = { "X-LinhaZero": "1" };

/** Profile, password and two-step login, on account.<domain> (Keycloak). */
export const ACCOUNT_URL =
  (import.meta.env.VITE_ACCOUNT_URL as string | undefined) ??
  "https://account.linhazero.localhost/realms/linhazero/account";

/**
 * The demo opens without login (docs/plano/landing.md): a scenario link or ?demo. Everything else needs a session; an
 * API call without one sends the browser to the login.
 */
export function isDemo(search = location.search): boolean {
  const q = new URLSearchParams(search);
  return q.has("demo") || q.has("scenario");
}

/** The login, which comes back to this same address. */
export function loginUrl(
  returnTo = location.pathname + location.search + location.hash,
): string {
  return `/api/auth/login?returnUrl=${encodeURIComponent(returnTo)}`;
}

let current: Session = { state: "loading" };
const listeners = new Set<() => void>();

export function setSession(next: Session) {
  current = next;
  listeners.forEach((l) => l());
}

export function useSession(): Session {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** Ends the session in the API and in Keycloak, then lands on the landing page. */
export async function logout() {
  let to = "/";
  try {
    const res = await fetch("/api/auth/logout", {
      method: "POST",
      headers: CSRF_HEADER,
    });
    const body: { redirect?: string } = await res.json();
    if (body.redirect) to = body.redirect;
  } catch {
    // Without an answer the cookie may still be there; the app's address then asks for a login again anyway.
  }
  location.assign(to);
}
