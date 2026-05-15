const prisma = require('../config/prisma');
const notifications = require('../utils/notifications');
const { sendDemandeAdhesionEnAttenteEmail, sendGoogleInvitationEmail } = require('../utils/emailUtils');

const FREE_MODE = process.env.FREE_MODE === 'true';

const validateEmail = (email) => {
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(String(email).toLowerCase());
};

function normalizeTelephone(t) {
  return String(t || '').trim().replace(/\s+/g, '');
}

function joursValiditeDemande() {
  const n = parseInt(process.env.DEMANDE_RESIDENT_JOURS_VALIDITE, 10);
  return Number.isFinite(n) && n >= 1 ? n : 7;
}

function isAbonnementActif(abonnement) {
  if (!abonnement) return false;
  const now = new Date();
  return abonnement.statut === 'actif' && abonnement.isActive && abonnement.dateFin > now;
}

async function findMaisonActiveByCode(codeInvitation) {
  return prisma.maison.findFirst({
    where: {
      codeInvitation: String(codeInvitation).trim().toUpperCase(),
      statut: 'active',
    },
    select: {
      id: true,
      nomMaison: true,
      adresseRue: true,
      adresseVille: true,
      adressePays: true,
    },
  });
}

/**
 * POST /demandes-residents/public/verifier-code
 * Vérifie qu’un code d’invitation correspond à une maison active (sans créer de demande).
 */
const verifierCodeInvitationPublic = async (req, res) => {
  try {
    const { codeInvitation } = req.body;
    if (!codeInvitation || !String(codeInvitation).trim()) {
      return res.status(400).json({ message: 'codeInvitation est requis' });
    }

    const maison = await findMaisonActiveByCode(codeInvitation);
    if (!maison) {
      return res.status(404).json({
        message: 'Code d’invitation invalide ou logement introuvable',
      });
    }

    const adresseParts = [maison.adresseRue, maison.adresseVille].filter(Boolean);
    res.json({
      valide: true,
      maison: {
        id: maison.id,
        nomMaison: maison.nomMaison,
        adresse: adresseParts.length > 0 ? adresseParts.join(', ') : maison.adressePays,
      },
    });
  } catch (error) {
    console.error('verifierCodeInvitationPublic:', error);
    res.status(500).json({ message: 'Erreur lors de la vérification du code' });
  }
};

/**
 * POST /demandes-residents/public
 * Sans authentification — rate-limit côté route.
 */
const soumettreDemandePublique = async (req, res) => {
  try {
    const { codeInvitation, prenom, nom, telephone, email } = req.body;

    if (!codeInvitation || !prenom || !nom || !telephone || !email) {
      return res.status(400).json({
        message: 'codeInvitation, prenom, nom, telephone et email sont requis',
      });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ message: 'Adresse e-mail invalide' });
    }

    const normalizedEmail = email.toString().trim().toLowerCase();
    const tel = normalizeTelephone(telephone);
    if (tel.length < 8) {
      return res.status(400).json({ message: 'Numéro de téléphone invalide' });
    }

    const maison = await findMaisonActiveByCode(codeInvitation);

    if (!maison) {
      return res.status(404).json({
        message: 'Code d’invitation invalide ou logement introuvable',
      });
    }

    const maisonWithOwner = await prisma.maison.findUnique({
      where: { id: maison.id },
      select: { id: true, nomMaison: true, proprietaireId: true },
    });

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(400).json({ message: 'Cette adresse e-mail est déjà utilisée' });
    }

    const pending = await prisma.demandeResident.findFirst({
      where: {
        maisonId: maison.id,
        email: normalizedEmail,
        statut: 'en_attente',
      },
    });
    if (pending) {
      return res.status(400).json({
        message: 'Une demande est déjà en cours pour cette adresse e-mail et ce logement',
      });
    }

    const expireLe = new Date();
    expireLe.setDate(expireLe.getDate() + joursValiditeDemande());

    const demande = await prisma.demandeResident.create({
      data: {
        maisonId: maison.id,
        prenom: String(prenom).trim(),
        nom: String(nom).trim(),
        telephone: tel,
        email: normalizedEmail,
        statut: 'en_attente',
        expireLe,
      },
      include: {
        maison: { select: { id: true, nomMaison: true } },
      },
    });

    try {
      await notifications.notifyProprietaireNouvelleDemandeAdhesion(maisonWithOwner.proprietaireId, {
        demandeurPrenom: demande.prenom,
        demandeurNom: demande.nom,
        maisonNom: demande.maison.nomMaison,
      });
    } catch (e) {
      console.error('notifyProprietaireNouvelleDemandeAdhesion:', e.message);
    }

    try {
      await sendDemandeAdhesionEnAttenteEmail(
        normalizedEmail,
        demande.prenom,
        demande.nom,
        demande.maison.nomMaison
      );
    } catch (e) {
      console.error('sendDemandeAdhesionEnAttenteEmail:', e.message);
    }

    // WhatsApp Cloud API (phase Meta) : envoyer un message au numéro `demande.telephone` quand le webhook sera branché.

    res.status(201).json({
      message:
        'Demande enregistrée. Le gérant doit l’approuver avant que vous puissiez vous connecter.',
      demande: {
        id: demande.id,
        statut: demande.statut,
        expireLe: demande.expireLe,
        maison: demande.maison,
      },
    });
  } catch (error) {
    console.error('soumettreDemandePublique:', error);
    res.status(500).json({ message: 'Erreur lors de l’enregistrement de la demande' });
  }
};

