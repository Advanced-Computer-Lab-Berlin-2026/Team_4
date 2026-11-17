import api from './axios';

export async function listPromoCodes(page = 1, signal) {
  return (await api.get('/promo-codes', { params: { page }, signal })).data;
}

export async function createPromoCode(promo) {
  return (await api.post('/promo-codes', promo)).data.promoCode;
}

export async function listPromoRedemptions({ page = 1, promoCodeId }, signal) {
  return (await api.get('/promo-codes/usage', { params: { page, promoCodeId }, signal })).data;
}
