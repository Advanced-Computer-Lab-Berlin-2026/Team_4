// FOUNDATION - builds <Routes> from routeConfig.jsx. Do not edit.
import { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import routes from './routeConfig';
import Layout from '../components/layout/Layout';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import Spinner from '../components/common/Spinner';
import NotFoundPage from '../pages/NotFoundPage';

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {routes.map(({ path, access, element: Page }) => (
          <Route
            key={path}
            path={path}
            element={
              <ProtectedRoute access={access}>
                <Suspense fallback={<Spinner />}>
                  <Page />
                </Suspense>
              </ProtectedRoute>
            }
          />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
