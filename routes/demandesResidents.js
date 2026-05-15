const express = require('express');
const rateLimit = require('express-rate-limit');
const demandesResidentsController = require('../controllers/demandesResidentsController');
const { authenticateToken, requireProprietaire } = require('../middlewares/auth');
const { checkSubscription } = require('../middlewares/checkSubscription');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: DemandesResidents
 *     description: Parcours d'adhésion résident
 */

const publicDemandeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  message: 'Trop de demandes depuis cette adresse, réessayez plus tard',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @swagger
 * /demandes-residents/public:
 *   post:
 *     summary: Soumettre une demande publique d'adhésion résident
 *     tags: [DemandesResidents]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DemandeResidentPublicInput'
 *     responses:
 *       201:
 *         description: Demande créée
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DemandeResident'
 *             examples:
 *               demandeCreee:
 *                 value:
 *                   id: cly-dem-01
 *                   codeInvitation: ECO-8K9L2P
 *                   prenom: Aminata
 *                   nom: Ndiaye
 *                   statut: en_attente
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       500:
 *         $ref: '#/components/responses/GenericError'
 */
router.post(
  '/public/verifier-code',
  publicDemandeLimiter,
  demandesResidentsController.verifierCodeInvitationPublic
);

router.post(
  '/public',
  publicDemandeLimiter,
  demandesResidentsController.soumettreDemandePublique
);

router.get(
  '/public/statut',
  publicDemandeLimiter,
  demandesResidentsController.consulterStatutDemandePublique
);

router.use(authenticateToken);
router.use(requireProprietaire);

/**
 * @swagger
 * /demandes-residents:
 *   get:
 *     summary: Lister les demandes (gérant)
 *     tags: [DemandesResidents]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des demandes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/DemandeResident'
 *             examples:
 *               demandes:
 *                 value:
 *                   - id: cly-dem-01
 *                     prenom: Aminata
 *                     nom: Ndiaye
 *                     statut: en_attente
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/', demandesResidentsController.listerDemandesGerant);

/**
 * @swagger
 * /demandes-residents/{id}/approuver:
 *   patch:
 *     summary: Approuver une demande et créer le résident
 *     tags: [DemandesResidents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Demande approuvée
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.patch(
  '/:id/approuver',
  checkSubscription,
  demandesResidentsController.approuverDemande
);

/**
 * @swagger
 * /demandes-residents/{id}/refuser:
 *   patch:
 *     summary: Refuser une demande
 *     tags: [DemandesResidents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               motifRefus:
 *                 type: string
 *     responses:
 *       200:
 *         description: Demande refusée
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.patch('/:id/refuser', demandesResidentsController.refuserDemande);

module.exports = router;
