#!/usr/bin/env bash
# End-to-end smoke test of the compose stack (plan-architecture.md, "End-to-end smoke"). Needs bash, curl, python3 and
# docker compose. Run from the repo root:
#   infra/smoke.sh            # assumes `npm run down -- -v && npm run up` was done, or does it with --fresh
#   infra/smoke.sh --fresh
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE="docker compose"
APP=https://app.${LZ_DOMAIN:-linhazero.localhost}
API=$APP/api/v1
# Every curl below goes through the proxy with the session of infra/dev-login.sh and the CSRF header (via .curlrc).
CURL_HOME=$(mktemp -d)
export CURL_HOME
trap 'rm -rf "$CURL_HOME"' EXIT
JAR=$CURL_HOME/jar
printf 'insecure\ncookie = "%s"\nheader = "X-LinhaZero: 1"\n' "$JAR" > "$CURL_HOME/.curlrc"
PSQL="$COMPOSE exec -T postgres psql -U dois -tA -c"

step() { printf '\n== %s\n' "$*"; }
fail() { printf 'FALHOU: %s\n' "$*" >&2; exit 1; }
wait_for() { # wait_for <seconds> <description> <command...>
  local n=$1 what=$2; shift 2
  for ((i = 0; i < n; i++)); do "$@" && return 0; sleep 1; done
  fail "à espera de $what ($n s)"
}
post_run() { curl -sf -X POST "$API/runs" -H 'content-type: application/json' -d "$1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["runId"])'; }
status_of() { curl -sf "$API/runs/$1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["status"])'; }

if [[ "${1:-}" == "--fresh" ]]; then
  step "1. down -v && up"
  $COMPOSE down -v
  $COMPOSE up -d --build
fi

step "2. readiness"
wait_for 120 "api com idleWorkers >= 1" bash -c "curl -sf $API/health | grep -q '\"idleWorkers\":[1-9]'"
curl -s "$API/health"; echo

step "2b. login (Keycloak) and what needs it"
[[ $(curl -q -sk -o /dev/null -w '%{http_code}' "$API/me") == 401 ]] || fail "sem sessão, /me devia dar 401"
[[ $(curl -q -sk -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{}' "$API/runs") == 403 ]] \
  || fail "POST sem o cabeçalho X-LinhaZero devia dar 403"
wait_for 120 "keycloak" bash -c "curl -sf https://account.${LZ_DOMAIN:-linhazero.localhost}/realms/linhazero/.well-known/openid-configuration > /dev/null"
infra/dev-login.sh "$JAR"
wait_for 60 "ingest líder" bash -c "curl -sf http://127.0.0.1:8081/health/ready | grep -q '\"leader\":true'"
curl -s http://127.0.0.1:8081/health/ready; echo

step "3. weather (needs network or the demo seed)"
wait_for 90 "snapshot com vento" bash -c "curl -s '$API/weather?lat=41.45&lon=-8.29' | grep -q '\"use\":\"'"
curl -s "$API/weather?lat=41.45&lon=-8.29" | python3 -c '
import json,sys; d=json.load(sys.stdin)
print("use:", d["use"], "| observed:", d["observed"] and d["observed"]["station"]["name"], "| model:", d["model"] and d["model"]["speedMs"])
print("sources:", [(s["name"], "stale" if s["stale"] else "ok") for s in d["sources"]])'

step "4. POST the example run"
ID=$(post_run @contracts/examples/run-request.json)
echo "runId $ID"

step "5. SSE until done"
# sed quits at "done"; curl's SIGPIPE must not trip pipefail.
EVENTS=$( (curl -sN --max-time 120 "$API/runs/$ID/events" || true) | sed '/^event: done/q')
printf '%s\n' "$EVENTS"
grep -q '^event: done' <<<"$EVENTS" || fail "sem evento done"
[[ "$(status_of "$ID")" == done ]] || fail "estado final não é done"

step "6. one raster"
SIZE=$(curl -sf "$API/runs/$ID/rasters/A/probability" | wc -c)
echo "A/probability: $SIZE bytes (esperados $((157 * 152 * 4)))"
[[ "$SIZE" -eq $((157 * 152 * 4)) ]] || fail "tamanho do raster"

step "7. scale out: 3 workers, 6 runs"
$COMPOSE up -d --scale engine-worker=3 --no-recreate engine-worker
wait_for 60 "3 workers idle" bash -c "curl -sf $API/health | grep -q '\"idleWorkers\":3'"
BIG=$(python3 -c 'import json;r=json.load(open("contracts/examples/run-request.json"));r["ensemble"]["runs"]=500;r["wind"]["speedMs"]=12;r["durationMin"]=480;print(json.dumps(r))')
IDS=()
for i in 1 2 3 4 5 6; do IDS+=("$(post_run "$BIG")"); done
for id in "${IDS[@]}"; do wait_for 180 "run $id done" bash -c "[[ \$(curl -sf $API/runs/$id | python3 -c 'import json,sys;print(json.load(sys.stdin)[\"status\"])') == done ]]"; done
LIST=$(printf "'%s'," "${IDS[@]}"); LIST=${LIST%,}
$PSQL "select worker, count(*) from runs where id in ($LIST) group by worker"
DISTINCT=$($PSQL "select count(distinct worker) from runs where id in ($LIST)")
echo "workers distintos: $DISTINCT"
[[ "$DISTINCT" -ge 2 ]] || fail "os 6 runs correram todos no mesmo worker"

step "8. redelivery: SIGKILL the worker while it holds a 500-run job"
# The heaviest job allowed (500 runs, 8 h, 20 m/s on the synthetic grid) takes under a second on these grids, so the
# only worker left is throttled to 5% CPU first, which makes the job last several seconds; after the kill a fresh,
# unthrottled container gets the redelivery once ack_wait (60 s) passes.
HEAVY=$(python3 -c 'import json;r=json.load(open("contracts/examples/run-request.json"));r.update(grid="sintetica",ignition={"row":30,"col":40},wind={"directionDeg":225,"speedMs":20},durationMin=480,decisions={"A":[],"B":[]});r["ensemble"]["runs"]=500;print(json.dumps(r))')
$COMPOSE up -d --scale engine-worker=1 --no-recreate engine-worker >/dev/null 2>&1
wait_for 60 "1 worker idle" bash -c "curl -sf $API/health | grep -q '\"idleWorkers\":1'"
W=$($COMPOSE ps -q --status running engine-worker | head -1 | cut -c1-12)
docker update --cpus 0.05 "$W" >/dev/null
ID=$(post_run "$HEAVY")
wait_for 60 "run $ID running" bash -c "[[ \$($PSQL \"select status from runs where id = '$ID'\") == running ]]"
[[ "$($PSQL "select worker from runs where id = '$ID'")" == "$W" ]] || fail "a linha diz outro worker"
echo "running on $W (5% CPU); docker kill"
docker kill "$W" >/dev/null
echo "linha depois do kill: $($PSQL "select status || ' attempts=' || attempts from runs where id = '$ID'")"
docker rm -f "$W" >/dev/null
$COMPOSE up -d --scale engine-worker=1 engine-worker >/dev/null 2>&1
wait_for 150 "run $ID done depois do kill (ack_wait 60 s + uma corrida)" bash -c "[[ \$($PSQL \"select status from runs where id = '$ID'\") == done ]]"
$PSQL "select status, attempts, worker from runs where id = '$ID'"
[[ "$($PSQL "select worker from runs where id = '$ID'")" != "$W" ]] || fail "terminou no mesmo worker"
[[ "$($PSQL "select attempts from runs where id = '$ID'")" == 2 ]] || fail "esperava 2 entregas"

printf '\nSMOKE OK\n'
