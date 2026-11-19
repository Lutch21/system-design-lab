#!/usr/bin/env sh
# Local Vault helper for System Design Lab.
#
#   sh scripts/vault.sh start     Start Vault; on first run, set it up. Safe to run any time.
#   sh scripts/vault.sh put-key   Store ANTHROPIC_API_KEY in Vault (prompts; nothing is echoed).
#   sh scripts/vault.sh status    Show whether Vault is running, unsealed and holding the key.
#
# Vault concepts used here:
#   init     First-time setup. Vault creates an unseal key and a root token. We save both to
#            .vault/init.json (git-ignored). With a real Vault, these are split between people.
#   unseal   Vault starts "sealed": its data is encrypted and it can't read it. The unseal key
#            unlocks it. A local server must be unsealed again after every restart.
#   kv-v2    A key/value secrets engine that keeps versions of each secret.
#   policy   A list of what a token may do. The tutor's policy allows reading one path only.
#   token    The tutor gets its own read-only token (in .env as VAULT_TOKEN), never the root token.
set -eu
cd "$(dirname "$0")/.."

INIT_FILE=.vault/init.json
SECRET=secret/system-design-lab/tutor   # where the tutor's secrets live in Vault
POLICY=system-design-lab-tutor

# Run the vault CLI inside the container. VAULT_TOKEN is passed from the environment by name,
# so its value never shows up in the command line.
vault_cli() { docker compose exec -T -e VAULT_TOKEN vault vault "$@"; }

# Read a field from .vault/init.json (e.g. root_token).
init_field() { node -e "const j=require('./$INIT_FILE'); console.log($1)"; }

use_root_token() { VAULT_TOKEN=$(init_field 'j.root_token'); export VAULT_TOKEN; }

# Set (or replace) KEY=VALUE in .env without touching other lines.
set_env() {
  touch .env
  grep -v "^$1=" .env > .env.tmp || true
  printf '%s=%s\n' "$1" "$2" >> .env.tmp
  mv .env.tmp .env
}

wait_for_vault() {
  i=0
  # `vault status` exits 0 when unsealed, 2 when sealed, 1 when it can't answer yet.
  until vault_cli status >/dev/null 2>&1 || [ $? -eq 2 ]; do
    i=$((i + 1))
    [ "$i" -gt 30 ] && { echo "Vault did not start. See: docker compose logs vault"; exit 1; }
    sleep 1
  done
}

start() {
  docker compose up -d vault
  VAULT_TOKEN=""; export VAULT_TOKEN
  wait_for_vault

  # If a local kind cluster exists, put Vault on its Docker network too, so pods (External
  # Secrets) can reach it by name. Docker forgets this whenever the container is recreated.
  if docker network inspect kind >/dev/null 2>&1; then
    docker network connect kind system-design-lab-vault 2>/dev/null || true
  fi

  if vault_cli status -format=json | grep -q '"initialized": false'; then
    echo "First run: initialising Vault (1 unseal key; fine locally, use more in production)"
    mkdir -p .vault && chmod 700 .vault
    vault_cli operator init -key-shares=1 -key-threshold=1 -format=json > "$INIT_FILE"
    chmod 600 "$INIT_FILE"
  fi

  if vault_cli status -format=json | grep -q '"sealed": true'; then
    echo "Unsealing Vault"
    # Uses Vault's HTTP API with the key in the request body (read from stdin), so the key is
    # never a command-line argument. (The CLI only accepts it as an argument or typed at a prompt.)
    init_field 'JSON.stringify({ key: j.unseal_keys_b64[0] })' |
      curl -sf -X PUT --data @- http://127.0.0.1:8200/v1/sys/unseal >/dev/null
  fi

  use_root_token

  # One-time setup. Each step is skipped if it's already done, so `start` can run again safely.
  if ! vault_cli secrets list | grep -q '^secret/'; then
    vault_cli secrets enable -path=secret kv-v2
  fi
  # KV v2 stores data under secret/data/..., so that's the path the policy grants.
  printf 'path "secret/data/system-design-lab/tutor" {\n  capabilities = ["read"]\n}\n' |
    vault_cli policy write "$POLICY" - >/dev/null

  # Give the tutor a read-only token, unless .env already holds one that still works.
  existing=$(grep '^VAULT_TOKEN=' .env 2>/dev/null | cut -d= -f2- || true)
  # The ( ) subshell keeps the tutor token from replacing the root token in the rest of the script.
  if [ -z "$existing" ] || ! (VAULT_TOKEN="$existing"; vault_cli token lookup >/dev/null 2>&1); then
    echo "Creating a read-only token for the tutor and saving it to .env"
    token=$(vault_cli token create -policy="$POLICY" -orphan -ttl=768h -field=token)
    set_env VAULT_TOKEN "$token"
  fi
  set_env VAULT_ADDR http://127.0.0.1:8200

  echo "Vault is ready at http://localhost:8200"
  vault_cli kv get "$SECRET" >/dev/null 2>&1 || echo "No API key stored yet. Run: npm run vault:put-key"
}

put_key() {
  use_root_token
  if [ -t 0 ]; then
    printf 'Paste your Anthropic API key (input is hidden): '
    stty -echo; read -r key; stty echo; echo
  else
    read -r key # piped in, e.g. moving a key out of .env
  fi
  [ -n "$key" ] || { echo "No key given."; exit 1; }
  # `=-` makes Vault read the value from stdin, so it never appears in a command line.
  printf '%s' "$key" | vault_cli kv put "$SECRET" ANTHROPIC_API_KEY=- >/dev/null
  echo "Stored. Restart the tutor (npm run dev) to load the new key."
}

status() {
  use_root_token
  vault_cli status | grep -E 'Initialized|Sealed|Version'
  if vault_cli kv get "$SECRET" >/dev/null 2>&1; then
    echo "API key: stored at $SECRET"
  else
    echo "API key: not stored"
  fi
}

case "${1:-}" in
  start) start ;;
  put-key) put_key ;;
  status) status ;;
  *) echo "Usage: sh scripts/vault.sh start | put-key | status"; exit 1 ;;
esac
