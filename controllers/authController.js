const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { generateTemporaryPassword, validatePasswordStrength } = require('../utils/passwordUtils');


const validateEmail = (email) => {
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(String(email).toLowerCase());
};
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN }
  );

  return { accessToken, refreshToken };
};

const hashPassword = async (password) => {
  if (!password) return null;
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

const comparePassword = async (password, hashedPassword) => {
  if (!password || !hashedPassword) return false;
  return bcrypt.compare(password, hashedPassword);
};

const register = async (req, res) => {
  try {
    const { nom, prenom, email, telephone, motDePasse, role } = req.body;
    
    if (!email || !validateEmail(email)) {
      return res.status(400).json({ message: 'Veuillez fournir une adresse email valide' });
    }
    const normalizedEmail = (email || '').toString().trim().toLowerCase();

    if (motDePasse) {
      const strength = validatePasswordStrength(motDePasse.toString());
      if (!strength.isValid) {
        return res.status(400).json({
          message: 'Le mot de passe ne respecte pas la politique de sécurité',
          errors: strength.errors,
        });
      }
    }

    const existingUser = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } }
    });

    if (existingUser) {
      return res.status(400).json({ message: 'Cet email est déjà utilisé' });
    }

    const isAdminRequest = role === 'admin';

    if (isAdminRequest) {
      const existingAdmin = await prisma.user.findFirst({ where: { role: 'admin' } });
      if (existingAdmin) {
        return res.status(400).json({ message: 'Un administrateur existe déjà' });
      }
    }

    const hashedPassword = await hashPassword(motDePasse);

    const user = await prisma.user.create({
      data: {
        nom,
        prenom,
        email: normalizedEmail,
        telephone,
        motDePasse: hashedPassword,
        role: isAdminRequest ? 'admin' : 'proprietaire'
      }
    });

    const { accessToken, refreshToken } = generateTokens(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken }
    });

    const message = isAdminRequest ? 'Compte administrateur créé avec succès' : 'Compte propriétaire créé avec succès';
    
    res.status(201).json({
      message,
      user,
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement:', error);
    res.status(500).json({ message: 'Erreur lors de la création du compte' });
  }
};

const FREE_MODE = process.env.FREE_MODE === 'true';

const login = async (req, res) => {
  try {
    console.log('🔐 [LOGIN] Tentative de connexion reçue');
    const { email, motDePasse } = req.body;

    if (!email || !motDePasse) {
      console.log('❌ [LOGIN] Email ou mot de passe manquant');
      return res.status(400).json({ message: 'Email et mot de passe requis' });
    }

    const normalizedEmail = (email || '').toString().trim().toLowerCase();
    const normalizedPassword = (motDePasse || '').toString().trim();

    console.log('🔐 [LOGIN] Email normalisé:', normalizedEmail);
    console.log('🔐 [LOGIN] Recherche de l\'utilisateur...');

    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: normalizedEmail, mode: 'insensitive' } },
          { telephone: (email || '').toString().trim() }
        ]
      },
      include: {
        maisonResident: true,
        maisonsPropriete: true,
        maisonsHabitees: true,
        abonnement: true
      }
    });
    
    if (!user) {
      console.log('❌ [LOGIN] Utilisateur non trouvé pour:', normalizedEmail);
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    console.log('✅ [LOGIN] Utilisateur trouvé:', user.email, 'Role:', user.role);

    if (user.authMethod === 'google' || !user.motDePasse) {
      console.log('❌ [LOGIN] Cet utilisateur utilise Google Sign-In');
      return res.status(400).json({ 
        message: 'Cet compte utilise Google Sign-In. Veuillez vous connecter avec Google.',
        useGoogleSignIn: true
      });
    }

    const isPasswordValid = await comparePassword(normalizedPassword, user.motDePasse);
    if (!isPasswordValid) {
      console.log('❌ [LOGIN] Mot de passe incorrect pour:', normalizedEmail);
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    console.log('✅ [LOGIN] Mot de passe valide');

    const { accessToken, refreshToken } = generateTokens(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken }
    });

    let abonnement = null;
    if (FREE_MODE) {
      const now = new Date();
      const future = new Date(now);
      future.setFullYear(future.getFullYear() + 5);
      abonnement = {
        statut: 'actif',
        isActive: true,
        dateDebut: now,
        dateFin: future,
        nbResidentsMax: 9999,
      };
    } else {
      abonnement = user.abonnement;
    }

    let maisons = [];
    if (user.role === 'proprietaire') {
      maisons = user.maisonsPropriete;
    } else if (user.role === 'resident') {
      if (user.maisonResident) {
        maisons = [user.maisonResident];
      } else if (user.maisonsHabitees && user.maisonsHabitees.length > 0) {
        maisons = user.maisonsHabitees;
      }
    }

    console.log('✅ [LOGIN] Connexion réussie pour:', user.email, 'Role:', user.role);
    
    const { motDePasse: _, refreshToken: __, ...userWithoutSensitiveData } = user;

    res.json({
      message: 'Connexion réussie',
      user: userWithoutSensitiveData,
      accessToken,
      refreshToken,
      abonnement,
      maisons
    });
  } catch (error) {
    console.error('💥 [LOGIN] Erreur lors de la connexion:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la connexion',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token requis' });
    }

    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId }
    });

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: 'Refresh token invalide' });
    }

    const tokens = generateTokens(user.id);
    
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken }
    });

    res.json(tokens);
  } catch (error) {
    console.error('Erreur lors du refresh token:', error);
    res.status(401).json({ message: 'Refresh token invalide' });
  }
};

