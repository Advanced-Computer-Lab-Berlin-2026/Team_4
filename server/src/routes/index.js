/**
 * AUTO-MOUNTER - nobody needs to edit this file.
 * Every file named  <name>.routes.js  in this folder is mounted at  /api/<kebab-case name>.
 *   auth.routes.js                    -> /api/auth
 *   lenderApplications.routes.js      -> /api/lender-applications
 *   adminLenderApplications.routes.js -> /api/admin-lender-applications
 * This is what lets 9 people add routers without ever touching a shared file.
 */
const fs = require('fs');
const router = require('express').Router();
const env = require('../config/env');

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

fs.readdirSync(__dirname)
  .filter((f) => f.endsWith('.routes.js'))
  .sort()
  .forEach((file) => {
    const name = file.replace('.routes.js', '');
    if (name === 'dev' && env.NODE_ENV === 'production') return; // never expose dev helpers in prod
    router.use(`/${kebab(name)}`, require(`./${file}`));
  });

module.exports = router;
