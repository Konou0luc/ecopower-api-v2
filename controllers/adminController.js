const PDFDocument = require('pdfkit');
const prisma = require('../config/prisma');
const notifications = require('../utils/notifications');

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
      facturesEnAttente,
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
      prisma.facture.count({ where: { statut: 'non_payee' } }),
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
        enAttente: facturesEnAttente,
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
      stats = {
        maisonsCount,
        facturesCount,
        consommationsCount,
        maisons: maisonsCount,
        factures: facturesCount,
        consommations: consommationsCount
      };
    } else if (user.role === 'resident') {
      const [facturesCount, consommationsCount] = await Promise.all([
        prisma.facture.count({ where: { residentId: id } }),
        prisma.consommation.count({ where: { residentId: id } })
      ]);
      stats = {
        facturesCount,
        consommationsCount,
        factures: facturesCount,
        consommations: consommationsCount
      };
    }

    const { motDePasse, refreshToken, ...userSafe } = user;
    res.json({ user: userSafe, stats });
  } catch (error) {
    console.error('Erreur getUser:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de l\'utilisateur' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id: userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: 'ID manquant' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    if (user.role === 'admin') {
      const adminCount = await prisma.user.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        return res.status(403).json({ message: 'Impossible de supprimer le dernier administrateur' });
      }
    }

    await prisma.$transaction(async (tx) => {
      if (user.role === 'proprietaire') {
        const maisons = await tx.maison.findMany({ where: { proprietaireId: userId } });
        const maisonIds = maisons.map((m) => m.id);
        await tx.consommation.deleteMany({ where: { maisonId: { in: maisonIds } } });
        await tx.facture.deleteMany({ where: { maisonId: { in: maisonIds } } });
        await tx.user.deleteMany({ where: { idProprietaire: userId, role: 'resident' } });
        await tx.maison.deleteMany({ where: { proprietaireId: userId } });
        await tx.abonnement.deleteMany({ where: { proprietaireId: userId } });
      } else if (user.role === 'resident') {
        await tx.consommation.deleteMany({ where: { residentId: userId } });
        await tx.facture.deleteMany({ where: { residentId: userId } });
      }
      await tx.message.deleteMany({
        where: { OR: [{ expediteurId: userId }, { destinataireId: userId }] },
      });
      await tx.notification.deleteMany({ where: { destinataireId: userId } });
      await tx.log.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });

    res.json({ message: 'Utilisateur supprimé avec succès' });
  } catch (error) {
    console.error('Erreur deleteUser:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression de l\'utilisateur' });
  }
};

const parseFactureStatutFilter = (raw) => {
  if (!raw || typeof raw !== 'string') return undefined;
  const t = raw.trim().toLowerCase();
  if (t === 'payée' || t === 'payee') return 'payee';
  if (t === 'en attente' || t === 'non payée') return 'non_payee';
  if (t === 'en retard') return 'en_retard';
  return undefined;
};

const mapFactureStatutForClient = (statut) => {
  if (statut === 'payee') return 'payée';
  if (statut === 'non_payee') return 'En attente';
  if (statut === 'en_retard') return 'en retard';
  return statut;
};

const getAllMaisons = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const lim = parseInt(limit, 10);
    const skip = (parseInt(page, 10) - 1) * lim;
    const where = {};
    if (search) {
      where.OR = [
        { nomMaison: { contains: search, mode: 'insensitive' } },
        { adresseVille: { contains: search, mode: 'insensitive' } },
        { adresseRue: { contains: search, mode: 'insensitive' } }
      ];
    }
    const [rows, total] = await Promise.all([
      prisma.maison.findMany({
        where,
        skip,
        take: lim,
        orderBy: { createdAt: 'desc' },
        include: {
          proprietaire: { select: { id: true, nom: true, prenom: true, email: true } },
          _count: { select: { residentsDirects: true, listeResidents: true } }
        }
      }),
      prisma.maison.count({ where })
    ]);
    const maisons = rows.map((m) => {
      const adresseObj = {
        rue: m.adresseRue || '',
        ville: m.adresseVille || '',
        pays: m.adressePays || ''
      };
      return {
        id: m.id,
        _id: m.id,
        nomMaison: m.nomMaison,
        adresse: adresseObj,
        proprietaire: m.proprietaire,
        proprietaireId: m.proprietaire,
        nbResidents: (m._count?.residentsDirects || 0) + (m._count?.listeResidents || 0),
        tarifKwh: m.tarifKwh,
        statut: m.statut,
        createdAt: m.createdAt
      };
    });
    res.json({
      maisons,
      houses: maisons,
      pagination: {
        page: parseInt(page, 10),
        limit: lim,
        total,
        pages: Math.ceil(total / lim) || 0
      }
    });
  } catch (error) {
    console.error('Erreur getAllMaisons:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des maisons' });
  }
};

