using System.Net.Mail;
using LinhaZero.Api.Models;

namespace LinhaZero.Api.Validation;

/// <summary>Checks a "Pedir acesso" form. Every message is the Portuguese text of the 400, shown on the landing as is.</summary>
public static class AccessRequestValidator
{
    /// <summary>The landing's choices (landing/src/App.tsx, KINDS).</summary>
    public static readonly string[] OrganizationTypes = ["Bombeiros", "Proteção civil", "Câmara", "GNR", "Outra"];

    public const int MaxName = 200;
    public const int MaxEmail = 254;
    public const int MaxMessage = 2000;

    /// <summary>The trimmed request, or the reason it is refused.</summary>
    public static (AccessRequestCreate? Request, string? Error) Validate(AccessRequestCreate? body)
    {
        if (body is null)
        {
            return (null, "pedido inválido");
        }

        var name = body.Name?.Trim() ?? "";
        var email = body.Email?.Trim() ?? "";
        var organization = body.Organization?.Trim() ?? "";
        var type = body.OrganizationType?.Trim() ?? "";
        var message = string.IsNullOrWhiteSpace(body.Message) ? null : body.Message.Trim();

        if (name.Length is 0 or > MaxName)
        {
            return (null, "Indique o seu nome.");
        }

        if (email.Length is 0 or > MaxEmail || !IsEmail(email))
        {
            return (null, "Indique um email válido.");
        }

        if (organization.Length is 0 or > MaxName)
        {
            return (null, "Indique a entidade.");
        }

        if (!OrganizationTypes.Contains(type))
        {
            return (null, "Escolha o tipo de entidade.");
        }

        if (message is { Length: > MaxMessage })
        {
            return (null, $"A mensagem tem mais de {MaxMessage} caracteres.");
        }

        return (body with { Name = name, Email = email.ToLowerInvariant(), Organization = organization, OrganizationType = type, Message = message }, null);
    }

    private static bool IsEmail(string value) =>
        MailAddress.TryCreate(value, out var address) && address.Address == value && value.Contains('.', StringComparison.Ordinal);
}
