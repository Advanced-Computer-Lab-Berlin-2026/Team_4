const app = require('./app');
const env = require('./config/env');
const connectDB = require('./config/db');
const { startSprint2Jobs } = require('./services/sprint2/bootstrap');

(async () => {
  try {
    await connectDB();
    await Promise.all(Object.values(require('./models')).map((model) => model.init()));
    startSprint2Jobs();
    app.listen(env.PORT, () => console.log(`ShareShed API running on http://localhost:${env.PORT}`));
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
})();
