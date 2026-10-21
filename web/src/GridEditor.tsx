import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyVariant,
  DEFAULT_PARAMS,
  calibrationFor,
  emptyVariant,
  PARAM_RANGES,
  parseGridVariant,
  variantHash,
  type GridEdit,
  type GridEditKind,
  type GridVariant,
  type ModelParams,
} from "@linha-zero/engine";
import { CellInspector, cellUnder } from "./components/CellInspector";
import { Icon } from "./components/Icon";
import { Segmented, Shell, Toggle } from "./components/Shell";
import { MapView, type Draft, type MapShape } from "./components/MapView";
import { fetchGrid, fetchGridHeader, fetchGridIndex, type GridBundle, type GridIndexEntry } from "./lib/load-grid";
import { lngLatToProjected, type LngLat } from "./lib/projection";
import { fuelSwatch, renderLayer, renderMask, SLOPE_CLASSES, type LayerView } from "./lib/render";
import { navigate, useRoute } from "./lib/route";
import { newVariantId, useVariants, variantStore } from "./lib/variants";

const EDIT_TOOLS: { kind: GridEditKind; label: string; hint: string }[] = [
  { kind: "setFuel", label: "Pintar combustível", hint: "Desenha uma área: as células lá dentro passam a ter o combustível escolhido." },
  { kind: "addBarrier", label: "Acrescentar barreira", hint: "Desenha uma linha: uma estrada ou aceiro novo, que o fogo não atravessa." },
  { kind: "removeBarrier", label: "Tirar barreiras", hint: "Desenha uma área: as barreiras lá dentro deixam de existir." },
];

const EDIT_LABEL: Record<GridEditKind, string> = {
  setFuel: "Combustível",
  addBarrier: "Barreira nova",
  removeBarrier: "Barreiras retiradas",
};

const VIEWS: { view: LayerView; label: string }[] = [
  { view: "fuel", label: "Combustível" },
  { view: "elevation", label: "Relevo" },
  { view: "slope", label: "Declive" },
  { view: "village", label: "Lugares" },
];

const PARAM_LABEL: Record<keyof ModelParams, string> = {
  kWind: "Efeito do vento (kWind)",
  kSlope: "Efeito do declive (kSlope)",
  minSlopeFactor: "Fator mínimo a descer",
  suppressionFactor: "Fator do Ataque",
  protectFactor: "Fator de Proteger zona",
  attackFullKwM: "Ataque eficaz até (kW/m, Rothermel)",
  attackNoneKwM: "Ataque sem efeito a partir de (kW/m, Rothermel)",
  aerialFullKwM: "Descarga aérea segura sempre até (kW/m, Rothermel)",
  aerialNoneKwM: "Descarga aérea nunca segura a partir de (kW/m, Rothermel)",
  lineWidthM: "Largura das linhas de contenção (m, Rothermel)",
  holdWidthPerFlame: "Linha segura a 50% com largura = N × chama (Rothermel)",
  holdSteepness: "Inclinação da probabilidade de a linha segurar (Rothermel)",
  spotCriticalKwM: "Focos secundários a partir de (kW/m, Rothermel)",
  spotPerHa: "Probabilidade de foco secundário por hectare (Rothermel)",
  spotDelayMin: "Atraso até um foco secundário arder (min, Rothermel)",
  rosAdj: "Ajuste da velocidade (calibração, Rothermel)",
  windAdj: "Ajuste do vento a meia chama (calibração, Rothermel)",
  rosAdjLitter: "Ajuste da velocidade: folhada (calibração, Rothermel)",
  rosAdjUnderstory: "Ajuste da velocidade: sub-bosque (calibração, Rothermel)",
  rosAdjShrub: "Ajuste da velocidade: matos (calibração, Rothermel)",
  rosAdjGrass: "Ajuste da velocidade: herbáceas (calibração, Rothermel)",
  deadMoistureOffset: "Correção da humidade do combustível morto (fração, Rothermel)",
  crownFire: "Fogo de copas (1 = sim, 0 = não; Rothermel)",
  crownAdj: "Ajuste da velocidade do fogo de copas (Rothermel)",
  gustShare: "Fração da rajada somada ao vento médio (0 a 1)",
  windLimit: "Limite do vento de Rothermel (1 original, 2 revisto em 2013, 0 sem)",
  crownRatio: "Razão de copa no abrigo do vento (0,1 a 1; Rothermel)",
  demSmoothM: "Suavização do relevo antes do declive (m, 0 = nenhuma)",
  bgSuppression: "Combate de fundo (só calibração)",
};

