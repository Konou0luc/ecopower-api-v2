const prisma = require('../config/prisma');

const getMaisonById = async (req, res) => {
  try {
    const { id } = req.params;
    const maison = await prisma.maison.findUnique({
      where: { id },
      include: {
        listeResidents: true,
        proprietaire: true
      }
    });

    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    res.json(maison);
  } catch (error) {
    console.error('💥 [API] getMaisonById error:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de la maison' });
  }
};

const createMaison = async (req, res) => {
  try {
    const { nomMaison, adresse, description, tarifKwh, nbResidentsMax } = req.body;

    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent créer des maisons' });
    }

    const maison = await prisma.maison.create({
      data: {
        nomMaison,
        proprietaireId: req.user.id,
        adresseRue: adresse?.rue,
        adresseVille: adresse?.ville,
        adresseCodePostal: adresse?.codePostal,
        adressePays: adresse?.pays || 'Togo',
        description,
        tarifKwh: tarifKwh !== undefined ? Number(tarifKwh) : 0,
        nbResidentsMax: nbResidentsMax !== undefined ? Number(nbResidentsMax) : 1
      }
    });

    res.status(201).json({
      message: 'Maison créée avec succès',
      maison
    });
  } catch (error) {
    console.error('Erreur lors de la création de la maison:', error);
    res.status(500).json({ message: 'Erreur lors de la création de la maison' });
  }
};

