-- Run as superuser on propscout DB

-- Extensions — matches deployed postgres:16-alpine (no postgis/timescale/vector/pg_cron)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
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
