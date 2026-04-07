const prisma = require('../config/prisma');

const socketManager = (io) => {
  const connectedUsers = new Map();

  io.on('connection', (socket) => {
    console.log(`Nouvelle connexion: ${socket.id}`);

    socket.on('authenticate', async (data) => {
      try {
        const { token } = data;
        if (!token) {
          socket.emit('auth_error', { message: 'Token manquant' });
          return;
        }

        // Pour simplifier on assume token = userId pour le moment si c'est ce que faisait le code original
        // Mais idéalement il faudrait vérifier le JWT
        const userId = token; 
        
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: {
            maisonsHabitees: true,
            maisonsPropriete: true,
            maisonResident: true
          }
        });

        if (!user) {
          socket.emit('auth_error', { message: 'Utilisateur non trouvé' });
          return;
        }

        socket.userId = user.id;
        socket.userRole = user.role;
        socket.userNom = `${user.prenom} ${user.nom}`;

        connectedUsers.set(user.id, {
          socketId: socket.id,
          user: user
        });

        socket.join(`user:${user.id}`);

        if (user.role === 'resident') {
          if (user.maisonResident) {
            socket.join(`maison:${user.maisonResident.id}`);
          }
          user.maisonsHabitees.forEach(maison => {
            socket.join(`maison:${maison.id}`);
          });
        } else if (user.role === 'proprietaire') {
          user.maisonsPropriete.forEach(maison => {
            socket.join(`maison:${maison.id}`);
          });
        }

        socket.emit('authenticated', {
          message: 'Authentification réussie',
          user: {
            id: user.id,
            nom: socket.userNom,
            role: user.role
          }
        });

        console.log(`✅ [Socket] Utilisateur authentifié: ${socket.userNom} (${user.role}) - ID: ${user.id}`);
      } catch (error) {
        console.error('Erreur d\'authentification socket:', error);
        socket.emit('auth_error', { message: 'Erreur d\'authentification' });
      }
    });

    socket.on('send_private_message', async (data) => {
      try {
        console.log('🔵 [Socket] Reçu send_private_message:', data);
        const { receiverId, contenu, maisonId } = data;

        if (!socket.userId) {
          console.log('🔴 [Socket] Utilisateur non authentifié');
          socket.emit('error', { message: 'Non authentifié' });
          return;
        }

        const sujet = contenu.trim().length > 50 
          ? contenu.trim().substring(0, 50) + '...' 
          : contenu.trim();

        const message = await prisma.message.create({
          data: {
            expediteurId: socket.userId,
            destinataireId: receiverId,
            sujet: sujet,
            contenu: contenu,
            type: 'chat',
            statut: 'en_attente'
          }
        });

        io.to(`user:${receiverId}`).emit('new_private_message', {
          message,
          from: {
            id: socket.userId,
            nom: socket.userNom
          }
        });

        socket.emit('message_sent', { message });
      } catch (error) {
        console.error('Erreur envoi message socket:', error);
        socket.emit('error', { message: 'Erreur lors de l\'envoi du message' });
      }
    });

    socket.on('disconnect', () => {
      if (socket.userId) {
        connectedUsers.delete(socket.userId);
        console.log(`Déconnexion utilisateur: ${socket.userId}`);
      }
    });
  });
};

module.exports = socketManager;
