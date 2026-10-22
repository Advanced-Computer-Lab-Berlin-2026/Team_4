const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');
const env = require('./config/env');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const ApiError = require('./utils/ApiError');
require('./models'); // registers every model (needed for populate)

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
if (env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Public uploads only (item photos, manuals). private/ is intentionally NOT exposed.
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads', 'public')));

// All /api routes are auto-mounted from src/routes/*.routes.js (see routes/index.js)
app.use('/api', routes);
app.use('/api', (req, res, next) => next(ApiError.notFound(`No route: ${req.method} ${req.originalUrl}`)));

app.use(errorHandler);

module.exports = app;
