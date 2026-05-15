const express = require('express');
const getRawBody = require('raw-body');
const { verifySubscription, handleWebhook } = require('../controllers/whatsappWebhookController');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: WhatsAppWebhook
 *     description: Webhook Meta WhatsApp (verification + events entrants)
 */

/**
 * Corps brut identique à celui signé par Meta (recommandé par Meta pour X-Hub-Signature-256).
 * Compatible Express + Bun ; évite les corps vides / tronqués.
 */
function readRawBody(req, res, next) {
  getRawBody(req, {
    length: req.headers['content-length'],
    limit: '512kb',
    encoding: false,
  })
    .then((buf) => {
      req.body = buf;
      next();
    })
    .catch((err) => {
      if (err.statusCode === 413) {
        res.status(413).send('Payload Too Large');
        return;
      }
      next(err);
    });
}

/**
 * @swagger
 * /whatsapp-webhook:
 *   get:
 *     summary: Vérifier le webhook WhatsApp auprès de Meta
 *     tags: [WhatsAppWebhook]
 *     parameters:
 *       - in: query
 *         name: hub.mode
 *         schema:
 *           type: string
 *       - in: query
 *         name: hub.verify_token
 *         schema:
 *           type: string
 *       - in: query
 *         name: hub.challenge
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Challenge retourné
 *         content:
 *           text/plain:
 *             examples:
 *               challenge:
 *                 value: "1234567890"
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/', verifySubscription);

/**
 * @swagger
 * /whatsapp-webhook:
 *   post:
 *     summary: Recevoir les événements WhatsApp entrants
 *     tags: [WhatsAppWebhook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Evénement traité
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value:
 *                   message: EVENT_RECEIVED
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/GenericError'
 */
router.post('/', readRawBody, handleWebhook);

module.exports = router;
