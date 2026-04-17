const prisma = require('../config/prisma');
const notifications = require('../utils/notifications');

/** Limite mensuelle (résident + maison) : `MAX_RELEVES_PAR_MOIS` dans `.env`, défaut 2, minimum 1. */
function getMaxRelevesParMois() {
  const n = parseInt(process.env.MAX_RELEVES_PAR_MOIS, 10);
  if (Number.isFinite(n) && n >= 1) return n;
  return 2;
}

const addConsommation = async (req, res) => {
  try {
    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({
        message: 'Seul le gérant ou le propriétaire peut enregistrer les relevés de consommation pour les résidents',
      });
    }

    const {
      residentId,
      maisonId,
      previousIndex,
      currentIndex,
      mois,
      annee,
      commentaire,
    } = req.body;

    const resident = await prisma.user.findFirst({
      where: {
        id: residentId,
        idProprietaire: req.user.id,
        role: 'resident',
      },
    });
    if (!resident) return res.status(404).json({ message: 'Résident non trouvé' });

    const maison = await prisma.maison.findFirst({
      where: {
        id: maisonId,
        proprietaireId: req.user.id,
      },
    });
    if (!maison) return res.status(404).json({ message: 'Maison non trouvée' });

    const countReleves = await prisma.consommation.count({
      where: {
        residentId,
        maisonId,
        mois,
        annee,
      },
    });
    const maxReleves = getMaxRelevesParMois();
    if (countReleves >= maxReleves) {
      return res.status(400).json({
        message: `Limite atteinte : maximum ${maxReleves} relevés par mois pour ce résident`,
        count: countReleves,
      });
    }

    const kwh = currentIndex - previousIndex;
    if (kwh < 0) {
      return res.status(400).json({ message: "L'index actuel doit être ≥ à l'ancien index" });
    }

    const montant = kwh * maison.tarifKwh;

    const consommation = await prisma.consommation.create({
      data: {
        residentId,
        maisonId,
        previousIndex,
        currentIndex,
        mois,
        annee,
        commentaire,
        kwh,
        montant,
        dateReleve: new Date(),
      }
    });

    try {
      await notifications.notifyConsommationAdded(residentId, consommation.id);
    } catch (e) {
      console.error('Erreur notification consommation:', e.message);
    }

    res.status(201).json({
      message: "Consommation enregistrée avec succès",
      consommation,
    });
  } catch (error) {
    console.error("Erreur lors de l'enregistrement de la consommation:", error);
    res.status(500).json({ message: "Erreur lors de l'enregistrement" });
  }
};

const getConsommationsByResident = async (req, res) => {
  try {
    const { residentId } = req.params;
    const { annee, mois } = req.query;

    if (req.user.role === "proprietaire") {
      const resident = await prisma.user.findFirst({
        where: {
          id: residentId,
          idProprietaire: req.user.id,
          role: "resident",
        },
      });
      if (!resident) return res.status(404).json({ message: "Résident non trouvé" });
    } else if (residentId !== req.user.id) {
      return res.status(403).json({ message: "Accès non autorisé" });
    }

    const where = { residentId };
    if (annee) where.annee = parseInt(annee);
    if (mois) where.mois = parseInt(mois);

    const consommations = await prisma.consommation.findMany({
      where,
      include: {
        maison: {
          select: { nomMaison: true }
        }
      },
      orderBy: [
        { annee: 'desc' },
        { mois: 'desc' },
        { dateReleve: 'desc' }
      ]
    });

    res.json(consommations);
  } catch (error) {
    console.error("Erreur lors de la récupération des consommations:", error);
    res.status(500).json({ message: "Erreur lors de la récupération" });
  }
};

