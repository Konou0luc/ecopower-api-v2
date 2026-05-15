const prisma = require('../config/prisma');
const { sendTextMessage } = require('../services/whatsappGraphClient');
const { sendRappelProprietaireDemandeAdhesionEmail } = require('../utils/emailUtils');
const notifications = require('../utils/notifications');

function toWhatsAppDigits(telephone, defaultCountry = '228') {
  let d = String(telephone || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0') && defaultCountry) d = defaultCountry + d.slice(1);
  return d.length >= 8 ? d : null;
}

const listDemandesResidents = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;
    const { statut, search } = req.query;

    const where = {};
    if (statut && statut !== 'all') {
      where.statut = String(statut);
    }
    if (search && String(search).trim()) {
      const s = String(search).trim();
      where.OR = [
        { prenom: { contains: s, mode: 'insensitive' } },
        { nom: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
        { telephone: { contains: s } },
        { maison: { nomMaison: { contains: s, mode: 'insensitive' } } },
        { maison: { codeInvitation: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.demandeResident.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          maison: {
            select: {
              id: true,
              nomMaison: true,
              codeInvitation: true,
              adresseVille: true,
              adresseRue: true,
              proprietaire: {
                select: {
                  id: true,
                  nom: true,
                  prenom: true,
                  email: true,
                  telephone: true,
                },
              },
            },
          },
        },
      }),
      prisma.demandeResident.count({ where }),
    ]);

    const now = new Date();
    const demandes = rows.map((d) => ({
      id: d.id,
      prenom: d.prenom,
      nom: d.nom,
      email: d.email,
      telephone: d.telephone,
      statut: d.statut,
      expireLe: d.expireLe,
      createdAt: d.createdAt,
      traiteeLe: d.traiteeLe,
      motifRefus: d.motifRefus,
      estExpiree: d.statut === 'en_attente' && d.expireLe && d.expireLe < now,
      maison: d.maison
        ? {
            id: d.maison.id,
            nomMaison: d.maison.nomMaison,
            codeInvitation: d.maison.codeInvitation,
            adresse: [d.maison.adresseRue, d.maison.adresseVille].filter(Boolean).join(', '),
          }
        : null,
      proprietaire: d.maison?.proprietaire
        ? {
            id: d.maison.proprietaire.id,
            nom: d.maison.proprietaire.nom,
            prenom: d.maison.proprietaire.prenom,
            email: d.maison.proprietaire.email,
            telephone: d.maison.proprietaire.telephone,
          }
        : null,
    }));

    res.json({
      demandes,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 0 },
    });
  } catch (error) {
    console.error('listDemandesResidents admin:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des demandes' });
  }
};

/**
 * Informe le gérant (e-mail + WhatsApp) — l’admin n’approuve pas la demande.
 */
const notifierProprietaireDemande = async (req, res) => {
  try {
    const { id } = req.params;

    const demande = await prisma.demandeResident.findUnique({
      where: { id },
      include: {
        maison: {
          include: {
            proprietaire: {
              select: {
                id: true,
                nom: true,
                prenom: true,
                email: true,
                telephone: true,
              },
            },
          },
        },
      },
    });

    if (!demande) {
      return res.status(404).json({ message: 'Demande introuvable' });
    }
    if (demande.statut !== 'en_attente') {
      return res.status(400).json({
        message: 'Seules les demandes en attente peuvent faire l’objet d’un rappel au gérant.',
      });
    }
    if (demande.expireLe && demande.expireLe < new Date()) {
      return res.status(400).json({ message: 'Cette demande a expiré' });
    }

    const gerant = demande.maison?.proprietaire;
    if (!gerant) {
      return res.status(400).json({ message: 'Gérant introuvable pour ce logement' });
    }

    const maisonNom = demande.maison.nomMaison;
    const residentNom = `${demande.prenom} ${demande.nom}`.trim();
    const codeInvitation = demande.maison.codeInvitation || '—';

    const emailResult = await sendRappelProprietaireDemandeAdhesionEmail({
      to: gerant.email,
      gerantPrenom: gerant.prenom,
      residentNom,
      residentEmail: demande.email,
      residentTelephone: demande.telephone,
      maisonNom,
      codeInvitation,
    });

    let whatsappResult = { success: false, skipped: true, error: 'WHATSAPP_PHONE_NUMBER_ID manquant' };
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    const waTo = toWhatsAppDigits(gerant.telephone);
    if (phoneNumberId && waTo) {
      const body =
        `Bonjour ${gerant.prenom},\n\n` +
        `Ecopower : ${residentNom} a demandé à rejoindre votre logement « ${maisonNom} » ` +
        `(code utilisé : ${codeInvitation}).\n\n` +
        `Si vous attendez bien cette personne, ouvrez l’application Ecopower (espace gérant) ` +
        `et approuvez la demande d’adhésion.\n\n` +
        `Contact demandeur : ${demande.email} / ${demande.telephone}\n\n` +
        `— Équipe Ecopower`;
      const sent = await sendTextMessage({ phoneNumberId, to: waTo, body });
      whatsappResult = sent.ok
        ? { success: true, to: waTo }
        : { success: false, error: sent.error?.message || 'Échec envoi WhatsApp', to: waTo };
    } else if (!waTo) {
      whatsappResult = { success: false, error: 'Numéro du gérant invalide ou manquant' };
    }

    let pushResult = { success: false };
    try {
      pushResult = await notifications.notifyProprietaireNouvelleDemandeAdhesion(gerant.id, {
        demandeurPrenom: demande.prenom,
        demandeurNom: demande.nom,
        maisonNom,
      });
    } catch (e) {
      pushResult = { success: false, error: e.message };
    }

    const emailOk = emailResult?.success !== false;
    const waOk = whatsappResult.success === true;

    res.json({
      message: emailOk || waOk
        ? 'Le gérant a été informé. Seul lui peut approuver la demande dans l’application.'
        : 'Aucun canal n’a pu être utilisé — vérifiez SMTP et WhatsApp.',
      channels: {
        email: emailResult,
        whatsapp: whatsappResult,
        push: pushResult,
      },
    });
  } catch (error) {
    console.error('notifierProprietaireDemande:', error);
    res.status(500).json({ message: 'Erreur lors de la notification du gérant' });
  }
};

module.exports = {
  listDemandesResidents,
  notifierProprietaireDemande,
};
