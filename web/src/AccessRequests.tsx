import { useCallback, useEffect, useState } from "react";
import type { AccessRequestResponse } from "./api/client";
import { Mark } from "./components/Icon";
import { accessRequestsApi, ApiError } from "./lib/api";
import { navigate } from "./lib/route";
import { useSession } from "./lib/session";

// "Pedidos de acesso" (#/pedidos), for admins (Keycloak role linhazero-admin): the requests from the landing's
// "Pedir acesso". Aprovar creates the account in Keycloak and emails the person a link to set their password
// (docs/decisoes/0062); Recusar only marks the request.

const STATUS: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Recusado",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-PT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function AccessRequests() {
  const session = useSession();
  const isAdmin = session.state === "signed-in" && session.me.isAdmin;
  const [items, setItems] = useState<AccessRequestResponse[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    accessRequestsApi
      .list()
      .then(setItems)
      .catch((e) => setMessage(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  async function answer(item: AccessRequestResponse, approve: boolean) {
    if (
      !approve &&
      !confirm(`Recusar o pedido de ${item.name}? Não é enviado nenhum email.`)
    )
      return;
    setBusy(item.id);
    setMessage(null);
    try {
      const updated = approve
        ? await accessRequestsApi.approve(item.id)
        : await accessRequestsApi.reject(item.id);
      setItems(
        (list) => list?.map((x) => (x.id === updated.id ? updated : x)) ?? null,
      );
      setMessage(
        approve
          ? `Conta criada; o convite foi enviado para ${item.email}.`
          : `Pedido de ${item.name} recusado.`,
      );
    } catch (e) {
      setMessage(
        e instanceof ApiError
          ? e.message
          : `Não foi possível responder: ${e instanceof Error ? e.message : e}`,
      );
      load();
    } finally {
      setBusy(null);
    }
  }

  const pending = items?.filter((x) => x.status === "pending") ?? [];
  const answered = items?.filter((x) => x.status !== "pending") ?? [];

  return (
    <div className="admin-page">
      <header className="appbar">
        <Mark />
        <span className="appbar-title">
          <b>
            Linha<span>Zero</span>
          </b>
          <span>Pedidos de acesso</span>
        </span>
        <button onClick={() => navigate("#/")}>Voltar à simulação</button>
      </header>
      <main className="admin-body">
        {!isAdmin ? (
          <p>
            Esta página é só para quem gere os acessos (papel linhazero-admin no
            Keycloak).
          </p>
        ) : (
          <>
            {message && (
              <p className="message" role="status">
                <span>{message}</span>
              </p>
            )}
            <h2>Pendentes{items && ` (${pending.length})`}</h2>
            {items === null ? (
              <p className="muted">A carregar…</p>
            ) : pending.length === 0 ? (
              <p className="muted">Nenhum pedido à espera de resposta.</p>
            ) : (
              <ul className="requests">
                {pending.map((item) => (
                  <li key={item.id} className="request">
                    <Request item={item} />
                    <div className="request-actions">
                      <button
                        className="primary"
                        disabled={busy !== null}
                        onClick={() => void answer(item, true)}
                      >
                        {busy === item.id
                          ? "A enviar…"
                          : "Aprovar e enviar convite"}
                      </button>
                      <button
                        disabled={busy !== null}
                        onClick={() => void answer(item, false)}
                      >
                        Recusar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {answered.length > 0 && (
              <>
                <h2>Respondidos</h2>
                <ul className="requests">
                  {answered.map((item) => (
                    <li key={item.id} className="request answered">
                      <Request item={item} />
                      <p className={`status ${item.status}`}>
                        {STATUS[item.status] ?? item.status}
                        {item.decidedAt && ` · ${when(item.decidedAt)}`}
                      </p>
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

function Request({ item }: { item: AccessRequestResponse }) {
  return (
    <div className="request-body">
      <p>
        <b>{item.name}</b> · <a href={`mailto:${item.email}`}>{item.email}</a>
      </p>
      <p>
        {item.organization}{" "}
        <span className="muted">({item.organizationType})</span>
      </p>
      {item.message && <blockquote>{item.message}</blockquote>}
      <p className="muted">Pedido a {when(item.createdAt)}</p>
    </div>
  );
}
