const prisma = require('../config/prisma');
const { sendFactureNotification } = require('../utils/whatsappUtils');
const notifications = require('../utils/notifications');

const genererNumeroFacture = async () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const count = await prisma.facture.count();
  return `FAC-${year}${month}-${String(count + 1).padStart(4, '0')}`;
};

const generateFacture = async (req, res) => {
  try {
    const { residentId } = req.params;
    const { mois, annee, fraisFixes = 0 } = req.body;

    if (req.user.role === 'proprietaire') {
      const resident = await prisma.user.findFirst({
        where: {
          id: residentId,
          idProprietaire: req.user.id,
          role: 'resident'
        }
      });
      if (!resident) return res.status(404).json({ message: 'Résident non trouvé' });
    } else if (residentId !== req.user.id) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    const consommation = await prisma.consommation.findFirst({
      where: {
        residentId,
        mois: parseInt(mois),
        annee: parseInt(annee)
      }
    });

    if (!consommation) {
      return res.status(404).json({ message: 'Aucune consommation trouvée pour cette période' });
    }

    const existingFacture = await prisma.facture.findFirst({
      where: {
        residentId,
        consommationId: consommation.id
      }
    });

    if (existingFacture) {
      return res.status(400).json({ 
        message: 'Une facture existe déjà pour cette consommation',
        facture: existingFacture
      });
    }

    const maisonFact = await prisma.maison.findUnique({ where: { id: consommation.maisonId } });
    const tarif = maisonFact?.tarifKwh || 0.1740;
    const montant = (consommation.kwh * tarif) + fraisFixes;

    const numeroFacture = await genererNumeroFacture();
    const dateEcheance = new Date();
    dateEcheance.setDate(dateEcheance.getDate() + 30);

    const facture = await prisma.facture.create({
      data: {
        residentId,
        maisonId: consommation.maisonId,
        consommationId: consommation.id,
        montant,
        numeroFacture,
        dateEcheance,
        detailsKwh: consommation.kwh,
        detailsPrixKwh: tarif,
        detailsFraisFixes: fraisFixes,
        statut: 'non_payee'
      }
    });

    await prisma.consommation.update({
      where: { id: consommation.id },
      data: { statut: 'facturee' }
    });

    const resident = await prisma.user.findUnique({ where: { id: residentId } });
    if (resident && resident.telephone) {
      try {
        await sendFactureNotification(resident.telephone, numeroFacture, montant, dateEcheance);
      } catch (e) {
        console.error('Erreur notification facture:', e.message);
      }
    }

    res.status(201).json({
      message: 'Facture générée avec succès',
      facture
    });
  } catch (error) {
    console.error('Erreur lors de la génération de la facture:', error);
    res.status(500).json({ message: 'Erreur lors de la génération de la facture' });
  }
};

