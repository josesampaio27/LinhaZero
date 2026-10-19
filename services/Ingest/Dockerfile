# Build context: services/ (needs Core/ too).
FROM mcr.microsoft.com/dotnet/sdk:10.0.402 AS build
WORKDIR /src
COPY Directory.Build.props .editorconfig ./
COPY Core/Core.csproj Core/
COPY Ingest/Ingest.csproj Ingest/
RUN dotnet restore Ingest/Ingest.csproj
COPY Core/ Core/
COPY Ingest/ Ingest/
RUN dotnet publish Ingest/Ingest.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0.13
WORKDIR /app
COPY --from=build /app .
USER $APP_UID
ENV ASPNETCORE_URLS=http://+:8081
EXPOSE 8081
ENTRYPOINT ["dotnet", "Ingest.dll"]
