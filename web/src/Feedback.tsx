import { useCallback, useEffect, useState } from "react";
import type { FeedbackResponse } from "./api/client";
import { Mark } from "./components/Icon";
import { ApiError, feedbackApi } from "./lib/api";
import { FEEDBACK_KINDS } from "./lib/feedback";
import { navigate } from "./lib/route";
import { useSession } from "./lib/session";

// "Relatórios" (#/relatorios), for admins (Keycloak role linhazero-admin): the problems and suggestions people sent
// from the account menu (docs/decisoes/0066). Resolvido / Arquivar close one; Reabrir opens it again.

const KIND: Record<string, string> = Object.fromEntries(
  FEEDBACK_KINDS.map((k) => [k.id, k.label]),
);

const STATUS: Record<string, string> = {
  open: "Aberto",
  done: "Resolvido",
  dismissed: "Arquivado",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-PT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function Feedback() {
  const session = useSession();
  const isAdmin = session.state === "signed-in" && session.me.isAdmin;
  const [items, setItems] = useState<FeedbackResponse[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    feedbackApi
      .list()
      .then(setItems)
      .catch((e) => setMessage(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  async function setStatus(item: FeedbackResponse, status: string) {
    setBusy(item.id);
    setMessage(null);
    try {
      const updated = await feedbackApi.setStatus(item.id, { status });
      setItems(
        (list) => list?.map((x) => (x.id === updated.id ? updated : x)) ?? null,
      );
    } catch (e) {
      setMessage(
        e instanceof ApiError
          ? e.message
          : `Não foi possível mudar o estado: ${e instanceof Error ? e.message : e}`,
      );
      load();
    } finally {
      setBusy(null);
    }
  }

  const open = items?.filter((x) => x.status === "open") ?? [];
  const closed = items?.filter((x) => x.status !== "open") ?? [];

  return (
    <div className="admin-page">
      <header className="appbar">
        <Mark />
        <span className="appbar-title">
          <b>
            Linha<span>Zero</span>
          </b>
          <span>Relatórios de problemas e sugestões</span>
        </span>
        <button onClick={() => navigate("#/")}>Voltar à simulação</button>
      </header>
      <main className="admin-body">
        {!isAdmin ? (
          <p>
            Esta página é só para quem gere a aplicação (papel linhazero-admin
            no Keycloak).
          </p>
        ) : (
          <>
            {message && (
              <p className="message" role="status">
                <span>{message}</span>
              </p>
            )}
            <h2>Abertos{items && ` (${open.length})`}</h2>
            {items === null ? (
              <p className="muted">A carregar…</p>
            ) : open.length === 0 ? (
              <p className="muted">Nenhum relatório por tratar.</p>
            ) : (
              <ul className="requests">
                {open.map((item) => (
                  <li key={item.id} className="request">
                    <Report item={item} />
                    <div className="request-actions">
                      <button
                        className="primary"
                        disabled={busy !== null}
                        onClick={() => void setStatus(item, "done")}
                      >
                        Resolvido
                      </button>
                      <button
                        disabled={busy !== null}
                        onClick={() => void setStatus(item, "dismissed")}
                      >
                        Arquivar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {closed.length > 0 && (
              <>
                <h2>Fechados</h2>
                <ul className="requests">
                  {closed.map((item) => (
                    <li key={item.id} className="request answered">
                      <Report item={item} />
                      <div className="field-row">
                        <p className={`status ${item.status}`}>
                          {STATUS[item.status] ?? item.status}
                          {item.closedAt && ` · ${when(item.closedAt)}`}
                        </p>
                        <button
                          disabled={busy !== null}
                          onClick={() => void setStatus(item, "open")}
                        >
                          Reabrir
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Report({ item }: { item: FeedbackResponse }) {
  const c = item.context;
  const where = [
    c.page,
    c.scenario && `cenário ${c.scenario}`,
    c.variant && `variante ${c.variant}`,
  ].filter(Boolean);
  return (
    <div className="request-body">
      <p>
        <span className={`kind ${item.kind}`}>
          {KIND[item.kind] ?? item.kind}
        </span>{" "}
        <b>{item.userName}</b>
        {item.mayContact && item.userEmail && (
          <>
            {" "}
            · <a href={`mailto:${item.userEmail}`}>{item.userEmail}</a>
          </>
        )}
      </p>
      <blockquote>{item.message}</blockquote>
      <p className="muted">
        {when(item.createdAt)}
        {where.length > 0 && ` · ${where.join(" · ")}`}
      </p>
      <details className="muted">
        <summary>Detalhes técnicos</summary>
        <p>Versão: {c.appVersion ?? "?"}</p>
        <p>Ecrã: {c.viewport ?? "?"}</p>
        <p>Browser: {c.userAgent ?? "?"}</p>
      </details>
    </div>
  );
}
