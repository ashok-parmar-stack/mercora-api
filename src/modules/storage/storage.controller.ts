/// <reference path="../../types/multer.d.ts" />
import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Query,
  Body,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StorageService } from './storage.service';

// ─── Multer File Type ─────────────────────────────────────────────────────────
type MulterFile = Express.Multer.File;

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export class PresignedUploadDto {
  @ApiProperty({
    example: 'avatars/user-123.png',
    description: 'Target S3 key (path inside bucket)',
  })
  @IsString()
  key: string;

  @ApiPropertyOptional({
    example: 'image/png',
    description: 'MIME type of the file to be uploaded',
  })
  @IsOptional()
  @IsString()
  contentType?: string;

  @ApiPropertyOptional({
    example: 3600,
    description: 'Presigned URL expiry in seconds (min 60, max 604800)',
  })
  @IsOptional()
  @IsNumber()
  @Min(60)
  @Max(604800)
  @Type(() => Number)
  expiresIn?: number;
}

// ─── Controller ───────────────────────────────────────────────────────────────

/** Max file size: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

@ApiTags('Storage / File Uploads')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  // ── Direct File Upload (multipart/form-data via multer memory storage) ────

  @Post('upload')
  @ApiOperation({
    summary: 'Direct file upload via multipart/form-data',
    description:
      'Accepts a file via `multipart/form-data`, buffers it in memory using multer, ' +
      'then streams it to S3-compatible object storage. ' +
      'Optional `folder` query param organises files (e.g. "avatars", "invoices"). ' +
      'Max file size: 10 MB.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'File to upload (max 10 MB)' },
      },
    },
  })
  @ApiQuery({ name: 'folder', required: false, example: 'avatars', description: 'Storage folder prefix' })
  @ApiResponse({ status: 201, description: 'File uploaded – returns key, bucket, and public URL' })
  @ApiResponse({ status: 400, description: 'No file provided or file too large' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),           // buffer kept in RAM – safe for Vercel/serverless
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder = 'uploads',
  ) {
    if (!file) {
      throw new BadRequestException('No file provided. Send field name "file" in multipart/form-data.');
    }

    const key = this.storageService.generateKey(folder, file.originalname);

    const stored = await this.storageService.upload({
      key,
      body: file.buffer,           // multer memoryStorage → Buffer
      contentType: file.mimetype,
      metadata: {
        originalName: file.originalname,
        uploadedAt: new Date().toISOString(),
      },
    });

    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      message: 'File uploaded successfully',
      data: {
        ...stored,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      },
    };
  }

  // ── Presigned PUT URL (browser → S3 direct upload) ────────────────────────

  @Post('presigned-upload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate a presigned PUT URL for direct browser-to-S3 upload',
    description:
      'Returns a short-lived signed URL the browser uses to PUT a file directly to S3, ' +
      'bypassing the API server entirely (no bandwidth cost on the server).',
  })
  @ApiResponse({ status: 200, description: 'Presigned upload URL returned' })
  async getPresignedUploadUrl(@Body() dto: PresignedUploadDto) {
    const url = await this.storageService.getPresignedUploadUrl({
      key: dto.key,
      contentType: dto.contentType,
      expiresIn: dto.expiresIn ?? 3600,
    });

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Presigned upload URL generated',
      data: { url, key: dto.key, expiresIn: dto.expiresIn ?? 3600 },
    };
  }

  // ── Presigned GET URL (secure view / download) ────────────────────────────

  @Get('presigned-url')
  @ApiOperation({
    summary: 'Generate a presigned GET URL for secure file access',
    description: 'Returns a time-limited URL that grants temporary read access to a private S3 object.',
  })
  @ApiQuery({ name: 'key', description: 'S3 object key', example: 'avatars/user-123.png' })
  @ApiQuery({ name: 'expiresIn', required: false, description: 'Expiry in seconds (default 3600)' })
  @ApiResponse({ status: 200, description: 'Presigned view URL returned' })
  @ApiResponse({ status: 404, description: 'File not found in bucket' })
  async getPresignedViewUrl(
    @Query('key') key: string,
    @Query('expiresIn') expiresIn?: string,
  ) {
    if (!key) throw new BadRequestException('Query parameter "key" is required');

    const fileExists = await this.storageService.exists(key);
    if (!fileExists) throw new NotFoundException(`File "${key}" not found in bucket`);

    const url = await this.storageService.getPresignedViewUrl({
      key,
      expiresIn: expiresIn ? Number(expiresIn) : 3600,
    });

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Presigned view URL generated',
      data: { url, key, expiresIn: Number(expiresIn ?? 3600) },
    };
  }

  // ── File Metadata (HEAD – no download) ────────────────────────────────────

  @Get('metadata')
  @ApiOperation({
    summary: 'Fetch file metadata (HEAD request)',
    description: 'Returns size, content-type, last modified, ETag, and custom metadata without downloading the file body.',
  })
  @ApiQuery({ name: 'key', description: 'S3 object key', example: 'avatars/user-123.png' })
  @ApiResponse({ status: 200, description: 'Metadata returned' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async getMetadata(@Query('key') key: string) {
    if (!key) throw new BadRequestException('Query parameter "key" is required');

    const fileExists = await this.storageService.exists(key);
    if (!fileExists) throw new NotFoundException(`File "${key}" not found in bucket`);

    const metadata = await this.storageService.getMetadata(key);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'File metadata fetched',
      data: metadata,
    };
  }

  // ── List Files ────────────────────────────────────────────────────────────

  @Get('list')
  @ApiOperation({
    summary: 'List files under a folder prefix',
    description: 'Returns all objects whose key starts with the given prefix (like listing a folder).',
  })
  @ApiQuery({ name: 'prefix', required: false, example: 'avatars/', description: 'Folder prefix' })
  @ApiQuery({ name: 'limit', required: false, example: '50', description: 'Max results (default 100)' })
  @ApiResponse({ status: 200, description: 'File list returned' })
  async listFiles(
    @Query('prefix') prefix = '',
    @Query('limit') limit?: string,
  ) {
    const files = await this.storageService.list(prefix, limit ? Number(limit) : 100);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Files listed successfully',
      data: { prefix, count: files.length, files },
    };
  }

  // ── Delete File ───────────────────────────────────────────────────────────

  @Delete(':key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a file from storage',
    description: 'Permanently removes an object from the bucket. This action is irreversible.',
  })
  @ApiParam({ name: 'key', required: false, description: 'S3 object key', example: 'avatars/user-123.png' })
  @ApiQuery({ name: 'key', required: false, description: 'S3 object key (alternative for keys containing slashes)' })
  @ApiResponse({ status: 200, description: 'File deleted' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async deleteFile(
    @Param('key') paramKey?: string,
    @Query('key') queryKey?: string,
  ) {
    const key = paramKey || queryKey;
    if (!key) throw new BadRequestException('File key is required');

    const fileExists = await this.storageService.exists(key);
    if (!fileExists) throw new NotFoundException(`File "${key}" not found in bucket`);

    await this.storageService.delete(key);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'File deleted successfully',
      data: { key },
    };
  }
}
