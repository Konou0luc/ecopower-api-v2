const prisma = require('../config/prisma');
const notifications = require('../utils/notifications');
const { sendFactureNotification } = require('../utils/whatsappUtils');

async function generateInvoiceNumber(tx) {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const count = await tx.facture.count();
  return `FAC-${year}${month}-${String(count + 1).padStart(4, '0')}`;
}

function computeDueDate(days = 30) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + days);
  return dueDate;
}

async function createInvoiceForConsumption({ consommationId, fraisFixes = 0 }) {
  return prisma.$transaction(async (tx) => {
    const consommation = await tx.consommation.findUnique({
      where: { id: consommationId },
      include: {
        maison: true,
        resident: true,
      },
    });

    if (!consommation) {
      const err = new Error('CONSUMPTION_NOT_FOUND');
      err.code = 'CONSUMPTION_NOT_FOUND';
      throw err;
    }

    const existing = await tx.facture.findFirst({
      where: { consommationId: consommation.id },
    });
    if (existing) {
      return { facture: existing, duplicated: true, consommation };
    }

    const tarif = consommation.maison?.tarifKwh || 0;
    const montant = (consommation.kwh * tarif) + Number(fraisFixes || 0);
    const numeroFacture = await generateInvoiceNumber(tx);
    const dateEcheance = computeDueDate(30);

    const facture = await tx.facture.create({
      data: {
        residentId: consommation.residentId,
        maisonId: consommation.maisonId,
        consommationId: consommation.id,
        montant,
        numeroFacture,
        dateEcheance,
        detailsKwh: consommation.kwh,
        detailsPrixKwh: tarif,
        detailsFraisFixes: Number(fraisFixes || 0),
        statut: 'non_payee',
      },
    });

    await tx.consommation.update({
      where: { id: consommation.id },
      data: { statut: 'facturee' },
    });

    return { facture, duplicated: false, consommation };
  });
}

async function notifyInvoiceCreation({ facture, consommation }) {
  try {
    await notifications.notifyNewInvoice(facture.id);
  } catch (e) {
    console.error('notifyNewInvoice:', e.message);
  }

  try {
    if (consommation?.resident?.telephone) {
      await sendFactureNotification(
        consommation.resident.telephone,
        facture.numeroFacture,
        facture.montant,
        facture.dateEcheance
      );
    }
  } catch (e) {
    console.error('sendFactureNotification:', e.message);
  }
}

module.exports = {
  createInvoiceForConsumption,
  notifyInvoiceCreation,
};
