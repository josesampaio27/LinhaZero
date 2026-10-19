import { useSyncExternalStore } from "react";
import type { GridVariant } from "@linha-zero/engine";

// Grid variants saved in this browser (localStorage), shared by the simulation page and the grid editor.
// Variants are small JSON documents; if storage is unavailable they still live for the session.

const KEY = "linha-zero:variantes";

function load(): GridVariant[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GridVariant[]) : [];
  } catch {
    return [];
  }
}

let variants: GridVariant[] = load();
const listeners = new Set<() => void>();

function commit(next: GridVariant[]): void {
  variants = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or full storage: keep the variants in memory for this session.
  }
  listeners.forEach((l) => l());
}

export const variantStore = {
  list: (): GridVariant[] => variants,
  get: (id: string | null): GridVariant | null => (id ? variants.find((v) => v.id === id) ?? null : null),
  /** Adds the variant, or replaces the one with the same id. */
  save(v: GridVariant): void {
    commit([...variants.filter((x) => x.id !== v.id), v]);
  },
  remove(id: string): void {
    commit(variants.filter((v) => v.id !== id));
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** All saved variants; re-renders when one is saved or removed. */
export function useVariants(): GridVariant[] {
  return useSyncExternalStore(variantStore.subscribe, variantStore.list);
}

let counter = 0;
export const newVariantId = () => `var-${Date.now().toString(36)}-${(counter++).toString(36)}`;
