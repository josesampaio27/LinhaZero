# Build context: backend/ (needs src/LinhaZero.Core/ too).
FROM mcr.microsoft.com/dotnet/sdk:10.0.402 AS build
WORKDIR /src
COPY Directory.Build.props .editorconfig ./
COPY src/LinhaZero.Core/LinhaZero.Core.csproj src/LinhaZero.Core/
COPY src/LinhaZero.Ingest/LinhaZero.Ingest.csproj src/LinhaZero.Ingest/
RUN dotnet restore src/LinhaZero.Ingest/LinhaZero.Ingest.csproj
COPY src/LinhaZero.Core/ src/LinhaZero.Core/
COPY src/LinhaZero.Ingest/ src/LinhaZero.Ingest/
RUN dotnet publish src/LinhaZero.Ingest/LinhaZero.Ingest.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0.13
WORKDIR /app
COPY --from=build /app .
USER $APP_UID
ENV ASPNETCORE_URLS=http://+:8081
EXPOSE 8081
ENTRYPOINT ["dotnet", "LinhaZero.Ingest.dll"]
