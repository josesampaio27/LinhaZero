# Build context: backend/ (needs src/LinhaZero.Core/ too).
FROM mcr.microsoft.com/dotnet/sdk:10.0.402 AS build
WORKDIR /src
COPY Directory.Build.props .editorconfig ./
COPY src/LinhaZero.Core/LinhaZero.Core.csproj src/LinhaZero.Core/
COPY src/LinhaZero.Api/LinhaZero.Api.csproj src/LinhaZero.Api/
RUN dotnet restore src/LinhaZero.Api/LinhaZero.Api.csproj
COPY src/LinhaZero.Core/ src/LinhaZero.Core/
COPY src/LinhaZero.Api/ src/LinhaZero.Api/
RUN dotnet publish src/LinhaZero.Api/LinhaZero.Api.csproj -c Release -o /app --no-restore -p:OpenApiGenerateDocuments=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0.13
WORKDIR /app
COPY --from=build /app .
USER $APP_UID
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "LinhaZero.Api.dll"]
