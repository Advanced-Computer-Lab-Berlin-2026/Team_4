import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import FeedbackProvider from './components/feedback/FeedbackProvider';
import { AuthProvider } from './context/AuthContext';
import './styles/global.css';

// Keep the existing nested routes; a data router enables useBlocker for history navigation.
const router = createBrowserRouter([{
  path: '*',
  element: <AuthProvider><FeedbackProvider><App /></FeedbackProvider></AuthProvider>,
}]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
