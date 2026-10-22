const mongoose = require('mongoose');
const env = require('./env');

module.exports = async function connectDB() {
  env.assertRequired();
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGO_URI);
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
};
