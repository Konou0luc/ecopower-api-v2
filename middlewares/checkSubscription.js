const prisma = require('../config/prisma');
const FREE_MODE = process.env.FREE_MODE === 'true';

const isAbonnementActif = (abonnement) => {
  if (!abonnement) return false;
  const now = new Date();
  return abonnement.statut === 'actif' && abonnement.isActive && abonnement.dateFin > now;
};

const getJoursRestants = (dateFin) => {
  if (!dateFin) return 0;
  const now = new Date();
  const diffTime = dateFin - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const checkSubscription = async (req, res, next) => {
  try {
    if (FREE_MODE) {
      return next();
    }
    
    if (req.user.role !== 'proprietaire') {
      return next();
    }

    if (!req.user.abonnementId) {
      return res.status(403).json({ 
        message: 'Aucun abonnement actif',
        error: 'NO_SUBSCRIPTION'
      });
    }

    const abonnement = await prisma.abonnement.findUnique({
      where: { id: req.user.abonnementId }
    });
    
    if (!abonnement) {
      return res.status(403).json({ 
        message: 'Abonnement non trouvé',
        error: 'SUBSCRIPTION_NOT_FOUND'
      });
    }

    if (!isAbonnementActif(abonnement)) {
      return res.status(403).json({ 
        message: 'Abonnement expiré',
        error: !abonnement.isActive ? 'NO_SUBSCRIPTION' : 'SUBSCRIPTION_EXPIRED',
        dateExpiration: abonnement.dateFin,
        joursRestants: getJoursRestants(abonnement.dateFin)
      });
    }

    req.abonnement = abonnement;
    next();
  } catch (error) {
    console.error('Erreur lors de la vérification de l\'abonnement:', error);
    return res.status(500).json({ 
      message: 'Erreur lors de la vérification de l\'abonnement' 
    });
  }
};

const checkResidentQuota = async (req, res, next) => {
  try {
    let defaultNbResidentsParMaison = 2; // For FREE_MODE

    // Développeur exception: allow 6 residents
    if (req.user && req.user.email === 'konouluc1@gmail.com') {
      defaultNbResidentsParMaison = 6;
    }

    const limit = (FREE_MODE || !req.abonnement) ? defaultNbResidentsParMaison : req.abonnement.nbResidentsParMaisonMax;

    if (FREE_MODE) {
      // In free mode, we still need to check the quota for the house
    } else if (!req.abonnement) {
      return res.status(403).json({ 
        message: 'Abonnement requis pour cette opération' 
      });
    }

    const { maisonId } = req.body;
    if (!maisonId) {
      return res.status(400).json({ message: 'maisonId requis pour vérifier le quota de résidents' });
    }

    const maison = await prisma.maison.findUnique({
      where: { id: maisonId },
      include: {
        listeResidents: true
      }
    });
    
    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    const nbResidentsActuels = maison.listeResidents.length;

    if (nbResidentsActuels >= limit) {
      return res.status(403).json({ 
        message: `Quota de résidents atteint pour cette maison (${limit} maximum)`,
        error: 'QUOTA_EXCEEDED',
        quotaActuel: nbResidentsActuels,
        quotaMaximum: limit
      });
    }

    req.nbResidentsActuels = nbResidentsActuels;
    next();
  } catch (error) {
    console.error('Erreur lors de la vérification du quota de résidents:', error);
    return res.status(500).json({ message: 'Erreur lors de la vérification du quota' });
  }
};

const checkMaisonQuota = async (req, res, next) => {
  try {
    let defaultNbMaisonsMax = 1; // For FREE_MODE

    // Développeur exception: allow 6 houses
    if (req.user && req.user.email === 'konouluc1@gmail.com') {
      defaultNbMaisonsMax = 6;
    }

    const limit = (FREE_MODE || !req.abonnement) ? defaultNbMaisonsMax : req.abonnement.nbMaisonsMax;

    if (FREE_MODE) {
      // In free mode, we still need to check the quota for the house
    } else if (!req.abonnement) {
      return res.status(403).json({ 
        message: 'Abonnement requis pour cette opération' 
      });
    }

    const nbMaisonsActuelles = await prisma.maison.count({
      where: { proprietaireId: req.user.id }
    });

    if (nbMaisonsActuelles >= limit) {
      return res.status(403).json({ 
        message: `Quota de maisons atteint (${limit} maximum)`,
        error: 'QUOTA_EXCEEDED',
        quotaActuel: nbMaisonsActuelles,
        quotaMaximum: limit
      });
    }

    req.nbMaisonsActuelles = nbMaisonsActuelles;
    next();
  } catch (error) {
    console.error('Erreur lors de la vérification du quota de maisons:', error);
    return res.status(500).json({ message: 'Erreur lors de la vérification du quota de maisons' });
  }
};

module.exports = {
  checkSubscription,
  checkResidentQuota,
  checkMaisonQuota
};

const checkSubscriptionExpiry = async (req, res, next) => {
  try {
    if (FREE_MODE) {
      return next();
    }
    if (!req.abonnement) {
      return next();
    }

    const joursRestants = getJoursRestants(req.abonnement.dateFin);
    
    if (joursRestants <= 7 && joursRestants > 0) {
      res.locals.subscriptionWarning = {
        message: `Votre abonnement expire dans ${joursRestants} jour(s)`,
        joursRestants,
        dateExpiration: req.abonnement.dateFin
      };
    }
    next();
  } catch (error) {
    console.error('Erreur lors de la vérification de l\'expiration:', error);
    next();
  }
};

module.exports = {
  checkSubscription,
  checkResidentQuota,
  checkMaisonQuota,
  checkSubscriptionExpiry
};