/**
 * Not shown: the coefficients of the retired simple model (ADR 0058), kept so older variant files still
 * load, and the calibration-only firefighting layer (ADR 0068), which the app never uses.
 */
const HIDDEN_PARAMS = new Set<keyof ModelParams>(["kWind", "kSlope", "minSlopeFactor", "bgSuppression"]);

const EDITED_CELLS: [number, number, number] = [217, 70, 239];

const shapeOf = (e: GridEdit): MapShape =>
  e.kind === "addBarrier" ? { kind: e.kind, line: true, coords: e.line } : { kind: e.kind, line: false, coords: e.polygon };

/** The grid editor page: inspect a grid, edit it as a variant, save it and test it in the simulation. */
export function GridEditor() {
  const route = useRoute();
  const active = route.page === "grelha";
  const saved = useVariants();
  const [gridIndex, setGridIndex] = useState<GridIndexEntry[]>([]);
  const [gridName, setGridName] = useState("guimaraes");
  const [bundle, setBundle] = useState<GridBundle | null>(null);
  const [variant, setVariant] = useState<GridVariant | null>(null);
  const [view, setView] = useState<LayerView>("fuel");
  const [showEdited, setShowEdited] = useState(true);
  const [tool, setTool] = useState<GridEditKind | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
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

  useEffect(() => {
    fetchGridIndex().then(setGridIndex, (e) => setMessage(String(e)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBundle(null);
    setHoverCell(null); // a cell index of the old grid
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
    setVariant((v) => (v && v.base.grid === bundle.name ? v : emptyVariant(bundle.data.header, bundle.sha256, newVariantId(), "Nova variante")));
    const codes = Object.keys(bundle.data.header.fuelTable).map(Number);
    // Default paint: a non-burnable code, the usual choice for a fuel break.
    setPaintFuel(codes.find((c) => (bundle.data.header.fuelTable[c].baseRate ?? 0) <= 0) ?? codes[0] ?? null);
  }, [bundle]);

  const base = bundle?.data ?? null;
  const shaMismatch = !!(bundle && variant && variant.base.sha256 !== bundle.sha256);
  const edited = useMemo(() => (base && variant && !shaMismatch ? applyVariant(base, variant) : base), [base, variant, shaMismatch]);
  const terrainUrl = useMemo(() => (edited ? renderLayer(edited, view) : null), [edited, view]);
  const mask = useMemo(() => {
    if (!base || !edited || !showEdited) return null;
    const mask = new Uint8Array(base.fuel.length);
    for (let i = 0; i < mask.length; i++) mask[i] = base.fuel[i] !== edited.fuel[i] || base.barrier[i] !== edited.barrier[i] ? 1 : 0;
    return renderMask(mask, base.header.cols, base.header.rows, EDITED_CELLS);
  }, [base, edited, showEdited]);
  const shapes = useMemo(() => (variant ? variant.edits.map(shapeOf) : []), [variant]);

  const savedHere = saved.filter((v) => bundle && v.base.grid === bundle.name);
  const stored = variant ? variantStore.get(variant.id) : null;
  const unsaved = !!variant && (!stored || variantHash(stored) !== variantHash(variant) || stored.name !== variant.name);
  const changeCount = variant ? variant.edits.length + Object.keys(variant.fuelRates).length + Object.keys(variant.params).length : 0;

  const update = (patch: Partial<GridVariant>) => setVariant((v) => (v ? { ...v, ...patch } : v));

  // --- Drawing ---
  const finishDraft = useCallback(() => {
    if (!draft || !tool || !base) return;
    const minDist = base.header.cellSize / 3;
    const coords = draft.coords.filter((p, i, all) => i === 0 || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > minDist);
    if (coords.length < (draft.line ? 2 : 3)) {
      setMessage(draft.line ? "Uma linha precisa de pelo menos 2 pontos." : "Uma área precisa de pelo menos 3 pontos.");
      return;
    }
    const edit: GridEdit =
      tool === "setFuel"
        ? { kind: "setFuel", fuel: paintFuel ?? 0, polygon: coords }
        : tool === "addBarrier"
          ? { kind: "addBarrier", line: coords }
          : { kind: "removeBarrier", polygon: coords };
    setVariant((v) => (v ? { ...v, edits: [...v.edits, edit] } : v));
    setDraft(null);
    setTool(null);
    setMessage(null);
  }, [draft, tool, base, paintFuel]);

  const cancelTool = useCallback(() => {
    setDraft(null);
    setTool(null);
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelTool();
      // Enter on a focused control does what that control does.
      if (e.key === "Enter" && !(e.target instanceof Element && e.target.closest("button, input, select, textarea"))) finishDraft();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, cancelTool, finishDraft]);

  const onMapClick = (lngLat: LngLat) => {
    if (!tool) return;
    const xy = lngLatToProjected(lngLat[0], lngLat[1]);
    setDraft((prev) => ({ line: tool === "addBarrier", coords: [...(prev?.coords ?? []), xy] }));
  };

  const pickTool = (kind: GridEditKind) => {
    setDraft(null);
    setMessage(null);
    setTool(kind);
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
    setVariant(v);
    setConfirmDelete(false);
    return v;
  };

  const open = (v: GridVariant) => {
    setVariant(v);
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
    setVariant(emptyVariant(bundle.data.header, bundle.sha256, newVariantId(), "Nova variante"));
    setConfirmDelete(false);
    setMessage("Variante apagada.");
  };

  const test = () => {
    const v = save();
    if (v) navigate(`#/?variante=${encodeURIComponent(v.id)}`);
  };

  const fuelTable = base?.header.fuelTable ?? {};
  const codes = Object.keys(fuelTable).map(Number).sort((a, b) => a - b);

  const drawTool = tool ? EDIT_TOOLS.find((t) => t.kind === tool)! : null;
  const points = draft?.coords.length ?? 0;
  const hoverRowCol: [string, string][] =
    hoverCell !== null && edited ? [["Célula", `linha ${Math.floor(hoverCell / edited.header.cols)}, coluna ${hoverCell % edited.header.cols}`]] : [];

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

  const stage = (
    <>
      <div className="maps">
        <MapView
          title={`Editor de grelha${variant ? ` · ${variant.name}` : ""}`}
          accent="var(--b)"
          grid={edited}
          terrainUrl={terrainUrl}
          fire={mask}
          showOsm={false}
          contours={view === "elevation"}
          ignition={null}
          shapes={shapes}
          draft={draft}
          interactive={tool !== null}
          onClick={onMapClick}
          onDblClick={() => finishDraft()}
          onHover={(lngLat) => setHoverCell(cellUnder(edited, lngLat))}
        />
      </div>
      <div className={`hover-bar ${hoverCell === null ? "idle" : ""}`}>
        <CellInspector
          compact
          grid={edited}
          base={changeCount ? base : null}
          cell={hoverCell}
          extra={hoverRowCol}
          placeholder="Passa o rato sobre o mapa (ou toca e segura) para ver o que a grelha diz em cada ponto."
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

  if (drawTool) {
    const line = tool === "addBarrier";
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
            <b>{drawTool.label}</b>
          </p>
          <p>{drawTool.hint}</p>
          {tool === "setFuel" && paintFuel !== null && (
            <p className="hint">
              <i className="swatch" style={{ background: base ? fuelSwatch(base, paintFuel) : undefined }} />
              {paintFuel} · {fuelTable[paintFuel]?.label}
            </p>
          )}
          <p className="hint">
            {line ? "Toca no mapa para marcar os pontos da linha" : "Toca no mapa para marcar os cantos da área"} ({points}{" "}
            {points === 1 ? "ponto" : "pontos"}). No computador: duplo clique ou Enter para terminar, Esc para cancelar.
          </p>
          {messageLine}
        </div>
      </Shell>
    );
  }

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
          {shaMismatch && tab !== "variante" && <p className="message">Esta variante é de outra versão da grelha: reaplica-a no separador Variante.</p>}
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
              else if (bundle) setVariant(emptyVariant(bundle.data.header, bundle.sha256, newVariantId(), "Nova variante"));
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
          <input value={variant?.name ?? ""} onChange={(e) => update({ name: e.target.value })} disabled={!variant} />
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
              {confirmDelete ? "Toca outra vez para apagar" : "Apagar"}
            </button>
          )}
        </div>
      </div>

      <div className="step" hidden={tab !== "alterar"}>
        <div>
          <p className="field-label">Ver</p>
          <Segmented label="Camada" value={view} onChange={setView} options={VIEWS.map((v) => ({ value: v.view, label: v.label }))} />
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
          <Toggle checked={showEdited} onChange={setShowEdited}>
            <span>
              <i className="swatch" style={{ background: `rgb(${EDITED_CELLS.join(",")})` }} /> Destacar células alteradas
            </span>
          </Toggle>
        </div>
        <div>
          <p className="field-label">Alterar</p>
          <div className="add-actions">
            {EDIT_TOOLS.map((t) => (
              <button key={t.kind} className="add-action" onClick={() => pickTool(t.kind)} disabled={!variant || shaMismatch}>
                <span>
                  <b>{t.label}</b>
                  <small>{t.hint}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span className="field-label">Combustível a pintar</span>
          <select value={paintFuel ?? ""} onChange={(e) => setPaintFuel(Number(e.target.value))}>
            {codes.map((c) => (
              <option key={c} value={c}>
                {c} · {fuelTable[c].label} ({fuelTable[c].baseRate} m/min)
              </option>
            ))}
          </select>
        </label>
        {variant && variant.edits.length > 0 && (
          <div>
            <p className="field-label">Alterações desenhadas</p>
            <ul className="actions">
              {variant.edits.map((e, i) => (
                <li key={i} className="edit-item">
                  <span>
                    {i + 1}. {EDIT_LABEL[e.kind]}
                    {e.kind === "setFuel" && `: ${e.fuel} · ${fuelTable[e.fuel]?.label ?? ""}`}
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
            <button className="link" onClick={() => update({ edits: variant.edits.slice(0, -1) })}>
              Anular a última
            </button>
          </div>
        )}
      </div>

      <div className="step" hidden={tab !== "valores"}>
        <div>
          <p className="field-label">Coeficientes do modelo</p>
          <p className="hint">Os valores usados pelo modelo de Rothermel, calibrados com incêndios reais. Vazio = valor oficial.</p>
          {(Object.keys(PARAM_LABEL) as (keyof ModelParams)[]).filter((k) => !HIDDEN_PARAMS.has(k)).map((k) => (
            <label key={k} className={`param ${variant && k in variant.params ? "changed" : ""}`}>
              <span>{PARAM_LABEL[k]}</span>
              <input
                type="number"
                inputMode="decimal"
                min={PARAM_RANGES[k][0]}
                max={PARAM_RANGES[k][1]}
                step={0.01}
                placeholder={String(calibrationFor(base?.header.cellSize ?? 100).params[k] ?? DEFAULT_PARAMS[k])}
                value={variant?.params[k] ?? ""}
                onChange={(e) => setParam(k, e.target.value)}
                disabled={!variant || shaMismatch}
              />
            </label>
          ))}
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
