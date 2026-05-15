/**
 * Traitement des événements WhatsApp Cloud API (messages entrants, statuts).
 * Appelé après réponse HTTP 200 au webhook — ne pas bloquer la requête Meta.
 */

const { sendTextMessage } = require('./whatsappGraphClient');
const prisma = require('../config/prisma');

/** ID fictif des payloads « Test » du tableau Meta (ne peut pas être utilisé sur Graph). */
const META_SAMPLE_PHONE_NUMBER_IDS = new Set(['123456123']);

/**
 * Utilise l’ID du webhook ; si c’est un échantillon Meta ou absent, retombe sur WHATSAPP_PHONE_NUMBER_ID (.env).
 * @param {string|undefined} rawFromWebhook value.metadata.phone_number_id
 */
function resolvePhoneNumberId(rawFromWebhook) {
  const w = rawFromWebhook != null ? String(rawFromWebhook).trim() : '';
  if (w && !META_SAMPLE_PHONE_NUMBER_IDS.has(w)) return w;
  const envId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  return envId || w || '';
}

function maskWaId(waId) {
  if (waId == null) return null;
  const s = String(waId);
  if (s.length <= 4) return '****';
  return `…${s.slice(-4)}`;
}

/** Chiffres uniquement — base pour comparer au champ User.telephone plus tard. */
function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

function normalizeCommand(text) {
  return String(text || '').trim().toLowerCase();
}

async function resolveResidentByWhatsAppNumber(waFrom) {
  const rawDigits = digitsOnly(waFrom);
  if (!rawDigits) return null;
  const users = await prisma.user.findMany({
    where: { role: 'resident' },
    select: { id: true, prenom: true, nom: true, telephone: true },
  });
  return users.find((u) => digitsOnly(u.telephone).endsWith(rawDigits)) || null;
}

async function buildBalanceReply(residentId) {
  const invoices = await prisma.facture.findMany({
    where: {
      residentId,
      statut: { in: ['non_payee', 'en_retard'] },
    },
    orderBy: { dateEmission: 'desc' },
  });
  const total = invoices.reduce((acc, i) => acc + i.montant, 0);
  return `Unpaid balance: ${total.toFixed(2)} FCFA (${invoices.length} invoice(s)).`;
}

async function buildConsumptionReply(residentId) {
  const currentYear = new Date().getFullYear();
  const consumptions = await prisma.consommation.findMany({
    where: { residentId, annee: currentYear },
    orderBy: [{ annee: 'desc' }, { mois: 'desc' }],
    take: 6,
  });
  const totalKwh = consumptions.reduce((acc, c) => acc + c.kwh, 0);
  return `Consumption ${currentYear}: ${totalKwh.toFixed(2)} kWh over ${consumptions.length} reading(s).`;
}

async function buildHistoryReply(residentId) {
  const invoices = await prisma.facture.findMany({
    where: { residentId },
    include: { consommation: true },
    orderBy: { dateEmission: 'desc' },
    take: 3,
  });
  if (invoices.length === 0) {
    return 'No invoice history yet.';
  }
  const lines = invoices.map((f) => {
    const m = f.consommation?.mois ?? '-';
    const y = f.consommation?.annee ?? '-';
    return `- ${f.numeroFacture}: ${f.montant.toFixed(2)} FCFA (${m}/${y}) [${f.statut}]`;
  });
  return `Latest invoices:\n${lines.join('\n')}`;
}

async function buildBotReply(ev) {
  const command = normalizeCommand(ev.textBody);
  if (!command) {
    return 'Type "help" to see available commands.';
  }
  if (command === 'help' || command === 'aide') {
    return 'Available commands: help, balance, consumption, history.';
  }

  const resident = await resolveResidentByWhatsAppNumber(ev.waFrom);
  if (!resident) {
    return 'No resident account is linked to this WhatsApp number.';
  }

  if (command === 'balance' || command === 'solde') {
    return buildBalanceReply(resident.id);
  }
  if (command === 'consumption' || command === 'consommation') {
    return buildConsumptionReply(resident.id);
  }
  if (command === 'history' || command === 'historique') {
    return buildHistoryReply(resident.id);
  }

  return 'Unknown command. Type "help".';
}

/**
 * @param {object} payload — corps JSON du webhook
 * @returns {Array<{ phoneNumberId?: string, waFrom?: string, messageId?: string, type?: string, textBody?: string, timestamp?: string }>}
 */
