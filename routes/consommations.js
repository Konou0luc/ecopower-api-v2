const express = require('express');
const router = express.Router();
const consommationsController = require('../controllers/consommationsController');
const { authenticateToken } = require('../middlewares/auth');
const { checkSubscription } = require('../middlewares/checkSubscription');

/**
 * @swagger
 * tags:
 *   - name: Consommations
 *     description: Gestion des relevés de consommation
 */

router.use(authenticateToken);


router.use((req, res, next) => {
  
  if ((req.path.startsWith('/my-') || req.path.startsWith('/resident/')) && req.user.role === 'resident') {
    return next();
  }
  
  return checkSubscription(req, res, next);
});


/**
 * @swagger
 * /consommations:
 *   post:
 *     summary: Ajouter un relevé de consommation
 *     tags: [Consommations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddConsommationInput'
 *     responses:
 *       201:
 *         description: Consommation créée
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Consommation'
 *             examples:
 *               consommationCreee:
 *                 value:
 *                   id: cly9n3za10003abc741xyz852
 *                   mois: 5
 *                   annee: 2026
 *                   indexCompteur: 1530.75
 *                   kwhConsommes: 84.2
 *                   statut: facturee
 */
router.post('/', consommationsController.addConsommation);


/**
 * @swagger
 * /consommations/resident/{residentId}:
 *   get:
 *     summary: Consommations d'un résident
 *     tags: [Consommations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: residentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Liste des consommations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Consommation'
 *             examples:
 *               consommationsResident:
 *                 value:
 *                   - id: cly9n3za10003abc741xyz852
 *                     mois: 5
 *                     annee: 2026
 *                     kwhConsommes: 84.2
 *                   - id: cly9n3za10003abc741xyz853
 *                     mois: 4
 *                     annee: 2026
 *                     kwhConsommes: 71.8
 */
router.get('/resident/:residentId', consommationsController.getConsommationsByResident);


/**
 * @swagger
 * /consommations/maison/{maisonId}:
 *   get:
 *     summary: Consommations d'une maison
 *     tags: [Consommations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: maisonId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Liste des consommations
 */
router.get('/maison/:maisonId', consommationsController.getConsommationsByMaison);


/**
 * @swagger
 * /consommations/my-consommations:
 *   get:
 *     summary: Consommations du résident connecté
 *     tags: [Consommations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Consommations personnelles
 */
router.get('/my-consommations', consommationsController.getMyConsommations);


/**
 * @swagger
 * /consommations/my-maison:
 *   get:
 *     summary: Consommations de la maison du résident connecté
 *     tags: [Consommations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Consommations maison
 */
router.get('/my-maison', consommationsController.getMyMaisonConsommations);


/**
 * @swagger
 * /consommations/{id}:
 *   put:
 *     summary: Mettre à jour un relevé
 *     tags: [Consommations]
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
 *         description: Consommation mise à jour
 */
router.put('/:id', consommationsController.updateConsommation);


/**
 * @swagger
 * /consommations/{id}:
 *   delete:
 *     summary: Supprimer un relevé
 *     tags: [Consommations]
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
 *         description: Consommation supprimée
 */
router.delete('/:id', consommationsController.deleteConsommation);

module.exports = router;
