const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminDemandesResidentsController = require('../controllers/adminDemandesResidentsController');
const systemController = require('../controllers/systemController');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   - name: Admin
 *     description: Endpoints d'administration (accès admin uniquement)
 */

router.use(authenticateToken);
router.use(requireAdmin);


/**
 * @swagger
 * /admin/dashboard/stats:
 *   get:
 *     summary: Statistiques du dashboard admin
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stats globales
 *         content:
 *           application/json:
 *             examples:
 *               dashboard:
 *                 value:
 *                   usersCount: 124
 *                   housesCount: 37
 *                   consumptionsCount: 892
 *                   unpaidBillsCount: 53
 */
router.get('/dashboard/stats', adminController.getDashboardStats);


/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: Lister tous les utilisateurs
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste utilisateurs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserPublic'
 *             examples:
 *               utilisateurs:
 *                 value:
 *                   - id: cly-user-01
 *                     nom: Doe
 *                     prenom: Jane
 *                     role: proprietaire
 */
router.get('/users', adminController.getAllUsers);
/**
 * @swagger
 * /admin/users/{id}:
 *   get:
 *     summary: Détail d'un utilisateur
 *     tags: [Admin]
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
 *         description: Utilisateur
 */
router.get('/users/:id', adminController.getUser);
/**
 * @swagger
 * /admin/users/{id}:
 *   delete:
 *     summary: Supprimer un utilisateur
 *     tags: [Admin]
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
 *         description: Utilisateur supprimé
 */
router.delete('/users/:id', adminController.deleteUser);


/**
 * @swagger
 * /admin/houses:
 *   get:
 *     summary: Lister toutes les maisons
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste maisons
 */
router.get('/houses', adminController.getAllMaisons);
/**
 * @swagger
 * /admin/houses/{id}:
 *   delete:
 *     summary: Supprimer une maison
 *     tags: [Admin]
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
router.delete('/houses/:id', adminController.deleteMaison);


/**
 * @swagger
 * /admin/consumptions:
 *   get:
 *     summary: Lister toutes les consommations
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste consommations
 */
router.get('/consumptions', adminController.getAllConsommations);

/**
 * @swagger
 * /admin/bills/{id}/pdf:
 *   get:
 *     summary: Télécharger un PDF de facture
 *     tags: [Admin]
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
 *         description: PDF facture
 */
router.get('/bills/:id/pdf', adminController.downloadFacturePdf);

/**
 * @swagger
 * /admin/bills:
 *   get:
 *     summary: Lister toutes les factures
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste factures
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Facture'
 *             examples:
 *               factures:
 *                 value:
 *                   - numeroFacture: FAC-2026-05-00012
 *                     montantTotal: 15450
 *                     statut: impayee
 */
router.get('/bills', adminController.getAllFactures);


/**
 * @swagger
 * /admin/subscriptions:
 *   get:
 *     summary: Lister les abonnements
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste abonnements
 */
router.get('/subscriptions', adminController.getAllAbonnements);


/**
 * @swagger
 * /admin/residents:
 *   get:
 *     summary: Lister les résidents
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste résidents
 */
router.get('/residents', adminController.getResidents);

router.get('/demandes-residents', adminDemandesResidentsController.listDemandesResidents);
router.post(
  '/demandes-residents/:id/notifier-proprietaire',
  adminDemandesResidentsController.notifierProprietaireDemande
);
/**
 * @swagger
 * /admin/residents/{id}:
 *   delete:
 *     summary: Supprimer un résident
 *     tags: [Admin]
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
 */
router.delete('/residents/:id', adminController.deleteResident);


/**
 * @swagger
 * /admin/messages:
 *   get:
 *     summary: Lister les messages
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste messages
 */
router.get('/messages', adminController.getMessages);


/**
 * @swagger
 * /admin/notifications:
 *   get:
 *     summary: Lister les notifications
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/NotificationEntity'
 *             examples:
 *               notifications:
 *                 value:
 *                   - titre: Nouvelle facture
 *                     contenu: Votre facture du mois est disponible.
 *                     lu: false
 */
router.get('/notifications', adminController.getNotifications);


/**
 * @swagger
 * /admin/logs:
 *   get:
 *     summary: Consulter les logs applicatifs
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logs
 */
router.get('/logs', adminController.getLogs);


/**
 * @swagger
 * /admin/system/status:
 *   get:
 *     summary: État système
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: État système
 */
router.get('/system/status', systemController.getSystemStatus);
/**
 * @swagger
 * /admin/system/info:
 *   get:
 *     summary: Informations système
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Infos système
 */
router.get('/system/info', systemController.getSystemInfo);


/**
 * @swagger
 * /admin/app-info:
 *   get:
 *     summary: Lire les informations de l'application
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Informations application
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AppInfo'
 */
router.get('/app-info', adminController.getAppInfo);
/**
 * @swagger
 * /admin/app-info:
 *   put:
 *     summary: Mettre à jour les informations de l'application
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AppInfo'
 *     responses:
 *       200:
 *         description: Informations mises à jour
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AppInfo'
 */
router.put('/app-info', adminController.updateAppInfo);


/**
 * @swagger
 * /admin/test/notification:
 *   post:
 *     summary: Envoyer une notification de test
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification de test envoyée
 */
router.post('/test/notification', adminController.testNotification);


/**
 * @swagger
 * /admin/broadcast/notification:
 *   post:
 *     summary: Diffuser une notification globale
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification diffusée
 */
router.post('/broadcast/notification', adminController.broadcastNotification);

module.exports = router;
