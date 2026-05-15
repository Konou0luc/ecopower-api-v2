const prisma = require('../config/prisma');
const notifications = require('../utils/notifications');


const validateEmail = (email) => {
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(String(email).toLowerCase());
};
const getMyHouseResidents = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    console.log(`🔍 [RESIDENTS] getMyHouseResidents appelé pour userId: ${userId}, role: ${userRole}`);

    let maisonId;
    if (userRole === 'proprietaire') {
      const maison = await prisma.maison.findFirst({ where: { proprietaireId: userId } });
      if (!maison) {
        return res.json([]); 
      }
      maisonId = maison.id;
    } else if (userRole === 'resident') {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || !user.maisonId) {
        return res.json([]); 
      }
      maisonId = user.maisonId;
    } else {
      return res.status(403).json({ message: 'Rôle non autorisé' });
    }

    const residents = await prisma.user.findMany({
      where: {
        maisonId: maisonId,
        role: 'resident',
        id: { not: userId }
      },
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        telephone: true,
        role: true,
        maisonId: true
      }
    });

    res.json(residents);
  } catch (error) {
    console.error('❌ [RESIDENTS] Erreur lors de la récupération des résidents:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

const addResident = async (req, res) => {
  const { nom, prenom, email, telephone, maisonId } = req.body;
  
  if (!email || !validateEmail(email)) {
    return res.status(400).json({ message: 'Veuillez fournir une adresse email valide pour le résident' });
  }
  const normalizedEmail = (email || '').toString().trim().toLowerCase();
  
  try {
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(400).json({ message: 'Cet email est déjà utilisé' });
    }

    const maison = await prisma.maison.findFirst({
      where: {
        id: maisonId,
        proprietaireId: req.user.id
      },
      include: {
        listeResidents: true
      }
    });

    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    const effectiveNbResidentsMax = (req.user && req.user.email === 'konouluc1@gmail.com') 
      ? Math.max(maison.nbResidentsMax || 0, 6) 
      : maison.nbResidentsMax;

    if (
      effectiveNbResidentsMax > 0 &&
      maison.listeResidents.length >= effectiveNbResidentsMax
    ) {
      return res.status(400).json({
        message: `Nombre maximal de résidents atteint pour cette maison (${effectiveNbResidentsMax})`
      });
    }

    const { generateTemporaryPassword } = require('../utils/passwordUtils');
    const tempPassword = generateTemporaryPassword();
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(tempPassword, salt);

    const resident = await prisma.user.create({
      data: {
        nom,
        prenom,
        email: normalizedEmail,
        telephone,
        motDePasse: hashedPassword,
        role: 'resident',
        idProprietaire: req.user.id,
        maisonId: maisonId,
        firstLogin: true,
        maisonsHabitees: {
          connect: { id: maisonId }
        }
      }
    });

    try {
      await notifications.notifyResidentAdded(resident, tempPassword, maison.nomMaison);
    } catch (e) {
      console.error('Erreur notification résident:', e.message);
    }

    res.status(201).json({
      message: 'Résident ajouté avec succès',
      resident: {
        id: resident.id,
        nom: resident.nom,
        prenom: resident.prenom,
        email: resident.email,
        telephone: resident.telephone
      },
      tempPassword 
    });
  } catch (error) {
    console.error('Erreur lors de l\'ajout du résident:', error);
    res.status(500).json({ message: 'Erreur lors de l\'ajout du résident' });
  }
};

const addResidentWithGoogle = async (req, res) => {
  const { nom, prenom, email, telephone, maisonId } = req.body;
  
  if (!email || !validateEmail(email)) {
    return res.status(400).json({ message: 'Veuillez fournir une adresse email valide pour le résident' });
  }
  const normalizedEmail = (email || '').toString().trim().toLowerCase();
  
  try {
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(400).json({ message: 'Cet email est déjà utilisé' });
    }

    const maison = await prisma.maison.findFirst({
      where: {
        id: maisonId,
        proprietaireId: req.user.id
      },
      include: {
        listeResidents: true
      }
    });

    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    const resident = await prisma.user.create({
      data: {
        nom,
        prenom,
        email: normalizedEmail,
        telephone,
        authMethod: 'google',
        role: 'resident',
        idProprietaire: req.user.id,
        maisonId: maisonId,
        firstLogin: false,
        maisonsHabitees: {
          connect: { id: maisonId }
        }
      }
    });

    try {
      const { sendGoogleInvitationEmail } = require('../utils/emailUtils');
      await sendGoogleInvitationEmail(normalizedEmail, `${prenom} ${nom}`, maison.nomMaison);
    } catch (e) {
      console.error('Erreur invitation email:', e.message);
    }

    res.status(201).json({
      message: 'Résident ajouté avec succès (invitation Google envoyée)',
      resident
    });
  } catch (error) {
    console.error('Erreur lors de l\'ajout du résident Google:', error);
    res.status(500).json({ message: 'Erreur lors de l\'ajout du résident' });
  }
};