/**
 * GET /demandes-residents/public/statut?demandeId=&email=
 * Consultation du statut sans JWT (email doit correspondre à la demande).
 */
const consulterStatutDemandePublique = async (req, res) => {
  try {
    const { demandeId, email } = req.query;
    if (!demandeId || !email) {
      return res.status(400).json({ message: 'demandeId et email sont requis' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const demande = await prisma.demandeResident.findUnique({
      where: { id: String(demandeId) },
      include: {
        maison: { select: { id: true, nomMaison: true } },
      },
    });

    if (!demande || demande.email !== normalizedEmail) {
      return res.status(404).json({ message: 'Demande introuvable' });
    }

    const now = new Date();
    const estExpiree =
      demande.statut === 'en_attente' && demande.expireLe && demande.expireLe < now;
    const statut = estExpiree ? 'expiree' : demande.statut;

    res.json({
      demande: {
        id: demande.id,
        statut,
        expireLe: demande.expireLe,
        estExpiree,
        prenom: demande.prenom,
        nom: demande.nom,
        email: demande.email,
        maison: demande.maison,
      },
    });
  } catch (error) {
    console.error('consulterStatutDemandePublique:', error);
    res.status(500).json({ message: 'Erreur lors de la consultation du statut' });
  }
};

/**
 * GET /demandes-residents — gérant : liste des demandes (option maisonId, statut)
 */
const listerDemandesGerant = async (req, res) => {
  try {
    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Accès réservé aux gérants' });
    }

    const { maisonId, statut } = req.query;
    const where = {
      maison: {
        proprietaireId: req.user.id,
        ...(maisonId ? { id: String(maisonId) } : {}),
      },
    };
    if (statut === 'all') {
      /* pas de filtre sur statut */
    } else if (statut) {
      where.statut = String(statut);
    } else {
      where.statut = 'en_attente';
    }

    const demandes = await prisma.demandeResident.findMany({
      where,
      include: {
        maison: { select: { id: true, nomMaison: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const avecExpiration = demandes.map((d) => ({
      ...d,
      estExpiree: d.statut === 'en_attente' && d.expireLe < now,
    }));

    res.json({ demandes: avecExpiration });
  } catch (error) {
    console.error('listerDemandesGerant:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des demandes' });
  }
};

async function assertPeutAjouterResident(proprietaireId, maison) {
  if (!FREE_MODE) {
    const proprio = await prisma.user.findUnique({
      where: { id: proprietaireId },
      include: { abonnement: true },
    });
    if (!proprio?.abonnementId) {
      const err = new Error('NO_SUB');
      err.code = 'NO_SUB';
      throw err;
    }
    const ab = await prisma.abonnement.findUnique({ where: { id: proprio.abonnementId } });
    if (!isAbonnementActif(ab)) {
      const err = new Error('SUB_EXPIRED');
      err.code = 'SUB_EXPIRED';
      throw err;
    }
  }

  const fullMaison = maison.listeResidents
    ? maison
    : await prisma.maison.findUnique({
        where: { id: maison.id },
        include: { listeResidents: true },
      });

  const nb = await prisma.user.count({
    where: { maisonId: fullMaison.id, role: 'resident' },
  });
  const max = fullMaison.nbResidentsMax || 0;
  if (max > 0 && nb >= max) {
    const err = new Error('QUOTA');
    err.code = 'QUOTA';
    throw err;
  }
}

/**
 * PATCH /demandes-residents/:id/approuver
 */
const approuverDemande = async (req, res) => {
  try {
    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Accès réservé aux gérants' });
    }

    const { id } = req.params;

    const demande = await prisma.demandeResident.findUnique({
      where: { id },
      include: {
        maison: { include: { listeResidents: true } },
      },
    });

    if (!demande) {
      return res.status(404).json({ message: 'Demande introuvable' });
    }
    if (demande.maison.proprietaireId !== req.user.id) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    if (demande.statut !== 'en_attente') {
      return res.status(400).json({ message: 'Cette demande n’est plus modifiable' });
    }
    if (demande.expireLe < new Date()) {
      await prisma.demandeResident.update({
        where: { id: demande.id },
        data: { statut: 'expiree', traiteeLe: new Date() },
      });
      return res.status(400).json({ message: 'La demande a expiré' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: demande.email },
    });
    if (existingUser) {
      return res.status(400).json({
        message: 'Un compte existe déjà avec cet e-mail',
      });
    }

    try {
      await assertPeutAjouterResident(req.user.id, demande.maison);
    } catch (e) {
      if (e.code === 'QUOTA') {
        return res.status(403).json({
          message: `Nombre maximal de résidents atteint pour ce logement (${demande.maison.nbResidentsMax})`,
        });
      }
      if (e.code === 'NO_SUB' || e.code === 'SUB_EXPIRED') {
        return res.status(403).json({ message: 'Abonnement actif requis pour approuver un résident' });
      }
      throw e;
    }

    const resident = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          nom: demande.nom,
          prenom: demande.prenom,
          email: demande.email,
          telephone: demande.telephone,
          motDePasse: null,
          authMethod: 'google',
          role: 'resident',
          idProprietaire: req.user.id,
          maisonId: demande.maisonId,
          firstLogin: false,
          maisonsHabitees: {
            connect: { id: demande.maisonId },
          },
        },
      });

      await tx.maison.update({
        where: { id: demande.maisonId },
        data: {
          listeResidents: {
            connect: { id: user.id },
          },
        },
      });

      await tx.demandeResident.update({
        where: { id: demande.id },
        data: {
          statut: 'approuvee',
          traiteeLe: new Date(),
          residentCreeId: user.id,
        },
      });

      return user;
    });

    try {
      await notifications.notifyNewResident(resident.id, req.user.id);
    } catch (e) {
      console.error('notifyNewResident:', e.message);
    }

    try {
      await sendGoogleInvitationEmail(
        resident.email,
        `${resident.prenom} ${resident.nom}`,
        demande.maison.nomMaison
      );
    } catch (e) {
      console.error('sendGoogleInvitationEmail:', e.message);
    }

    res.json({
      message: 'Demande approuvée — compte résident créé (connexion Google)',
      resident: {
        id: resident.id,
        nom: resident.nom,
        prenom: resident.prenom,
        email: resident.email,
        telephone: resident.telephone,
      },
    });
  } catch (error) {
    console.error('approuverDemande:', error);
    res.status(500).json({ message: 'Erreur lors de l’approbation' });
  }
};

