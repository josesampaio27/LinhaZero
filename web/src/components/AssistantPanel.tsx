import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type Anthropic from "@anthropic-ai/sdk";
import type { DecisionId, DrawnIntervention } from "@linha-zero/engine";
import type { AssistantStatus } from "../api/client";
import { MAX_HISTORY_CHARS, runTurn, type TurnEvent } from "../assistant/client";
import type { AssistantContext } from "../assistant/context";
import { settle } from "../assistant/tools";
import { assistantApi } from "../lib/api";
import { Icon } from "./Icon";

/** One-tap requests for the things the assistant is best at. */
const QUICK: { label: string; prompt: string }[] = [
  { label: "Explicar o resultado", prompt: "Explica-me o resultado da comparação entre A e B: qual é melhor, quão certo é, e porquê." },
  { label: "Rever o meu plano", prompt: "Revê as ações da decisão A com check_plan e diz-me o que está mal e o que mudarias." },
  {
    label: "Propor uma decisão B",
    prompt:
      "Propõe uma decisão B melhor do que a A: parte das ações de A, acrescenta ou muda uma ou duas para proteger os lugares mais ameaçados, simula e diz-me o resultado.",
  },
  { label: "Resumo para o COS", prompt: "Escreve um resumo para o COS desta situação e da comparação entre A e B." },
];

type Decisions = Record<DecisionId, DrawnIntervention[]>;

interface ToolLine {
  id: string;
  label: string;
  status: "running" | "done" | "error";
  detail?: string;
}

type Item =
  | { kind: "user"; text: string }
  | {
      kind: "assistant";
      /** Text and tool lines in the order they came. */
      parts: ({ type: "text"; text: string } | { type: "tool"; tool: ToolLine } | { type: "notice"; text: string })[];
      error?: string;
      done: boolean;
      /** The decisions before and after this turn, when it changed them: "Desfazer" puts `before` back. */
      undo?: { before: Decisions; after: Decisions; used: boolean };
    };

/** **bold** and "- " list lines: the only formatting the assistant is asked to use. */
function Rich({ text }: { text: string }) {
  const inline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>));
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const line of text.split("\n")) {
    const item = /^\s*[-•*]\s+(.*)$/.exec(line);
    if (item) list.push(item[1]);
    else {
      flush();
      if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    }
  }
  flush();
  return <>{blocks}</>;
}

const usd = (v: number) => `${v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} US$`;

/**
 * The assistant (docs/decisoes/0079): a chat beside the maps that sees the app state and can draw actions, change the
 * conditions and simulate. Stays mounted while closed, so the conversation survives closing it.
 */
