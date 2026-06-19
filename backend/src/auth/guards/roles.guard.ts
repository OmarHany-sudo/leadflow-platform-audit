import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Role hierarchy: ADMIN > AGENCY_OWNER > SALES_MANAGER > SALES_REP > VIEWER
    const roleHierarchy: Record<UserRole, number> = {
      [UserRole.ADMIN]: 5,
      [UserRole.AGENCY_OWNER]: 4,
      [UserRole.SALES_MANAGER]: 3,
      [UserRole.SALES_REP]: 2,
      [UserRole.VIEWER]: 1,
    };

    const userRoleLevel = roleHierarchy[user.role as UserRole] || 0;
    const minRequiredLevel = Math.min(...requiredRoles.map(r => roleHierarchy[r] || 0));

    if (userRoleLevel >= minRequiredLevel) {
      return true;
    }

    throw new ForbiddenException(`Required role: ${requiredRoles.join(' or ')}`);
  }
}