import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 标记无需鉴权的路由（如登录） */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
