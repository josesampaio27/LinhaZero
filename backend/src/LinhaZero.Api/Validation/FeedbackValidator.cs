using LinhaZero.Api.Models;

namespace LinhaZero.Api.Validation;

/// <summary>Checks a "Reportar problema ou sugestão" form. Every message is the Portuguese text of the 400, shown as is.</summary>
public static class FeedbackValidator
{
    public static readonly string[] Kinds = ["bug", "suggestion", "other"];
    public static readonly string[] Statuses = ["open", "done", "dismissed"];

    public const int MaxMessage = 4000;

    /// <summary>Each context field is cut to this length rather than refused: it is only a hint for whoever reads it.</summary>
    public const int MaxContextField = 500;

    /// <summary>The trimmed report, or the reason it is refused.</summary>
    public static (FeedbackCreate? Report, string? Error) Validate(FeedbackCreate? body)
    {
        if (body is null)
        {
            return (null, "pedido inválido");
        }

        var kind = body.Kind?.Trim() ?? "";
        var message = body.Message?.Trim() ?? "";
        if (!Kinds.Contains(kind))
        {
            return (null, "Escolha o tipo: problema, sugestão ou outro.");
        }

        if (message.Length == 0)
        {
            return (null, "Escreva a mensagem.");
        }

        if (message.Length > MaxMessage)
        {
            return (null, $"A mensagem tem mais de {MaxMessage} caracteres.");
        }

        var c = body.Context;
        var context = new FeedbackContext(Cut(c?.Page), Cut(c?.Scenario), Cut(c?.Variant), Cut(c?.AppVersion), Cut(c?.UserAgent), Cut(c?.Viewport));
        return (body with { Kind = kind, Message = message, Context = context }, null);
    }

    private static string? Cut(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed.Length > MaxContextField ? trimmed[..MaxContextField] : trimmed;
    }
}
