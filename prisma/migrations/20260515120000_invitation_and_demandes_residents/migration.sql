-- Parcours code d'invitation + demandes d'adhésion résident

ALTER TABLE "Maison" ADD COLUMN IF NOT EXISTS "codeInvitation" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Maison_codeInvitation_key" ON "Maison"("codeInvitation");

CREATE TABLE IF NOT EXISTS "DemandeResident" (
    "id" TEXT NOT NULL,
    "maisonId" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'en_attente',
    "expireLe" TIMESTAMP(3) NOT NULL,
    "motifRefus" TEXT,
    "traiteeLe" TIMESTAMP(3),
    "residentCreeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandeResident_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DemandeResident_maisonId_email_idx" ON "DemandeResident"("maisonId", "email");
CREATE INDEX IF NOT EXISTS "DemandeResident_maisonId_statut_idx" ON "DemandeResident"("maisonId", "statut");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DemandeResident_maisonId_fkey'
  ) THEN
    ALTER TABLE "DemandeResident"
      ADD CONSTRAINT "DemandeResident_maisonId_fkey"
      FOREIGN KEY ("maisonId") REFERENCES "Maison"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