const logout = async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        refreshToken: null,
        deviceToken: null
      }
    });

    res.json({ message: 'Déconnexion réussie' });
  } catch (error) {
    console.error('Erreur lors de la déconnexion:', error);
    res.status(500).json({ message: 'Erreur lors de la déconnexion' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { nouveauMotDePasse } = req.body;

    const strength = validatePasswordStrength(nouveauMotDePasse || '');
    if (!strength.isValid) {
      return res.status(400).json({
        message: 'Le mot de passe ne respecte pas la politique de sécurité',
        errors: strength.errors,
      });
    }

    const hashedPassword = await hashPassword(nouveauMotDePasse);

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        motDePasse: hashedPassword,
        firstLogin: false
      }
    });

    res.json({ message: 'Mot de passe mis à jour avec succès' });
  } catch (error) {
    console.error('Erreur lors du changement de mot de passe:', error);
    res.status(500).json({ message: 'Erreur lors du changement de mot de passe' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { motDePasseActuel, nouveauMotDePasse } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    if (user.authMethod === 'google' || !user.motDePasse) {
      return res.status(400).json({
        message: 'Ce compte utilise Google Sign-In. Le changement de mot de passe n’est pas disponible.',
      });
    }

    const isPasswordValid = await comparePassword(motDePasseActuel, user.motDePasse);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Mot de passe actuel incorrect' });
    }

    const strength = validatePasswordStrength(nouveauMotDePasse || '');
    if (!strength.isValid) {
      return res.status(400).json({
        message: 'Le nouveau mot de passe ne respecte pas la politique de sécurité',
        errors: strength.errors,
      });
    }

    const hashedPassword = await hashPassword(nouveauMotDePasse);

    await prisma.user.update({
      where: { id: user.id },
      data: { motDePasse: hashedPassword }
    });

    res.json({ message: 'Mot de passe mis à jour avec succès' });
  } catch (error) {
    console.error('Erreur lors du changement de mot de passe:', error);
    res.status(500).json({ message: 'Erreur lors du changement de mot de passe' });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    console.log('🔍 [API] Récupération des données utilisateur:', req.user.id);

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        abonnement: true,
        maisonResident: true,
        maisonsPropriete: true,
        maisonsHabitees: true
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    const { motDePasse, refreshToken, ...userWithoutSensitiveData } = user;

    let abonnement = null;
    if (FREE_MODE) {
      const now = new Date();
      const future = new Date(now);
      future.setFullYear(future.getFullYear() + 5);
      abonnement = {
        statut: 'actif',
        isActive: true,
        dateDebut: now,
        dateFin: future,
        nbResidentsMax: 9999,
      };
    } else {
      abonnement = user.abonnement;
    }

    let maisons = [];
    if (user.role === 'proprietaire') {
      maisons = user.maisonsPropriete;
    } else if (user.role === 'resident') {
      if (user.maisonResident) {
        maisons = [user.maisonResident];
      } else if (user.maisonsHabitees && user.maisonsHabitees.length > 0) {
        maisons = user.maisonsHabitees;
      }
    }

    res.json({
      user: userWithoutSensitiveData,
      abonnement,
      maisons,
      message: 'Données utilisateur récupérées avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'utilisateur:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de l\'utilisateur' });
  }
};

