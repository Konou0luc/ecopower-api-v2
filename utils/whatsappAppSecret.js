const fs = require('fs');
const path = require('path');

/**
 * Lit WHATSAPP_APP_SECRET directement depuis le fichier .env à la racine du projet.
 * En développement, évite qu’un `export WHATSAPP_APP_SECRET=...` dans le shell
 * (ou l’ordre Bun / dotenv) fasse utiliser une ancienne valeur alors que le .env est à jour.
 */
function readWhatsAppAppSecretFromEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  try {
    const txt = fs.readFileSync(envPath, 'utf8');
    /** Dernière occurrence gagne (comme dotenv) ; autorise espaces autour du `=`. */
    const lines = txt.split(/\r?\n/);
    let last = null;
    for (const line of lines) {
      const m = line.match(/^\s*WHATSAPP_APP_SECRET\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[1].trim().replace(/\r/g, '');
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      v = v.replace(/^\uFEFF/, '').trim();
      if (v) last = v;
    }
    return last;
  } catch {
    return null;
  }
}

/**
 * Secret App Meta pour la vérification X-Hub-Signature-256.
 * En non-production : priorité au .env sur disque si présent.
 */
function getWhatsAppAppSecretForWebhook() {
  const fromFile =
    process.env.NODE_ENV !== 'production' ? readWhatsAppAppSecretFromEnvFile() : null;
  const raw =
    fromFile ??
    process.env.WHATSAPP_APP_SECRET ??
    process.env.FACEBOOK_APP_SECRET ??
    '';
  return String(raw).replace(/^\uFEFF/, '').trim();
}

module.exports = {
  readWhatsAppAppSecretFromEnvFile,
  getWhatsAppAppSecretForWebhook,
};
