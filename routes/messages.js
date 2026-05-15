const express = require('express');
const router = express.Router();
const messagesController = require('../controllers/messagesController');
const { authenticateToken } = require('../middlewares/auth');
const { uploadFileMiddleware } = require('../middlewares/upload');

/**
 * @swagger
 * tags:
 *   - name: Messages
 *     description: Messagerie privée et de maison
 */

/**
 * @swagger
 * /messages:
 *   post:
 *     summary: Envoyer un message texte
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [contenu]
 *             properties:
 *               contenu:
 *                 type: string
 *                 example: Bonjour, peux-tu verifier le compteur ?
 *               destinataireId:
 *                 type: string
 *                 nullable: true
 *               maisonId:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Message créé
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageEntity'
 *             examples:
 *               messageTexte:
 *                 value:
 *                   id: cly9q8fz90005abc963mno147
 *                   contenu: Bonjour, relevé ajouté.
 *                   type: text
 *                   expediteurId: cly-user-01
 *                   destinataireId: cly-user-02
 */
router.post('/', authenticateToken, messagesController.createMessage);


/**
 * @swagger
 * /messages/file:
 *   post:
 *     summary: Envoyer un message avec fichier
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Message fichier créé
 */
router.post('/file', authenticateToken, uploadFileMiddleware, messagesController.createFileMessage);


/**
 * @swagger
 * /messages/private/{otherUserId}:
 *   get:
 *     summary: Historique privé avec un utilisateur
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: otherUserId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Historique privé
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MessageEntity'
 *             examples:
 *               historique:
 *                 value:
 *                   - contenu: Bonjour
 *                     type: text
 *                     expediteurId: cly-user-01
 *                   - contenu: Releve bien recu
 *                     type: text
 *                     expediteurId: cly-user-02
 */
router.get('/private/:otherUserId', authenticateToken, messagesController.getPrivateHistory);


/**
 * @swagger
 * /messages/house/{maisonId}:
 *   get:
 *     summary: Historique des messages de maison
 *     tags: [Messages]
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
 *         description: Historique maison
 */
router.get('/house/:maisonId', authenticateToken, messagesController.getHouseHistory);


/**
 * @swagger
 * /messages/file/proxy:
 *   get:
 *     summary: Proxy de téléchargement/lecture de fichier de message
 *     tags: [Messages]
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Flux du fichier
 */
router.get('/file/proxy', messagesController.proxyFile);

module.exports = router;


