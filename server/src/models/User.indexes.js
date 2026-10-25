// One-time migration for databases created before username/password-only admins.
// From server/: node src/models/User.indexes.js
// Stop application writes and back up the database before running this migration.
const connectDB = require('../config/db');
const mongoose = require('mongoose');
const User = require('./User');

async function migrateUserIndexes() {
  const indexes = await User.collection.indexes();
  for (const field of ['email', 'phone']) {
    const old = indexes.find((index) => Object.keys(index.key).length === 1 && index.key[field] === 1);
    if (old?.unique && old?.sparse) continue;
    if (old) await User.collection.dropIndex(old.name);
    await User.collection.createIndex({ [field]: 1 }, { unique: true, sparse: true });
    console.log(`Updated ${field} unique sparse index`);
  }
}
if (require.main === module) {
  connectDB().then(migrateUserIndexes).catch((err) => {
    console.error(err.message); process.exitCode = 1;
  }).finally(() => mongoose.disconnect());
}
module.exports = migrateUserIndexes;
