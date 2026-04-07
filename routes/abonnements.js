const express = require('express');
const router = express.Router();
const abonnementsController = require('../controllers/abonnementsController');
const { authenticateToken, requireProprietaire, requireAdmin } = require('../middlewares/auth');


router.get('/', abonnementsController.getOffres);


router.use(authenticateToken);
router.use(requireProprietaire);


router.post('/souscrire', abonnementsController.souscrire);


router.post('/renouveler', abonnementsController.renouveler);


router.get('/actuel', abonnementsController.getMonAbonnement);


router.get('/proprietaires', requireAdmin, async (req, res) => {
  try {
    const prisma = require('../config/prisma');
    const proprietaires = await prisma.user.findMany({
      where: { role: 'proprietaire' },
      include: { abonnement: true }
    });
    res.json({ proprietaires });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
