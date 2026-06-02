'use client';

import { Navigate, useLocation } from 'react-router-dom';

/** 旧路径兼容：/connectors/db-schema → /query/db-er */
export default function DbSchemaLegacyRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/query/db-er${search}`} replace />;
}
