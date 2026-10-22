import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyVariant,
  DEFAULT_PARAMS,
  calibrationFor,
  editCells,
  emptyVariant,
  MAX_EDIT_CELLS,
  rasterizePolyline,
  PARAM_RANGES,
  parseGridVariant,
  variantHash,
  type EditCells,
  type GridData,
  type GridEdit,
  type GridEditKind,
  type GridVariant,
  type ModelParams,
} from "@linha-zero/engine";
import { CellInspector, cellUnder } from "./components/CellInspector";
import { Icon } from "./components/Icon";
import { Segmented, Shell, Toggle } from "./components/Shell";
import { FuelLegend, FuelPicker } from "./components/FuelPicker";
import { MapLayers } from "./components/MapLayers";
import { MapView, type Draft, type MapShape } from "./components/MapView";
import { fetchGrid, fetchGridHeader, fetchGridIndex, type GridBundle, type GridIndexEntry } from "./lib/load-grid";
import { lngLatToProjected, type LngLat } from "./lib/projection";
import { elevationLegend, renderCellLayers, renderLayer, SLOPE_CLASSES, type LayerView } from "./lib/render";
import { useMapPrefs } from "./lib/map-prefs";
import { navigate, useRoute } from "./lib/route";
import { newVariantId, useVariants, variantStore } from "./lib/variants";

/** The editor's tools: pick cells one by one, pick the cells inside an area, or draw a new barrier line. */
type Tool = "cells" | "area" | "barrierLine";

const TOOLS: { tool: Tool; label: string; hint: string }[] = [
  {
    tool: "cells",
    label: "Selecionar células",
    hint: "Marcar ou arrastar sobre as células para as selecionar; a partir de uma já selecionada, retira-as. Shift + arrastar também retira.",
  },
  { tool: "area", label: "Selecionar uma área", hint: "Marcar os cantos de uma área: as células lá dentro juntam-se à seleção." },
  { tool: "barrierLine", label: "Desenhar uma barreira", hint: "Marcar os pontos de uma linha: uma estrada ou aceiro novo, que o fogo não atravessa." },
];

const EDIT_LABEL: Record<GridEditKind, string> = {
  setFuel: "Combustível",
  addBarrier: "Barreira nova",
  removeBarrier: "Barreiras retiradas",
};

const BRUSHES = [1, 3, 5] as const;
type Brush = (typeof BRUSHES)[number];

const VIEWS: { view: LayerView; label: string }[] = [
  { view: "fuel", label: "Combustível" },
  { view: "elevation", label: "Relevo" },
  { view: "slope", label: "Declive" },
  { view: "village", label: "Lugares" },
];

/** Label and a short explanation of each coefficient the editor shows. */
const PARAM_INFO: Partial<Record<keyof ModelParams, { label: string; hint?: string }>> = {
  rosAdj: { label: "Velocidade do fogo", hint: "Multiplica a velocidade de propagação de todos os combustíveis" },
  windAdj: { label: "Efeito do vento", hint: "Multiplica o vento à altura da chama" },
  deadMoistureOffset: { label: "Correção da humidade do combustível morto", hint: "Somada à humidade calculada (0,01 = 1 ponto percentual)" },
  crownFire: { label: "Fogo de copas", hint: "1 = o fogo pode passar às copas das árvores; 0 = nunca" },
  lineWidthM: { label: "Largura das linhas de contenção (m)", hint: "Mais larga, mais difícil de a chama galgar" },
  suppressionFactor: { label: "Efeito do Ataque", hint: "Fator da velocidade do fogo nas células atacadas (0,2 = 5 vezes mais lento)" },
  protectFactor: { label: "Efeito de Proteger zona", hint: "Fator da velocidade do fogo na zona protegida" },
  attackFullKwM: { label: "Ataque eficaz até (kW/m)" },
  attackNoneKwM: { label: "Ataque sem efeito a partir de (kW/m)" },
  aerialFullKwM: { label: "Descarga aérea segura sempre até (kW/m)" },
  aerialNoneKwM: { label: "Descarga aérea nunca segura a partir de (kW/m)" },
  holdWidthPerFlame: { label: "Linha segura a 50% com largura = N × chama" },
  holdSteepness: { label: "Inclinação da probabilidade de a linha segurar" },
  spotCriticalKwM: { label: "Focos secundários a partir de (kW/m)" },
  spotPerHa: { label: "Probabilidade de foco secundário por hectare" },
  spotDelayMin: { label: "Atraso até um foco secundário arder (min)" },
  rosAdjLitter: { label: "Velocidade do fogo: folhada" },
  rosAdjUnderstory: { label: "Velocidade do fogo: sub-bosque" },
  rosAdjShrub: { label: "Velocidade do fogo: matos" },
  rosAdjGrass: { label: "Velocidade do fogo: herbáceas" },
  crownAdj: { label: "Velocidade do fogo de copas" },
  gustShare: { label: "Fração da rajada somada ao vento médio (0 a 1)" },
  windLimit: { label: "Limite do vento de Rothermel (1 original, 2 revisto em 2013, 0 sem)" },
  crownRatio: { label: "Razão de copa no abrigo do vento (0,1 a 1)" },
  demSmoothM: { label: "Suavização do relevo antes do declive (m, 0 = nenhuma)" },
};

