#!/usr/bin/env sh
# Smoke test for the two images: start them side by side, the way Kubernetes will, and check
# they work together. Used by CI and runnable locally:
#
#   sh scripts/smoke-test.sh <web-image> <tutor-image>
#
# No API key is given, so this proves the wiring (page served, /api proxied to the tutor, clear
# error when the key is missing) without calling Claude or needing a secret in CI.
set -eu
WEB_IMAGE=$1
TUTOR_IMAGE=$2
NET=sdl-smoke-$$
PORT=${SMOKE_PORT:-18080}

cleanup() {
  status=$?
  [ "$status" -ne 0 ] && { echo "--- tutor logs"; docker logs sdl-smoke-tutor; echo "--- web logs"; docker logs sdl-smoke-web; } || true
  docker rm -f sdl-smoke-web sdl-smoke-tutor >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

# A private network where the tutor container is reachable as "tutor", like the Kubernetes Service.
docker network create "$NET" >/dev/null
docker run -d --name sdl-smoke-tutor --network "$NET" --network-alias tutor "$TUTOR_IMAGE" >/dev/null
docker run -d --name sdl-smoke-web --network "$NET" -p "$PORT:80" "$WEB_IMAGE" >/dev/null

echo "Waiting for the web container…"
i=0
until curl -sf http://localhost:$PORT/api/health >/dev/null; do
  i=$((i + 1))
  [ "$i" -gt 30 ] && { echo "FAIL: not ready after 30s"; exit 1; }
  sleep 1
done

check() { echo "ok - $1"; }
fail() { echo "FAIL - $1"; exit 1; }

curl -sf http://localhost:$PORT/ | grep -q '<title>System Design Lab</title>' && check "web serves the app" || fail "web serves the app"
curl -sf http://localhost:$PORT/api/health | grep -q '"ok":true' && check "/api is proxied to the tutor" || fail "/api is proxied to the tutor"

code=$(curl -s -o /tmp/sdl-smoke-body -w '%{http_code}' http://localhost:$PORT/api/tutor \
  -H 'Content-Type: application/json' \
  -d '{"mode":"ask","messages":[{"role":"user","content":"hi"}]}')
[ "$code" = 401 ] && grep -q 'no valid API key' /tmp/sdl-smoke-body && check "tutor explains a missing key (401)" || fail "tutor explains a missing key (401)"

code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:$PORT/api/tutor -d '{"mode":"nope"}')
[ "$code" = 400 ] && check "tutor rejects bad input (400)" || fail "tutor rejects bad input (400)"

echo "All smoke tests passed."
