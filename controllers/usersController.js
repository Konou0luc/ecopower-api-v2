const prisma = require('../config/prisma');

const makeAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await prisma.user.findUnique({
            where: { id }
        });
        
        if (!user) {
            return res.status(404).json({ message: 'Utilisateur non trouvé' });
        }

        if (user.role === 'admin') {
            return res.status(200).json({ message: 'Utilisateur déjà admin', user });
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: { role: 'admin' }
        });

        res.json({ message: 'Utilisateur promu admin avec succès', user: updatedUser });
    } catch (error) {
        console.error('Erreur lors de la promotion en admin:', error);
        res.status(500).json({ message: 'Erreur lors de la promotion en admin' });
    }
};

module.exports = {
    makeAdmin
};
