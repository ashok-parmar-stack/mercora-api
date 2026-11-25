import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  SessionEntity,
  SessionRevocationReason,
} from '../../../database/entities/session.entity';

export interface SessionMetadata {
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  // In-memory throttle map to avoid heavy DB writes for activity timestamp updates
  private readonly activityThrottleMap = new Map<string, number>();

  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessionRepo: Repository<SessionEntity>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Enforces: ONE USER ID = MAXIMUM ONE ACTIVE SESSION
   * Atomically revokes any existing active session and creates a new active session.
   */
  async createSession(
    userId: string,
    refreshTokenHash: string,
    meta?: SessionMetadata,
  ): Promise<SessionEntity> {
    const sessionLifetimeDays = 30; // 30 days absolute expiration
    const expiresAt = new Date(Date.now() + sessionLifetimeDays * 24 * 60 * 60 * 1000);

    return this.dataSource.transaction(async (manager) => {
      // 1. Atomically revoke all existing active sessions for this user using raw SQL IS NULL
      const revokeResult = await manager
        .createQueryBuilder()
        .update(SessionEntity)
        .set({
          revokedAt: new Date(),
          revocationReason: 'NEW_LOGIN' as SessionRevocationReason,
        })
        .where('user_id = :userId AND revoked_at IS NULL', { userId })
        .execute();

      if (revokeResult.affected && revokeResult.affected > 0) {
        this.logger.log(
          `Revoked ${revokeResult.affected} previous active session(s) for user [${userId}] due to NEW_LOGIN`,
        );
      }

      // 2. Create the brand new active session
      const newSession = manager.create(SessionEntity, {
        userId,
        refreshTokenHash,
        deviceId: meta?.deviceId,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        expiresAt,
        lastActivityAt: new Date(),
        revokedAt: null,
      });

      const saved = await manager.save(newSession);
      this.logger.log(`Created active session [${saved.id}] for user [${userId}]`);
      return saved;
    });
  }

  /**
   * Validate and retrieve active session with absolute & inactivity expiration checks
   */
  async getActiveSession(sessionId: string): Promise<SessionEntity | null> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      relations: ['user', 'user.role', 'user.status'],
    });

    if (!session) return null;

    // Check if session has been explicitly revoked
    if (session.revokedAt) return null;

    const now = new Date();

    // 1. Check Absolute Expiration
    if (session.expiresAt && session.expiresAt.getTime() <= now.getTime()) {
      await this.revokeSession(session.id, 'EXPIRED');
      return null;
    }

    // 2. Check Inactivity Expiration
    const inactivityHours =
      this.configService.get<number>('auth.sessionInactivityHours') || 168; // 7 days
    const inactivityTimeoutMs = inactivityHours * 60 * 60 * 1000;

    if (
      session.lastActivityAt &&
      now.getTime() - session.lastActivityAt.getTime() > inactivityTimeoutMs
    ) {
      await this.revokeSession(session.id, 'INACTIVITY');
      return null;
    }

    return session;
  }

  /**
   * Find active session by user ID
   */
  async getActiveSessionByUserId(userId: string): Promise<SessionEntity | null> {
    return this.sessionRepo.findOne({
      where: {
        userId,
        revokedAt: IsNull(),
      },
    });
  }

  /**
   * Rotate refresh token hash on /auth/refresh
   */
  async rotateRefreshToken(
    sessionId: string,
    newRefreshTokenHash: string,
  ): Promise<void> {
    await this.sessionRepo.update(sessionId, {
      refreshTokenHash: newRefreshTokenHash,
      lastActivityAt: new Date(),
    });
  }

  /**
   * Revoke a specific session with reason
   */
  async revokeSession(
    sessionId: string,
    reason: SessionRevocationReason,
  ): Promise<void> {
    await this.sessionRepo.update(sessionId, {
      revokedAt: new Date(),
      revocationReason: reason,
    });
    this.logger.log(`Session [${sessionId}] revoked with reason [${reason}]`);
  }

  /**
   * Revoke all active sessions for a user (e.g. on password reset or security breach)
   */
  async revokeAllUserSessions(
    userId: string,
    reason: SessionRevocationReason,
  ): Promise<void> {
    await this.sessionRepo
      .createQueryBuilder()
      .update(SessionEntity)
      .set({
        revokedAt: new Date(),
        revocationReason: reason,
      })
      .where('user_id = :userId AND revoked_at IS NULL', { userId })
      .execute();

    this.logger.log(`All active sessions for user [${userId}] revoked with reason [${reason}]`);
  }

  /**
   * Throttled activity timestamp update (max once per 5 minutes per session)
   */
  async touchActivity(sessionId: string): Promise<void> {
    const now = Date.now();
    const lastTouched = this.activityThrottleMap.get(sessionId) || 0;
    const throttleMs = 5 * 60 * 1000; // 5 minutes

    if (now - lastTouched < throttleMs) {
      return;
    }

    this.activityThrottleMap.set(sessionId, now);
    try {
      await this.sessionRepo.update(sessionId, {
        lastActivityAt: new Date(),
      });
    } catch (err) {
      this.logger.warn(`Could not update lastActivityAt for session [${sessionId}]: ${err.message}`);
    }
  }
}
