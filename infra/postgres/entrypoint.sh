#!/bin/sh
set -eu
# Compose bind-mounted secrets preserve Linux host ownership/mode. Read as root,
# then stage a private copy for the official entrypoint's postgres user.
install -d -m 0700 -o postgres -g postgres /run/capstone-secrets
for role in bootstrap migration runtime jobs; do
  source=/run/secrets/${role}_password
  test -f "$source" && test -s "$source"
  install -m 0600 -o postgres -g postgres "$source" "/run/capstone-secrets/${role}_password"
done
exec /usr/local/bin/docker-entrypoint.sh "$@"