const getFacturesByResident = async (req, res) => {
  try {
    const { residentId } = req.params;
    const { statut, annee } = req.query;

    if (req.user.role === 'proprietaire') {
      const resident = await prisma.user.findFirst({
        where: {
          id: residentId,
          idProprietaire: req.user.id,
          role: 'resident'
        }
      });
      if (!resident) return res.status(404).json({ message: 'Résident non trouvé' });
    } else if (residentId !== req.user.id) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    const where = { residentId };
    if (statut) where.statut = statut;
    if (annee) {
      where.dateEmission = {
        gte: new Date(parseInt(annee), 0, 1),
        lt: new Date(parseInt(annee) + 1, 0, 1)
      };
    }

    const factures = await prisma.facture.findMany({
      where,
      include: {
        consommation: {
          select: { kwh: true, mois: true, annee: true }
        },
        maison: {
          select: { nomMaison: true }
        }
      },
      orderBy: { dateEmission: 'desc' }
    });

    const totalMontant = factures.reduce((sum, f) => sum + f.montant, 0);
    const facturesPayees = factures.filter(f => f.statut === 'payee');
    const totalPaye = facturesPayees.reduce((sum, f) => sum + f.montant, 0);
    const facturesEnRetard = factures.filter(f => f.statut === 'en_retard');

    res.json({
      factures,
      statistiques: {
        totalFactures: factures.length,
        totalMontant,
        totalPaye,
        totalImpaye: totalMontant - totalPaye,
        facturesPayees: facturesPayees.length,
        facturesEnRetard: facturesEnRetard.length
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des factures:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération' });
  }
};

const markFactureAsPaid = async (req, res) => {
  try {
    const { id } = req.params;

    const facture = await prisma.facture.findUnique({
      where: { id },
      include: { maison: true }
    });

    if (!facture) return res.status(404).json({ message: 'Facture non trouvée' });

    if (req.user.role === 'proprietaire') {
      if (facture.maison.proprietaireId !== req.user.id) {
        return res.status(403).json({ message: 'Accès non autorisé' });
      }
    } else {
      if (facture.residentId !== req.user.id) {
        return res.status(403).json({ message: 'Accès non autorisé' });
      }
    }

    const updatedFacture = await prisma.facture.update({
      where: { id },
      data: {
        statut: 'payee',
        datePaiement: new Date()
      }
    });

    res.json({
      message: 'Facture marquée comme payée',
      facture: updatedFacture
    });
  } catch (error) {
    console.error('Erreur lors du marquage de la facture:', error);
    res.status(500).json({ message: 'Erreur lors du marquage' });
  }
};

const getFacture = async (req, res) => {
  try {
    const { id } = req.params;

    const facture = await prisma.facture.findUnique({
      where: { id },
      include: {
        resident: { select: { id: true, nom: true, prenom: true, email: true, telephone: true } },
        consommation: { select: { kwh: true, mois: true, annee: true } },
        maison: { select: { nomMaison: true, proprietaireId: true } }
      }
    });

    if (!facture) return res.status(404).json({ message: 'Facture non trouvée' });

    if (req.user.role === 'proprietaire') {
      if (facture.maison.proprietaireId !== req.user.id) {
        return res.status(403).json({ message: 'Accès non autorisé' });
      }
    } else {
      if (facture.residentId !== req.user.id) {
        return res.status(403).json({ message: 'Accès non autorisé' });
      }
    }

    res.json({ facture });
  } catch (error) {
    console.error('Erreur lors de la récupération de la facture:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération' });
  }
};

const getFacturesByMaison = async (req, res) => {
  try {
    const { maisonId } = req.params;
    const { statut, annee } = req.query;

    let maison;
    if (req.user.role === 'proprietaire') {
      maison = await prisma.maison.findFirst({
        where: { id: maisonId, proprietaireId: req.user.id }
      });
    } else {
      maison = await prisma.maison.findFirst({
        where: {
          id: maisonId,
          OR: [
            { listeResidents: { some: { id: req.user.id } } },
            { residentsDirects: { some: { id: req.user.id } } }
          ]
        }
      });
    }

    if (!maison) return res.status(404).json({ message: 'Maison non trouvée' });

    const where = { maisonId };
    if (statut) where.statut = statut;
    if (annee) {
      where.dateEmission = {
        gte: new Date(parseInt(annee), 0, 1),
        lt: new Date(parseInt(annee) + 1, 0, 1)
      };
    }

    const factures = await prisma.facture.findMany({
      where,
      include: {
        resident: { select: { id: true, nom: true, prenom: true } },
        consommation: { select: { kwh: true, mois: true, annee: true } }
      },
      orderBy: { dateEmission: 'desc' }
    });

    const statsParResident = {};
    factures.forEach(f => {
      const rId = f.residentId;
      if (!statsParResident[rId]) {
        statsParResident[rId] = {
          resident: f.resident,
          totalFactures: 0,
          totalMontant: 0,
          totalPaye: 0,
          facturesEnRetard: 0
        };
      }
      statsParResident[rId].totalFactures += 1;
      statsParResident[rId].totalMontant += f.montant;
      if (f.statut === 'payee') {
        statsParResident[rId].totalPaye += f.montant;
      }
      if (f.statut === 'en_retard') {
        statsParResident[rId].facturesEnRetard += 1;
      }
    });

    res.json({
      factures,
      statistiquesParResident: Object.values(statsParResident),
      maison: { id: maison.id, nomMaison: maison.nomMaison }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des factures:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération' });
  }
};

const getMyFactures = async (req, res) => {
  try {
    const userId = req.user.id;
    const { statut, annee } = req.query;

    const where = { residentId: userId };
    if (statut) where.statut = statut;
    if (annee) {
      where.dateEmission = {
        gte: new Date(parseInt(annee), 0, 1),
        lt: new Date(parseInt(annee) + 1, 0, 1)
      };
    }

    const factures = await prisma.facture.findMany({
      where,
      include: {
        consommation: { select: { kwh: true, mois: true, annee: true } },
        maison: { select: { nomMaison: true } }
      },
      orderBy: { dateEmission: 'desc' }
    });

    const totalMontant = factures.reduce((sum, f) => sum + f.montant, 0);
    const facturesPayees = factures.filter(f => f.statut === 'payee');
    const totalPaye = facturesPayees.reduce((sum, f) => sum + f.montant, 0);
    const facturesEnRetard = factures.filter(f => f.statut === 'en_retard');

    res.json({
      factures,
      statistiques: {
        totalFactures: factures.length,
        totalMontant,
        totalPaye,
        totalImpaye: totalMontant - totalPaye,
        facturesPayees: facturesPayees.length,
        facturesEnRetard: facturesEnRetard.length
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de mes factures:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération' });
  }
};

const getMyMaisonFactures = async (req, res) => {
  try {
    const maison = await prisma.maison.findFirst({
      where: {
        OR: [
          { listeResidents: { some: { id: req.user.id } } },
          { residentsDirects: { some: { id: req.user.id } } }
        ]
      }
    });

    if (!maison) return res.status(404).json({ message: 'Aucune maison trouvée' });

    const { statut, annee } = req.query;
    const where = { maisonId: maison.id };
    if (statut) where.statut = statut;
    if (annee) {
      where.dateEmission = {
        gte: new Date(parseInt(annee), 0, 1),
        lt: new Date(parseInt(annee) + 1, 0, 1)
      };
    }

    const factures = await prisma.facture.findMany({
      where,
      include: {
        resident: { select: { id: true, nom: true, prenom: true } },
        consommation: { select: { kwh: true, mois: true, annee: true } }
      },
      orderBy: { dateEmission: 'desc' }
    });

    res.json({ factures });
  } catch (error) {
    console.error('Erreur lors de la récupération des factures de la maison:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération' });
  }
};

module.exports = {
  generateFacture,
  getFacturesByResident,
  getFacturesByMaison,
  getFacture,
  markFactureAsPaid,
  getMyFactures,
  getMyMaisonFactures
};
