import { useCallback, useEffect, useRef, useState } from "react";
import type { RunSummary } from "../api/client";
import { msToKmh } from "../lib/conditions";
import { listRuns } from "../lib/server-run";
import { compassName } from "./WindControl";

/**
 * "Histórico de simulações", from the app bar menu (docs/decisoes/0073): the signed-in person's simulations with
 * uncertainty, as the engine workers stored them. "Abrir" puts one back on the maps with its stored result, without
 * simulating again. Admins can list everyone's. A native modal dialog, as FeedbackDialog.
 */
export function RunHistoryDialog({
  isAdmin,
  zoneLabel,
  onOpen,
  onClose,
}: {
  isAdmin: boolean;
  /** The zone's name for a grid name (the grid index), else the name itself. */
  zoneLabel: (grid: string) => string;
  onOpen: (run: RunSummary) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [all, setAll] = useState(false);
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const load = useCallback((everyone: boolean) => {
    setRuns(null);
    setError(null);
    listRuns(everyone).then(setRuns, (e: unknown) =>
      setError(
        `Não foi possível obter o histórico: ${e instanceof Error ? e.message : String(e)}`,
      ),
    );
  }, []);
  useEffect(() => load(all), [all, load]);

  return (
    <dialog
      ref={dialog}
      className="feedback-dialog history-dialog"
      aria-labelledby="history-title"
      onClose={onClose}
    >
      <div className="feedback-form">
        <h2 id="history-title">Histórico de simulações</h2>
        <p className="hint">
          As simulações com incerteza feitas no servidor. Abrir mostra o
          resultado guardado, sem simular de novo.
        </p>
        {isAdmin && (
          <label className="feedback-contact">
            <input
              type="checkbox"
              checked={all}
              onChange={(e) => setAll(e.target.checked)}
            />
            Todas as pessoas
          </label>
        )}
        {error && (
          <p className="message" role="alert">
            <span>{error}</span>
          </p>
        )}
        {!error && runs === null && <p className="hint">A carregar…</p>}
        {runs?.length === 0 && (
          <p className="hint">Ainda não há simulações guardadas.</p>
        )}
        {runs && runs.length > 0 && (
          <ul className="history-list">
            {runs.map((r) => (
              <li key={r.id} className="history-item">
                <div className="history-head">
                  <b>{r.title ?? zoneLabel(r.grid)}</b>
                  <span>{when(r.createdAt)}</span>
                </div>
                <p className="history-meta">{conditionsLine(r, all)}</p>
                <p className="history-meta">{decisionsLine(r)}</p>
                {r.status === "done" ? (
                  <div className="history-foot">
                    <span className="history-numbers">{numbersLine(r)}</span>
                    <button
                      className="primary"
                      onClick={() => {
                        onOpen(r);
                        dialog.current?.close();
                      }}
                    >
                      Abrir
                    </button>
                  </div>
                ) : (
                  <p
                    className={`status ${r.status === "failed" ? "rejected" : ""}`}
                  >
                    {statusText(r)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="history-actions">
          <button onClick={() => load(all)}>Atualizar</button>
          <button onClick={() => dialog.current?.close()}>Fechar</button>
        </div>
      </div>
    </dialog>
  );
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-PT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const HA = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 });
const HOURS = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 });

function conditionsLine(r: RunSummary, withAuthor: boolean): string {
  const wind =
    r.windSpeedMs > 0
      ? `vento ${msToKmh(r.windSpeedMs)} km/h de ${compassName(r.windDirectionDeg)}`
      : "sem vento";
  const parts = [
    `${HOURS.format(r.durationMin / 60)} h`,
    wind,
    `${r.ensembleRuns} cenários`,
  ];
  if (r.station) parts.push(r.station);
  if (withAuthor && r.userName) parts.push(r.userName);
  return parts.join(" · ");
}

function decisionsLine(r: RunSummary): string {
  const one = (n: number, variant: string | null) => {
    const actions =
      n === 0 ? "deixar arder" : `${n} ${n === 1 ? "ação" : "ações"}`;
    return variant ? `${actions}, variante ${variant}` : actions;
  };
  return `A: ${one(r.interventionsA, r.variantA)} · B: ${one(r.interventionsB, r.variantB)}`;
}

function numbersLine(r: RunSummary): string {
  const ha = (v: number | null) => (v === null ? "—" : `${HA.format(v)} ha`);
  const n = (v: number | null) => (v === null ? "—" : String(v));
  return `Ardido A ${ha(r.burnedHaA)} · B ${ha(r.burnedHaB)} · Edifícios A ${n(r.buildingsA)} · B ${n(r.buildingsB)}`;
}

function statusText(r: RunSummary): string {
  if (r.status === "failed") return `Falhou${r.error ? `: ${r.error}` : ""}`;
  return r.status === "running" ? "A simular…" : "À espera de um worker…";
}
