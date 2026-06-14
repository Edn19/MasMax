import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { JwtUser } from './current-user.decorator';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: JwtUser }>();
    if (request.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Solo administradores');
    }
    return true;
  }
}
