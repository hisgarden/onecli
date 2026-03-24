#!/bin/sh
set -e

PRISMA="node /app/packages/db/node_modules/prisma/build/index.js"
SCHEMA="--schema /app/packages/db/prisma/schema.prisma"

# Run database migrations
echo "Running database migrations..."
if ! $PRISMA migrate deploy $SCHEMA 2>&1; then
  echo "migrate deploy failed — bootstrapping baseline migration..."
  $PRISMA migrate resolve --applied 0_init $SCHEMA
  $PRISMA migrate deploy $SCHEMA
fi

# Auto-generate SECRET_ENCRYPTION_KEY for OSS if not provided.
if [ "$NEXT_PUBLIC_EDITION" != "cloud" ] && [ -z "$SECRET_ENCRYPTION_KEY" ]; then
  SECRET_KEY_FILE="/app/data/secret-encryption-key"
  if [ ! -f "$SECRET_KEY_FILE" ] || [ ! -s "$SECRET_KEY_FILE" ]; then
    echo "Generating secret encryption key..."
    mkdir -p /app/data
    head -c 32 /dev/urandom | base64 > "$SECRET_KEY_FILE"
    chmod 600 "$SECRET_KEY_FILE"
  fi
  export SECRET_ENCRYPTION_KEY
  SECRET_ENCRYPTION_KEY=$(cat "$SECRET_KEY_FILE")
fi

# Write runtime config for Next.js
if [ "$NEXT_PUBLIC_EDITION" = "cloud" ]; then
  AUTH_MODE="cloud"
elif [ -n "$NEXTAUTH_SECRET" ]; then
  AUTH_MODE="oauth"
else
  AUTH_MODE="local"
fi
export AUTH_MODE
OAUTH_CONFIGURED="false"
if [ "$AUTH_MODE" = "cloud" ] || [ -n "$GOOGLE_CLIENT_ID" ]; then
  OAUTH_CONFIGURED="true"
fi
mkdir -p /app/data
printf '{"authMode":"%s","oauthConfigured":%s}\n' "$AUTH_MODE" "$OAUTH_CONFIGURED" > /app/data/runtime-config.json

# Start Next.js (foreground)
exec node apps/web/server.js
