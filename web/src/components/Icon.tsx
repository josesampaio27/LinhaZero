// Inline SVG icons (24×24, currentColor), so they look the same on every OS and work offline.
const PATHS = {
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6L6 18",
  layers: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5",
  line: "M4 18L10 9l5 5 5-9",
  attack: "M5 6l12-2 3 12-11 4z",
  shield: "M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z",
  flame: "M12 3c1 4 6 6 6 11a6 6 0 01-12 0c0-3 2-4 2-7 2 1 3 3 3 5 1-2 1-6 1-9z",
  drop: "M12 3c3 4.5 6 8 6 11.5a6 6 0 01-12 0C6 11 9 7.5 12 3z",
  play: "M8 5v14l11-7z",
  pause: "M8 5v14M16 5v14",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 4v7h-7",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  check: "M5 12l5 5 9-10",
  chevron: "M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  feedback: "M4 5h16v11H9l-5 4zM9 9.5h6M9 12.5h4",
} as const;

export type IconName = keyof typeof PATHS;

/** Filled shapes; the rest are strokes. */
const FILLED = new Set<IconName>(["play", "flame"]);
/** Outline plus a translucent fill. */
const SOFT = new Set<IconName>(["attack"]);

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const filled = FILLED.has(name);
  const soft = SOFT.has(name);
  return (
    <svg
      className="icon-svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={filled || soft ? "currentColor" : "none"}
      fillOpacity={soft ? 0.25 : undefined}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The LinhaZero mark with the white outline the landing uses (public/logo-outline.png, 85×99). */
export function Mark({ size = 32 }: { size?: number }) {
  return <img src="/logo-outline.png" width={Math.round((size * 85) / 99)} height={size} alt="" />;
}
