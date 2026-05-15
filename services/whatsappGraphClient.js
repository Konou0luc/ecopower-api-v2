/**
 * Client minimal WhatsApp Cloud API (envoi de messages).
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
 */

/** Aligné sur la version affichée dans la console Meta (ex. v23.0). */
const DEFAULT_GRAPH_VERSION = 'v23.0';

function graphVersion() {
  return process.env.WHATSAPP_GRAPH_API_VERSION || DEFAULT_GRAPH_VERSION;
}

function readAccessToken() {
  const raw = process.env.WHATSAPP_ACCESS_TOKEN;
  if (raw == null || String(raw).trim() === '') return '';
  return String(raw).trim().replace(/^["']|["']$/g, '');
}

/**
 * Envoie un message texte au numéro WhatsApp `to` (même format que le champ `from` du webhook).
 * @param {{ phoneNumberId: string, to: string, body: string }} params
 * @returns {Promise<{ ok: boolean, data?: object, error?: object, status?: number }>}
 */
async function sendTextMessage({ phoneNumberId, to, body }) {
  const token = readAccessToken();
  if (!token || !phoneNumberId || !to || body == null) {
    if (!token) {
      console.warn('[WhatsApp Graph] WHATSAPP_ACCESS_TOKEN manquant ou vide après chargement .env');
    }
    return { ok: false, error: { message: 'MISSING_CONFIG_OR_PARAMS' } };
  }

  const text = String(body).trim();
  if (!text) {
    return { ok: false, error: { message: 'EMPTY_BODY' } };
  }

  const url = `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(
    phoneNumberId
  )}/messages`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: String(to).trim(),
        type: 'text',
        text: {
          preview_url: false,
          body: text.slice(0, 4096),
        },
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.warn('[WhatsApp Graph] Envoi refusé:', res.status, JSON.stringify(data));
      const err = data?.error;
      const code = err?.code;
      if (code === 131030 || String(err?.message || '').toLowerCase().includes('allowed list')) {
        console.warn(
          '[WhatsApp Graph] (#131030) Le numéro du destinataire n’est pas dans la liste autorisée (compte / numéro de test Meta). ' +
            'Dans developers.facebook.com → ton app → WhatsApp → « Configuration de l’API » ou guide de démarrage : ' +
            'ajoute le numéro (format E.164 sans + dans le champ « to » côté API, ex. 228…) à la liste des numéros de test / destinataires autorisés, puis réessaie. ' +
            'Le bouton « Test » du webhook envoie un expéditeur fictif : la réponse auto échouera souvent tant que ce numéro n’est pas autorisé.'
        );
      }
      return { ok: false, status: res.status, error: data };
    }

    return { ok: true, data };
  } catch (e) {
    console.error('[WhatsApp Graph] Erreur réseau:', e.message);
    return { ok: false, error: { message: e.message } };
  }
}

module.exports = {
  sendTextMessage,
  graphVersion,
};
