const { body } = require('express-validator');

const fields = [
  ['street', 'Street', 200],
  ['city', 'City', 100],
  ['state', 'State', 100],
  ['postalCode', 'Postal code', 100],
  ['country', 'Country', 100],
];

function addressRules({ registration = false } = {}) {
  return fields.map(([key, label, max]) => {
    const required = registration && (key === 'street' || key === 'city');
    const chain = body(`address.${key}`);
    if (!required) chain.optional();
    chain.isString().withMessage(`${label} must be text`).bail().trim();
    if (required || (!registration && ['street', 'city', 'country'].includes(key))) {
      chain.notEmpty().withMessage(`${label} cannot be empty`).bail();
    }
    return chain.isLength({ max }).withMessage(`${label} must be at most ${max} characters`);
  });
}

module.exports = { addressRules };
