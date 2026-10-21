using LinhaZero.Api.Models;
using LinhaZero.Api.Repositories;
using Microsoft.Extensions.Options;

namespace LinhaZero.Api.Services;

/// <summary>ACCESS_REQUEST_EMAILS_PER_DAY (100 by default) and APP_URL, for the link in the email.</summary>
public sealed class AccessRequestEmailOptions
{
    /// <summary>Emails per UTC day, counted per recipient as the SMTP service (Brevo, 300 a day) counts them.</summary>
    public int PerDay { get; set; } = 100;

    public string AppUrl { get; set; } = "https://app.linhazero.localhost/";
}

/// <summary>
/// Emails every admin when someone asks for access (docs/decisoes/0067). The email budget is reserved in the database
/// before sending, so a flood of requests stops at the daily cap and leaves the rest of the quota to Keycloak.
/// </summary>
public sealed class AccessRequestNotifier(
    AccessRequestRepository requests,
    UserRepository users,
    IEmailSender email,
    IOptions<AccessRequestEmailOptions> options,
    ILogger<AccessRequestNotifier> log)
{
    public const int MaxMessage = 500;

    /// <summary>Never throws: the person's request is saved whatever happens to the email.</summary>
    public async Task NotifyAsync(Guid id, AccessRequestCreate request, CancellationToken ct)
    {
        try
        {
            var admins = await users.AdminEmailsAsync(ct);
            if (admins.Count == 0)
            {
                log.LogWarning("Pedido de acesso {Id} sem aviso: nenhum administrador com email (entram depois do primeiro login)", id);
                return;
            }

            if (!await requests.ReserveNotificationAsync(id, admins.Count, options.Value.PerDay, ct))
            {
                log.LogWarning("Pedido de acesso {Id} sem aviso: limite diário de {PerDay} emails atingido", id, options.Value.PerDay);
                return;
            }

            try
            {
                var (subject, text) = Compose(request, options.Value.AppUrl);
                if (!await email.SendAsync(admins, subject, text, request.Email, ct))
                {
                    await requests.ReleaseNotificationAsync(id, ct);
                    return;
                }

                log.LogInformation("Pedido de acesso {Id}: aviso enviado a {Count} administradores", id, admins.Count);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                log.LogError(e, "Pedido de acesso {Id}: o email aos administradores falhou", id);
                await requests.ReleaseNotificationAsync(id, CancellationToken.None);
            }
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            log.LogError(e, "Pedido de acesso {Id}: não foi possível preparar o aviso", id);
        }
    }

    /// <summary>The email: plain text, the person's message cut to <see cref="MaxMessage"/> characters.</summary>
    public static (string Subject, string Text) Compose(AccessRequestCreate request, string appUrl)
    {
        var message = request.Message is { Length: > MaxMessage } full ? full[..MaxMessage] + "…" : request.Message;
        var link = new Uri(new Uri(appUrl), "#/pedidos").ToString();
        var text = $"""
            Novo pedido de acesso ao LinhaZero.

            Nome: {request.Name}
            Email: {request.Email}
            Entidade: {request.Organization} ({request.OrganizationType})
            {(message is null ? "" : $"\nMensagem:\n{message}\n")}
            Aprovar ou recusar: {link}

            Para responder diretamente à pessoa, responda a este email.
            """;
        return ($"Novo pedido de acesso: {request.Organization}", text);
    }
}