/**
 * PATCH /demandes-residents/:id/refuser
 */
const refuserDemande = async (req, res) => {
  try {
    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Accès réservé aux gérants' });
    }

    const { id } = req.params;
    const { motifRefus } = req.body;

    const demande = await prisma.demandeResident.findUnique({
      where: { id },
      include: { maison: true },
    });

    if (!demande) {
      return res.status(404).json({ message: 'Demande introuvable' });
    }
    if (demande.maison.proprietaireId !== req.user.id) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    if (demande.statut !== 'en_attente') {
      return res.status(400).json({ message: 'Cette demande n’est plus modifiable' });
    }

    const updated = await prisma.demandeResident.update({
      where: { id },
      data: {
        statut: 'refusee',
        motifRefus: motifRefus ? String(motifRefus).slice(0, 500) : null,
        traiteeLe: new Date(),
      },
    });

    res.json({
      message: 'Demande refusée',
      demande: updated,
    });
  } catch (error) {
    console.error('refuserDemande:', error);
    res.status(500).json({ message: 'Erreur lors du refus' });
  }
};

module.exports = {
  verifierCodeInvitationPublic,
  soumettreDemandePublique,
  consulterStatutDemandePublique,
  listerDemandesGerant,
  approuverDemande,
  refuserDemande,
};
