# Build context: services/ (needs Core/ too).
FROM mcr.microsoft.com/dotnet/sdk:10.0.402 AS build
WORKDIR /src
COPY Directory.Build.props .editorconfig ./
COPY Core/Core.csproj Core/
COPY Api/Api.csproj Api/
RUN dotnet restore Api/Api.csproj
COPY Core/ Core/
COPY Api/ Api/
RUN dotnet publish Api/Api.csproj -c Release -o /app --no-restore -p:OpenApiGenerateDocuments=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0.13
WORKDIR /app
COPY --from=build /app .
USER $APP_UID
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "Api.dll"]
