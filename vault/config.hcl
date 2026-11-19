# Vault server config for local development.

# Keep data in files on the Docker volume mounted at /vault/file, so it survives restarts.
storage "file" {
  path = "/vault/file"
}

# Plain HTTP is acceptable only because the port is bound to 127.0.0.1 (see docker-compose.yml).
# Anything beyond your own machine needs TLS.
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true
}

api_addr = "http://127.0.0.1:8200"
ui       = true # web UI at http://localhost:8200
