const app = require('./app');
const env = require('./config/env');
const connectDB = require('./config/db');

(async () => {
  try {
    await connectDB();
    app.listen(env.PORT, () => console.log(`ShareShed API running on http://localhost:${env.PORT}`));
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
})();
