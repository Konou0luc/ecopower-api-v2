const express = require('express');
const router = express.Router();
const abonnementsController = require('../controllers/abonnementsController');
const { authenticateToken, requireProprietaire, requireAdmin } = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   - name: Abonnements
 *     description: Offres, souscription et gestion des abonnements
 */

/**
 * @swagger
 * /abonnements:
 *   get:
 *     summary: Lister les offres d'abonnement
 *     tags: [Abonnements]
 *     responses:
 *       200:
 *         description: Liste des offres
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/OffreAbonnement'
 *             examples:
 *               offres:
 *                 value:
 *                   - code: STARTER
 *                     nom: Starter
 *                     prixMensuel: 5000
 *                   - code: PRO
 *                     nom: Pro
 *                     prixMensuel: 12000
 *       500:
 *         $ref: '#/components/responses/GenericError'
 */
router.get('/', abonnementsController.getOffres);


router.use(authenticateToken);
router.use(requireProprietaire);


/**
 * @swagger
 * /abonnements/souscrire:
 *   post:
 *     summary: Souscrire à une offre
 *     tags: [Abonnements]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               offreCode:
 *                 type: string
 *                 example: PRO
 *               modePaiement:
 *                 type: string
 *                 example: mobile_money
 *     responses:
 *       200:
 *         description: Souscription effectuée
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/GenericError'
 */
router.post('/souscrire', abonnementsController.souscrire);


/**
 * @swagger
 * /abonnements/renouveler:
 *   post:
 *     summary: Renouveler l'abonnement actif
 *     tags: [Abonnements]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Abonnement renouvelé
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/GenericError'
 */
router.post('/renouveler', abonnementsController.renouveler);

router.get('/historique', abonnementsController.getHistoriqueAbonnements);


/**
 * @swagger
 * /abonnements/actuel:
 *   get:
 *     summary: Récupérer l'abonnement courant du propriétaire
 *     tags: [Abonnements]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Abonnement actuel
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Abonnement'
 *             examples:
 *               abonnementActif:
 *                 value:
 *                   id: cly-sub-01
 *                   plan: pro
 *                   statut: actif
 *                   dateDebut: 2026-05-01T00:00:00.000Z
 *                   dateFin: 2026-05-31T23:59:59.999Z
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/GenericError'
 */
router.get('/actuel', abonnementsController.getMonAbonnement);


/**
 * @swagger
 * /abonnements/proprietaires:
 *   get:
 *     summary: Lister les propriétaires et leurs abonnements (admin)
 *     tags: [Abonnements]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste propriétaires + abonnement
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/GenericError'
 */
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
