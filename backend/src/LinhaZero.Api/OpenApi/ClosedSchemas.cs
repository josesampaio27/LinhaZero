using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace LinhaZero.Api.OpenApi;

/// <summary>
/// Marks a request model whose unknown fields are kept and passed on (to the engine worker), so its schema stays open
/// to extra properties (see <see cref="ClosedSchemaTransformer"/>).
/// </summary>
[AttributeUsage(AttributeTargets.Class)]
public sealed class PassesUnknownFieldsAttribute : Attribute;

/// <summary>
/// Writes "additionalProperties": false on every model schema, because the API sends no fields beyond the ones it
/// declares. Without it, NSwag gives each TypeScript interface a [key: string]: any that accepts any typo.
/// </summary>
public sealed class ClosedSchemaTransformer : IOpenApiSchemaTransformer
{
    public Task TransformAsync(OpenApiSchema schema, OpenApiSchemaTransformerContext context, CancellationToken cancellationToken)
    {
        var type = context.JsonTypeInfo.Type;
        var isModel = schema.Properties is { Count: > 0 };
        var passesUnknownFields = type.IsDefined(typeof(PassesUnknownFieldsAttribute), inherit: false);
        if (isModel && !passesUnknownFields)
        {
            schema.AdditionalPropertiesAllowed = false;
        }

        return Task.CompletedTask;
    }
}
