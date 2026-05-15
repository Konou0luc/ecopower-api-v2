const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Ecopower API',
      version: '1.0.0',
      description: 'Documentation des endpoints Ecopower',
    },
    servers: [
      {
        url: process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`,
        description: 'Serveur API',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        SuccessMessage: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Opération effectuée avec succès' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Une erreur est survenue' },
            details: { type: 'string', example: 'Détails techniques optionnels' },
          },
        },
        UserPublic: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'cly9l0j8n0001abc123def456' },
            nom: { type: 'string', example: 'Doe' },
            prenom: { type: 'string', example: 'Jane' },
            email: { type: 'string', example: 'jane.doe@example.com' },
            telephone: { type: 'string', example: '+221771234567' },
            role: { type: 'string', example: 'resident' },
          },
        },
        Maison: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'cly9m2m9z0002abc987zyx654' },
            nom: { type: 'string', example: 'Villa Keur Mame' },
            adresse: { type: 'string', example: 'Dakar, Almadies' },
            tarifKwh: { type: 'number', example: 120.5 },
            nbResidentsMax: { type: 'integer', example: 6 },
            codeInvitation: { type: 'string', example: 'ECO-8K9L2P' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Consommation: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'cly9n3za10003abc741xyz852' },
            mois: { type: 'integer', example: 5 },
            annee: { type: 'integer', example: 2026 },
            indexCompteur: { type: 'number', example: 1530.75 },
            kwhConsommes: { type: 'number', example: 84.2 },
            statut: { type: 'string', example: 'facturee' },
            commentaire: { type: 'string', example: 'Relevé automatique' },
            maisonId: { type: 'string' },
            residentId: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Facture: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'cly9p6cew0004abc258hjk369' },
            numeroFacture: { type: 'string', example: 'FAC-2026-05-00012' },
            montantTotal: { type: 'number', example: 15450 },
            statut: { type: 'string', example: 'impayee' },
            dateEcheance: { type: 'string', format: 'date-time' },
            mois: { type: 'integer', example: 5 },
            annee: { type: 'integer', example: 2026 },
            residentId: { type: 'string' },
            maisonId: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        MessageEntity: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'cly9q8fz90005abc963mno147' },
            contenu: { type: 'string', example: 'Bonjour, relevé ajouté.' },
            type: { type: 'string', example: 'text' },
            expediteurId: { type: 'string' },
            destinataireId: { type: 'string', nullable: true },
            maisonId: { type: 'string', nullable: true },
            fileUrl: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        NotificationEntity: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'cly9r2jnf0006abc741stu852' },
            titre: { type: 'string', example: 'Nouvelle facture' },
            contenu: { type: 'string', example: 'Votre facture du mois est disponible.' },
            lu: { type: 'boolean', example: false },
            userId: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        AppInfo: {
          type: 'object',
          properties: {
            appName: { type: 'string', example: 'Ecopower API' },
            supportEmail: { type: 'string', example: 'support@ecopower.app' },
            supportPhone: { type: 'string', example: '+221770000000' },
            maintenanceMode: { type: 'boolean', example: false },
          },
        },
        CreateMaisonInput: {
          type: 'object',
          required: ['nom', 'adresse', 'tarifKwh'],
          properties: {
            nom: { type: 'string', example: 'Villa Keur Mame' },
            adresse: { type: 'string', example: 'Dakar, Almadies' },
            tarifKwh: { type: 'number', example: 120.5 },
            nbResidentsMax: { type: 'integer', example: 6 },
          },
        },
        AddConsommationInput: {
          type: 'object',
          required: ['residentId', 'maisonId', 'mois', 'annee', 'indexCompteur'],
          properties: {
            residentId: { type: 'string' },
            maisonId: { type: 'string' },
            mois: { type: 'integer', example: 5 },
            annee: { type: 'integer', example: 2026 },
            indexCompteur: { type: 'number', example: 1530.75 },
            commentaire: { type: 'string', example: 'Relevé manuel' },
          },
        },
        GenerateFactureInput: {
          type: 'object',
          required: ['mois', 'annee'],
          properties: {
            mois: { type: 'integer', example: 5 },
            annee: { type: 'integer', example: 2026 },
            fraisFixes: { type: 'number', example: 1500 },
          },
        },
        Abonnement: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            plan: { type: 'string', example: 'pro' },
            statut: { type: 'string', example: 'actif' },
            dateDebut: { type: 'string', format: 'date-time' },
            dateFin: { type: 'string', format: 'date-time' },
          },
        },
        OffreAbonnement: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'STARTER' },
            nom: { type: 'string', example: 'Starter' },
            prixMensuel: { type: 'number', example: 5000 },
            quotas: {
              type: 'object',
              properties: {
                maxMaisons: { type: 'integer', example: 1 },
                maxResidents: { type: 'integer', example: 5 },
              },
            },
          },
        },
        DemandeResident: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            codeInvitation: { type: 'string', example: 'ECO-8K9L2P' },
            prenom: { type: 'string', example: 'Aminata' },
            nom: { type: 'string', example: 'Ndiaye' },
            telephone: { type: 'string', example: '+221771112233' },
            email: { type: 'string', example: 'aminata@example.com' },
            statut: { type: 'string', example: 'en_attente' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        DemandeResidentPublicInput: {
          type: 'object',
          required: ['codeInvitation', 'prenom', 'nom', 'telephone', 'email'],
          properties: {
            codeInvitation: { type: 'string', example: 'ECO-8K9L2P' },
            prenom: { type: 'string', example: 'Aminata' },
            nom: { type: 'string', example: 'Ndiaye' },
            telephone: { type: 'string', example: '+221771112233' },
            email: { type: 'string', example: 'aminata@example.com' },
          },
        },
        ContactInput: {
          type: 'object',
          required: ['nom', 'email', 'message'],
          properties: {
            nom: { type: 'string', example: 'Client Ecopower' },
            email: { type: 'string', example: 'client@example.com' },
            sujet: { type: 'string', example: 'Question abonnement' },
            message: { type: 'string', example: 'Bonjour, je veux passer au plan Pro.' },
          },
        },
        GoogleAuthInput: {
          type: 'object',
          required: ['idToken'],
          properties: {
            idToken: { type: 'string', example: 'eyJhbGciOi...' },
          },
        },
        RefreshTokenInput: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string', example: 'rt_123456789' },
          },
        },
        SetDeviceTokenInput: {
          type: 'object',
          required: ['deviceToken'],
          properties: {
            deviceToken: { type: 'string', example: 'fcm-device-token' },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Non authentifie',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              examples: {
                missingToken: {
                  summary: 'Token manquant',
                  value: { error: 'Token manquant ou invalide' },
                },
              },
            },
          },
        },
        ForbiddenError: {
          description: 'Acces refuse',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              examples: {
                forbidden: {
                  summary: 'Role insuffisant',
                  value: { error: 'Acces refuse: permissions insuffisantes' },
                },
              },
            },
          },
        },
        ValidationError: {
          description: 'Donnees invalides',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              examples: {
                badPayload: {
                  summary: 'Body invalide',
                  value: { error: 'Champs requis manquants', details: 'email est requis' },
                },
              },
            },
          },
        },
        NotFoundError: {
          description: 'Ressource introuvable',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              examples: {
                notFound: {
                  summary: 'Entite absente',
                  value: { error: 'Ressource introuvable' },
                },
              },
            },
          },
        },
        GenericError: {
          description: 'Erreur applicative',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              examples: {
                serverError: {
                  summary: 'Erreur interne',
                  value: { error: 'Erreur serveur' },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: ['./routes/*.js'],
};

module.exports = swaggerJsdoc(options);
