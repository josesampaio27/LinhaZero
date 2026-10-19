using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace LinhaZero.Api.OpenApi;

/// <summary>
/// Marks an action that reads its JSON body by hand instead of binding it, so the OpenAPI document still shows the
/// body's schema (see <see cref="RawJsonBodyDescriptionProvider"/>).
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class RawJsonBodyAttribute(Type type) : Attribute
{
    public Type Type { get; } = type;
}

/// <summary>
/// Describes the body of every action marked with <see cref="RawJsonBodyAttribute"/> as if it were bound with
/// [FromBody], so the OpenAPI document gives it (and the types inside it) named schemas like any other body.
/// </summary>
public sealed class RawJsonBodyDescriptionProvider(IModelMetadataProvider metadata) : IApiDescriptionProvider
{
    public int Order => 0; // after the default provider (-1000), which builds the descriptions

    public void OnProvidersExecuting(ApiDescriptionProviderContext context) { }

    public void OnProvidersExecuted(ApiDescriptionProviderContext context)
    {
        foreach (var description in context.Results)
        {
            var body = description.ActionDescriptor.EndpointMetadata.OfType<RawJsonBodyAttribute>().FirstOrDefault();
            if (body is null) continue;
            description.ParameterDescriptions.Add(new ApiParameterDescription
            {
                Name = "body",
                Source = BindingSource.Body,
                Type = body.Type,
                ModelMetadata = metadata.GetMetadataForType(body.Type),
                IsRequired = true,
            });
            description.SupportedRequestFormats.Add(new ApiRequestFormat { MediaType = "application/json" });
        }
    }
}
