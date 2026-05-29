/** Agent 平台自有 JWT（iss=agent-platform，不与上层共享 Token；实施规格 §1.5） */
export const JWT_ISSUER = 'agent-platform';

/** JWT 载荷：含用户 ID、角色、可访问租户列表（验收标准 3） */
export interface JwtPayload {
  sub: string;
  username: string;
  roles: string[];
  tenantIds: string[];
  iss: string;
  iat?: number;
  exp?: number;
}

/** 经鉴权后挂载到 request.user 的当前用户上下文 */
export interface AuthUser {
  id: string;
  username: string;
  roles: string[];
  tenantIds: string[];
}
