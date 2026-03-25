#!/bin/sh
set -e

# Run database migrations (lightweight psql runner — no Prisma CLI needed)
echo "Running database migrations..."
./migrate.sh

# Auto-generate SECRET_ENCRYPTION_KEY for OSS if not provided.
if [ "$NEXT_PUBLIC_EDITION" != "cloud" ] && [ -z "$SECRET_ENCRYPTION_KEY" ]; then
  SECRET_KEY_FILE="/app/data/secret-encryption-key"
  if [ ! -f "$SECRET_KEY_FILE" ] || [ ! -s "$SECRET_KEY_FILE" ]; then
    echo "Generating secret encryption key..."
    head -c 32 /dev/urandom | base64 > "$SECRET_KEY_FILE"
    chmod 600 "$SECRET_KEY_FILE"
  fi
  export SECRET_ENCRYPTION_KEY
  SECRET_ENCRYPTION_KEY=$(cat "$SECRET_KEY_FILE")
fi

# Auto-generate BETTER_AUTH_SECRET if not provided (reuse encryption key as base)
if [ -z "$BETTER_AUTH_SECRET" ]; then
  if [ -n "$NEXTAUTH_SECRET" ]; then
    export BETTER_AUTH_SECRET="$NEXTAUTH_SECRET"
  elif [ -n "$SECRET_ENCRYPTION_KEY" ]; then
    export BETTER_AUTH_SECRET="$SECRET_ENCRYPTION_KEY"
  fi
fi

# Determine auth mode
if [ "$NEXT_PUBLIC_EDITION" = "cloud" ]; then
  AUTH_MODE="cloud"
elif [ -n "$BETTER_AUTH_SECRET" ] && [ -n "$GOOGLE_CLIENT_ID" ]; then
  AUTH_MODE="oauth"
else
  AUTH_MODE="local"
fi
export AUTH_MODE

echo "Starting onecli-api (auth_mode=$AUTH_MODE)..."
exec bun run apps/api/src/index.ts
