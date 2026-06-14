import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type JwtUser = {
  sub: string;
  email: string;
  role: 'USER' | 'ADMIN';
  name: string;
};

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<{ user: JwtUser }>();
  return request.user;
});
