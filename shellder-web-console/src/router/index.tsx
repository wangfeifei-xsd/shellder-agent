import { createHashRouter, Navigate } from 'react-router-dom';
import { appRoutes } from '@/routes';

const router = createHashRouter([
  ...appRoutes,
  { path: '*', element: <Navigate to="/" replace /> },
]);

export default router;
