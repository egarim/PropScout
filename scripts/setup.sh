#!/bin/bash
set -e

echo "=== PropScout Setup ==="

# Copy env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  Created .env — fill in your credentials before continuing"
  exit 1
fi

# Create propscout DB in existing postgres container
echo "Creating propscout database..."
docker exec postgres psql -U postgres -c "CREATE DATABASE propscout;" 2>/dev/null || echo "DB already exists"
docker exec postgres psql -U postgres -c "CREATE USER propscout WITH PASSWORD '$(grep POSTGRES_PASSWORD .env | cut -d= -f2)';" 2>/dev/null || echo "User already exists"
docker exec postgres psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE propscout TO propscout;" 2>/dev/null

# Run extensions + schema
echo "Running DB migrations..."
for f in infra/postgres/init/*.sql; do
  echo "  Running $f..."
  docker exec -i postgres psql -U postgres -d propscout < "$f"
done

# Start services
echo "Starting services..."
docker compose up -d minio
sleep 5
docker compose up -d

echo ""
echo "✅ PropScout is up!"
echo "   UI:       http://localhost:3200"
echo "   Directus: http://localhost:8055"
echo "   MinIO:    http://localhost:9011"
echo "   API:      http://localhost:3100"