const deleteMaison = async (req, res) => {
  try {
    const { id } = req.params;
    const maison = await prisma.maison.findUnique({ where: { id } });
    if (!maison) return res.status(404).json({ message: 'Maison non trouvée' });

    await prisma.$transaction(async (tx) => {
      await tx.facture.deleteMany({ where: { maisonId: id } });
      await tx.consommation.deleteMany({ where: { maisonId: id } });
      await tx.user.updateMany({ where: { maisonId: id }, data: { maisonId: null } });
      await tx.maison.update({
        where: { id },
        data: { listeResidents: { set: [] } }
      });
      await tx.maison.delete({ where: { id } });
    });

    res.json({ message: 'Maison supprimée avec succès' });
  } catch (error) {
    console.error('Erreur deleteMaison:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression de la maison' });
  }
};

const getAllConsommations = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, annee, mois } = req.query;
    const lim = parseInt(limit, 10);
    const skip = (parseInt(page, 10) - 1) * lim;
    const where = {};
    if (annee) where.annee = parseInt(annee, 10);
    if (mois) where.mois = parseInt(mois, 10);
    if (search) {
      where.OR = [
        { resident: { nom: { contains: search, mode: 'insensitive' } } },
        { resident: { prenom: { contains: search, mode: 'insensitive' } } },
        { resident: { email: { contains: search, mode: 'insensitive' } } },
        { maison: { nomMaison: { contains: search, mode: 'insensitive' } } }
      ];
    }
    const [rows, total] = await Promise.all([
      prisma.consommation.findMany({
        where,
        skip,
        take: lim,
        orderBy: [{ annee: 'desc' }, { mois: 'desc' }, { dateReleve: 'desc' }],
        include: {
          resident: { select: { id: true, nom: true, prenom: true, email: true } },
          maison: { select: { id: true, nomMaison: true, adresseRue: true, adresseVille: true } }
        }
      }),
      prisma.consommation.count({ where })
    ]);
    const consommations = rows.map((c) => ({
      id: c.id,
      _id: c.id,
      dateReleve: c.dateReleve,
      kwh: c.kwh,
      montant: c.montant,
      annee: c.annee,
      mois: c.mois,
      releveCompteur: c.kwh,
      residentId: c.resident
        ? {
            id: c.resident.id,
            _id: c.resident.id,
            nom: c.resident.nom,
            prenom: c.resident.prenom,
            email: c.resident.email
          }
        : undefined,
      maisonId: c.maison
        ? {
            id: c.maison.id,
            nomMaison: c.maison.nomMaison,
            adresse: [c.maison.adresseRue, c.maison.adresseVille].filter(Boolean).join(', ')
          }
        : undefined,
      maison: c.maison ? { nomMaison: c.maison.nomMaison } : undefined
    }));
    res.json({
      consommations,
      pagination: {
        page: parseInt(page, 10),
        limit: lim,
        total,
        pages: Math.ceil(total / lim) || 0
      }
    });
  } catch (error) {
    console.error('Erreur getAllConsommations:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des consommations' });
  }
};

const getAllFactures = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, statut } = req.query;
    const lim = parseInt(limit, 10);
    const skip = (parseInt(page, 10) - 1) * lim;
    const where = {};
    const st = parseFactureStatutFilter(statut);
    if (st) where.statut = st;
    if (search) {
      where.OR = [
        { numeroFacture: { contains: search, mode: 'insensitive' } },
        { resident: { nom: { contains: search, mode: 'insensitive' } } },
        { resident: { prenom: { contains: search, mode: 'insensitive' } } },
        { resident: { email: { contains: search, mode: 'insensitive' } } },
        { maison: { nomMaison: { contains: search, mode: 'insensitive' } } }
      ];
    }
    const [rows, total] = await Promise.all([
      prisma.facture.findMany({
        where,
        skip,
        take: lim,
        orderBy: { dateEmission: 'desc' },
        include: {
          resident: { select: { id: true, nom: true, prenom: true, email: true, telephone: true } },
          maison: { select: { id: true, nomMaison: true, adresseRue: true, adresseVille: true } },
          consommation: { select: { id: true, kwh: true, mois: true, annee: true } }
        }
      }),
      prisma.facture.count({ where })
    ]);
    const factures = rows.map((f) => ({
      id: f.id,
      _id: f.id,
      numeroFacture: f.numeroFacture,
      montant: f.montant,
      montantTotal: f.montant,
      statut: mapFactureStatutForClient(f.statut),
      dateEmission: f.dateEmission,
      dateFacture: f.dateEmission,
      residentId: f.resident
        ? {
            id: f.resident.id,
            _id: f.resident.id,
            nom: f.resident.nom,
            prenom: f.resident.prenom,
            email: f.resident.email,
            telephone: f.resident.telephone
          }
        : null,
      maisonId: f.maison
        ? {
            id: f.maison.id,
            nomMaison: f.maison.nomMaison,
            adresse: [f.maison.adresseRue, f.maison.adresseVille].filter(Boolean).join(', ')
          }
        : null,
      maison: f.maison ? { nomMaison: f.maison.nomMaison } : undefined,
      consommationId: f.consommation
        ? {
            id: f.consommation.id,
            _id: f.consommation.id,
            kwh: f.consommation.kwh,
            mois: f.consommation.mois,
            annee: f.consommation.annee
          }
        : null,
      details: {
        prixKwh: f.detailsPrixKwh,
        fraisFixes: f.detailsFraisFixes
      }
    }));
    res.json({
      factures,
      pagination: {
        page: parseInt(page, 10),
        limit: lim,
        total,
        pages: Math.ceil(total / lim) || 0
      }
    });
  } catch (error) {
    console.error('Erreur getAllFactures:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des factures' });
  }
};

