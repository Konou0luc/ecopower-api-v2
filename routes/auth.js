const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, requirePasswordChange, requireAdmin } = require('../middlewares/auth');
const usersController = require('../controllers/usersController');

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Authentification et gestion de session
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Créer un compte propriétaire/admin
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nom:
 *                 type: string
 *               prenom:
 *                 type: string
 *               email:
 *                 type: string
 *               telephone:
 *                 type: string
 *               motDePasse:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [proprietaire, admin]
 *     responses:
 *       201:
 *         description: Compte créé
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       500:
 *         $ref: '#/components/responses/GenericError'
 */
router.post('/register', authController.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Connexion email/mot de passe
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, motDePasse]
 *             properties:
 *               email:
 *                 type: string
 *               motDePasse:
 *                 type: string
 *     responses:
 *       200:
 *         description: Connexion réussie
 *         content:
 *           application/json:
 *             examples:
 *               loginSuccess:
 *                 value:
 *                   token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                   user:
 *                     id: cly-user-01
 *                     email: owner@example.com
 *                     role: proprietaire
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/login', (req, res, next) => {
  console.log('🔐 [AUTH ROUTE] POST /auth/login appelé');
  console.log('🔐 [AUTH ROUTE] Body:', req.body);
  next();
}, authController.login);

/**
 * @swagger
 * /auth/google:
 *   post:
 *     summary: Authentification via Google
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GoogleAuthInput'
 *     responses:
 *       200:
 *         description: Authentification réussie
 *         content:
 *           application/json:
 *             examples:
 *               googleSuccess:
 *                 value:
 *                   token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                   user:
 *                     email: resident@example.com
 *                     role: resident
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/google', authController.googleAuth);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Rafraîchir un token JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenInput'
 *     responses:
 *       200:
 *         description: Nouveau token généré
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/refresh', authController.refreshToken);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Déconnecter la session courante
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Déconnexion réussie
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/logout', authenticateToken, authController.logout);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Réinitialiser le mot de passe après first login
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mot de passe modifié
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/reset-password', authenticateToken, requirePasswordChange, authController.resetPassword);

// Back-office only: changement de mot de passe réservé aux admins
/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Changer le mot de passe d'un utilisateur (admin)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mot de passe changé
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post('/change-password', authenticateToken, requireAdmin, authController.changePassword);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Demander une procédure de mot de passe oublié
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Procédure lancée
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/forgot-password', authController.forgotPassword);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Récupérer l'utilisateur courant
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Données utilisateur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserPublic'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/me', authenticateToken, authController.getCurrentUser);

/**
 * @swagger
 * /auth/device-token:
 *   post:
 *     summary: Enregistrer un token appareil (push)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SetDeviceTokenInput'
 *     responses:
 *       200:
 *         description: Token enregistré
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/device-token', authenticateToken, authController.setDeviceToken);

/**
 * @swagger
 * /auth/home-location:
 *   patch:
 *     summary: Mettre à jour la localisation domicile de l'utilisateur
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *     responses:
 *       200:
 *         description: Localisation mise à jour
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.patch('/home-location', authenticateToken, authController.setHomeLocation);

/**
 * @swagger
 * /auth/account:
 *   delete:
 *     summary: Supprimer mon compte
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Compte supprimé
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.delete('/account', authenticateToken, authController.deleteMyAccount);

/**
 * @swagger
 * /auth/users/{id}/make-admin:
 *   patch:
 *     summary: Promouvoir un utilisateur en admin
 *     tags: [Auth]
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
 *         description: Utilisateur promu admin
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.patch('/users/:id/make-admin', authenticateToken, requireAdmin, usersController.makeAdmin);

module.exports = router;
