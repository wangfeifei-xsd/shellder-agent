export const OPENAPI_JWT_ISSUER = 'shellder-openapi';

export interface OpenApiJwtPayload {
  sub: string;
  appName: string;
  clientId: string;
  allowedTenantIds: string[];
  allowedCapabilities: string[];
  iss?: string;
  iat?: number;
  exp?: number;
}

/** 经 OpenAPI 鉴权后挂载到 request.openApiApp 的应用上下文 */
export interface OpenApiAppContext {
  appId: string;
  appName: string;
  clientId: string;
  allowedTenantIds: string[];
  allowedCapabilities: string[];
}
