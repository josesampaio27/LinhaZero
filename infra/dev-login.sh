#!/usr/bin/env bash
# Logs in through Keycloak with curl, as a browser would, and leaves the session cookie in a cookie jar.
#   infra/dev-login.sh [jar] [user] [password]      (defaults: /tmp/linhazero.jar and the dev user of infra/keycloak/dev)
#   curl -b /tmp/linhazero.jar https://app.linhazero.localhost/api/v1/me
# -k: the certificates come from Caddy's local authority, which curl may not trust.
set -euo pipefail
JAR=${1:-/tmp/linhazero.jar}
USER_NAME=${2:-dev@linhazero.localhost}
PASSWORD=${3:-linhazero-dev}
APP=https://app.${LZ_DOMAIN:-linhazero.localhost}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
rm -f "$JAR"

# 1. The API sends the browser to the Keycloak login page.
curl -sfk -c "$JAR" -b "$JAR" -L "$APP/api/auth/login?returnUrl=/" -o "$TMP/login.html"
ACTION=$(python3 -c 'import re,html,sys; print(html.unescape(re.search(r"id=\"kc-form-login\"[^>]*action=\"([^\"]+)\"", open(sys.argv[1]).read()).group(1)))' "$TMP/login.html")

# 2. The login form. Keycloak answers with a page that posts the code back to the API (form_post).
curl -sfk -c "$JAR" -b "$JAR" -X POST "$ACTION" --data-urlencode "username=$USER_NAME" --data-urlencode "password=$PASSWORD" -o "$TMP/post.html"

# 3. That post, which a browser makes by itself: the API checks state and nonce, swaps the code and sets the cookie.
python3 - "$TMP/post.html" > "$TMP/post.args" <<'PY'
import html, re, sys
page = open(sys.argv[1]).read()
action = re.search(r'<form[^>]*action="([^"]+)"', page, re.I)
if not action:
    sys.exit("login falhou (utilizador ou palavra-passe errados?)")
print(html.unescape(action.group(1)))
for name, value in re.findall(r'<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"', page, re.I):
    if name != "continue":
        print(f"{name}={html.unescape(value)}")
PY
{ read -r CALLBACK; ARGS=(); while read -r field; do ARGS+=(--data-urlencode "$field"); done; } < "$TMP/post.args"
curl -sfk -c "$JAR" -b "$JAR" -X POST "$CALLBACK" "${ARGS[@]}" -o /dev/null

curl -sfk -b "$JAR" "$APP/api/v1/me"; echo