export function AssistantPanel({ open, onClose, context }: { open: boolean; onClose: () => void; context: () => AssistantContext }) {
  const [items, setItems] = useState<Item[]>([]);
  const history = useRef<Anthropic.MessageParam[]>([]);
  const [draft, setDraft] = useState("");
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const refreshStatus = useCallback(() => {
    assistantApi.status().then(setStatus, () => setStatus(null));
  }, []);
  useEffect(() => {
    if (open) {
      refreshStatus();
      input.current?.focus();
    }
  }, [open, refreshStatus]);
  // Braces: scrollIntoView returns a Promise in recent Chrome, and React would call a returned value as the cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [items]);

  const tooLong = JSON.stringify(history.current).length > MAX_HISTORY_CHARS;
  const overBudget = !!status && status.usedTodayUsd >= status.dailyBudgetUsd;

  /** Applies a change to the turn being answered (the last item). */
  const updateLast = (f: (item: Extract<Item, { kind: "assistant" }>) => Extract<Item, { kind: "assistant" }>) =>
    setItems((all) => {
      const last = all[all.length - 1];
      return last?.kind === "assistant" ? [...all.slice(0, -1), f(last)] : all;
    });

  const onEvent = (e: TurnEvent) =>
    updateLast((item) => {
      const parts = [...item.parts];
      const last = parts[parts.length - 1];
      if (e.type === "text") {
        if (last?.type === "text") parts[parts.length - 1] = { type: "text", text: last.text + e.text };
        else parts.push({ type: "text", text: e.text });
      } else if (e.type === "notice") parts.push({ type: "notice", text: e.text });
      else {
        const tool: ToolLine = { id: e.id, label: e.label, status: e.status, detail: e.detail };
        const at = parts.findIndex((p) => p.type === "tool" && p.tool.id === e.id);
        if (at >= 0) parts[at] = { type: "tool", tool };
        else parts.push({ type: "tool", tool });
      }
      return { ...item, parts };
    });

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || working) return;
    setDraft("");
    setWorking(true);
    setItems((all) => [...all, { kind: "user", text: question }, { kind: "assistant", parts: [], done: false }]);
    const controller = new AbortController();
    abort.current = controller;
    const before = context().snapshot.decisions;
    const result = await runTurn(history.current, question, context, onEvent, controller.signal);
    history.current = result.history;
    await settle();
    const after = context().snapshot.decisions;
    updateLast((item) => ({
      ...item,
      done: true,
      error: result.error ?? undefined,
      undo: result.changed && after !== before ? { before, after, used: false } : undefined,
    }));
    abort.current = null;
    setWorking(false);
    refreshStatus();
  };

  const undo = (index: number) => {
    const item = items[index];
    if (item?.kind !== "assistant" || !item.undo) return;
    const { actions } = context();
    actions.setDecision("A", item.undo.before.A);
    actions.setDecision("B", item.undo.before.B);
    setItems((all) => all.map((x, i) => (i === index && x.kind === "assistant" && x.undo ? { ...x, undo: { ...x.undo, used: true } } : x)));
  };

  const restart = () => {
    abort.current?.abort();
    history.current = [];
    setItems([]);
  };

  const current = context().snapshot.decisions;
  const lastUndo = items.reduce((at, x, i) => (x.kind === "assistant" && x.undo && !x.undo.used ? i : at), -1);

  return (
    <aside className="assistant" hidden={!open} aria-label="Assistente">
      <header className="assistant-head">
        <Icon name="spark" size={18} />
        <b>Assistente</b>
        {status && (
          <small title="O limite diário de cada utilizador; volta a zero à meia-noite">
            Hoje {usd(status.usedTodayUsd)} de {usd(status.dailyBudgetUsd)}
          </small>
        )}
        {items.length > 0 && (
          <button className="link" onClick={restart} disabled={working}>
            Nova conversa
          </button>
        )}
        <button className="icon-btn" aria-label="Fechar o assistente" onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="assistant-body" aria-live="polite">
        {items.length === 0 && (
          <div className="assistant-intro">
            <p>
              Pergunte sobre o fogo, as decisões ou o resultado. O assistente vê o que está no ecrã, pode desenhar ações, mudar as condições e simular; tudo o
              que fizer pode ser desfeito.
            </p>
            <p className="hint">Os números vêm sempre do simulador, que tem os seus limites (mapas de combustível, vento de uma estação, sem combate real).</p>
          </div>
        )}
        {items.map((item, i) =>
          item.kind === "user" ? (
            <div key={i} className="msg msg-user">
              {item.text}
            </div>
          ) : (
            <div key={i} className="msg msg-assistant">
              {item.parts.map((p, j) =>
                p.type === "text" ? (
                  <div key={j} className="msg-text">
                    <Rich text={p.text} />
                  </div>
                ) : p.type === "notice" ? (
                  <p key={j} className="hint">
                    {p.text}
                  </p>
                ) : (
                  <p key={j} className={`tool-line ${p.tool.status}`} title={p.tool.detail}>
                    <i aria-hidden />
                    {p.tool.label}
                    {p.tool.status === "error" && p.tool.detail ? `: ${p.tool.detail}` : ""}
                  </p>
                ),
              )}
              {!item.done && !item.parts.length && <p className="tool-line running">A pensar…</p>}
              {item.error && <p className="message">{item.error}</p>}
              {item.done && (
                <div className="msg-actions">
                  {item.undo && !item.undo.used && i === lastUndo && (
                    <button
                      disabled={current !== item.undo.after}
                      title={current !== item.undo.after ? "As decisões mudaram depois disto: desfazer à mão" : "Repõe as decisões A e B como estavam antes deste pedido"}
                      onClick={() => undo(i)}
                    >
                      <Icon name="undo" size={16} /> Desfazer
                    </button>
                  )}
                  {item.undo?.used && <span className="hint">Desfeito.</span>}
                  {item.parts.some((p) => p.type === "text") && (
                    <button
                      className="icon-btn"
                      aria-label="Copiar a resposta"
                      title="Copiar a resposta"
                      onClick={() =>
                        void navigator.clipboard?.writeText(
                          item.parts
                            .filter((p) => p.type === "text")
                            .map((p) => p.text)
                            .join("\n\n"),
                        )
                      }
                    >
                      <Icon name="copy" size={16} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ),
        )}
        <div ref={end} />
      </div>

      <div className="assistant-foot">
        {!working && (
          <div className="quick">
            {QUICK.map((q) => (
              <button key={q.label} disabled={tooLong || overBudget} onClick={() => void send(q.prompt)}>
                {q.label}
              </button>
            ))}
          </div>
        )}
        {tooLong && <p className="hint">A conversa ficou longa: começar uma nova conversa para continuar.</p>}
        {overBudget && <p className="hint">Atingiu o limite diário do assistente. Volta a ficar disponível amanhã.</p>}
        <form
          className="assistant-input"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <textarea
            ref={input}
            rows={2}
            value={draft}
            placeholder="Perguntar ou pedir uma ação…"
            aria-label="Mensagem para o assistente"
            disabled={tooLong || overBudget}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
          />
          {working ? (
            <button type="button" className="icon-btn" aria-label="Parar" title="Parar" onClick={() => abort.current?.abort()}>
              <Icon name="stop" size={18} />
            </button>
          ) : (
            <button type="submit" className="icon-btn" aria-label="Enviar" title="Enviar (Enter)" disabled={!draft.trim() || tooLong || overBudget}>
              <Icon name="send" size={18} />
            </button>
          )}
        </form>
      </div>
    </aside>
  );
}
