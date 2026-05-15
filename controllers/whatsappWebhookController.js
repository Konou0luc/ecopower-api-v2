const {
  verifyMetaSignature,
  summarizeWebhookPayload,
  getHubSignature256Header,
} = require('../utils/whatsappWebhookMeta');
const { getWhatsAppAppSecretForWebhook } = require('../utils/whatsappAppSecret');
const whatsappInbound = require('../services/whatsappInboundService');

/**
 * GET — Vérification du webhook Meta (challenge).
 * Query : hub.mode, hub.verify_token, hub.challenge
 */
function verifySubscription(req, res) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) {
    return res.status(503).json({
      message: 'Webhook WhatsApp non configuré (WHATSAPP_VERIFY_TOKEN manquant)',
    });
  }

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === verifyToken && challenge != null && challenge !== '') {
    return res.status(200).type('text/plain').send(String(challenge));
  }

  return res.sendStatus(403);
}

/**
 * POST — Événements entrants WhatsApp Cloud API.
 * Corps brut requis pour la signature (middleware express.raw sur la route).
 */
function handleWebhook(req, res) {
  const appSecret = getWhatsAppAppSecretForWebhook();
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));

  const skipSignatureVerify =
    process.env.NODE_ENV === 'development' &&
    process.env.WHATSAPP_SKIP_SIGNATURE_VERIFY === 'true';

  if (appSecret && !skipSignatureVerify) {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      console.warn('[WhatsApp webhook] Corps brut absent ou vide — impossible de vérifier la signature');
      return res.sendStatus(400);
    }
    if (
      process.env.NODE_ENV === 'development' &&
      process.env.WHATSAPP_WEBHOOK_DEBUG_OBJECT === 'true'
    ) {
      try {
        const j = JSON.parse(rawBody.toString('utf8'));
        console.warn(
          '[WhatsApp webhook] debug payload (whatsapp_business_account attendu) object=',
          j?.object,
          'entry=',
          j?.entry?.length
        );
      } catch {
        console.warn('[WhatsApp webhook] debug payload: JSON illisible');
      }
    }
    const sig = getHubSignature256Header(req);
    const check = verifyMetaSignature(rawBody, sig, appSecret);
    if (!check.ok) {
      console.warn(
        '[WhatsApp webhook] Signature refusée:',
        check.reason,
        '| corps_octets=',
        rawBody.length,
        '| Vérifie que l’URL du webhook est enregistrée sur developers.facebook.com/apps/',
        process.env.WHATSAPP_APP_ID || '?',
        '/… (même app que Paramètres > De base > Clé secrète dans le .env).'
      );
      return res.sendStatus(403);
    }
  } else {
    if (skipSignatureVerify) {
      console.warn(
        '[WhatsApp webhook] ⚠️ WHATSAPP_SKIP_SIGNATURE_VERIFY=true — signature non vérifiée (dev uniquement)'
      );
    } else if (!appSecret) {
      console.warn(
        '[WhatsApp webhook] WHATSAPP_APP_SECRET absent — signature non vérifiée (réservé au développement)'
      );
    }
  }

  let payload;
  try {
    const text = rawBody.toString('utf8');
    payload = text ? JSON.parse(text) : {};
  } catch (e) {
    console.warn('[WhatsApp webhook] JSON invalide:', e.message);
    return res.sendStatus(400);
  }

  const summary = summarizeWebhookPayload(payload);
  console.log('[WhatsApp webhook]', JSON.stringify({ ts: new Date().toISOString(), ...summary }));

  setImmediate(() => {
    whatsappInbound.dispatchWebhookPayload(payload).catch((err) => {
      console.error('[WhatsApp inbound] dispatch:', err.message);
    });
  });

  return res.sendStatus(200);
}

module.exports = {
  verifySubscription,
  handleWebhook,
};
