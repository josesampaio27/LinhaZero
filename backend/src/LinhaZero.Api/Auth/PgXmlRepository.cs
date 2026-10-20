using System.Xml.Linq;
using Dapper;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Npgsql;

namespace LinhaZero.Api.Auth;

/// <summary>The Data Protection key ring (which encrypts the session cookie) in the data_protection_keys table (infra/db/002_users.sql).</summary>
public sealed class PgXmlRepository(NpgsqlDataSource db) : IXmlRepository
{
    public IReadOnlyCollection<XElement> GetAllElements()
    {
        using var connection = db.OpenConnection();
        return connection.Query<string>("select xml from data_protection_keys order by created_at").Select(XElement.Parse).ToList();
    }

    public void StoreElement(XElement element, string friendlyName)
    {
        using var connection = db.OpenConnection();
        connection.Execute(
            "insert into data_protection_keys (id, xml) values (@friendlyName, @xml) on conflict (id) do nothing",
            new { friendlyName, xml = element.ToString(SaveOptions.DisableFormatting) });
    }
}
