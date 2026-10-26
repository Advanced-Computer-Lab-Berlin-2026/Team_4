/** Convenience: require('../models') gives every model. Registering all of them here also guarantees populate() works everywhere. */
const fs = require('fs');
const models = {};
fs.readdirSync(__dirname)
    .filter((f) =>
        f.endsWith('.js') &&
        f !== 'index.js' &&
        !f.endsWith('.indexes.js')
    )
  .forEach((f) => { models[f.replace('.js', '')] = require(`./${f}`); });
module.exports = models;