const setHomeLocation = async (req, res) => {
  try {
    const { latitude, longitude, city, country } = req.body;

    if (latitude == null || longitude == null || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ message: 'Latitude et longitude requises (nombres)' });
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        homeLatitude: latitude,
        homeLongitude: longitude,
        homeCity: city || null,
        homeCountry: country || null,
        homeLocationSource: 'gps'
      }
    });

    return res.json({
      message: 'Localisation du domicile enregistrée',
      homeLatitude: latitude,
      homeLongitude: longitude,
      homeCity: city || null,
      homeCountry: country || null,
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la localisation:', error);
    res.status(500).json({ message: 'Erreur lors de l\'enregistrement de la localisation' });
  }
};

const setDeviceToken = async (req, res) => {
  try {
    const { deviceToken } = req.body;

    if (!deviceToken || typeof deviceToken !== 'string') {
      return res.status(400).json({ message: 'deviceToken requis' });
    }

    await prisma.user.updateMany({
      where: {
        deviceToken: deviceToken,
        id: { not: req.user.id }
      },
      data: { deviceToken: null }
    });

    await prisma.user.update({
      where: { id: req.user.id },
      data: { deviceToken: deviceToken }
    });

    return res.json({
      message: 'Device token mis à jour avec succès',
      deviceToken: deviceToken,
    });
  } catch (error) {
    console.error('💥 [API] Erreur lors de la mise à jour du deviceToken:', error);
    return res.status(500).json({ message: 'Erreur lors de la mise à jour du device token' });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email, telephone } = req.body;

    if (!email && !telephone) {
      return res.status(400).json({ message: 'Email ou téléphone requis' });
    }

    const normalizedEmail = (email || '').toString().trim().toLowerCase();

    let user;
    if (email) {
      user = await prisma.user.findFirst({
        where: { email: { equals: normalizedEmail, mode: 'insensitive' } }
      });
    } else {
      user = await prisma.user.findFirst({ where: { telephone: telephone.trim() } });
    }

    if (!user) {
      return res.json({
        message: 'Si un compte existe avec cet email/téléphone, un nouveau mot de passe temporaire a été généré.'
      });
    }

    const motDePasseTemporaire = generateTemporaryPassword();
    const hashedPassword = await hashPassword(motDePasseTemporaire);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        motDePasse: hashedPassword,
        firstLogin: true
      }
    });

    try {
      const { sendPasswordResetEmail } = require('../utils/emailUtils');
      await sendPasswordResetEmail(
        user.email,
        motDePasseTemporaire,
        `${user.prenom} ${user.nom}`
      );
    } catch (e) {
      console.error('Erreur lors de l\'envoi du mot de passe:', e);
    }

    res.json({
      message: 'Un nouveau mot de passe temporaire a été généré et envoyé',
      ...(process.env.NODE_ENV === 'development' && { temporaryPassword: motDePasseTemporaire })
    });
  } catch (error) {
    console.error('Erreur lors de la réinitialisation du mot de passe:', error);
    res.status(500).json({ message: 'Erreur lors de la réinitialisation du mot de passe' });
  }
};

