import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercoraLogger } from '../../common/logger';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

export interface UploadOptions {
  /** Destination key (path) inside the bucket. e.g. "avatars/user-123.png" */
  key: string;
  /** Raw file buffer */
  body: Buffer | Readable | string;
  /** MIME type e.g. "image/png" */
  contentType?: string;
  /** Extra S3 metadata */
  metadata?: Record<string, string>;
  /** "public-read" | "private" — defaults to private */
  acl?: string;
}

export interface PresignedUrlOptions {
  /** S3 key of the object */
  key: string;
  /** Expiry in seconds — defaults to 3600 (1 hour) */
  expiresIn?: number;
}

export interface PresignedUploadOptions extends PresignedUrlOptions {
  contentType?: string;
}

export interface FileMetadata {
  key: string;
  size?: number;
  contentType?: string;
  lastModified?: Date;
  etag?: string;
  metadata?: Record<string, string>;
}

export interface StoredFile {
  key: string;
  bucket: string;
  /** Public endpoint URL (if bucket is public) */
  publicUrl: string;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new MercoraLogger(StorageService.name);
  private client: S3Client;
  private bucket: string;
  private endpointUrl: string;

  constructor(private readonly config: ConfigService) { }

  onModuleInit() {
    this.bucket = this.config.get<string>('STORAGE_BUCKET_NAME') || 'assets';
    this.endpointUrl = this.config.get<string>('AWS_ENDPOINT_URL_S3') || '';

    const region = this.config.get<string>('AWS_REGION') || 'us-east-2';
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID') || '';
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY') || '';
    const forcePathStyle =
      this.config.get<string>('STORAGE_FORCE_PATH_STYLE') !== 'false';

    this.client = new S3Client({
      region,
      forcePathStyle,
      ...(this.endpointUrl ? { endpoint: this.endpointUrl } : {}),
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });

    this.logger.log(
      `StorageService initialised — bucket: "${this.bucket}", endpoint: "${this.endpointUrl || 'AWS default'}"`,
    );
  }

  // ────────────────────────────────────────────────────────────────
  //  Upload
  // ────────────────────────────────────────────────────────────────

  /**
   * Upload a file directly to S3.
   * Returns the stored file metadata including its public URL.
   */
  async upload(options: UploadOptions): Promise<StoredFile> {
    const { key, body, contentType, metadata, acl } = options;

    const params: PutObjectCommandInput = {
      Bucket: this.bucket,
      Key: key,
      Body: body as any,
      ...(contentType ? { ContentType: contentType } : {}),
      ...(metadata ? { Metadata: metadata } : {}),
      ...(acl ? { ACL: acl as any } : {}),
    };

    await this.client.send(new PutObjectCommand(params));

    this.logger.debug(`Uploaded: ${key}`);

    return {
      key,
      bucket: this.bucket,
      publicUrl: this.buildPublicUrl(key),
    };
  }

  // ────────────────────────────────────────────────────────────────
  //  Presigned Upload URL (browser-side direct upload)
  // ────────────────────────────────────────────────────────────────

  /**
   * Generate a presigned PUT URL so the client can upload directly to S3
   * without routing file bytes through the NestJS server.
   */
  async getPresignedUploadUrl(options: PresignedUploadOptions): Promise<string> {
    const { key, expiresIn = 3600, contentType } = options;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(contentType ? { ContentType: contentType } : {}),
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });
    this.logger.debug(`Presigned upload URL generated for key: ${key}`);
    return url;
  }

  // ────────────────────────────────────────────────────────────────
  //  Presigned Download / View URL
  // ────────────────────────────────────────────────────────────────

  /**
   * Generate a presigned GET URL to let a client securely download / view a
   * private object without exposing long-lived credentials.
   */
  async getPresignedViewUrl(options: PresignedUrlOptions): Promise<string> {
    const { key, expiresIn = 3600 } = options;

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });
    this.logger.debug(`Presigned view URL generated for key: ${key}`);
    return url;
  }

  // ────────────────────────────────────────────────────────────────
  //  Delete
  // ────────────────────────────────────────────────────────────────

  /** Permanently delete an object from the bucket. */
  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    this.logger.debug(`Deleted: ${key}`);
  }

  // ────────────────────────────────────────────────────────────────
  //  Metadata
  // ────────────────────────────────────────────────────────────────

  /** Fetch object metadata (HEAD request — no body downloaded). */
  async getMetadata(key: string): Promise<FileMetadata> {
    const res = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    return {
      key,
      size: res.ContentLength,
      contentType: res.ContentType,
      lastModified: res.LastModified,
      etag: res.ETag?.replace(/"/g, ''),
      metadata: res.Metadata,
    };
  }

  /** Check whether an object exists in the bucket. */
  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  List
  // ────────────────────────────────────────────────────────────────

  /** List objects under a given prefix (folder). */
  async list(prefix: string, maxKeys = 100): Promise<FileMetadata[]> {
    const res = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
      }),
    );

    return (res.Contents ?? []).map((obj) => ({
      key: obj.Key!,
      size: obj.Size,
      lastModified: obj.LastModified,
      etag: obj.ETag?.replace(/"/g, ''),
    }));
  }

  // ────────────────────────────────────────────────────────────────
  //  Copy
  // ────────────────────────────────────────────────────────────────

  /** Copy an object within the same bucket (e.g. rename). */
  async copy(sourceKey: string, destinationKey: string): Promise<StoredFile> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destinationKey,
      }),
    );

    this.logger.debug(`Copied: ${sourceKey} → ${destinationKey}`);

    return {
      key: destinationKey,
      bucket: this.bucket,
      publicUrl: this.buildPublicUrl(destinationKey),
    };
  }

  // ────────────────────────────────────────────────────────────────
  //  Helpers
  // ────────────────────────────────────────────────────────────────

  /** Build the public URL for an object (works when bucket is public). */
  buildPublicUrl(key: string): string {
    if (this.endpointUrl) {
      return `${this.endpointUrl.replace(/\/$/, '')}/${this.bucket}/${key}`;
    }
    return `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }

  /**
   * Generate a deterministic, collision-safe S3 key from an original filename.
   * Pattern: {folder}/{timestamp}-{random}.{ext}
   */
  generateKey(folder: string, originalName: string): string {
    const ext = originalName.split('.').pop()?.toLowerCase() ?? 'bin';
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    return `${folder}/${timestamp}-${random}.${ext}`;
  }
}
