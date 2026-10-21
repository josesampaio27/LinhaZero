import type { FeedbackContext } from "../api/client";

// What a problem report carries without the person typing it (docs/decisoes/0066): where they were in the app,
// which build, and the browser. No map contents, no coordinates beyond what is in the address.

/** The commit the web was built from (web/Dockerfile, APP_VERSION); "dev" for a local build. */
export const APP_VERSION =
  (import.meta.env.VITE_APP_VERSION as string | undefined) || "dev";

export const FEEDBACK_KINDS = [
  { id: "bug", label: "Problema" },
  { id: "suggestion", label: "Sugestão" },
  { id: "other", label: "Outro" },
] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]["id"];

export const FEEDBACK_MAX_MESSAGE = 4000;

export function feedbackContext(
  where: Pick<Location, "pathname" | "search" | "hash">,
  size: { width: number; height: number },
  userAgent: string,
  version = APP_VERSION,
): FeedbackContext {
  const search = new URLSearchParams(where.search);
  const hashQuery = new URLSearchParams(where.hash.split("?")[1] ?? "");
  return {
    page: where.pathname + where.search + (where.hash || "#/"),
    scenario: search.get("scenario"),
    variant: hashQuery.get("variante"),
    appVersion: version,
    userAgent,
    viewport: `${Math.round(size.width)}x${Math.round(size.height)}`,
  };
}

/** The context of this page, now. */
export function currentFeedbackContext(): FeedbackContext {
  return feedbackContext(
    location,
    { width: innerWidth, height: innerHeight },
    navigator.userAgent,
  );
}