const getMyConsommations = async (req, res) => {
  try {
    const userId = req.user.id;
    const { annee, mois } = req.query;

    const where = { residentId: userId };
    if (annee) where.annee = parseInt(annee);
    if (mois) where.mois = parseInt(mois);

    const consommations = await prisma.consommation.findMany({
      where,
      include: {
        maison: {
          select: { nomMaison: true }
        }
      },
      orderBy: [
        { annee: 'desc' },
        { mois: 'desc' },
        { dateReleve: 'desc' }
      ]
    });

    const totalKwh = consommations.reduce((s, c) => s + c.kwh, 0);
    const totalMontant = consommations.reduce((s, c) => s + c.montant, 0);
    const moyenneKwh = consommations.length > 0 ? totalKwh / consommations.length : 0;

    res.json({
      consommations,
      statistiques: {
        totalKwh,
        totalMontant,
        moyenneKwh,
        nombreReleves: consommations.length,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération de mes consommations:", error);
    res.status(500).json({ message: "Erreur lors de la récupération" });
  }
};

const deleteConsommation = async (req, res) => {
  try {
    const { id } = req.params;

    const consommation = await prisma.consommation.findUnique({
      where: { id },
      include: { maison: true }
    });

    if (!consommation) {
      return res.status(404).json({ message: "Consommation non trouvée" });
    }

    if (req.user.role !== 'proprietaire' || consommation.maison.proprietaireId !== req.user.id) {
      return res.status(403).json({ message: 'Seul le gérant peut supprimer un relevé de cette maison' });
    }

    if (consommation.statut === "facturee") {
      return res.status(400).json({ message: "Impossible de supprimer une consommation déjà facturée" });
    }

    await prisma.consommation.delete({ where: { id } });

    res.json({ message: "Consommation supprimée avec succès" });
  } catch (error) {
    console.error("Erreur lors de la suppression de la consommation:", error);
    res.status(500).json({ message: "Erreur lors de la suppression" });
  }
};

const getConsommationsByMaison = async (req, res) => {
  try {
    const { maisonId } = req.params;
    const { annee, mois } = req.query;

    let maison;
    if (req.user.role === "proprietaire") {
      maison = await prisma.maison.findFirst({
        where: {
          id: maisonId,
          proprietaireId: req.user.id,
        },
      });
    } else {
      maison = await prisma.maison.findFirst({
        where: {
          id: maisonId,
          OR: [
            { listeResidents: { some: { id: req.user.id } } },
            { residentsDirects: { some: { id: req.user.id } } }
          ]
        },
      });
    }
    if (!maison) return res.status(404).json({ message: "Maison non trouvée" });

    const where = { maisonId };
    if (annee) where.annee = parseInt(annee);
    if (mois) where.mois = parseInt(mois);

    const consommations = await prisma.consommation.findMany({
      where,
      include: {
        resident: {
          select: { id: true, nom: true, prenom: true, email: true }
        }
      },
      orderBy: [
        { annee: 'desc' },
        { mois: 'desc' },
        { dateReleve: 'desc' }
      ]
    });

    const statsParResident = {};
    consommations.forEach((conso) => {
      const rId = conso.residentId;
      if (!statsParResident[rId]) {
        statsParResident[rId] = {
          resident: conso.resident,
          totalKwh: 0,
          totalMontant: 0,
          nombreReleves: 0,
        };
      }
      statsParResident[rId].totalKwh += conso.kwh;
      statsParResident[rId].totalMontant += conso.montant;
      statsParResident[rId].nombreReleves += 1;
    });

    res.json({
      consommations,
      statistiquesParResident: Object.values(statsParResident),
      maison: { id: maison.id, nomMaison: maison.nomMaison },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des consommations:", error);
    res.status(500).json({ message: "Erreur lors de la récupération" });
  }
};

const updateConsommation = async (req, res) => {
  try {
    const { id } = req.params;
    const { previousIndex, currentIndex, commentaire } = req.body;

    const consommation = await prisma.consommation.findUnique({
      where: { id },
      include: { maison: true }
    });
    if (!consommation) return res.status(404).json({ message: "Consommation non trouvée" });

    if (req.user.role !== 'proprietaire' || consommation.maison.proprietaireId !== req.user.id) {
      return res.status(403).json({ message: 'Seul le gérant peut modifier un relevé de cette maison' });
    }

    const data = {};
    if (previousIndex !== undefined) data.previousIndex = previousIndex;
    if (currentIndex !== undefined) data.currentIndex = currentIndex;
    if (commentaire !== undefined) data.commentaire = commentaire;

    const updatedConsommation = await prisma.consommation.update({
      where: { id },
      data
    });

    res.json({
      message: "Consommation mise à jour avec succès",
      consommation: updatedConsommation,
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la consommation:", error);
    res.status(500).json({ message: "Erreur lors de la mise à jour" });
  }
};

const getMyMaisonConsommations = async (req, res) => {
  try {
    const maison = await prisma.maison.findFirst({
      where: {
        OR: [
          { listeResidents: { some: { id: req.user.id } } },
          { residentsDirects: { some: { id: req.user.id } } }
        ]
      },
    });

    if (!maison) {
      return res.status(404).json({ message: 'Aucune maison trouvée pour ce résident' });
    }

    const { annee, mois } = req.query;

    const where = { maisonId: maison.id };
    if (annee) where.annee = parseInt(annee);
    if (mois) where.mois = parseInt(mois);

    const consommations = await prisma.consommation.findMany({
      where,
      include: {
        resident: {
          select: { id: true, nom: true, prenom: true, email: true }
        }
      },
      orderBy: [
        { annee: 'desc' },
        { mois: 'desc' },
        { dateReleve: 'desc' }
      ]
    });

    const statsParResident = {};
    consommations.forEach((conso) => {
      const rId = conso.residentId;
      if (!statsParResident[rId]) {
        statsParResident[rId] = {
          resident: conso.resident,
          totalKwh: 0,
          totalMontant: 0,
          nombreReleves: 0,
        };
      }
      statsParResident[rId].totalKwh += conso.kwh;
      statsParResident[rId].totalMontant += conso.montant;
      statsParResident[rId].nombreReleves += 1;
    });

    res.json({
      consommations,
      statistiquesParResident: Object.values(statsParResident),
      maison: { 
        id: maison.id, 
        nomMaison: maison.nomMaison,
        adresseRue: maison.adresseRue
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des consommations de la maison:", error);
    res.status(500).json({ message: "Erreur lors de la récupération" });
  }
};

module.exports = {
  addConsommation,
  getConsommationsByResident,
  getConsommationsByMaison,
  updateConsommation,
  deleteConsommation,
  getMyConsommations,
  getMyMaisonConsommations,
};
