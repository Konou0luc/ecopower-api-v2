const prisma = require('../config/prisma');
const { uploadBufferToCloudinary, cloudinary } = require('../middlewares/upload');
const notifications = require('../utils/notifications');

exports.createFileMessage = async (req, res) => {
  try {
    const { receiverId, contenu, maisonId } = req.body;
    const senderId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ message: 'Aucun fichier fourni' });
    }

    if (!maisonId) {
      return res.status(400).json({ message: 'L\'ID de la maison est requis' });
    }

    const cloudinaryResult = await uploadBufferToCloudinary(req.file);

    const destinataireId = receiverId && receiverId.trim() !== '' 
      ? receiverId 
      : senderId;

    const sujet = req.file.originalname;

    const fileType = req.file.mimetype.startsWith('image/') 
      ? 'image' 
      : req.file.mimetype.startsWith('video/') 
        ? 'video' 
        : req.file.mimetype.startsWith('audio/') 
          ? 'audio' 
          : 'file';

    const message = await prisma.message.create({
      data: {
        expediteurId: senderId,
        destinataireId: destinataireId,
        sujet: sujet,
        contenu: contenu || req.file.originalname,
        type: 'chat',
        statut: 'envoye',
        dateEnvoi: new Date(),
        metadata: {
          maisonId: maisonId,
          receiverId: receiverId || null, 
          fileType: fileType, 
          fileName: req.file.originalname,
          fileSize: req.file.size,
          fileMimeType: req.file.mimetype,
          fileUrl: cloudinaryResult.secure_url,
          thumbnailUrl: cloudinaryResult.format === 'jpg' || cloudinaryResult.format === 'png' 
            ? cloudinaryResult.secure_url 
            : null
        }
      }
    });

    if (req.user.role === 'proprietaire' && receiverId && receiverId.trim() !== '') {
      try {
        const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
        if (receiver && receiver.role === 'resident') {
          const fileTypeLabel = fileType === 'image' ? 'une image' : 
                               fileType === 'video' ? 'une vidéo' : 
                               fileType === 'audio' ? 'un audio' : 'un fichier';
          await notifications.envoyer(receiverId, `Nouveau message de ${req.user.prenom + ' ' + req.user.nom}: ${fileTypeLabel}`);
        }
      } catch (e) {
        console.error('Notif push échouée:', e.message);
      }
    }

    res.status(201).json({
      message: 'Message avec fichier créé',
      messageData: message
    });
  } catch (error) {
    console.error('Erreur createFileMessage:', error);
    res.status(500).json({ message: 'Erreur lors de l\'envoi du fichier' });
  }
};

exports.getMessagesByMaison = async (req, res) => {
  try {
    const { maisonId } = req.params;
    const { receiverId } = req.query;
    const userId = req.user.id;

    let where = {};
    
    if (req.user.role === 'proprietaire') {
      if (!receiverId) return res.status(400).json({ message: 'receiverId requis pour le gérant' });
      
      where = {
        OR: [
          { expediteurId: userId, destinataireId: receiverId },
          { expediteurId: receiverId, destinataireId: userId }
        ],
        type: 'chat'
      };
    } else {
      const maison = await prisma.maison.findFirst({
        where: {
          id: maisonId,
          OR: [
            { listeResidents: { some: { id: userId } } },
            { residentsDirects: { some: { id: userId } } }
          ]
        }
      });

      if (!maison) return res.status(403).json({ message: 'Accès non autorisé à cette maison' });

      where = {
        OR: [
          { expediteurId: userId, destinataireId: maison.proprietaireId },
          { expediteurId: maison.proprietaireId, destinataireId: userId }
        ],
        type: 'chat'
      };
    }

    const messages = await prisma.message.findMany({
      where,
      orderBy: { dateEnvoi: 'asc' },
      include: {
        expediteur: { select: { id: true, nom: true, prenom: true } },
        destinataire: { select: { id: true, nom: true, prenom: true } }
      }
    });

    res.json(messages);
  } catch (error) {
    console.error('Erreur getMessagesByMaison:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des messages' });
  }
};

exports.createMessage = async (req, res) => {
  try {
    const { receiverId, contenu, maisonId } = req.body;
    const senderId = req.user.id;

    if (!maisonId) return res.status(400).json({ message: 'maisonId requis' });

    const destinataireId = receiverId || null;
    if (!destinataireId) return res.status(400).json({ message: 'Destinataire requis' });

    const message = await prisma.message.create({
      data: {
        expediteurId: senderId,
        destinataireId: destinataireId,
        sujet: 'Chat',
        contenu: contenu,
        type: 'chat',
        statut: 'envoye',
        metadata: { maisonId }
      }
    });

    try {
      await notifications.envoyer(destinataireId, `Nouveau message de ${req.user.prenom} ${req.user.nom}: ${contenu.substring(0, 50)}`);
    } catch (e) {
      console.error('Erreur notif message:', e.message);
    }

    res.status(201).json(message);
  } catch (error) {
    console.error('Erreur createMessage:', error);
    res.status(500).json({ message: 'Erreur lors de l\'envoi du message' });
  }
};

exports.getPrivateHistory = async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const userId = req.user.id;

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { expediteurId: userId, destinataireId: otherUserId },
          { expediteurId: otherUserId, destinataireId: userId }
        ],
        type: 'chat'
      },
      orderBy: { dateEnvoi: 'asc' },
      include: {
        expediteur: { select: { id: true, nom: true, prenom: true } },
        destinataire: { select: { id: true, nom: true, prenom: true } }
      }
    });

    res.json(messages);
  } catch (error) {
    console.error('Erreur getPrivateHistory:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de l\'historique' });
  }
};

exports.getHouseHistory = async (req, res) => {
  try {
    const { maisonId } = req.params;
    const userId = req.user.id;

    const messages = await prisma.message.findMany({
      where: {
        metadata: {
          path: ['maisonId'],
          equals: maisonId
        },
        type: 'chat'
      },
      orderBy: { dateEnvoi: 'asc' },
      include: {
        expediteur: { select: { id: true, nom: true, prenom: true } },
        destinataire: { select: { id: true, nom: true, prenom: true } }
      }
    });

    res.json(messages);
  } catch (error) {
    console.error('Erreur getHouseHistory:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de l\'historique de la maison' });
  }
};

exports.proxyFile = async (req, res) => {
  res.status(501).json({ message: 'Not implemented' });
};
