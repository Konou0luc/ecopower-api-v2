const prisma = require('../config/prisma');

const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalProprietaires,
      totalResidents,
      totalAdmins,
      totalMaisons,
      totalConsommations,
      sumConsommations,
      totalFactures,
      facturesPayees,
      facturesEnRetard,
      sumRevenus,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'proprietaire' } }),
      prisma.user.count({ where: { role: 'resident' } }),
      prisma.user.count({ where: { role: 'admin' } }),
      prisma.maison.count(),
      prisma.consommation.count(),
      prisma.consommation.aggregate({
        _sum: { kwh: true, montant: true }
      }),
      prisma.facture.count(),
      prisma.facture.count({ where: { statut: 'payee' } }),
      prisma.facture.count({ where: { statut: 'en_retard' } }),
      prisma.facture.aggregate({
        where: { statut: 'payee' },
        _sum: { montant: true }
      })
    ]);

    const sixMoisAgo = new Date();
    sixMoisAgo.setMonth(sixMoisAgo.getMonth() - 6);

    const consommationsRecentes = await prisma.consommation.groupBy({
      by: ['annee', 'mois'],
      where: { createdAt: { gte: sixMoisAgo } },
      _sum: { kwh: true, montant: true },
      _count: { id: true },
      orderBy: [{ annee: 'asc' }, { mois: 'asc' }]
    });

    const facturesRecentes = await prisma.facture.findMany({
      where: { dateEmission: { gte: sixMoisAgo } },
      select: { dateEmission: true, montant: true, statut: true }
    });

    const facturesGrouped = {};
    facturesRecentes.forEach(f => {
      const year = f.dateEmission.getFullYear();
      const month = f.dateEmission.getMonth() + 1;
      const key = `${year}-${month}`;
      if (!facturesGrouped[key]) {
        facturesGrouped[key] = { _id: { annee: year, mois: month }, totalMontant: 0, count: 0, payees: 0 };
      }
      facturesGrouped[key].totalMontant += f.montant;
      facturesGrouped[key].count += 1;
      if (f.statut === 'payee') facturesGrouped[key].payees += 1;
    });

    const topMaisonsRaw = await prisma.consommation.groupBy({
      by: ['maisonId'],
      _sum: { kwh: true, montant: true },
      _count: { id: true },
      orderBy: { _sum: { kwh: 'desc' } },
      take: 5
    });

    const topMaisons = await Promise.all(topMaisonsRaw.map(async (item) => {
      const maison = await prisma.maison.findUnique({ where: { id: item.maisonId } });
      return { ...item, maison };
    }));

    res.json({
      utilisateurs: {
        total: totalUsers,
        proprietaires: totalProprietaires,
        residents: totalResidents,
        admins: totalAdmins
      },
      maisons: { total: totalMaisons },
      consommations: {
        total: totalConsommations,
        totalKwh: sumConsommations._sum.kwh || 0,
        totalMontant: sumConsommations._sum.montant || 0
      },
      factures: {
        total: totalFactures,
        payees: facturesPayees,
        enRetard: facturesEnRetard,
        revenusTotaux: sumRevenus._sum.montant || 0
      },
      graphiques: {
        consommationsParMois: consommationsRecentes.map(c => ({
          _id: { annee: c.annee, mois: c.mois },
          totalKwh: c._sum.kwh,
          totalMontant: c._sum.montant,
          count: c._count.id
        })),
        facturesParMois: Object.values(facturesGrouped),
        topMaisons
      }
    });
  } catch (error) {
    console.error('Erreur stats dashboard:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des statistiques' });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, role, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (role) where.role = role;
    if (search) {
      where.OR = [
        { nom: { contains: search, mode: 'insensitive' } },
        { prenom: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, nom: true, prenom: true, email: true, telephone: true, role: true, createdAt: true
        }
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Erreur getAllUsers:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des utilisateurs' });
  }
};

const getUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        maisonResident: true,
        abonnement: true,
        proprietaire: { select: { nom: true, prenom: true, email: true } }
      }
    });

    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    let stats = {};
    if (user.role === 'proprietaire') {
      const [maisonsCount, facturesCount, consommationsCount] = await Promise.all([
        prisma.maison.count({ where: { proprietaireId: id } }),
        prisma.facture.count({ where: { maison: { proprietaireId: id } } }),
        prisma.consommation.count({ where: { maison: { proprietaireId: id } } })
      ]);
      stats = { maisonsCount, facturesCount, consommationsCount };
    } else if (user.role === 'resident') {
      const [facturesCount, consommationsCount] = await Promise.all([
        prisma.facture.count({ where: { residentId: id } }),
        prisma.consommation.count({ where: { residentId: id } })
      ]);
      stats = { facturesCount, consommationsCount };
    }

    const { motDePasse, refreshToken, ...userSafe } = user;
    res.json({ user: userSafe, stats });
  } catch (error) {
    console.error('Erreur getUser:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de l\'utilisateur' });
  }
};

module.exports = {
  getDashboardStats,
  getAllUsers,
  getUser,
  deleteUser: async (req, res) => res.status(501).json({ message: 'Non implémenté' }),
  getAllMaisons: async (req, res) => res.status(501).json({ message: 'Non implémenté' }),
  deleteMaison: async (req, res) => res.status(501).json({ message: 'Non implémenté' }),
  getAllConsommations: async (req, res) => res.status(501).json({ message: 'Non implémenté' }),
  getAllFactures: async (req, res) => res.status(501).json({ message: 'Non implémenté' }),
  getAllAbonnements: async (req, res) => res.status(501).json({ message: 'Non implémenté' }),
  getResidents: async (req, res) => res.status(501).json({ message: 'Non implémenté' }),
  deleteResident: async (req, res) => res.status(501).json({ message: 'Non implémenté' }),
  getMessages: async (req, res) => res.status(501).json({ message: 'Non implémenté' }),
  getNotifications: async (req, res) => res.status(501).json({ message: 'Non implémenté' }),
  getLogs: async (req, res) => res.status(501).json({ message: 'Non implémenté' }),
  getAppInfo: async (req, res) => res.status(501).json({ message: 'Non implémenté' }),
  updateAppInfo: async (req, res) => res.status(501).json({ message: 'Non implémenté' }),
  testNotification: async (req, res) => res.status(501).json({ message: 'Non implémenté' }),
  broadcastNotification: async (req, res) => res.status(501).json({ message: 'Non implémenté' }),
};
