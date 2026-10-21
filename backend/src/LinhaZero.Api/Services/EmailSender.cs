using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace LinhaZero.Api.Services;

/// <summary>
/// The SMTP server, from the same variables Keycloak reads (SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_AUTH, SMTP_USER,
/// SMTP_PASSWORD, SMTP_STARTTLS, SMTP_SSL). Locally Mailpit; in the cluster Brevo. No host: no email.
/// </summary>
public sealed class SmtpOptions
{
    public string? Host { get; set; }
    public int Port { get; set; } = 587;
    public string From { get; set; } = "linhazero@linhazero.localhost";
    public bool Auth { get; set; }
    public string? User { get; set; }
    public string? Password { get; set; }
    public bool StartTls { get; set; }
    public bool Ssl { get; set; }

    public void ReadFrom(IConfiguration config)
    {
        static bool Flag(string? value) => string.Equals(value, "true", StringComparison.OrdinalIgnoreCase);
        Host = config["SMTP_HOST"] is { Length: > 0 } host ? host : null;
        Port = int.TryParse(config["SMTP_PORT"], out var port) ? port : Port;
        From = config["SMTP_FROM"] is { Length: > 0 } from ? from : From;
        Auth = Flag(config["SMTP_AUTH"]);
        User = config["SMTP_USER"];
        Password = config["SMTP_PASSWORD"];
        StartTls = Flag(config["SMTP_STARTTLS"]);
        Ssl = Flag(config["SMTP_SSL"]);
    }
}

/// <summary>A plain-text email. An interface so the tests can record emails instead of sending them.</summary>
public interface IEmailSender
{
    /// <summary>Sends one email to every address in <paramref name="to"/>; false when email is off (no SMTP_HOST).</summary>
    Task<bool> SendAsync(IReadOnlyList<string> to, string subject, string text, string? replyTo, CancellationToken ct);
}

public sealed class SmtpEmailSender(IOptions<SmtpOptions> options, ILogger<SmtpEmailSender> log) : IEmailSender
{
    private readonly SmtpOptions _smtp = options.Value;

    public async Task<bool> SendAsync(IReadOnlyList<string> to, string subject, string text, string? replyTo, CancellationToken ct)
    {
        if (_smtp.Host is null)
        {
            log.LogInformation("Email desligado (sem SMTP_HOST): \"{Subject}\" não enviado", subject);
            return false;
        }

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress("LinhaZero", _smtp.From));
        message.To.AddRange(to.Select(address => MailboxAddress.Parse(address)));
        if (replyTo is not null)
        {
            message.ReplyTo.Add(MailboxAddress.Parse(replyTo));
        }

        message.Subject = subject;
        message.Body = new TextPart("plain") { Text = text };

        using var smtp = new SmtpClient { Timeout = 10_000 };
        var security = _smtp.Ssl ? SecureSocketOptions.SslOnConnect : _smtp.StartTls ? SecureSocketOptions.StartTls : SecureSocketOptions.None;
        await smtp.ConnectAsync(_smtp.Host, _smtp.Port, security, ct);
        if (_smtp.Auth)
        {
            await smtp.AuthenticateAsync(_smtp.User ?? "", _smtp.Password ?? "", ct);
        }

        await smtp.SendAsync(message, ct);
        await smtp.DisconnectAsync(true, ct);
        return true;
    }
}
