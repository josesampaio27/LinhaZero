import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { Poster } from "./components/Hero";

// The page is dark only (see docs/plano/landing.md): no theme switching.
// Section entrances: once, just before the element enters the viewport. The hidden states
// live under html.js (set in index.html) and prefers-reduced-motion: no-preference.
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px 8% 0px" },
  );
  const watch = () => document.querySelectorAll("[data-reveal]:not(.is-in)").forEach((el) => io.observe(el));
  new MutationObserver(watch).observe(document.getElementById("root")!, { childList: true, subtree: true });
  watch();
} else {
  document.documentElement.classList.remove("js");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {new URLSearchParams(location.search).has("poster") ? <Poster /> : <App />}
  </StrictMode>,
);
