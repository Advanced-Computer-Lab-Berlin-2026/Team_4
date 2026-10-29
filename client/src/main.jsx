import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './styles/global.css';

// Keep the existing nested routes; a data router enables useBlocker for history navigation.
const router = createBrowserRouter([{
  path: '*',
  element: <AuthProvider><App /></AuthProvider>,
}]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
