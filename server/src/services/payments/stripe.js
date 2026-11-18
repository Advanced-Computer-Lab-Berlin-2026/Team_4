// Member 2 - the ONLY file that talks to Stripe (Req 51, NFR 4).
// Everything else asks this file for "the Stripe client". That keeps three things in one place:
//   1. TEST MODE ONLY: a live key (sk_live_...) is refused, so no real card can ever be charged.
//   2. Not configured (no key in server/.env) -> isConfigured() is false and card payment is simply not offered.
//   3. Tests swap in a fake Stripe with setClient(), so no network or keys are needed to test our logic.
// Card numbers never reach ShareShed: the borrower types them on Stripe's own hosted page.
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');

let realClient = null;
let fake = null; // tests only

const isTestKey = (key) => /^(sk|rk)_test_/.test(key || '');

/** True when card payments can run: a TEST secret key is set (or a fake is installed in tests). */
function isConfigured() {
  return Boolean(fake) || isTestKey(env.STRIPE_SECRET_KEY);
}

/** The Stripe client, or a 503 "card payments unavailable" error. */
function client() {
  if (fake) return fake.client;
  if (!isTestKey(env.STRIPE_SECRET_KEY)) {
    throw new ApiError(503, 'Card payments are unavailable. Please try again later.');
  }
  if (!realClient) {
    const Stripe = require('stripe'); // loaded only when a key exists
    realClient = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return realClient;
}

/** Secret used to check that a webhook really came from Stripe. */
function webhookSecret() {
  const secret = fake ? fake.webhookSecret : env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new ApiError(503, 'Stripe webhooks are not configured');
  return secret;
}

/** Tests: setClient({ client, webhookSecret }) installs a fake Stripe; setClient(null) restores the real one. */
function setClient(fakeStripe) { fake = fakeStripe; }

if (env.STRIPE_SECRET_KEY && !isTestKey(env.STRIPE_SECRET_KEY)) {
  console.warn('STRIPE_SECRET_KEY is not a test key - card payments stay disabled (test mode only).');
}

module.exports = { isConfigured, client, webhookSecret, setClient };
