const express = require('express');
const router = express.Router();
const residentsController = require('../controllers/residentsController');
const { authenticateToken, requireProprietaire } = require('../middlewares/auth');
const { checkSubscription, checkResidentQuota } = require('../middlewares/checkSubscription');

/**
 * @swagger
 * tags:
 *   - name: Residents
 *     description: Gestion des résidents par propriétaire
 */

/**
 * @swagger
 * /residents/my-house:
 *   get:
 *     summary: Lister les résidents de ma maison (résident connecté)
 *     tags: [Residents]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des résidents
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/GenericError'
 */
router.get('/my-house', authenticateToken, residentsController.getMyHouseResidents);


router.use(authenticateToken);
router.use(requireProprietaire);
router.use(checkSubscription);


/**
 * @swagger
 * /residents:
 *   post:
 *     summary: Créer un résident
 *     tags: [Residents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [prenom, nom, email, telephone, maisonId]
 *             properties:
 *               prenom: { type: string, example: 'Fatou' }
 *               nom: { type: string, example: 'Ba' }
 *               email: { type: string, example: 'fatou@example.com' }
 *               telephone: { type: string, example: '+221778887766' }
 *               maisonId: { type: string }
 *     responses:
 *       201:
 *         description: Résident créé
 *         content:
 *           application/json:
 *             examples:
 *               residentCree:
 *                 value:
 *                   id: cly-res-01
 *                   prenom: Fatou
 *                   nom: Ba
 *                   email: fatou@example.com
 *                   telephone: +221778887766
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/GenericError'
 */
router.post('/', checkResidentQuota, residentsController.addResident);


/**
 * @swagger
 * /residents:
 *   get:
 *     summary: Lister les résidents du propriétaire
 *     tags: [Residents]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des résidents
 *         content:
 *           application/json:
 *             examples:
 *               residents:
 *                 value:
 *                   - id: cly-res-01
 *                     prenom: Fatou
 *                     nom: Ba
 *                   - id: cly-res-02
 *                     prenom: Ibrahima
 *                     nom: Ndiaye
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/', residentsController.getResidents);


/**
 * @swagger
 * /residents/{id}:
 *   get:
 *     summary: Détail d'un résident
 *     tags: [Residents]
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
 *         description: Résident trouvé
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:id', residentsController.getResident);


/**
 * @swagger
 * /residents/{id}:
 *   put:
 *     summary: Mettre à jour un résident
 *     tags: [Residents]
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
 *         description: Résident mis à jour
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.put('/:id', residentsController.updateResident);


/**
 * @swagger
 * /residents/{id}/reset-password:
 *   post:
 *     summary: Réinitialiser le mot de passe d'un résident
 *     tags: [Residents]
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
 *         description: Mot de passe réinitialisé
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.post('/:id/reset-password', residentsController.resetResidentPassword);


/**
 * @swagger
 * /residents/{id}:
 *   delete:
 *     summary: Supprimer un résident
 *     tags: [Residents]
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
 *         description: Résident supprimé
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.delete('/:id', residentsController.deleteResident);

module.exports = router;
