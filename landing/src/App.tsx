import { useEffect } from "react";
import { Home } from "@/pages/Home";
import { EnginePage } from "@/pages/EnginePage";
import { CalibrationPage } from "@/pages/CalibrationPage";
import { DataSheetPage } from "@/pages/DataSheetPage";

/**
 * Four pages, picked by the path: the main page, how the engine works (/motor), how it was calibrated and
 * validated (/calibracao) and the technical sheet (/ficha-tecnica). nginx and the Vite dev server send every path to index.html; anything else is the main page.
 */
const PAGES = {
  "/motor": {
    page: EnginePage,
    title: "Como funciona o simulador · LinhaZero",
    description: "Como o LinhaZero simula um incêndio rural: o território em células, a física do fogo, as decisões desenhadas e a incerteza.",
  },
  "/calibracao": {
    page: CalibrationPage,
    title: "Calibração e validação · LinhaZero",
    description: "Como o simulador do LinhaZero foi ajustado e posto à prova em incêndios portugueses reais, e o que os resultados dizem.",
  },
  "/ficha-tecnica": {
    page: DataSheetPage,
    title: "Ficha técnica · LinhaZero",
    description: "Ficha técnica do simulador do LinhaZero: em que modelos se baseia, como usa o combustível e como este se relaciona com o mapa.",
  },
} as const;

export function App() {
  const path = location.pathname.replace(/\/$/, "") as keyof typeof PAGES;
  const entry = PAGES[path];
  useEffect(() => {
    if (entry) {
      document.title = entry.title;
      document.querySelector('meta[name="description"]')?.setAttribute("content", entry.description);
    }
    // The browser scrolls to a #section only if it exists when the page loads; here it is rendered after.
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  }, [entry]);
  const Page = entry?.page ?? Home;
  return <Page />;
}
