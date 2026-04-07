const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) {
      return res.status(401).json({ message: 'Token d\'accès requis' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });
    
    if (!user) {
      return res.status(401).json({ message: 'Utilisateur non trouvé' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expiré' });
    }
    return res.status(401).json({ message: 'Token invalide' });
  }
};


const requireProprietaire = (req, res, next) => {
  if (req.user.role !== 'proprietaire') {
    return res.status(403).json({ message: 'Accès réservé aux propriétaires' });
  }
  next();
};


const requireResident = (req, res, next) => {
  if (req.user.role !== 'resident') {
    return res.status(403).json({ message: 'Accès réservé aux résidents' });
  }
  next();
};


const requireAdmin = (req, res, next) => {
  
  if (!req.user) {
    console.error('❌ [AUTH] requireAdmin: req.user n\'est pas défini');
    return res.status(401).json({ message: 'Authentification requise' });
  }
  
  
  if (req.user.role !== 'admin' && req.user.role !== 'super-admin') {
    console.error('❌ [AUTH] requireAdmin: Rôle insuffisant. Rôle actuel:', req.user.role, 'Email:', req.user.email);
    return res.status(403).json({ 
      message: 'Accès réservé aux administrateurs',
      role: req.user.role,
      requiredRoles: ['admin', 'super-admin']
    });
  }
  
  console.log('✅ [AUTH] requireAdmin: Accès autorisé pour', req.user.email, 'avec le rôle', req.user.role);
  next();
};



const requirePasswordChange = (req, res, next) => {
  if (req.user.firstLogin) {
    return next();
  }
  return res.status(400).json({
    message: 'Cette opération n\'est pas nécessaire',
    firstLogin: false
  });
};


const authenticateRefreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token requis' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });
    
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: 'Refresh token invalide' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('❌ [AUTH] authenticateRefreshToken: Erreur', error.message);
    return res.status(401).json({ message: 'Refresh token invalide' });
  }
};

module.exports = {
  authenticateToken,
  requireProprietaire,
  requireResident,
  requireAdmin,
  requirePasswordChange,
  authenticateRefreshToken
};