const getMaisons = async (req, res) => {
  try {
    let maisons;

    if (req.user.role === 'proprietaire') {
      maisons = await prisma.maison.findMany({
        where: { proprietaireId: req.user.id },
        include: {
          listeResidents: {
            select: { id: true, nom: true, prenom: true, email: true, telephone: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } else {
      maisons = await prisma.maison.findMany({
        where: {
          OR: [
            { listeResidents: { some: { id: req.user.id } } },
            { residentsDirects: { some: { id: req.user.id } } }
          ]
        },
        include: {
          proprietaire: {
            select: { id: true, nom: true, prenom: true, email: true }
          },
          listeResidents: {
            select: { id: true, nom: true, prenom: true, email: true, telephone: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    res.json({
      maisons,
      count: maisons.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des maisons:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des maisons' });
  }
};


const getMaison = async (req, res) => {
  try {
    const { id } = req.params;

    let maison;
    if (req.user.role === 'proprietaire') {
      maison = await prisma.maison.findFirst({
        where: {
          id,
          proprietaireId: req.user.id
        },
        include: {
          listeResidents: {
            select: { id: true, nom: true, prenom: true, email: true, telephone: true }
          }
        }
      });
    } else {
      maison = await prisma.maison.findFirst({
        where: {
          id,
          OR: [
            { listeResidents: { some: { id: req.user.id } } },
            { residentsDirects: { some: { id: req.user.id } } }
          ]
        },
        include: {
          proprietaire: {
            select: { id: true, nom: true, prenom: true, email: true }
          },
          listeResidents: {
            select: { id: true, nom: true, prenom: true, email: true, telephone: true }
          }
        }
      });
    }

    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    res.json({ maison });
  } catch (error) {
    console.error('Erreur lors de la récupération de la maison:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de la maison' });
  }
};

const updateMaison = async (req, res) => {
  try {
    const { id } = req.params;
    const { nomMaison, adresse, description, tarifKwh, nbResidentsMax } = req.body;

    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent modifier des maisons' });
    }

    const maison = await prisma.maison.findFirst({
      where: {
        id,
        proprietaireId: req.user.id
      }
    });

    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    const data = {};
    if (nomMaison) data.nomMaison = nomMaison;
    if (adresse) {
      if (adresse.rue) data.adresseRue = adresse.rue;
      if (adresse.ville) data.adresseVille = adresse.ville;
      if (adresse.codePostal) data.adresseCodePostal = adresse.codePostal;
      if (adresse.pays) data.adressePays = adresse.pays;
    }
    if (description !== undefined) data.description = description;
    if (tarifKwh !== undefined) {
      if (Number.isNaN(Number(tarifKwh)) || Number(tarifKwh) < 0) {
        return res.status(400).json({ message: 'tarifKwh invalide' });
      }
      data.tarifKwh = Number(tarifKwh);
    }
    if (nbResidentsMax !== undefined) {
      if (Number.isNaN(Number(nbResidentsMax)) || Number(nbResidentsMax) < 1) {
        return res.status(400).json({ message: 'nbResidentsMax invalide' });
      }
      data.nbResidentsMax = Number(nbResidentsMax);
    }

    const updatedMaison = await prisma.maison.update({
      where: { id },
      data
    });

    res.json({
      message: 'Maison mise à jour avec succès',
      maison: updatedMaison
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la maison:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour de la maison' });
  }
};


const updateMaisonConfiguration = async (req, res) => {
  try {
    const { id } = req.params;
    const { tarifKwh, nbResidentsMax } = req.body;

    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent modifier la configuration' });
    }

    if (tarifKwh === undefined && nbResidentsMax === undefined) {
      return res.status(400).json({
        message: 'Veuillez fournir au moins tarifKwh ou nbResidentsMax'
      });
    }

    if (tarifKwh !== undefined && (Number.isNaN(Number(tarifKwh)) || Number(tarifKwh) < 0)) {
      return res.status(400).json({ message: 'tarifKwh invalide' });
    }

    if (
      nbResidentsMax !== undefined &&
      (Number.isNaN(Number(nbResidentsMax)) || Number(nbResidentsMax) < 1)
    ) {
      return res.status(400).json({ message: 'nbResidentsMax invalide' });
    }

    const maison = await prisma.maison.findFirst({
      where: { id, proprietaireId: req.user.id }
    });

    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    const data = {};
    if (tarifKwh !== undefined) data.tarifKwh = Number(tarifKwh);
    if (nbResidentsMax !== undefined) data.nbResidentsMax = Number(nbResidentsMax);

    const updatedMaison = await prisma.maison.update({
      where: { id },
      data
    });

    return res.json({
      message: 'Configuration de la maison mise à jour avec succès',
      maison: {
        id: updatedMaison.id,
        tarifKwh: updatedMaison.tarifKwh,
        nbResidentsMax: updatedMaison.nbResidentsMax
      }
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la configuration:', error);
    return res.status(500).json({ message: 'Erreur lors de la mise à jour de la configuration' });
  }
};


const deleteMaison = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent supprimer des maisons' });
    }

    const maison = await prisma.maison.findFirst({
      where: { id, proprietaireId: req.user.id },
      include: { listeResidents: true }
    });

    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    if (maison.listeResidents.length > 0) {
      return res.status(400).json({ 
        message: 'Impossible de supprimer une maison qui a des résidents' 
      });
    }

    await prisma.maison.delete({ where: { id } });

    res.json({ message: 'Maison supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de la maison:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression de la maison' });
  }
};


const updateMaisonTarif = async (req, res) => {
  try {
    const { id } = req.params;
    const { tarifKwh } = req.body;

    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent modifier le tarif' });
    }

    if (tarifKwh === undefined || Number.isNaN(Number(tarifKwh)) || Number(tarifKwh) < 0) {
      return res.status(400).json({ message: 'tarifKwh invalide' });
    }

    const maison = await prisma.maison.findFirst({
      where: { id, proprietaireId: req.user.id }
    });

    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    const updatedMaison = await prisma.maison.update({
      where: { id },
      data: { tarifKwh: Number(tarifKwh) }
    });

    res.json({ 
      message: 'Tarif mis à jour avec succès', 
      maison: { id: updatedMaison.id, tarifKwh: updatedMaison.tarifKwh } 
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du tarif:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour du tarif' });
  }
};

const addResidentToMaison = async (req, res) => {
  try {
    const { maisonId, residentId } = req.body;

    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent ajouter des résidents' });
    }

    const maison = await prisma.maison.findFirst({
      where: { id: maisonId, proprietaireId: req.user.id },
      include: { listeResidents: true }
    });

    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    const resident = await prisma.user.findFirst({
      where: { id: residentId, idProprietaire: req.user.id, role: 'resident' }
    });

    if (!resident) {
      return res.status(404).json({ message: 'Résident non trouvé' });
    }

    if (maison.nbResidentsMax > 0 && maison.listeResidents.length >= maison.nbResidentsMax) {
      return res.status(400).json({
        message: `Nombre maximal de résidents atteint pour cette maison (${maison.nbResidentsMax})`
      });
    }

    const updatedMaison = await prisma.maison.update({
      where: { id: maisonId },
      data: {
        listeResidents: {
          connect: { id: residentId }
        }
      }
    });

    res.json({
      message: 'Résident ajouté à la maison avec succès',
      maison: updatedMaison
    });
  } catch (error) {
    console.error('Erreur lors de l\'ajout du résident:', error);
    res.status(500).json({ message: 'Erreur lors de l\'ajout du résident' });
  }
};

const removeResidentFromMaison = async (req, res) => {
  try {
    const { maisonId, residentId } = req.body;

    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent retirer des résidents' });
    }

    const maison = await prisma.maison.findFirst({
      where: { id: maisonId, proprietaireId: req.user.id }
    });

    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    const updatedMaison = await prisma.maison.update({
      where: { id: maisonId },
      data: {
        listeResidents: {
          disconnect: { id: residentId }
        }
      }
    });

    res.json({
      message: 'Résident retiré de la maison avec succès',
      maison: updatedMaison
    });
  } catch (error) {
    console.error('Erreur lors du retrait du résident:', error);
    res.status(500).json({ message: 'Erreur lors du retrait du résident' });
  }
};

module.exports = {
  getMaisonById,
  createMaison,
  getMaisons,
  getMaison,
  updateMaison,
  updateMaisonConfiguration,
  deleteMaison,
  updateMaisonTarif,
  addResidentToMaison,
  removeResidentFromMaison
};
