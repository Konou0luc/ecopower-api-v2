-- Idempotent uniqueness guard for one invoice per consumption.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'facture_consommation_unique'
  ) THEN
    CREATE UNIQUE INDEX facture_consommation_unique
      ON "Facture" ("consommationId");
  END IF;
END $$;
