const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

/**
 * Compte de service Firebase : fichier JSON (recommandé) ou FIREBASE_CONFIG (une ligne).
 * Priorité : FIREBASE_SERVICE_ACCOUNT_PATH → GOOGLE_APPLICATION_CREDENTIALS → FIREBASE_CONFIG
 * Absence / invalide = pas de push, sans erreur bloquante.
 */
function parseServiceAccount() {
  const filePath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (filePath) {
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);
    try {
      if (!fs.existsSync(resolved)) {
        console.warn('⚠️ Fichier compte de service Firebase introuvable :', resolved);
        return null;
      }
      const txt = fs.readFileSync(resolved, 'utf8');
      const obj = JSON.parse(txt);
      return normalizeServiceAccount(obj);
    } catch (e) {
      console.error('❌ FIREBASE (fichier) : lecture ou JSON invalide —', e.message);
      return null;
    }
  }

  const raw = process.env.FIREBASE_CONFIG;
  if (raw == null) return null;

  let s = String(raw).trim();
  if (s === '' || s === '{}') return null;

  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).replace(/\\"/g, '"');
  }

  let obj;
  try {
    obj = JSON.parse(s);
  } catch (e) {
    console.error(
      '❌ FIREBASE_CONFIG : JSON invalide. Préférez FIREBASE_SERVICE_ACCOUNT_PATH=./config/firebase-service-account.json (fichier JSON exporté depuis la console Firebase).',
      e.message
    );
    return null;
  }

  return normalizeServiceAccount(obj);
}

function normalizeServiceAccount(obj) {
  if (!obj || typeof obj !== 'object' || !obj.project_id) {
    return null;
  }

  if (typeof obj.private_key === 'string' && obj.private_key.includes('\\n')) {
    obj.private_key = obj.private_key.replace(/\\n/g, '\n');
  }

  return obj;
}

let firebaseReady = false;
const serviceAccount = parseServiceAccount();

if (serviceAccount) {
  try {
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    firebaseReady = true;
  } catch (e) {
    console.error('❌ Firebase : échec de initializeApp —', e.message);
  }
}

/** Indique si l’envoi FCM (push) est disponible. */
admin.isFirebaseReady = () => firebaseReady;

module.exports = admin;
