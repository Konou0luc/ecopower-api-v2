const admin = require("firebase-admin");

let serviceAccount;
try {
    let configStr = process.env.FIREBASE_CONFIG || '{}';
    // Trim potential surrounding quotes and whitespace
    configStr = configStr.trim();
    if (configStr.startsWith('"') && configStr.endsWith('"')) {
        configStr = configStr.substring(1, configStr.length - 1);
    }
    // Sometimes the private key in env vars has literal newlines that need to be escaped
    const sanitizedConfig = configStr.replace(/\\n/g, '\\n').replace(/\n/g, '\\n');
    serviceAccount = JSON.parse(sanitizedConfig);
} catch (error) {
    console.error('❌ Erreur lors du parsing de FIREBASE_CONFIG:', error.message);
    // Fallback if parsing fails, but this might still fail if critical data is missing
    serviceAccount = {};
}

if (serviceAccount.project_id) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} else {
    console.warn('⚠️ Firebase non initialisé: FIREBASE_CONFIG manquant ou invalide');
}

module.exports = admin;
