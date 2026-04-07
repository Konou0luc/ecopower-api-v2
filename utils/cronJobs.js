const cron = require('node-cron');
const prisma = require('../config/prisma');
const { notifySubscriptionExpiry, notifyOverdueInvoices } = require('./notifications');

const checkExpiredSubscriptions = async () => {
  try {
    console.log('🕐 Vérification des abonnements expirés...');
    const now = new Date();
    
    const result = await prisma.abonnement.updateMany({
      where: {
        dateFin: { lt: now },
        statut: 'actif'
      },
      data: {
        statut: 'expire',
        isActive: false
      }
    });
    
    console.log(`✅ ${result.count} abonnements marqués comme expirés`);
  } catch (error) {
    console.error('❌ Erreur lors de la vérification des abonnements expirés:', error);
  }
};

const checkOverdueInvoices = async () => {
  try {
    console.log('🕐 Vérification des factures en retard...');
    const now = new Date();
    
    const result = await prisma.facture.updateMany({
      where: {
        dateEcheance: { lt: now },
        statut: 'non_payee'
      },
      data: {
        statut: 'en_retard'
      }
    });

    console.log(`✅ ${result.count} factures marquées comme en retard`);
  } catch (error) {
    console.error('❌ Erreur lors de la vérification des factures en retard:', error);
  }
};

const cleanupOldMessages = async () => {
  try {
    console.log('🕐 Nettoyage des anciens messages...');
    
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const result = await prisma.message.deleteMany({
      where: {
        dateEnvoi: { lt: sixMonthsAgo },
        type: { in: ['email', 'sms', 'push'] } 
      }
    });

    console.log(`✅ ${result.count} anciens messages supprimés`);
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage des messages:', error);
  }
};

const generateDailyStats = async () => {
  try {
    console.log('🕐 Génération des statistiques quotidiennes...');
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const consommationsHier = await prisma.consommation.count({
      where: {
        createdAt: {
          gte: yesterday,
          lt: today
        }
      }
    });
    
    const facturesHier = await prisma.facture.count({
      where: {
        dateEmission: {
          gte: yesterday,
          lt: today
        }
      }
    });
    
    const paiementsHier = await prisma.facture.count({
      where: {
        datePaiement: {
          gte: yesterday,
          lt: today
        },
        statut: 'payee'
      }
    });
    
    console.log(`📊 Statistiques du ${yesterday.toLocaleDateString()}:`);
    console.log(`   - Consommations enregistrées: ${consommationsHier}`);
    console.log(`   - Factures générées: ${facturesHier}`);
    console.log(`   - Paiements reçus: ${paiementsHier}`);
  } catch (error) {
    console.error('❌ Erreur lors de la génération des statistiques:', error);
  }
};

const initCronJobs = () => {
  // Tous les jours à minuit
  cron.schedule('0 0 * * *', checkExpiredSubscriptions);
  cron.schedule('0 1 * * *', checkOverdueInvoices);
  cron.schedule('0 2 * * *', cleanupOldMessages);
  cron.schedule('0 3 * * *', generateDailyStats);
  
  console.log('✅ Cron Jobs initialisés');
};

module.exports = { initCronJobs };
