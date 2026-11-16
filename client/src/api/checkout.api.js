import api from './axios';

export async function getCheckoutQuote(selection) {
  return (await api.post('/checkout/quote', selection)).data.quote;
}

export async function submitCheckout(data) {
  return (await api.post('/checkout', data)).data.checkout;
}

export async function getCheckoutStatus(id) {
  return (await api.get('/checkout/' + id)).data.checkout;
}
