const express = require('express');
const router = express.Router();
const maisonsController = require('../controllers/maisonsController');
const { authenticateToken } = require('../middlewares/auth');
const { checkSubscription, checkMaisonQuota } = require('../middlewares/checkSubscription');

/**
 * @swagger
 * tags:
 *   - name: Maisons
 *     description: Gestion des maisons et codes d'invitation
 */

/**
 * @swagger
 * /maisons/{id}/full:
 *   get:
 *     summary: Détail complet d'une maison
 *     tags: [Maisons]
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
 *         description: Maison trouvée
 */
router.get('/:id/full', authenticateToken, maisonsController.getMaisonById);

router.use(authenticateToken);

// Appliquer checkSubscription globalement pour les proprios, 
// mais on le fera finement vu que les résidents accèdent aussi à certaines routes.
// Pour la création, c'est que proprio de toute façon.
/**
 * @swagger
 * /maisons:
 *   post:
 *     summary: Créer une maison
 *     tags: [Maisons]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateMaisonInput'
 *     responses:
 *       201:
 *         description: Maison créée
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Maison'
 *             examples:
 *               maisonCreee:
 *                 value:
 *                   id: cly9m2m9z0002abc987zyx654
 *                   nom: Villa Keur Mame
 *                   adresse: Dakar, Almadies
 *                   tarifKwh: 120.5
 *                   nbResidentsMax: 6
 *                   codeInvitation: ECO-8K9L2P
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post('/', checkSubscription, checkMaisonQuota, maisonsController.createMaison);


/**
 * @swagger
 * /maisons:
 *   get:
 *     summary: Lister les maisons accessibles
 *     tags: [Maisons]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des maisons
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Maison'
 *             examples:
 *               maisons:
 *                 value:
 *                   - id: cly9m2m9z0002abc987zyx654
 *                     nom: Villa Keur Mame
 *                     adresse: Dakar, Almadies
 *                     tarifKwh: 120.5
 *                   - id: cly9m2m9z0002abc987zyx655
 *                     nom: Residence Parcelles
 *                     adresse: Dakar, Parcelles Assainies
 *                     tarifKwh: 110
 */
router.get('/', maisonsController.getMaisons);


/**
 * @swagger
 * /maisons/{id}:
 *   get:
 *     summary: Récupérer une maison
 *     tags: [Maisons]
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
 *         description: Maison
 */
router.get('/:id', maisonsController.getMaison);


/**
 * @swagger
 * /maisons/{id}:
 *   put:
 *     summary: Mettre à jour une maison
 *     tags: [Maisons]
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
 *         description: Maison mise à jour
 */
router.put('/:id', maisonsController.updateMaison);


/**
 * @swagger
 * /maisons/{id}:
 *   delete:
 *     summary: Supprimer une maison
 *     tags: [Maisons]
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
 *         description: Maison supprimée
 */
router.delete('/:id', maisonsController.deleteMaison);


/**
 * @swagger
 * /maisons/{id}/tarif:
 *   patch:
 *     summary: Mettre à jour le tarif kWh
 *     tags: [Maisons]
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
 *         description: Tarif mis à jour
 */
router.patch('/:id/tarif', maisonsController.updateMaisonTarif);


/**
 * @swagger
 * /maisons/{id}/configuration:
 *   patch:
 *     summary: Mettre à jour la configuration maison
 *     tags: [Maisons]
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
 *         description: Configuration mise à jour
 */
router.patch('/:id/configuration', maisonsController.updateMaisonConfiguration);

/**
 * @swagger
 * /maisons/{id}/code-invitation:
 *   patch:
 *     summary: Régénérer le code d'invitation d'une maison
 *     tags: [Maisons]
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
 *         description: Code régénéré
 */
router.patch('/:id/code-invitation', maisonsController.regenerateCodeInvitation);

/**
 * @swagger
 * /maisons/{id}/invitation/share-whatsapp:
 *   post:
 *     summary: Partager le code d'invitation via WhatsApp
 *     tags: [Maisons]
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
 *         description: Code partagé
 */
router.post('/:id/invitation/share-whatsapp', maisonsController.shareInvitationCodeOnWhatsApp);

/**
 * @swagger
 * /maisons/residents/ajouter:
 *   post:
 *     summary: Ajouter un résident à une maison
 *     tags: [Maisons]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Résident ajouté
 */
router.post('/residents/ajouter', maisonsController.addResidentToMaison);


/**
 * @swagger
 * /maisons/residents/retirer:
 *   post:
 *     summary: Retirer un résident d'une maison
 *     tags: [Maisons]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Résident retiré
 */
router.post('/residents/retirer', maisonsController.removeResidentFromMaison);

module.exports = router;