/** PDF facture (admin) — téléchargement pour le back-office. */
const downloadFacturePdf = async (req, res) => {
  try {
    const { id } = req.params;
    const facture = await prisma.facture.findUnique({
      where: { id },
      include: {
        resident: { select: { nom: true, prenom: true, email: true, telephone: true } },
        maison: { select: { nomMaison: true, adresseRue: true, adresseVille: true } },
        consommation: { select: { kwh: true, mois: true, annee: true } },
      },
    });

    if (!facture) {
      return res.status(404).json({ message: 'Facture non trouvée' });
    }

    const filename = `${facture.numeroFacture.replace(/[^\w.-]+/g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(18).text('Ecopower', { align: 'center' });
    doc.moveDown(0.35);
    doc.fontSize(13).text(`Facture ${facture.numeroFacture}`, { align: 'center' });
    doc.moveDown(1.2);
    doc.fontSize(10.5);
    doc.text(`Date d'émission : ${facture.dateEmission.toLocaleString('fr-FR')}`);
    doc.text(`Date d'échéance : ${facture.dateEcheance.toLocaleString('fr-FR')}`);
    if (facture.datePaiement) {
      doc.text(`Date de paiement : ${facture.datePaiement.toLocaleString('fr-FR')}`);
    }
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Montant : ${facture.montant} FCFA`, { continued: false });
    doc.fontSize(10.5);
    doc.text(`Statut : ${mapFactureStatutForClient(facture.statut)}`);
    doc.moveDown();
    if (facture.resident) {
      doc.text(`Client : ${facture.resident.prenom} ${facture.resident.nom}`);
      doc.text(`Email : ${facture.resident.email || '—'}`);
      doc.text(`Téléphone : ${facture.resident.telephone || '—'}`);
    }
    if (facture.maison) {
      const addr = [facture.maison.adresseRue, facture.maison.adresseVille].filter(Boolean).join(', ');
      doc.text(`Maison : ${facture.maison.nomMaison}${addr ? ` — ${addr}` : ''}`);
    }
    if (facture.consommation) {
      doc.text(
        `Consommation : ${facture.consommation.kwh} kWh (période ${facture.consommation.mois}/${facture.consommation.annee})`
      );
    }
    if (facture.detailsKwh != null) {
      doc.moveDown(0.3);
      doc.fontSize(9.5).fillColor('#444444');
      doc.text(
        `Détail énergie : ${facture.detailsKwh} kWh × ${facture.detailsPrixKwh ?? '—'} FCFA/kWh`
      );
      doc.fillColor('#000000');
    }
    if (facture.detailsFraisFixes != null && facture.detailsFraisFixes > 0) {
      doc.fontSize(9.5).fillColor('#444444');
      doc.text(`Frais fixes : ${facture.detailsFraisFixes} FCFA`);
      doc.fillColor('#000000');
    }

    doc.end();
  } catch (error) {
    console.error('Erreur downloadFacturePdf:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Erreur lors de la génération du PDF' });
    } else {
      res.end();
    }
  }
};

const getAllAbonnements = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const lim = parseInt(limit, 10);
    const skip = (parseInt(page, 10) - 1) * lim;
    const [rows, total] = await Promise.all([
      prisma.abonnement.findMany({
        skip,
        take: lim,
        orderBy: { createdAt: 'desc' },
        include: {
          proprietaire: { select: { id: true, nom: true, prenom: true, email: true } }
        }
      }),
      prisma.abonnement.count()
    ]);
    const subscriptions = rows.map((a) => ({
      id: a.id,
      _id: a.id,
      typeAbonnement: a.type,
      type: a.type,
      dateDebut: a.dateDebut,
      dateFin: a.dateFin,
      statut: a.statut,
      utilisateur: a.proprietaire
        ? {
            nom: a.proprietaire.nom,
            prenom: a.proprietaire.prenom,
            email: a.proprietaire.email
          }
        : null
    }));
    res.json({
      subscriptions,
      pagination: {
        page: parseInt(page, 10),
        limit: lim,
        total,
        pages: Math.ceil(total / lim) || 0
      }
    });
  } catch (error) {
    console.error('Erreur getAllAbonnements:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des abonnements' });
  }
};

const getResidents = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const lim = parseInt(limit, 10);
    const skip = (parseInt(page, 10) - 1) * lim;
    const where = search
      ? {
          AND: [
            { role: 'resident' },
            {
              OR: [
                { nom: { contains: search, mode: 'insensitive' } },
                { prenom: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } }
              ]
            }
          ]
        }
      : { role: 'resident' };
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: lim,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          nom: true,
          prenom: true,
          email: true,
          telephone: true,
          createdAt: true,
          maisonResident: {
            select: { id: true, nomMaison: true, adresseRue: true, adresseVille: true }
          }
        }
      }),
      prisma.user.count({ where })
    ]);
    const residents = rows.map((r) => ({
      id: r.id,
      _id: r.id,
      nom: r.nom,
      prenom: r.prenom,
      email: r.email,
      telephone: r.telephone,
      createdAt: r.createdAt,
      maison: r.maisonResident
        ? {
            id: r.maisonResident.id,
            nomMaison: r.maisonResident.nomMaison,
            adresse: [r.maisonResident.adresseRue, r.maisonResident.adresseVille].filter(Boolean).join(', ')
          }
        : null
    }));
    res.json({
      residents,
      pagination: {
        page: parseInt(page, 10),
        limit: lim,
        total,
        pages: Math.ceil(total / lim) || 0
      }
    });
  } catch (error) {
    console.error('Erreur getResidents:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des résidents' });
  }
};

const deleteResident = async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
  if (user.role !== 'resident') {
    return res.status(400).json({ message: 'Cet utilisateur n\'est pas un résident' });
  }
  return deleteUser(req, res);
};

const getMessages = async (req, res) => {
  res.json({
    messages: [],
    pagination: { page: 1, limit: 10, total: 0, pages: 0 }
  });
};

const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const lim = parseInt(limit, 10);
    const skip = (parseInt(page, 10) - 1) * lim;
    const [rows, total] = await Promise.all([
      prisma.notification.findMany({
        skip,
        take: lim,
        orderBy: { createdAt: 'desc' },
        include: {
          destinataire: { select: { id: true, email: true, nom: true, prenom: true } }
        }
      }),
      prisma.notification.count()
    ]);
    const notifications = rows.map((n) => ({
      id: n.id,
      _id: n.id,
      titre: n.titre,
      message: n.contenu,
      contenu: n.contenu,
      type: n.type,
      createdAt: n.createdAt,
      lue: !!n.dateLecture,
      destinataire: n.destinataire
    }));
    res.json({ notifications, pagination: { total, page: parseInt(page, 10), limit: lim, pages: Math.ceil(total / lim) || 0 } });
  } catch (error) {
    console.error('Erreur getNotifications:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des notifications' });
  }
};

const getLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const lim = parseInt(limit, 10);
    const skip = (parseInt(page, 10) - 1) * lim;
    const where = {};
    if (search) {
      where.OR = [
        { message: { contains: search, mode: 'insensitive' } },
        { module: { contains: search, mode: 'insensitive' } },
        { action: { contains: search, mode: 'insensitive' } }
      ];
    }
    const [rows, total] = await Promise.all([
      prisma.log.findMany({
        where,
        skip,
        take: lim,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, nom: true, prenom: true } }
        }
      }),
      prisma.log.count({ where })
    ]);
    const logs = rows.map((log) => ({
      id: log.id,
      _id: log.id,
      level: log.level,
      message: log.message,
      description: log.message,
      createdAt: log.createdAt,
      timestamp: log.createdAt,
      utilisateur: log.user ? { email: log.user.email } : null,
      user: log.user ? { email: log.user.email } : null
    }));
    res.json({
      logs,
      pagination: {
        page: parseInt(page, 10),
        limit: lim,
        total,
        pages: Math.ceil(total / lim) || 0
      }
    });
  } catch (error) {
    console.error('Erreur getLogs:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des logs' });
  }
};

const getAppInfo = async (req, res) => {
  try {
    const settings = await prisma.appSettings.findUnique({ where: { key: 'contact' } });
    const data = settings
      ? {
          email: settings.email || '',
          phone: settings.phone || '',
          website: settings.website || '',
          description: settings.description || '',
          guideRapideUrl: settings.guideRapideUrl || '',
          privacyPolicyUrl: settings.privacyPolicyUrl || ''
        }
      : {
          email: '',
          phone: '',
          website: '',
          description: '',
          guideRapideUrl: '',
          privacyPolicyUrl: ''
        };
    res.json(data);
  } catch (error) {
    console.error('Erreur getAppInfo admin:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des paramètres' });
  }
};

const updateAppInfo = async (req, res) => {
  try {
    const { email, phone, website, description, guideRapideUrl, privacyPolicyUrl } = req.body;
    const data = {
      email: email ?? '',
      phone: phone ?? '',
      website: website ?? '',
      description: description ?? '',
      guideRapideUrl: guideRapideUrl ?? '',
      privacyPolicyUrl: privacyPolicyUrl ?? ''
    };
    await prisma.appSettings.upsert({
      where: { key: 'contact' },
      create: { key: 'contact', ...data },
      update: data
    });
    res.json({ message: 'Paramètres enregistrés', ...data });
  } catch (error) {
    console.error('Erreur updateAppInfo:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour des paramètres' });
  }
};

const testNotification = async (req, res) => {
  try {
    const adminId = req.user.id;
    const r = await notifications.envoyerAvecTitre(adminId, 'Test Ecopower', 'Notification de test envoyée depuis l\'administration.');
    if (!r.success) {
      return res.status(400).json({ message: r.error || 'Échec de l\'envoi (vérifiez le deviceToken).' });
    }
    res.json({ message: 'Notification de test envoyée', detail: r.response });
  } catch (error) {
    console.error('Erreur testNotification:', error);
    res.status(500).json({ message: 'Erreur lors du test de notification' });
  }
};

const broadcastNotification = async (req, res) => {
  try {
    const { title, message, role } = req.body;
    if (!message || !String(message).trim()) {
      return res.status(400).json({ message: 'Le message est requis' });
    }
    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: 'Le titre est requis' });
    }
    const whereUser = {};
    if (role && ['proprietaire', 'resident', 'admin'].includes(role)) {
      whereUser.role = role;
    }
    const users = await prisma.user.findMany({
      where: whereUser,
      select: { id: true, email: true, role: true }
    });
    const details = [];
    let success = 0;
    let failed = 0;
    for (const u of users) {
      try {
        await prisma.notification.create({
          data: {
            titre: String(title).trim(),
            contenu: String(message).trim(),
            destinataireId: u.id,
            type: 'info',
            statut: 'envoye'
          }
        });
        const send = await notifications.envoyerAvecTitre(u.id, String(title).trim(), String(message).trim());
        if (send.success) {
          success += 1;
          details.push({
            userId: u.id,
            email: u.email,
            role: u.role,
            status: 'success',
            messageId: send.response?.messageId
          });
        } else {
          failed += 1;
          details.push({
            userId: u.id,
            email: u.email,
            role: u.role,
            status: 'failed',
            error: send.error,
            errorCode: send.errorCode
          });
        }
      } catch (e) {
        failed += 1;
        details.push({
          userId: u.id,
          email: u.email,
          role: u.role,
          status: 'failed',
          error: e.message
        });
      }
    }
    const total = users.length;
    const successRate = total ? `${Math.round((success / total) * 100)}%` : '0%';
    res.json({
      message: 'Diffusion terminée',
      summary: {
        total,
        success,
        failed,
        successRate
      },
      notification: {
        title: String(title).trim(),
        message: String(message).trim(),
        sentAt: new Date().toISOString(),
        filter: role || 'tous'
      },
      details
    });
  } catch (error) {
    console.error('Erreur broadcastNotification:', error);
    res.status(500).json({ message: 'Erreur lors de la diffusion' });
  }
};

module.exports = {
  getDashboardStats,
  getAllUsers,
  getUser,
  deleteUser,
  getAllMaisons,
  deleteMaison,
  getAllConsommations,
  getAllFactures,
  downloadFacturePdf,
  getAllAbonnements,
  getResidents,
  deleteResident,
  getMessages,
  getNotifications,
  getLogs,
  getAppInfo,
  updateAppInfo,
  testNotification,
  broadcastNotification
};
