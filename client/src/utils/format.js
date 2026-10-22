// FOUNDATION - shared formatting helpers
export const formatMoney = (n) =>
  new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' }).format(Number(n || 0));

export const formatDate = (d) =>
  d ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(d)) : '';

export const formatDateTime = (d) =>
  d ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d)) : '';
