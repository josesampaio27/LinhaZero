using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace LinhaZero.Api.OpenApi;

/// <summary>
/// Names every operation "{Controller}_{Action}" (Runs_Create, Weather_Get, ...). NSwag splits the name into one client
/// class per controller and one method per action (RunsClient.create), instead of names made from the path.
/// </summary>
public sealed class OperationIdTransformer : IOpenApiOperationTransformer
{
    public Task TransformAsync(OpenApiOperation operation, OpenApiOperationTransformerContext context, CancellationToken cancellationToken)
    {
        if (context.Description.ActionDescriptor is ControllerActionDescriptor action)
        {
            operation.OperationId ??= $"{action.ControllerName}_{action.ActionName}";
        }

        return Task.CompletedTask;
    }
}
