const admin = require("firebase-admin");

const serviceAccount = require("../menufunctions-firebase-adminsdk-pbnfx-97a020f330.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.DATABASEURL,
  storageBucket: process.env.STORAGEBUCKET
});

const db = admin.firestore();

module.exports = { admin, db };
