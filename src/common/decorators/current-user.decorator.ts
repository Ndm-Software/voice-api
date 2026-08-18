import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

interface RequestWithUser {
  user?: AuthenticatedUser;
  headers: Record<string, string | string[] | undefined>;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext): any => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();

    const xUserHeader = request.headers['x-user'];
    let user: AuthenticatedUser | undefined = request.user;

    if (!user && typeof xUserHeader === 'string') {
      try {
        user = JSON.parse(xUserHeader) as AuthenticatedUser;
      } catch {
        user = undefined;
      }
    }

    if (data && user) {
      return user[data];
    }

    return user;
  },
);