/** Shown first; the rest go under "Avançado". Not shown at all: the retired simple model's coefficients (ADR 0058) and the calibration-only firefighting layer. */
const MAIN_PARAMS: (keyof ModelParams)[] = ["rosAdj", "windAdj", "deadMoistureOffset", "crownFire", "lineWidthM", "suppressionFactor", "protectFactor"];
const ADVANCED_PARAMS = (Object.keys(PARAM_INFO) as (keyof ModelParams)[]).filter((k) => !MAIN_PARAMS.includes(k));

const EDITED_CELLS: [number, number, number] = [217, 70, 239];
const SELECTED_CELLS: [number, number, number] = [14, 165, 233];
/** Undo steps kept. */
const MAX_HISTORY = 100;

/** Areas and lines drawn on the map; edits of cells picked one by one show through the changed-cells highlight. */
const shapeOf = (e: GridEdit): MapShape | null =>
  "line" in e
    ? { kind: e.kind, line: true, coords: e.line }
    : "polygon" in e
      ? { kind: e.kind, line: false, coords: e.polygon }
      : null;

/** The non-combustible code to paint for a fuel break: the one labelled so, else any code that never burns. */
function nonFuelCode(grid: GridData): number | null {
  const codes = Object.keys(grid.header.fuelTable).map(Number);
  const table = grid.header.fuelTable;
  return (
    codes.find((c) => /não combustível/i.test(table[c].label)) ??
    codes.find((c) => c !== 0 && !table[c].rothermel) ??
    codes.find((c) => !table[c].rothermel) ??
    null
  );
}

/** The cells covered by a square brush of `size` cells centred on `cell`. */
function brushCells(grid: GridData, cell: number, size: Brush): number[] {
  const { rows, cols } = grid.header;
  const r0 = Math.floor(cell / cols);
  const c0 = cell % cols;
  const k = (size - 1) / 2;
  const out: number[] = [];
  for (let r = r0 - k; r <= r0 + k; r++) {
    for (let c = c0 - k; c <= c0 + k; c++) if (r >= 0 && r < rows && c >= 0 && c < cols) out.push(r * cols + c);
  }
  return out;
}

/** The cells between two cells, both included: a fast drag skips cells between two pointer events. */
function cellsBetween(grid: GridData, from: number, to: number): number[] {
  const { cols, rows } = grid.header;
  const centre = (i: number) => ({ x: (i % cols) + 0.5, y: Math.floor(i / cols) + 0.5 });
  return rasterizePolyline([centre(from), centre(to)], rows, cols).map(({ row, col }) => row * cols + col);
}

/** One edit per MAX_EDIT_CELLS cells, so a big selection still fits the variant format. */
function cellEdits(grid: GridData, cells: number[], make: (cells: EditCells) => GridEdit): GridEdit[] {
  const { cols } = grid.header;
  const sorted = [...cells].sort((a, b) => a - b);
  const edits: GridEdit[] = [];
  for (let i = 0; i < sorted.length; i += MAX_EDIT_CELLS) {
    edits.push(make(sorted.slice(i, i + MAX_EDIT_CELLS).map((c): [number, number] => [Math.floor(c / cols), c % cols])));
  }
  return edits;
}

