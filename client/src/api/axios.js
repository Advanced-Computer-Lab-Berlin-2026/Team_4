// FOUNDATION - shared axios instance. Cookies (JWT) are sent automatically.
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

/** Turn any axios error into a user-friendly string:  setError(getErrorMessage(err)) */
export const getErrorMessage = (err) =>
  err?.response?.data?.message || err?.message || 'Something went wrong';

/** Field-level errors from the server: [{ field, message }] */
export const getFieldErrors = (err) => err?.response?.data?.errors || [];

export default api;
