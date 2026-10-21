import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, feedbackApi } from "../lib/api";
import {
  currentFeedbackContext,
  FEEDBACK_KINDS,
  FEEDBACK_MAX_MESSAGE,
  type FeedbackKind,
} from "../lib/feedback";

/**
 * "Reportar problema ou sugestão", from the account menu (docs/decisoes/0066). A native modal dialog: it keeps focus
 * inside and closes on Escape. The page, build and browser go with the report (lib/feedback.ts).
 */
export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [message, setMessage] = useState("");
  const [mayContact, setMayContact] = useState(true);
  const [state, setState] = useState<"editing" | "sending" | "sent">("editing");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function send(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      await feedbackApi.create({
        kind,
        message,
        mayContact,
        context: currentFeedbackContext(),
      });
      setState("sent");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível enviar. Verifique a ligação e tente outra vez.",
      );
      setState("editing");
    }
  }

  return (
    <dialog
      ref={dialog}
      className="feedback-dialog"
      aria-labelledby="feedback-title"
      onClose={onClose}
    >
      {state === "sent" ? (
        <div className="feedback-form">
          <h2 id="feedback-title">Obrigado!</h2>
          <p>Recebemos a sua mensagem.</p>
          <button
            className="primary"
            autoFocus
            onClick={() => dialog.current?.close()}
          >
            Fechar
          </button>
        </div>
      ) : (
        <form className="feedback-form" onSubmit={(e) => void send(e)}>
          <h2 id="feedback-title">Reportar problema ou sugestão</h2>
          <fieldset className="feedback-kinds">
            <legend className="field-label">Tipo</legend>
            {FEEDBACK_KINDS.map((k) => (
              <label key={k.id} className={kind === k.id ? "on" : ""}>
                <input
                  type="radio"
                  name="kind"
                  value={k.id}
                  checked={kind === k.id}
                  onChange={() => setKind(k.id)}
                />
                {k.label}
              </label>
            ))}
          </fieldset>
          <label className="field">
            <span className="field-label">Mensagem</span>
            <textarea
              required
              autoFocus
              rows={6}
              maxLength={FEEDBACK_MAX_MESSAGE}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                kind === "bug"
                  ? "O que fez, o que esperava e o que aconteceu."
                  : "Conte-nos a sua ideia."
              }
            />
          </label>
          <label className="feedback-contact">
            <input
              type="checkbox"
              checked={mayContact}
              onChange={(e) => setMayContact(e.target.checked)}
            />
            Podem contactar-me por email sobre isto
          </label>
          <p className="hint">
            Enviamos também a página onde está, a versão da aplicação e o
            browser.
          </p>
          {error && (
            <p className="message" role="alert">
              <span>{error}</span>
            </p>
          )}
          <div className="feedback-actions">
            <button type="button" onClick={() => dialog.current?.close()}>
              Cancelar
            </button>
            <button
              className="primary"
              disabled={state === "sending" || message.trim() === ""}
            >
              {state === "sending" ? "A enviar…" : "Enviar"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
