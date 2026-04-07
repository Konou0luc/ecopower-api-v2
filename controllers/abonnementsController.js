const prisma = require('../config/prisma');

const getOffres = async (req, res) => {
  try {
    const offres = [
      {
        type: 'basic',
        nom: 'Basic',
        prix: 1000,
        nbResidentsParMaisonMax: 5,
        nbMaisonsMax: 2,
        description: 'Idéal pour les petites propriétés',
        fonctionnalites: [
          'Gestion jusqu\'à 2 maisons',
          'Gestion jusqu\'à 5 résidents par maison',
          'Génération de factures',
          'Historique des consommations',
          'Notifications via l\'application'
        ]
      },
      {
        type: 'premium',
        nom: 'Premium',
        prix: 2000,
        nbResidentsParMaisonMax: 7,
        nbMaisonsMax: 3,
        description: 'Parfait pour les propriétés moyennes',
        fonctionnalites: [
          'Gestion jusqu\'à 3 maisons',
          'Gestion jusqu\'à 7 résidents par maison',
          'Génération de factures',
          'Historique des consommations',
          'Notifications  via l\'application',
          'Support prioritaire'
        ]
      },
      {
        type: 'enterprise',
        nom: 'Enterprise',
        prix: 5000,
        nbResidentsParMaisonMax: 10,
        nbMaisonsMax: 4,
        description: 'Pour les grandes propriétés',
        fonctionnalites: [
          'Gestion jusqu\'à 4 maisons',
          'Gestion jusqu\'à 10 résidents par maison',
          'Génération de factures',
          'Historique des consommations',
          'Notifications via l\'application',
          'Support prioritaire'
        ]
      }
    ];

    res.json({ offres });
  } catch (error) {
    console.error('Erreur lors de la récupération des offres:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des offres' });
  }
};

const souscrire = async (req, res) => {
  try {
    const { type } = req.body;

    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent souscrire' });
    }

    if (req.user.abonnementId) {
      const existingAbonnement = await prisma.abonnement.findUnique({
        where: { id: req.user.abonnementId }
      });
      const now = new Date();
      if (existingAbonnement && existingAbonnement.statut === 'actif' && existingAbonnement.dateFin > now) {
        return res.status(400).json({ 
          message: 'Vous avez déjà un abonnement actif',
          abonnement: existingAbonnement
        });
      }
      
      if (existingAbonnement) {
        await prisma.abonnement.delete({ where: { id: existingAbonnement.id } });
        await prisma.user.update({
          where: { id: req.user.id },
          data: { abonnementId: null }
        });
      }
    }

    const offres = {
      basic: { prix: 1000, nbResidentsParMaisonMax: 5, nbMaisonsMax: 2 },
      premium: { prix: 2000, nbResidentsParMaisonMax: 7, nbMaisonsMax: 3 },
      enterprise: { prix: 5000, nbResidentsParMaisonMax: 10, nbMaisonsMax: 4 }
    };

    const offre = offres[type];
    if (!offre) return res.status(400).json({ message: 'Offre invalide' });

    const dateDebut = new Date();
    const dateFin = new Date();
    dateFin.setMonth(dateFin.getMonth() + 1);

    const abonnement = await prisma.abonnement.create({
      data: {
        type,
        prix: offre.prix,
        nbResidentsParMaisonMax: offre.nbResidentsParMaisonMax,
        nbMaisonsMax: offre.nbMaisonsMax,
        dateDebut,
        dateFin,
        statut: 'actif',
        isActive: true,
        proprietaireId: req.user.id
      }
    });

    await prisma.user.update({
      where: { id: req.user.id },
      data: { abonnementId: abonnement.id }
    });

    res.status(201).json({
      message: 'Abonnement souscrit avec succès',
      abonnement
    });
  } catch (error) {
    console.error('Erreur lors de la souscription:', error);
    res.status(500).json({ message: 'Erreur lors de la souscription' });
  }
};

const RENOUVELLEMENT_AUTO = true;

const FREE_MODE = process.env.FREE_MODE === 'true';


const renouveler = async (req, res) => {
  try {
    const FREE_MODE = process.env.FREE_MODE === 'true';
    if (FREE_MODE) {
      const now = new Date();
      const future = new Date(now);
      future.setFullYear(future.getFullYear() + 5);
      return res.json({
        message: 'Mode gratuit: abonnement considéré actif',
        abonnement: {
          statut: 'actif',
          isActive: true,
          dateDebut: now,
          dateFin: future,
          nbResidentsParMaisonMax: 2,
          nbMaisonsMax: 1,
        },
        success: true,
      });
    }

    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent renouveler' });
    }

    const abonnement = await prisma.abonnement.findFirst({
      where: { proprietaireId: req.user.id }
    });

    if (!abonnement) return res.status(404).json({ message: 'Aucun abonnement à renouveler' });

    const dateDebut = new Date();
    const dateFin = new Date();
    dateFin.setMonth(dateFin.getMonth() + 1);

    const updatedAbonnement = await prisma.abonnement.update({
      where: { id: abonnement.id },
      data: {
        dateDebut,
        dateFin,
        statut: 'actif',
        isActive: true
      }
    });

    res.json({
      message: 'Abonnement renouvelé avec succès',
      abonnement: updatedAbonnement
    });
  } catch (error) {
    console.error('Erreur lors du renouvellement:', error);
    res.status(500).json({ message: 'Erreur lors du renouvellement' });
  }
};


const getMonAbonnement = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { abonnement: true }
    });

    if (!user || !user.abonnement) {
      if (FREE_MODE) {
        const now = new Date();
        const future = new Date(now);
        future.setFullYear(future.getFullYear() + 5);
        return res.json({
          statut: 'actif',
          isActive: true,
          dateDebut: now,
          dateFin: future,
          nbResidentsParMaisonMax: 2,
          nbMaisonsMax: 1,
        });
      }
      return res.status(404).json({ message: 'Aucun abonnement trouvé' });
    }

    res.json(user.abonnement);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'abonnement:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération' });
  }
};

module.exports = {
  getOffres,
  souscrire,
  renouveler,
  getMonAbonnement
};
