import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { SessionService } from '../services/session.service';
import { JwtPayload } from '../services/token.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly sessionService: SessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('auth.jwtAccessSecret') ||
        'mercora-jwt-access-secret-key-super-secure-production-2026',
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

    // User account status check
    const user = session.user;
    if (user.status && (user.status.code === 'INACTIVE' || user.status.code === 'SUSPENDED')) {
      throw new UnauthorizedException('Account is inactive or suspended');
    }

    // Async throttled activity touch (non-blocking)
    this.sessionService.touchActivity(session.id);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      companyId: user.companyId,
      statusId: user.statusId,
      isEmailVerified: user.isEmailVerified,
      sessionId: session.id,
    };
  }
}
