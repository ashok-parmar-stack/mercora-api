import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ArgumentsHost, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import {
  sanitizeStorageFolder,
  sanitizeStorageKey,
  validateMagicBytes,
  validateUploadedFile,
} from '../src/common/utils/file-validation.util';
import { sanitizeLogData } from '../src/common/logger/sanitizer.util';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('File Validation Utilities', () => {
  it('blocks path traversal in folders and storage keys', () => {
    assert.throws(() => sanitizeStorageFolder('../../etc'), BadRequestException);
    assert.throws(() => sanitizeStorageFolder('bad\\folder'), BadRequestException);
    assert.equal(sanitizeStorageFolder('/avatars/team/'), 'avatars/team');

    assert.throws(() => sanitizeStorageKey('../secret.env'), BadRequestException);
    assert.throws(() => sanitizeStorageKey('a\\b.png'), BadRequestException);
    assert.equal(sanitizeStorageKey('/avatars/logo.png'), 'avatars/logo.png');
  });

  it('rejects SVG uploads and mismatched magic bytes', () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(validateMagicBytes(pngHeader, 'image/png'), true);
    assert.equal(validateMagicBytes(pngHeader, 'image/jpeg'), false);

    assert.throws(
      () =>
        validateUploadedFile({
          originalname: 'xss.svg',
          mimetype: 'image/svg+xml',
          buffer: Buffer.from('<svg></svg>'),
          size: 12,
        }),
      BadRequestException,
    );

    assert.throws(
      () =>
        validateUploadedFile({
          originalname: 'fake.jpg',
          mimetype: 'image/jpeg',
          buffer: pngHeader,
          size: pngHeader.length,
        }),
      BadRequestException,
    );

    assert.doesNotThrow(() =>
      validateUploadedFile({
        originalname: 'avatar.png',
        mimetype: 'image/png',
        buffer: pngHeader,
        size: pngHeader.length,
      }),
    );
  });
});

describe('Log Sanitizer', () => {
  it('redacts sensitive secrets, bearer tokens, and masks email PII', () => {
    const sanitized = sanitizeLogData({
      authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.secret',
      password: 'MySecretPassword!',
      refreshToken: 'rt_123456',
      email: 'alice.smith@mercora.com',
      nested: {
        apiKey: 'sk-live-secret',
        safeField: 'hello',
      },
    }) as Record<string, any>;

    assert.equal(sanitized.authorization, '[REDACTED]');
    assert.equal(sanitized.password, '[REDACTED]');
    assert.equal(sanitized.refreshToken, '[REDACTED]');
    assert.equal(sanitized.email, 'a***h@mercora.com');
    assert.equal(sanitized.nested.apiKey, '[REDACTED]');
    assert.equal(sanitized.nested.safeField, 'hello');
  });
});

describe('AllExceptionsFilter', () => {
  function runFilter(exception: unknown) {
    let statusAssigned = 0;
    let payloadSent: any = null;
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          originalUrl: '/api/businesses?debug=1',
          requestId: 'req-test-123',
          query: { debug: '1' },
        }),
        getResponse: () => ({
          status: (code: number) => {
            statusAssigned = code;
            return {
              json: (body: any) => {
                payloadSent = body;
              },
            };
          },
        }),
      }),
    } as unknown as ArgumentsHost;

    new AllExceptionsFilter().catch(exception, host);
    return { statusAssigned, payloadSent };
  }

  it('maps PostgreSQL unique violation (23505) to 409 Conflict without leaking SQL', () => {
    const err = new QueryFailedError('INSERT INTO ...', [], { code: '23505' } as any);
    const { statusAssigned, payloadSent } = runFilter(err);

    assert.equal(statusAssigned, HttpStatus.CONFLICT);
    assert.equal(payloadSent.statusCode, 409);
    assert.equal(payloadSent.requestId, 'req-test-123');
    assert.equal(payloadSent.path, '/api/businesses');
    assert.equal(String(payloadSent.message).includes('INSERT INTO'), false);
  });

  it('preserves HttpException status and structured validation errors', () => {
    const err = new HttpException(
      { message: 'Validation failed', errors: { name: 'Required' } },
      HttpStatus.BAD_REQUEST,
    );
    const { statusAssigned, payloadSent } = runFilter(err);
    assert.equal(statusAssigned, 400);
    assert.deepEqual(payloadSent.errors, { name: 'Required' });
  });
});