function extractIncomingMessages(payload) {
  const out = [];
  if (!payload?.entry || !Array.isArray(payload.entry)) return out;

  for (const entry of payload.entry) {
    for (const change of entry.changes || []) {
      const value = change?.value;
      if (!value?.messages?.length) continue;
      const phoneNumberId = value.metadata?.phone_number_id;

      for (const m of value.messages) {
        out.push({
          phoneNumberId,
          waFrom: m.from,
          messageId: m.id,
          type: m.type ?? 'unknown',
          textBody: m.type === 'text' ? m.text?.body ?? null : null,
          timestamp: m.timestamp != null ? String(m.timestamp) : null,
        });
      }
    }
  }
  return out;
}

/**
 * @param {object} payload
 * @returns {Array<{ id?: string, status?: string, recipientId?: string }>}
 */
function extractStatusUpdates(payload) {
  const out = [];
  if (!payload?.entry || !Array.isArray(payload.entry)) return out;

  for (const entry of payload.entry) {
    for (const change of entry.changes || []) {
      const value = change?.value;
      if (!value?.statuses?.length) continue;
      for (const s of value.statuses) {
        out.push({
          id: s.id,
          status: s.status,
          recipientId: s.recipient_id,
        });
      }
    }
  }
  return out;
}

/**
 * Point d’entrée du futur bot (menu, réponses Graph API, résolution résident).
 */
async function handleIncomingMessage(ev) {
  const logLine = {
    kind: 'message',
    waFrom: maskWaId(ev.waFrom),
    waDigitsLen: ev.waFrom ? digitsOnly(ev.waFrom).length : 0,
    type: ev.type,
    textPreview:
      ev.textBody != null && ev.textBody.length > 80
        ? `${ev.textBody.slice(0, 80)}…`
        : ev.textBody,
  };
  console.log('[WhatsApp inbound]', JSON.stringify(logLine));

  if (!ev.waFrom) {
    return;
  }

  const phoneNumberId = resolvePhoneNumberId(ev.phoneNumberId);
  if (!phoneNumberId) {
    console.warn(
      '[WhatsApp inbound] phone_number_id absent — ajoute WHATSAPP_PHONE_NUMBER_ID dans .env (ID du numéro Meta > Configuration API).'
    );
    return;
  }
  if (META_SAMPLE_PHONE_NUMBER_IDS.has(phoneNumberId) && !process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()) {
    console.warn(
      '[WhatsApp inbound] Payload de test Meta (phone_number_id fictif) — défini WHATSAPP_PHONE_NUMBER_ID pour la réponse auto, ou ignore cet avertissement pour les tests dashboard.'
    );
    return;
  }

  if (ev.type === 'text' && ev.textBody) {
    const reply = await buildBotReply(ev);

    const result = await sendTextMessage({
      phoneNumberId,
      to: ev.waFrom,
      body: reply,
    });

    if (result.ok) {
      console.log('[WhatsApp outbound]', JSON.stringify({ kind: 'text_sent', to: maskWaId(ev.waFrom) }));
    } else {
      const code = result.error?.error?.code;
      if (code === 131030) {
        console.error('[WhatsApp outbound] échec envoi — destinataire non autorisé (voir log [WhatsApp Graph] ci-dessus).');
      } else {
        console.error(
          '[WhatsApp outbound] échec envoi — vérifie WHATSAPP_ACCESS_TOKEN (jeton valide, droits whatsapp_business_messaging) et que l’API tourne :',
          JSON.stringify(result.error || result)
        );
      }
    }
    return;
  }

  if (ev.type !== 'text') {
    const r = await sendTextMessage({
      phoneNumberId,
      to: ev.waFrom,
      body: 'Ecopower : pour le moment, merci d’envoyer un message texte.',
    });
    if (!r.ok) {
      console.error('[WhatsApp outbound] échec (non-texte):', JSON.stringify(r.error || r));
    }
  }
}

function handleStatusUpdate(st) {
  console.log(
    '[WhatsApp inbound]',
    JSON.stringify({
      kind: 'status',
      status: st.status,
      idSuffix: st.id ? String(st.id).slice(-8) : null,
    })
  );
}

/**
 * Dispatch asynchrone après accusé webhook.
 * @param {object} payload
 */
async function dispatchWebhookPayload(payload) {
  const messages = extractIncomingMessages(payload);
  const statuses = extractStatusUpdates(payload);

  for (const st of statuses) {
    handleStatusUpdate(st);
  }

  for (const ev of messages) {
    await handleIncomingMessage(ev);
  }

  if (messages.length === 0 && statuses.length === 0) {
    console.log(
      '[WhatsApp inbound]',
      JSON.stringify({ kind: 'noop', note: 'aucun message ni statut exploitable' })
    );
  }
}

module.exports = {
  extractIncomingMessages,
  extractStatusUpdates,
  dispatchWebhookPayload,
  handleIncomingMessage,
  resolveResidentByWhatsAppNumber,
};
