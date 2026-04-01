-- Run as superuser on propscout DB

-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PropScout user (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'propscout') THEN
    CREATE USER propscout WITH PASSWORD 'changeme';
  END IF;
END
$$;

GRANT ALL PRIVILEGES ON DATABASE propscout TO propscout;
GRANT ALL ON SCHEMA public TO propscout;

SELECT 'Extensions installed' AS status;
