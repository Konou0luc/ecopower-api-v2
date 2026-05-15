const crypto = require('crypto');

/**
 * Lit l’en-tête de signature (Express / Bun : casse des clés peut varier).
 * @param {import('express').Request} req
 */
function getHubSignature256Header(req) {
  if (!req) return undefined;
  const h =
    (typeof req.get === 'function' && req.get('X-Hub-Signature-256')) ||
    (req.headers && (req.headers['x-hub-signature-256'] || req.headers['X-Hub-Signature-256']));
  if (h == null || h === '') return undefined;
  return String(h);
}

/**
 * Normalise le préfixe (Meta envoie `sha256=` ; certains proxys peuvent changer la casse).
 * @param {string} signatureHeader
 */
function normalizeMetaSignatureHeader(signatureHeader) {
  let s = String(signatureHeader).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  const lower = s.slice(0, 7).toLowerCase();
  if (lower === 'sha256=') {
    return 'sha256=' + s.slice(7).trim();
  }
  return s;
}

/**
 * Vérifie l’en-tête X-Hub-Signature-256 (HMAC SHA256 du corps brut, secret = App Secret Meta).
 * @param {Buffer} rawBody
 * @param {string|undefined} signatureHeader ex. "sha256=abcdef..."
 * @param {string} appSecret
 * @returns {{ ok: boolean, reason?: string }}
 */
function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret || typeof appSecret !== 'string') {
    return { ok: false, reason: 'NO_APP_SECRET' };
  }
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return { ok: false, reason: 'MISSING_SIGNATURE_HEADER' };
  }
  const normalized = normalizeMetaSignatureHeader(signatureHeader);
  const expectedPrefix = 'sha256=';
  if (!normalized.startsWith(expectedPrefix)) {
    return { ok: false, reason: 'BAD_SIGNATURE_FORMAT' };
  }
  const receivedHex = normalized.slice(expectedPrefix.length).trim();
  const receivedBuf = Buffer.from(receivedHex, 'hex');
  const debugSig =
    process.env.WHATSAPP_WEBHOOK_SIGNATURE_DEBUG === 'true' ||
    process.env.WHATSAPP_WEBHOOK_SIGNATURE_DEBUG === '1';

  if (receivedBuf.length !== 32) {
    if (debugSig) {
      console.warn('[WhatsApp webhook] sig debug (longueurs)', {
        receivedBytes: receivedBuf.length,
        receivedHexChars: receivedHex.length,
        receivedPrefix: receivedHex.slice(0, 8),
      });
    }
    return { ok: false, reason: 'SIGNATURE_BAD_HEX_LENGTH' };
  }

  /** Ordre Meta habituel : clé = chaîne UTF-8 du secret (32 caractères hex affichés). */
  const keysToTry = [appSecret];
  /** Cas rare : certains intégrateurs testent la clé = 16 octets décodés depuis l’affichage hex. */
  if (/^[0-9a-fA-F]{32}$/.test(appSecret)) {
    try {
      const bin = Buffer.from(appSecret, 'hex');
      if (bin.length === 16) keysToTry.push(bin);
    } catch (_) {}
  }

  let digestHexPrimary = '';
  for (let i = 0; i < keysToTry.length; i++) {
    const key = keysToTry[i];
    const digestHex = crypto.createHmac('sha256', key).update(rawBody).digest('hex');
    if (i === 0) digestHexPrimary = digestHex;
    const expectedBuf = Buffer.from(digestHex, 'hex');
    if (expectedBuf.length === 32 && crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
      if (i > 0 && (process.env.NODE_ENV === 'development' || debugSig)) {
        console.warn(
          '[WhatsApp webhook] Signature OK avec clé = Buffer.from(secret, "hex") (16 octets). La doc Meta utilise en principe la chaîne du secret telle quelle.'
        );
      }
      return { ok: true };
    }
  }

  if (debugSig) {
    console.warn('[WhatsApp webhook] sig debug (HMAC différent — clé secrète ≠ celle qui signe chez Meta)', {
      digestPrefix: digestHexPrimary.slice(0, 8),
      receivedPrefix: receivedHex.slice(0, 8),
      corpsSha256: crypto.createHash('sha256').update(rawBody).digest('hex').slice(0, 16),
    });
  }
  return { ok: false, reason: 'SIGNATURE_MISMATCH' };
}

/**
 * Résumé structuré pour les logs (évite de journaliser corps complet / numéros en clair).
 * @param {object} payload
 */
function summarizeWebhookPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { kind: 'invalid' };
  }
  const out = {
    object: payload.object ?? null,
    entryCount: Array.isArray(payload.entry) ? payload.entry.length : 0,
    fields: [],
    messageHints: [],
  };

  if (!Array.isArray(payload.entry)) {
    return out;
  }

  for (const entry of payload.entry) {
    const changes = entry?.changes;
    if (!Array.isArray(changes)) continue;
    for (const ch of changes) {
      if (ch?.field) out.fields.push(String(ch.field));
      const value = ch?.value;
      if (value?.messages?.length) {
        for (const m of value.messages) {
          out.messageHints.push({
            type: m.type ?? 'unknown',
            fromSuffix: maskId(m.from),
          });
        }
      }
      if (value?.statuses?.length) {
        for (const s of value.statuses) {
          out.messageHints.push({
            type: `status:${s.status ?? 'unknown'}`,
            idSuffix: s.id ? String(s.id).slice(-6) : null,
          });
        }
      }
    }
  }

  return out;
}

function maskId(id) {
  if (id == null) return null;
  const s = String(id);
  if (s.length <= 4) return '****';
  return `…${s.slice(-4)}`;
}

module.exports = {
  verifyMetaSignature,
  summarizeWebhookPayload,
  getHubSignature256Header,
};
