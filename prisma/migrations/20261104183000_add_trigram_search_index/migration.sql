-- Enable pg_trgm extension for efficient ILIKE / substring searches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN Trigram index on products(name) for sub-millisecond case-insensitive pattern matching
CREATE INDEX IF NOT EXISTS "products_name_trgm_idx" ON "products" USING gin ("name" gin_trgm_ops);

