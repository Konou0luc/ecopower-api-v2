const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const prisma = require('../config/prisma');
require('dotenv').config();

const app = express();

app.set('trust proxy', 1);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:4200',
      'http://127.0.0.1:4200',
      'http://localhost:5173',
      'http://localhost:5174',
      /^https:\/\/.*\.vercel\.app$/,
      /^https:\/\/.*\.netlify\.app$/,
    ];
    
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return origin === allowed;
      } else if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(null, true); 
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, 
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 30, 
  message: 'Trop de tentatives, réessayez plus tard',
  standardHeaders: true,
  legacyHeaders: false,
});

const residentLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 10, 
  message: 'Trop de requêtes, réessayez plus tard',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(async (req, res, next) => {
  try {
    // Vérifier la connexion à la DB pour Vercel (optionnel car Prisma gère le pooling)
    // await prisma.$connect();
    next();
  } catch (error) {
    console.error('❌ [VERCEL] Erreur DB:', error);
    res.status(500).json({ 
      message: 'Erreur de connexion à la base de données'
    });
  }
});

app.use('/auth', authLimiter, require('../routes/auth'));
app.use('/residents', residentLimiter, require('../routes/residents'));
app.use('/consommations', require('../routes/consommations'));
app.use('/factures', require('../routes/factures'));
app.use('/abonnements', require('../routes/abonnements'));
app.use('/maisons', require('../routes/maisons'));
app.use('/messages', require('../routes/messages'));
app.use('/admin', require('../routes/admin'));
app.use('/contact', require('../routes/contact'));

app.get('/config', (req, res) => {
  res.json({ freeMode: process.env.FREE_MODE === 'true' });
});

const appInfoController = require('../controllers/appInfoController');
app.get('/app-info', appInfoController.getAppInfo);

app.get('/', (req, res) => {
  res.json({ message: 'API Ecopower - Gestion de consommation électrique (Vercel/Prisma)' });
});

app.use((err, req, res, _next) => {
  console.error('❌ [VERCEL] Erreur:', err.stack);
  res.status(500).json({ message: 'Erreur interne du serveur' });
});

module.exports = app;
