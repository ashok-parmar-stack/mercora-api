import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../../database/entities';
import { MercoraLogger } from '../../../common/logger';
import { AuditService } from '../../../common/audit';
import { BaseEntityService } from '../../../common/services';
import { toSlug } from '../../../common/services/slug.util';
import { CreateUserDto } from '../dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class CreateUserService extends BaseEntityService<UserEntity> {
  protected readonly entityName = 'User';
  protected readonly logger = new MercoraLogger(CreateUserService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    protected readonly audit: AuditService,
  ) {
    super(userRepo);
  }

  /**
   * Create a new user with automatic unique slug generation.
   * Debugging: If user creation, email duplication, or slug collisions occur, debug only this method.
   */
  async create(dto: CreateUserDto, actorId?: string): Promise<UserEntity> {
    this.logger.debug('Creating new user', { email: dto.email, name: dto.name });

    // Validate email uniqueness
    await this.ensureUnique('email', dto.email);

    // Generate or validate slug (normalize custom slug, or auto-generate from name/email)
    const fallbackSeed = dto.name?.trim() || dto.email.split('@')[0];
    const requestedSlug = dto.slug?.trim() ? toSlug(dto.slug) : '';
    let slug: string;
    if (requestedSlug) {
      await this.ensureUnique('slug', requestedSlug);
      slug = requestedSlug;
    } else {
      slug = await this.generateUniqueSlug(fallbackSeed, 'slug');
    }

    // Securely hash password if provided
    let hashedPassword = dto.password;
    if (
      hashedPassword &&
      !hashedPassword.startsWith('$2b$') &&
      !hashedPassword.startsWith('$2a$') &&
      !hashedPassword.startsWith('$2y$')
    ) {
      hashedPassword = await bcrypt.hash(hashedPassword, 12);
    }

    const newUser = this.userRepo.create({
      ...dto,
      password: hashedPassword,
      slug,
    });

    const savedUser = await this.userRepo.save(newUser);

    // Audit log & debug trace
    await this.recordAudit({
      userId: actorId,
      action: 'CREATE_USER',
      module: 'USER_MANAGEMENT',
      entityType: 'UserEntity',
      entityId: savedUser.id,
      newData: {
        id: savedUser.id,
        email: savedUser.email,
        slug: savedUser.slug,
        roleId: savedUser.roleId,
      },
    });

    this.logger.info(`User created successfully: ${savedUser.email} (slug: ${savedUser.slug})`, {
      userId: savedUser.id,
      slug: savedUser.slug,
    });

    return savedUser;
  }
}