const updateResident = async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, prenom, telephone } = req.body;

    const resident = await prisma.user.findUnique({
      where: { id }
    });

    if (!resident) {
      return res.status(404).json({ message: 'Résident non trouvé' });
    }

    const updatedResident = await prisma.user.update({
      where: { id },
      data: { nom, prenom, telephone }
    });

    res.json({
      message: 'Résident mis à jour avec succès',
      resident: updatedResident
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du résident:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour' });
  }
};

const deleteResident = async (req, res) => {
  try {
    const { id } = req.params;

    const resident = await prisma.user.findUnique({
      where: { id },
    });

    if (!resident || resident.role !== 'resident') {
      return res.status(404).json({ message: 'Résident non trouvé' });
    }

    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Accès réservé aux gérants' });
    }

    if (resident.idProprietaire !== req.user.id) {
      return res.status(403).json({ message: 'Accès non autorisé pour ce résident' });
    }

    await prisma.$transaction(async (tx) => {
      // Contraintes FK : supprimer les données liées avant l'utilisateur.
      await tx.facture.deleteMany({ where: { residentId: id } });
      await tx.consommation.deleteMany({ where: { residentId: id } });
      await tx.message.deleteMany({
        where: {
          OR: [{ expediteurId: id }, { destinataireId: id }],
        },
      });
      await tx.notification.deleteMany({ where: { destinataireId: id } });
      await tx.log.deleteMany({ where: { userId: id } });

      await tx.user.update({
        where: { id },
        data: {
          maisonsHabitees: { set: [] },
          maisonId: null,
        },
      });

      await tx.user.delete({ where: { id } });
    });

    res.json({
      message: 'Résident supprimé avec succès',
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du résident:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression' });
  }
};

const getResidents = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize =
      parseInt(req.query.pageSize, 10) || parseInt(req.query.limit, 10) || 50;
    const { search, maisonId } = req.query;
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const where = {
      role: 'resident',
      idProprietaire: req.user.id
    };

    if (search) {
      where.OR = [
        { nom: { contains: search, mode: 'insensitive' } },
        { prenom: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (maisonId) {
      const maisonFilter = {
        OR: [
          { maisonId: String(maisonId) },
          { maisonsHabitees: { some: { id: String(maisonId) } } },
        ],
      };
      if (where.OR) {
        where.AND = [{ OR: where.OR }, maisonFilter];
        delete where.OR;
      } else {
        Object.assign(where, maisonFilter);
      }
    }

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      items,
      total,
      page,
      pageSize,
      hasMore: skip + items.length < total,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des résidents:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des résidents' });
  }
};

const getResident = async (req, res) => {
  try {
    const { id } = req.params;
    const resident = await prisma.user.findUnique({
      where: { id },
      include: { maisonResident: true }
    });

    if (!resident || resident.idProprietaire !== req.user.id) {
      return res.status(404).json({ message: 'Résident non trouvé' });
    }

    res.json(resident);
  } catch (error) {
    console.error('Erreur lors de la récupération du résident:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const resetResidentPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { generateTemporaryPassword } = require('../utils/passwordUtils');
    const tempPassword = generateTemporaryPassword();
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(tempPassword, salt);

    await prisma.user.update({
      where: { id },
      data: {
        motDePasse: hashedPassword,
        firstLogin: true
      }
    });

    res.json({
      message: 'Mot de passe réinitialisé avec succès',
      tempPassword
    });
  } catch (error) {
    console.error('Erreur lors de la réinitialisation:', error);
    res.status(500).json({ message: 'Erreur lors de la réinitialisation' });
  }
};

module.exports = {
  getMyHouseResidents,
  addResident,
  addResidentWithGoogle,
  updateResident,
  deleteResident,
  getResidents,
  getResident,
  resetResidentPassword
};
