# Keycloak for account.<domain>: the LinhaZero theme and realm baked in, built once for Postgres (start --optimized).
# Build context: infra/keycloak. The realm is imported on start when it does not exist yet (--import-realm).
FROM quay.io/keycloak/keycloak:26.8.1 AS build
ENV KC_DB=postgres KC_HEALTH_ENABLED=true KC_HTTP_RELATIVE_PATH=/
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.8.1
COPY --from=build /opt/keycloak/ /opt/keycloak/
COPY themes/ /opt/keycloak/themes/
COPY linhazero-realm.json /opt/keycloak/data/import/
EXPOSE 8080 9000
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized", "--import-realm"]
