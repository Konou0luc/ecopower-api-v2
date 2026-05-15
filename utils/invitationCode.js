const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Code lisible (sans 0/O/1/I confondus) pour partage résident → maison.
 */
function generateInvitationCode(length = 8) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out.toUpperCase();
}

/**
 * Génère un code unique pour la table Maison (quelques tentatives).
 */
async function ensureUniqueMaisonInvitationCode(prismaClient) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateInvitationCode(8);
    const clash = await prismaClient.maison.findUnique({
      where: { codeInvitation: code },
    });
    if (!clash) return code;
  }
  throw new Error('Impossible de générer un code d’invitation unique');
}

module.exports = { generateInvitationCode, ensureUniqueMaisonInvitationCode };
