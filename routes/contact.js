const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');

/**
 * @swagger
 * tags:
 *   - name: Contact
 *     description: Formulaire de contact public
 */

/**
 * @swagger
 * /contact:
 *   post:
 *     summary: Envoyer un message de contact
 *     tags: [Contact]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ContactInput'
 *     responses:
 *       200:
 *         description: Message envoyé
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *             examples:
 *               contactSuccess:
 *                 value:
 *                   message: Votre message a ete envoye avec succes
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       500:
 *         $ref: '#/components/responses/GenericError'
 */
router.post('/', contactController.sendContactMessage);

module.exports = router;