const googleAuth = async (req, res) => {
  try {
    const { idToken, nom, prenom, telephone } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: 'idToken Google requis' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name: googleName, given_name: googleGivenName, family_name: googleFamilyName } = payload;
    const normalizedEmail = email.toLowerCase().trim();

    console.log('🔍 [GOOGLE AUTH] Tentative pour:', normalizedEmail);

    // Utilisation de findFirst avec mode: 'insensitive' pour gérer les anciennes données non normalisées
    let user = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      include: { abonnement: true }
    });

    if (user) {
      console.log('✅ [GOOGLE AUTH] Utilisateur trouvé:', normalizedEmail, 'Role:', user.role);

      if (!user.googleId || !user.authMethod === 'google') {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId,
            authMethod: 'google',
            // On en profite pour normaliser l'email si besoin
            email: normalizedEmail
          }
        });
      }

      if (user.role === 'resident') {
        const maisonResident = await prisma.maison.findFirst({
          where: {
            OR: [
              { listeResidents: { some: { id: user.id } } },
              { residentsDirects: { some: { id: user.id } } }
            ]
          }
        });
        
        if (!maisonResident) {
          console.log('⚠️ [GOOGLE AUTH] Résident trouvé mais sans maison:', normalizedEmail);
          // On laisse passer, l'app gérera le cas "sans maison"
        } else if (!user.maisonId) {
          await prisma.user.update({
            where: { id: user.id },
            data: { maisonId: maisonResident.id }
          });
          user.maisonId = maisonResident.id;
        }
      }

      const { accessToken, refreshToken } = generateTokens(user.id);
      await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken }
      });

      let abonnement = null;
      if (user.role === 'proprietaire') {
        if (FREE_MODE) {
          const now = new Date();
          const future = new Date(now);
          future.setFullYear(future.getFullYear() + 5);
          abonnement = {
            statut: 'actif',
            isActive: true,
            dateDebut: now,
            dateFin: future,
            nbResidentsMax: 9999,
          };
        } else {
          abonnement = user.abonnement;
        }
      }

      return res.json({
        message: 'Connexion réussie',
        user,
        accessToken,
        refreshToken,
        abonnement,
        needsRegistration: false
      });
    }

    if (!telephone) {
      const finalNom = nom || googleFamilyName || googleName.split(' ').slice(-1).join(' ') || '';
      const finalPrenom = prenom || googleGivenName || googleName.split(' ').slice(0, -1).join(' ') || googleName || '';
      
      return res.status(200).json({
        message: 'Informations supplémentaires requises',
        needsRegistration: true,
        googleData: {
          email: normalizedEmail,
          nom: finalNom,
          prenom: finalPrenom,
          googleId,
        },
        requiredFields: ['telephone'],
      });
    }

    console.log('🆕 [GOOGLE AUTH] Création nouveau compte:', normalizedEmail);
    const newUser = await prisma.user.create({
      data: {
        nom: nom.trim(),
        prenom: prenom.trim(),
        email: normalizedEmail,
        telephone: telephone.trim(),
        googleId: googleId,
        authMethod: 'google',
        role: 'proprietaire',
        motDePasse: null
      }
    });

    const { accessToken, refreshToken } = generateTokens(newUser.id);
    await prisma.user.update({
      where: { id: newUser.id },
      data: { refreshToken }
    });

    res.status(201).json({
      message: 'Compte créé avec succès',
      user: newUser,
      accessToken,
      refreshToken,
      abonnement: null,
      needsRegistration: false
    });
  } catch (error) {
    console.error('💥 [GOOGLE AUTH] Erreur lors de l\'authentification Google:', error);
    res.status(500).json({ message: 'Erreur lors de l\'authentification Google' });
  }
};

const deleteMyAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    await prisma.$transaction(async (tx) => {
      if (user.role === 'proprietaire') {
        const maisons = await tx.maison.findMany({ where: { proprietaireId: userId } });
        const maisonIds = maisons.map(m => m.id);
        await tx.consommation.deleteMany({ where: { maisonId: { in: maisonIds } } });
        await tx.facture.deleteMany({ where: { maisonId: { in: maisonIds } } });
        await tx.user.deleteMany({ where: { idProprietaire: userId, role: 'resident' } });
        await tx.maison.deleteMany({ where: { proprietaireId: userId } });
        await tx.abonnement.deleteMany({ where: { proprietaireId: userId } });
      } else if (user.role === 'resident') {
        await tx.consommation.deleteMany({ where: { residentId: userId } });
        await tx.facture.deleteMany({ where: { residentId: userId } });
      }
      await tx.message.deleteMany({ where: { OR: [{ expediteurId: userId }, { destinataireId: userId }] } });
      await tx.notification.deleteMany({ where: { destinataireId: userId } });
      await tx.log.deleteMany({ where: { userId: userId } });
      await tx.user.delete({ where: { id: userId } });
    });

    res.json({ message: 'Compte supprimé avec succès' });
  } catch (error) {
    console.error('Erreur suppression compte:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression du compte' });
  }
};

module.exports = {
  register,
  login,
  googleAuth,
  refreshToken,
  logout,
  resetPassword,
  changePassword,
  getCurrentUser,
  setDeviceToken,
  setHomeLocation,
  forgotPassword,
  deleteMyAccount
};
