import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { SessionService } from '../services/session.service';
import { JwtPayload } from '../services/token.service';

const COOKIE_ACCESS_TOKEN = 'mercora_access_token';

/**
 * Extracts access JWT from `mercora_access_token` httpOnly cookie when
 * the request originates from same-origin browser/Next.js proxy calls.
 */
function extractJwtFromCookie(req: Request): string | null {
  const rawCookie = req?.headers?.cookie;
  if (!rawCookie) return null;

  for (const part of rawCookie.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex).trim();
    if (key === COOKIE_ACCESS_TOKEN) {
      const value = part.slice(eqIndex + 1).trim();
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly sessionService: SessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        extractJwtFromCookie,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('auth.jwtAccessSecret'),
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sessionId || !payload.sub) {
      throw new UnauthorizedException('Invalid token structure');
    }

    // Dynamic Live Session Check: Ensures session has not been revoked by a new login
    const session = await this.sessionService.getActiveSession(payload.sessionId);
    if (!session) {
      throw new UnauthorizedException(
        'Session has been revoked or expired. A newer login may have occurred on another device.',
      );
    }

    if (!session.user) {
      throw new UnauthorizedException('User associated with session not found');
    }

    // User account status check (now backed by joined user.status relation)
    const user = session.user;
    if (
      user.status &&
      (user.status.code === 'INACTIVE' ||
        user.status.code === 'SUSPENDED' ||
        user.status.code === 'PENDING')
    ) {
      throw new UnauthorizedException('Account is inactive, pending, or suspended');
    }

    // Async throttled activity touch (non-blocking)
    this.sessionService.touchActivity(session.id);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      role: user.role?.code || payload.role || 'CUSTOMER',
      companyId: user.companyId,
      statusId: user.statusId,
      statusCode: user.status?.code,
      isEmailVerified: user.isEmailVerified,
      sessionId: session.id,
    };
  }
}
