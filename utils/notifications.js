const prisma = require('../config/prisma');
const admin = require('../config/firebase');

const envoyer = async (residentId, message) => {
  try {
    const resident = await prisma.user.findUnique({
      where: { id: residentId }
    });
    
    if (!resident) {
      console.error('❌ Résident non trouvé pour notification');
      return { success: false, error: 'RESIDENT_NOT_FOUND' };
    }

    const deviceToken = resident.deviceToken;
    if (!deviceToken) {
      console.error('❌ deviceToken manquant pour le résident', resident.id);
      return { success: false, error: 'DEVICE_TOKEN_MISSING' };
    }

    const messagePayload = {
      notification: {
        title: 'Ecopower',
        body: message
      },
      data: {
        userId: resident.id,
        type: 'notification'
      },
      token: deviceToken,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'ecopower_default'
        }
      },
      apns: {
        headers: {
          'apns-priority': '10'
        },
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    };

    const nomComplet = `${resident.prenom} ${resident.nom}`;
    console.log(`🔔 Envoi FCM à ${nomComplet} (${resident.id})`);
    
    const response = await admin.messaging().send(messagePayload);
    console.log('✅ FCM envoyé avec succès. Message ID:', response);
    return { success: true, response: { messageId: response } };
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi FCM:', error);
    return { 
      success: false, 
      error: error.message,
      errorCode: error.code
    };
  }
};

/** FCM avec titre personnalisé (admin / diffusion) */
const envoyerAvecTitre = async (userId, titre, corps) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return { success: false, error: 'USER_NOT_FOUND' };
    }

    const deviceToken = user.deviceToken;
    if (!deviceToken) {
      return { success: false, error: 'DEVICE_TOKEN_MISSING' };
    }

    const messagePayload = {
      notification: {
        title: titre || 'Ecopower',
        body: corps
      },
      data: {
        userId: user.id,
        type: 'notification'
      },
      token: deviceToken,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'ecopower_default'
        }
      },
      apns: {
        headers: {
          'apns-priority': '10'
        },
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    };

    const messageId = await admin.messaging().send(messagePayload);
    return { success: true, response: { messageId } };
  } catch (error) {
    console.error('❌ Erreur envoyerAvecTitre:', error);
    return {
      success: false,
      error: error.message,
      errorCode: error.code
    };
  }
};

const notifySubscriptionExpiry = async () => {
  try {
    console.log('🔔 Vérification des abonnements expirant bientôt...');
    const dateLimite = new Date();
    dateLimite.setDate(dateLimite.getDate() + 7);

    const abonnements = await prisma.abonnement.findMany({
      where: {
        statut: 'actif',
        dateFin: { lt: dateLimite }
      },
      include: { proprietaire: true }
    });

    for (const abonnement of abonnements) {
      const diffTime = abonnement.dateFin - new Date();
      const joursRestants = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      console.log(`⚠️ Abonnement expire dans ${joursRestants} jours pour ${abonnement.proprietaire.email}`);
      const message = `Votre abonnement Ecopower expire dans ${joursRestants} jour(s). Pensez à le renouveler !`;
      await envoyer(abonnement.proprietaireId, message);
    }
  } catch (error) {
    console.error('❌ Erreur lors de la vérification des abonnements:', error);
  }
};

const notifyOverdueInvoices = async () => {
  try {
    console.log('🔔 Vérification des factures en retard...');
    const now = new Date();
    
    const facturesEnRetard = await prisma.facture.findMany({
      where: {
        dateEcheance: { lt: now },
        statut: 'non_payee'
      },
      include: { resident: true }
    });

    for (const facture of facturesEnRetard) {
      const diffTime = now - facture.dateEcheance;
      const joursRetard = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (joursRetard > 0) {
        console.log(`⚠️ Facture en retard de ${joursRetard} jours pour ${facture.resident.email}`);
        const message = `Rappel: votre facture ${facture.numeroFacture} (${facture.montant}) a ${joursRetard} jours de retard.`;
        await envoyer(facture.residentId, message);
        
        await prisma.facture.update({
          where: { id: facture.id },
          data: { statut: 'en_retard' }
        });
      }
    }
  } catch (error) {
    console.error('❌ Erreur lors de la vérification des factures:', error);
  }
};

const notifyNewInvoice = async (factureId) => {
  try {
    const facture = await prisma.facture.findUnique({
      where: { id: factureId },
      include: { resident: true }
    });

    if (!facture) return;

    const message = `Nouvelle facture ${facture.numeroFacture}: montant ${facture.montant}. Échéance le ${facture.dateEcheance.toLocaleDateString()}.`;
    await envoyer(facture.residentId, message);
  } catch (error) {
    console.error('❌ Erreur notification nouvelle facture:', error);
  }
};

const notifyPaymentReceived = async (factureId) => {
  try {
    const facture = await prisma.facture.findUnique({
      where: { id: factureId },
      include: { resident: true }
    });

    if (!facture) return;

    const message = `Paiement reçu pour ${facture.numeroFacture}. Merci !`;
    await envoyer(facture.residentId, message);
  } catch (error) {
    console.error('❌ Erreur notification paiement reçu:', error);
  }
};

const notifyNewResident = async (residentId, proprietaireId) => {
  try {
    const resident = await prisma.user.findUnique({ where: { id: residentId } });
    const proprietaire = await prisma.user.findUnique({ where: { id: proprietaireId } });

    if (!resident || !proprietaire) return;

    const message = `Bienvenue chez Ecopower ! Vous avez été ajouté comme résident par ${proprietaire.prenom} ${proprietaire.nom}.`;
    await envoyer(residentId, message);
  } catch (error) {
    console.error('❌ Erreur notification nouveau résident:', error);
  }
};

const notifyConsommationAdded = async (residentId, consommationId) => {
  try {
    const consommation = await prisma.consommation.findUnique({
      where: { id: consommationId },
      include: { maison: true }
    });

    if (!consommation) return;

    const message = `Nouveau relevé de consommation enregistré pour la maison ${consommation.maison.nomMaison} : ${consommation.kwh} kWh.`;
    await envoyer(residentId, message);
  } catch (error) {
    console.error('❌ Erreur notification consommation:', error);
  }
};

const notifyResidentAdded = async (resident, password, maisonNom) => {
  try {
    const message = `Bienvenue chez Ecopower ! Vous avez été ajouté à la maison ${maisonNom}. Vos identifiants : Email: ${resident.email}, Mot de passe: ${password}`;
    await envoyer(resident.id, message);
  } catch (error) {
    console.error('❌ Erreur notification ajout résident:', error);
  }
};

module.exports = {
  envoyer,
  envoyerAvecTitre,
  notifySubscriptionExpiry,
  notifyOverdueInvoices,
  notifyNewInvoice,
  notifyPaymentReceived,
  notifyNewResident,
  notifyConsommationAdded,
  notifyResidentAdded
};
