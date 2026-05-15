const express = require('express');
const router = express.Router();
const facturesController = require('../controllers/facturesController');
const { authenticateToken } = require('../middlewares/auth');
const { checkSubscription } = require('../middlewares/checkSubscription');

/**
 * @swagger
 * tags:
 *   - name: Factures
 *     description: Gestion des factures
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
 * /factures/generer/{residentId}:
 *   post:
 *     summary: Générer une facture pour un résident
 *     tags: [Factures]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: residentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GenerateFactureInput'
 *     responses:
 *       201:
 *         description: Facture créée
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Facture'
 *             examples:
 *               factureCreee:
 *                 value:
 *                   id: cly9p6cew0004abc258hjk369
 *                   numeroFacture: FAC-2026-05-00012
 *                   montantTotal: 15450
 *                   statut: impayee
 *                   mois: 5
 *                   annee: 2026
 */
router.post('/generer/:residentId', facturesController.generateFacture);


/**
 * @swagger
 * /factures/resident/{residentId}:
 *   get:
 *     summary: Factures d'un résident
 *     tags: [Factures]
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
 *         description: Liste des factures
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Facture'
 *             examples:
 *               facturesResident:
 *                 value:
 *                   - numeroFacture: FAC-2026-05-00012
 *                     montantTotal: 15450
 *                     statut: impayee
 *                   - numeroFacture: FAC-2026-04-00009
 *                     montantTotal: 13200
 *                     statut: payee
 */
router.get('/resident/:residentId', facturesController.getFacturesByResident);


/**
 * @swagger
 * /factures/maison/{maisonId}:
 *   get:
 *     summary: Factures d'une maison
 *     tags: [Factures]
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
 *         description: Liste des factures
 */
router.get('/maison/:maisonId', facturesController.getFacturesByMaison);


/**
 * @swagger
 * /factures/my-factures:
 *   get:
 *     summary: Factures du résident connecté
 *     tags: [Factures]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Factures personnelles
 */
router.get('/my-factures', facturesController.getMyFactures);


/**
 * @swagger
 * /factures/my-maison-factures:
 *   get:
 *     summary: Factures de la maison du résident connecté
 *     tags: [Factures]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Factures de la maison
 */
router.get('/my-maison-factures', facturesController.getMyMaisonFactures);


/**
 * @swagger
 * /factures/{id}:
 *   get:
 *     summary: Détail d'une facture
 *     tags: [Factures]
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
 *         description: Facture
 */
router.get('/:id', facturesController.getFacture);


/**
 * @swagger
 * /factures/{id}/payer:
 *   put:
 *     summary: Marquer une facture comme payée
 *     tags: [Factures]
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
 *         description: Facture mise à jour
 */
router.put('/:id/payer', facturesController.markFactureAsPaid);

router.delete('/:id', facturesController.deleteFacture);

module.exports = router;