/** The grid editor page: inspect a grid, edit it as a variant, save it and test it in the simulation. */
export function GridEditor() {
  const route = useRoute();
  const active = route.page === "grelha";
  const saved = useVariants();
  const mapPrefs = useMapPrefs();
  const [gridIndex, setGridIndex] = useState<GridIndexEntry[]>([]);
  const [gridName, setGridName] = useState("guimaraes");
  const [bundle, setBundle] = useState<GridBundle | null>(null);
  const [variant, setVariantState] = useState<GridVariant | null>(null);
  // Undo and redo: earlier and later versions of the variant being edited.
  const [history, setHistory] = useState<{ past: GridVariant[]; future: GridVariant[] }>({ past: [], future: [] });
  const [view, setView] = useState<LayerView>("fuel");
  const [showEdited, setShowEdited] = useState(true);
  const [tool, setTool] = useState<Tool | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selection, setSelection] = useState<ReadonlySet<number>>(new Set());
  const [brush, setBrush] = useState<Brush>(1);
  const [paintFuel, setPaintFuel] = useState<number | null>(null);
  const [hoverCell, setHoverCell] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<"variante" | "alterar" | "valores">("variante");
  // The second tap must come soon: touch browsers may never blur the button.
  useEffect(() => {
    if (!confirmDelete) return;
    const t = window.setTimeout(() => setConfirmDelete(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmDelete]);
  const fileInput = useRef<HTMLInputElement>(null);

  /** Starts editing another variant (new, opened or imported): no undo across variants, no selection carried over. */
  const startVariant = useCallback((v: GridVariant | null) => {
    setVariantState(v);
    setHistory({ past: [], future: [] });
    setSelection(new Set());
  }, []);

  /** Changes the variant being edited, as one undo step. */
  const change = useCallback(
    (next: (v: GridVariant) => GridVariant) => {
      if (!variant) return;
      setHistory((h) => ({ past: [...h.past, variant].slice(-MAX_HISTORY), future: [] }));
      setVariantState(next(variant));
    },
    [variant],
  );
  const update = (patch: Partial<GridVariant>) => change((v) => ({ ...v, ...patch }));

  const undo = useCallback(() => {
    if (!variant || !history.past.length) return;
    setVariantState(history.past[history.past.length - 1]);
    setHistory({ past: history.past.slice(0, -1), future: [variant, ...history.future] });
  }, [variant, history]);
  const redo = useCallback(() => {
    if (!variant || !history.future.length) return;
    setVariantState(history.future[0]);
    setHistory({ past: [...history.past, variant], future: history.future.slice(1) });
  }, [variant, history]);

  useEffect(() => {
    fetchGridIndex().then(setGridIndex, (e) => setMessage(String(e)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBundle(null);
    setHoverCell(null); // a cell index of the old grid
    setSelection(new Set());
    fetchGrid(gridName)
      .then((b) => !cancelled && setBundle(b))
      .catch((e) => setMessage(`Não foi possível carregar a grelha "${gridName}": ${e instanceof Error ? e.message : e}`));
    return () => {
      cancelled = true;
    };
  }, [gridName]);

  // A new grid starts a new variant, unless the variant being opened is for this grid.
  useEffect(() => {
    if (!bundle) return;
    setVariantState((v) => {
      if (v && v.base.grid === bundle.name) return v;
      setHistory({ past: [], future: [] });
      return emptyVariant(bundle.data.header, bundle.sha256, newVariantId(), "Nova variante");
    });
    // Default paint: the non-combustible code, the usual choice for a fuel break.
    const codes = Object.keys(bundle.data.header.fuelTable).map(Number);
    setPaintFuel(nonFuelCode(bundle.data) ?? codes[0] ?? null);
  }, [bundle]);

  const base = bundle?.data ?? null;
  const shaMismatch = !!(bundle && variant && variant.base.sha256 !== bundle.sha256);
  const edited = useMemo(() => (base && variant && !shaMismatch ? applyVariant(base, variant) : base), [base, variant, shaMismatch]);
  const terrainUrl = useMemo(() => (edited ? renderLayer(edited, view) : null), [edited, view]);
  const editedCells = useMemo(() => {
    if (!base || !edited || !showEdited) return [];
    const cells: number[] = [];
    for (let i = 0; i < base.fuel.length; i++) if (base.fuel[i] !== edited.fuel[i] || base.barrier[i] !== edited.barrier[i]) cells.push(i);
    return cells;
  }, [base, edited, showEdited]);
  const overlay = useMemo(() => {
    if (!base || (!editedCells.length && !selection.size)) return null;
    return renderCellLayers(base.header.cols, base.header.rows, [
      { cells: editedCells, rgb: EDITED_CELLS, alpha: 150 },
      { cells: selection, rgb: SELECTED_CELLS, alpha: 210 },
    ]);
  }, [base, editedCells, selection]);
  const shapes = useMemo(() => (variant ? variant.edits.map(shapeOf).filter((x): x is MapShape => x !== null) : []), [variant]);
  const elevation = useMemo(() => (base && view === "elevation" ? elevationLegend(base) : null), [base, view]);

  const savedHere = saved.filter((v) => bundle && v.base.grid === bundle.name);
  const stored = variant ? variantStore.get(variant.id) : null;
  const unsaved = !!variant && (!stored || variantHash(stored) !== variantHash(variant) || stored.name !== variant.name);
  const changeCount = variant ? variant.edits.length + Object.keys(variant.fuelRates).length + Object.keys(variant.params).length : 0;
  const editable = !!variant && !shaMismatch;

  // --- Selecting cells ---
  const paintRef = useRef<{ add: boolean; last: number } | null>(null);
  const onPaint = (lngLat: LngLat | null, phase: "start" | "move" | "end", erase: boolean) => {
    if (!edited) return;
    if (phase === "end") {
      paintRef.current = null;
      return;
    }
    const cell = cellUnder(edited, lngLat);
    if (cell === null) return;
    const stroke = paintRef.current;
    if (phase === "start") {
      // Starting on a selected cell removes, as a tap toggles it.
      const add = !erase && !selection.has(cell);
      paintRef.current = { add, last: cell };
      setSelection((prev) => withCells(prev, brushCells(edited, cell, brush), add));
      return;
    }
    if (!stroke || cell === stroke.last) return;
    const path = cellsBetween(edited, stroke.last, cell).flatMap((c) => brushCells(edited, c, brush));
    stroke.last = cell;
    setSelection((prev) => withCells(prev, path, stroke.add));
  };

  const applyToSelection = (make: (cells: EditCells) => GridEdit, done: string) => {
    if (!edited || !selection.size) return;
    const edits = cellEdits(edited, [...selection], make);
    change((v) => ({ ...v, edits: [...v.edits, ...edits] }));
    setMessage(`${done}: ${selection.size} ${selection.size === 1 ? "célula" : "células"}.`);
    setSelection(new Set());
  };
  const nonFuel = base ? nonFuelCode(base) : null;

  // --- Drawing (an area to select, or a barrier line) ---
  const finishDraft = useCallback(() => {
    if (!draft || (tool !== "area" && tool !== "barrierLine") || !base) return;
    const minDist = base.header.cellSize / 3;
    const coords = draft.coords.filter((p, i, all) => i === 0 || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > minDist);
    if (coords.length < (draft.line ? 2 : 3)) {
      setMessage(draft.line ? "Uma linha precisa de pelo menos 2 pontos." : "Uma área precisa de pelo menos 3 pontos.");
      return;
    }
    if (tool === "barrierLine") {
      change((v) => ({ ...v, edits: [...v.edits, { kind: "addBarrier", line: coords }] }));
      setMessage(null);
    } else {
      // The same cells an area edit would change.
      const inside = editCells(base.header, { kind: "setFuel", fuel: 0, polygon: coords });
      setSelection((prev) => withCells(prev, inside, true));
      setMessage(inside.length ? `${inside.length} células juntas à seleção.` : "A área não tem nenhuma célula da grelha.");
    }
    setDraft(null);
    setTool(null);
  }, [draft, tool, base, change]);

  const cancelTool = useCallback(() => {
    setDraft(null);
    setTool(null);
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof Element && e.target.closest("input, select, textarea");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === "Escape") {
        if (tool) cancelTool();
        else setSelection(new Set());
      }
      // Enter on a focused control does what that control does.
      if (e.key === "Enter" && !(e.target instanceof Element && e.target.closest("button, input, select, textarea"))) finishDraft();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, tool, cancelTool, finishDraft, undo, redo]);

  const onMapClick = (lngLat: LngLat) => {
    if (tool !== "area" && tool !== "barrierLine") return;
    const xy = lngLatToProjected(lngLat[0], lngLat[1]);
    setDraft((prev) => ({ line: tool === "barrierLine", coords: [...(prev?.coords ?? []), xy] }));
  };

  const pickTool = (t: Tool) => {
    setDraft(null);
    setMessage(null);
    setTool(t);
  };

  // --- Values ---
  const setParam = (key: keyof ModelParams, value: string) => {
    if (!variant) return;
    const params = { ...variant.params };
    const n = Number(value);
    const [lo, hi] = PARAM_RANGES[key];
    if (value === "" || !Number.isFinite(n) || n === DEFAULT_PARAMS[key]) delete params[key];
    else params[key] = Math.min(hi, Math.max(lo, n));
    update({ params });
  };

  // --- Saving ---
  const save = () => {
    if (!variant) return null;
    const v = { ...variant, name: variant.name.trim() || "Variante sem nome" };
    variantStore.save(v);
    setVariantState(v);
    setConfirmDelete(false);
    return v;
  };

  const open = (v: GridVariant) => {
    startVariant(v);
    setGridName(v.base.grid);
    setDraft(null);
    setTool(null);
    setConfirmDelete(false);
    setMessage(null);
  };

  const exportVariant = () => {
    const v = save();
    if (!v) return;
    const blob = new Blob([JSON.stringify(v, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `variante-${v.name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importVariant = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text());
      const gridOf = (raw as { base?: { grid?: unknown } })?.base?.grid;
      if (typeof gridOf !== "string") throw new Error("falta a grelha de base");
      const v = parseGridVariant(raw, await fetchGridHeader(gridOf));
      variantStore.save(v);
      open(v);
      setMessage(`Variante "${v.name}" importada e guardada neste browser.`);
    } catch (e) {
      setMessage(`Não foi possível ler "${file.name}": ${e instanceof Error ? e.message : e}`);
    }
  };

  const remove = () => {
    if (!variant || !bundle) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    variantStore.remove(variant.id);
    startVariant(emptyVariant(bundle.data.header, bundle.sha256, newVariantId(), "Nova variante"));
    setConfirmDelete(false);
    setMessage("Variante apagada.");
  };

  const test = () => {
    const v = save();
    if (v) navigate(`#/?variante=${encodeURIComponent(v.id)}`);
  };

  const fuelTable = base?.header.fuelTable ?? {};
  const fuelName = (code: number) => `${code} · ${fuelTable[code]?.label ?? ""}`;

  const activeTool = tool ? TOOLS.find((t) => t.tool === tool)! : null;
  const points = draft?.coords.length ?? 0;
  const hoverRowCol: [string, string][] =
    hoverCell !== null && edited ? [["Célula", `linha ${(Math.floor(hoverCell / edited.header.cols)).toLocaleString("pt-PT")}, coluna ${(hoverCell % edited.header.cols).toLocaleString("pt-PT")}`]] : [];

  const menu = (close: () => void) => (
    <div className="menu-body">
      <button
        className="menu-item"
        onClick={() => {
          close();
          navigate("#/");
        }}
      >
        Simulação <Icon name="chevron" size={18} />
      </button>
    </div>
  );

  const messageLine = message && (
    <p className="message" role="status">
      <span>{message}</span>
      <button className="icon-btn" aria-label="Fechar a mensagem" onClick={() => setMessage(null)}>
        <Icon name="close" size={16} />
      </button>
    </p>
  );

  const undoRow = (
    <div className="row">
      <button onClick={undo} disabled={!history.past.length} title="Ctrl+Z">
        <Icon name="undo" size={18} /> Desfazer
      </button>
      <button onClick={redo} disabled={!history.future.length} title="Ctrl+Shift+Z">
        Refazer
      </button>
    </div>
  );

  // What to do with the selected cells: shown while selecting and in the "Alterar" tab.
  const selectionPanel = selection.size > 0 && base && (
    <div className="selection-panel">
      <p className="value">
        <i className="swatch" style={{ background: `rgb(${SELECTED_CELLS.join(",")})` }} /> {selection.size}{" "}
        {selection.size === 1 ? "célula selecionada" : "células selecionadas"}
        <button className="link" onClick={() => setSelection(new Set())}>
          Limpar a seleção
        </button>
      </p>
      <div className="add-actions">
        {nonFuel !== null && (
          <button className="add-action" disabled={!editable} onClick={() => applyToSelection((cells) => ({ kind: "setFuel", fuel: nonFuel, cells }), "Não combustível")}>
            <span>
              <b>Tornar não combustível</b>
              <small>Uma faixa de gestão de combustível: o fogo não arde nestas células</small>
            </span>
          </button>
        )}
        <button
          className="add-action"
          disabled={!editable || paintFuel === null}
          onClick={() => paintFuel !== null && applyToSelection((cells) => ({ kind: "setFuel", fuel: paintFuel, cells }), `Combustível ${fuelName(paintFuel)}`)}
        >
          <span>
            <b>Pôr o combustível escolhido</b>
            <small>{paintFuel !== null ? fuelName(paintFuel) : "Escolher o combustível abaixo"}</small>
          </span>
        </button>
        <button className="add-action" disabled={!editable} onClick={() => applyToSelection((cells) => ({ kind: "addBarrier", cells }), "Barreira nova")}>
          <span>
            <b>Acrescentar barreira</b>
            <small>Uma estrada ou aceiro novo, que o fogo não atravessa</small>
          </span>
        </button>
        <button className="add-action" disabled={!editable} onClick={() => applyToSelection((cells) => ({ kind: "removeBarrier", cells }), "Barreiras retiradas")}>
          <span>
            <b>Tirar barreiras</b>
            <small>As barreiras nestas células deixam de existir</small>
          </span>
        </button>
      </div>
    </div>
  );

  const fuelChoice = base && (
    <div>
      <h2 className="field-label">Combustível a pôr</h2>
      <FuelPicker grid={base} value={paintFuel} onChange={setPaintFuel} />
    </div>
  );

  const stage = (
    <>
      <div className="maps">
        <MapView
          title={`Editor de grelha${variant ? ` · ${variant.name}` : ""}`}
          accent="var(--b)"
          grid={edited}
          terrainUrl={terrainUrl}
          fire={overlay}
          showOsm={mapPrefs.baseMap === "osm"}
          showSatellite={mapPrefs.baseMap === "satellite"}
          terrain3d={mapPrefs.terrain3d}
          contours={mapPrefs.contours}
          ignition={null}
          shapes={shapes}
          draft={draft}
          interactive={tool !== null}
          paint={tool === "cells"}
          onPaint={onPaint}
          onClick={onMapClick}
          onDblClick={() => finishDraft()}
          onHover={(lngLat) => setHoverCell(cellUnder(edited, lngLat))}
        />
      </div>
      <MapLayers />
      <div className={`hover-bar ${hoverCell === null ? "idle" : ""}`}>
        <CellInspector
          compact
          grid={edited}
          base={changeCount ? base : null}
          cell={hoverCell}
          extra={hoverRowCol}
          placeholder="Passar o cursor ou tocar longamente no mapa."
        />
        {hoverCell !== null && (
          <button className="icon-btn" aria-label="Fechar" onClick={() => setHoverCell(null)}>
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
      <input
        ref={fileInput}
        className="file-input"
        type="file"
        accept="application/json,.json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importVariant(f);
          e.target.value = "";
        }}
      />
    </>
  );

  const title = `Editor de grelha${variant ? ` · ${variant.name}` : ""}`;

  if (activeTool && tool === "cells") {
    return (
      <Shell
        title={title}
        menu={menu}
        stage={stage}
        footer={
          <div className="draw-buttons">
            <button onClick={undo} disabled={!history.past.length}>
              <Icon name="undo" size={18} /> Desfazer
            </button>
            <button className="primary" onClick={cancelTool}>
              <Icon name="check" size={18} /> Concluir
            </button>
          </div>
        }
      >
        <div className="draw">
          <p className="draw-title">
            <b>{activeTool.label}</b>
          </p>
          <p>{activeTool.hint}</p>
          <Segmented
            label="Tamanho do pincel"
            value={brush}
            onChange={setBrush}
            options={BRUSHES.map((b) => ({ value: b, label: b === 1 ? "1 célula" : `${b} × ${b}` }))}
          />
          <p className="hint">Durante a seleção, arrastar não move o mapa: aproximar com dois dedos ou com a roda do rato, e Concluir para voltar a mover.</p>
          {selectionPanel}
          {fuelChoice}
          {messageLine}
        </div>
      </Shell>
    );
  }

  if (activeTool) {
    const line = tool === "barrierLine";
    return (
      <Shell
        title={title}
        menu={menu}
        stage={stage}
        footer={
          <div className="draw-buttons">
            <button
              disabled={!points}
              onClick={() => setDraft((d) => (d && d.coords.length > 1 ? { ...d, coords: d.coords.slice(0, -1) } : null))}
            >
              <Icon name="undo" size={18} /> Desfazer
            </button>
            <button onClick={cancelTool}>Cancelar</button>
            <button className="primary" disabled={points < (line ? 2 : 3)} onClick={finishDraft}>
              <Icon name="check" size={18} /> Concluir
            </button>
          </div>
        }
      >
        <div className="draw">
          <p className="draw-title">
            <b>{activeTool.label}</b>
          </p>
          <p>{activeTool.hint}</p>
          <p className="hint">
            {line ? "Marcar no mapa os pontos da linha" : "Marcar no mapa os cantos da área"} ({points}{" "}
            {points === 1 ? "ponto" : "pontos"}). Duplo clique ou Enter para terminar, Esc para cancelar.
          </p>
          {messageLine}
        </div>
      </Shell>
    );
  }

  const paramInput = (k: keyof ModelParams) => {
    const info = PARAM_INFO[k]!;
    const official = calibrationFor(base?.header.cellSize ?? 100).params[k] ?? DEFAULT_PARAMS[k];
    return (
      <label key={k} className={`param ${variant && k in variant.params ? "changed" : ""}`}>
        <span>
          {info.label}
          {info.hint && <small>{info.hint}</small>}
          <small>Oficial: {official.toLocaleString("pt-PT")}</small>
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={PARAM_RANGES[k][0]}
          max={PARAM_RANGES[k][1]}
          step={0.01}
          placeholder={String(official)}
          value={variant?.params[k] ?? ""}
          onChange={(e) => setParam(k, e.target.value)}
          disabled={!editable}
        />
      </label>
    );
  };

  return (
    <Shell
      title={title}
      menu={menu}
      stage={stage}
      tabs={[
        { id: "variante", label: "Variante" },
        { id: "alterar", label: "Alterar", done: !!variant && variant.edits.length > 0 },
        { id: "valores", label: "Valores", done: !!variant && Object.keys(variant.fuelRates).length + Object.keys(variant.params).length > 0 },
      ]}
      tab={tab}
      onTab={(t) => {
        setTab(t);
        setConfirmDelete(false);
      }}
      footer={
        <>
          {shaMismatch && tab !== "variante" && <p className="message">Esta variante é de outra versão da grelha: reaplicar no separador Variante.</p>}
          {messageLine}
          <button className="primary" onClick={test} disabled={!variant || shaMismatch}>
            Testar na simulação <Icon name="chevron" size={18} />
          </button>
          <p className="hint foot-hint">Guarda a variante e abre a simulação: decisão A na grelha oficial, decisão B na variante.</p>
        </>
      }
    >
      <div className="step" hidden={tab !== "variante"}>
        {shaMismatch && (
          <div className="message">
            <span>
              Esta variante foi feita para outra versão da grelha "{variant!.base.grid}".
              <button style={{ marginTop: 8 }} onClick={() => bundle && update({ base: { ...variant!.base, sha256: bundle.sha256 } })}>
                Reaplicar à versão atual
              </button>
            </span>
          </div>
        )}
        <label className="field">
          <span className="field-label">Zona</span>
          <select value={gridName} onChange={(e) => setGridName(e.target.value)}>
            {gridIndex.map((g) => (
              <option key={g.name} value={g.name}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Variante</span>
          <select
            value={stored ? variant!.id : ""}
            onChange={(e) => {
              const v = variantStore.get(e.target.value);
              if (v) open(v);
              else if (bundle) startVariant(emptyVariant(bundle.data.header, bundle.sha256, newVariantId(), "Nova variante"));
            }}
          >
            <option value="">Nova variante</option>
            {savedHere.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Nome</span>
          {/* Typing the name is not an undo step. */}
          <input value={variant?.name ?? ""} onChange={(e) => setVariantState((v) => (v ? { ...v, name: e.target.value } : v))} disabled={!variant} />
        </label>
        <p className="value">
          {changeCount === 0 ? "Sem alterações: é igual à grelha oficial." : `${changeCount} alteraç${changeCount === 1 ? "ão" : "ões"}`}
          {unsaved && changeCount > 0 && <span className="warn-text"> · por guardar</span>}
        </p>
        <div className="row">
          <button onClick={() => save() && setMessage("Variante guardada neste browser.")} disabled={!variant}>
            Guardar
          </button>
          <button onClick={exportVariant} disabled={!variant}>
            Exportar
          </button>
          <button onClick={() => fileInput.current?.click()}>Importar</button>
          {stored && (
            <button onClick={remove} className={confirmDelete ? "danger" : ""}>
              {confirmDelete ? "Sim, apagar" : "Apagar"}
            </button>
          )}
        </div>
      </div>

      <div className="step" hidden={tab !== "alterar"}>
        <div>
          <h2 className="field-label">Ver</h2>
          <Segmented label="Camada" value={view} onChange={setView} options={VIEWS.map((v) => ({ value: v.view, label: v.label }))} />
          {view === "fuel" && base && (
            <details className="legend-details">
              <summary>Legenda do combustível</summary>
              <FuelLegend grid={edited ?? base} />
            </details>
          )}
          {view === "slope" && (
            <div className="legend legend-classes">
              <span>Declive:</span>
              {SLOPE_CLASSES.map((c) => (
                <span key={c.label} className="legend-class">
                  <i style={{ background: `rgb(${c.rgb.join(",")})` }} />
                  {c.label}
                </span>
              ))}
            </div>
          )}
          {elevation && (
            <div className="legend">
              <span>Altitude:</span>
              <span>{elevation.lo} m</span>
              <i className="ramp" style={{ background: elevation.gradient }} />
              <span>{elevation.hi} m</span>
            </div>
          )}
          <Toggle checked={showEdited} onChange={setShowEdited}>
            <span>
              <i className="swatch" style={{ background: `rgb(${EDITED_CELLS.join(",")})` }} /> Destacar células alteradas
            </span>
          </Toggle>
        </div>
        <div>
          <h2 className="field-label">Alterar</h2>
          <div className="add-actions">
            {TOOLS.map((t) => (
              <button key={t.tool} className="add-action" onClick={() => pickTool(t.tool)} disabled={!editable}>
                <span>
                  <b>{t.label}</b>
                  <small>{t.hint}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
        {selectionPanel}
        {selection.size > 0 && fuelChoice}
        {undoRow}
        {variant && variant.edits.length > 0 && (
          <div>
            <h2 className="field-label">Alterações feitas</h2>
            <ul className="actions">
              {variant.edits.map((e, i) => (
                <li key={i} className="edit-item">
                  <span>
                    {i + 1}. {EDIT_LABEL[e.kind]}
                    {e.kind === "setFuel" && `: ${fuelName(e.fuel)}`}
                    {"cells" in e && ` (${e.cells.length} ${e.cells.length === 1 ? "célula" : "células"})`}
                  </span>
                  <button
                    className="icon-btn"
                    title="Apagar"
                    aria-label={`Apagar a alteração ${i + 1}`}
                    onClick={() => update({ edits: variant.edits.filter((_, j) => j !== i) })}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="step" hidden={tab !== "valores"}>
        <div>
          <h2 className="field-label">Coeficientes do modelo</h2>
          <p className="hint">Os valores usados pelo modelo de Rothermel, calibrados com incêndios reais. Vazio = valor oficial.</p>
          {MAIN_PARAMS.map(paramInput)}
          <details className="advanced">
            <summary>Avançado ({ADVANCED_PARAMS.length} coeficientes)</summary>
            {ADVANCED_PARAMS.map(paramInput)}
          </details>
          {variant && Object.keys(variant.params).length > 0 && (
            <button className="link" onClick={() => update({ params: {} })}>
              Repor os valores oficiais
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}

/** A copy of the selection with the cells added or removed. */
function withCells(prev: ReadonlySet<number>, cells: number[], add: boolean): ReadonlySet<number> {
  const next = new Set(prev);
  for (const c of cells) {
    if (add) next.add(c);
    else next.delete(c);
  }
  return next;
}
