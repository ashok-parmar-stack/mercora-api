import { BadRequestException } from '@nestjs/common';

export const SAFE_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
] as const;

export const ALLOWED_EXTENSIONS_BY_MIME: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'application/pdf': ['.pdf'],
};

const SAFE_FOLDER_REGEX = /^[a-zA-Z0-9_-]{1,40}(?:\/[a-zA-Z0-9_-]{1,40})?$/;

export function sanitizeStorageFolder(folder?: string): string {
  const cleaned = (folder || 'uploads').trim().replace(/^\/+|\/+$/g, '');
  if (!cleaned || cleaned.includes('..') || !SAFE_FOLDER_REGEX.test(cleaned)) {
    throw new BadRequestException(
      'Invalid folder name. Only alphanumeric characters, hyphens, and underscores are allowed.',
    );
  }
  return cleaned;
}

export function sanitizeStorageKey(key?: string): string {
  const cleaned = (key || '').trim().replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('..') || cleaned.includes('\\') || cleaned.length > 300) {
    throw new BadRequestException('Invalid storage key format.');
  }
  return cleaned;
}

export function validateMagicBytes(buffer: Buffer, mimetype: string): boolean {
  if (!buffer || buffer.length < 4) return false;

  switch (mimetype) {
    case 'image/jpeg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'image/png':
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );
    case 'image/gif':
      return (
        buffer[0] === 0x47 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x38
      );
    case 'image/webp':
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    case 'application/pdf':
      return buffer.subarray(0, 4).toString('ascii') === '%PDF';
    default:
      return false;
  }
}

export function validateUploadedFile(file: {
  originalname: string;
  mimetype: string;
  buffer?: Buffer;
  size: number;
}): void {
  const mime = (file.mimetype || '').toLowerCase();
  if (!(SAFE_UPLOAD_MIME_TYPES as readonly string[]).includes(mime)) {
    throw new BadRequestException(
      `Unsupported file type '${mime}'. Allowed: JPG, PNG, WEBP, GIF, PDF.`,
    );
  }

  const lowerName = (file.originalname || '').toLowerCase();
  const dotIdx = lowerName.lastIndexOf('.');
  const ext = dotIdx !== -1 ? lowerName.slice(dotIdx) : '';
  const allowedExts = ALLOWED_EXTENSIONS_BY_MIME[mime] || [];
  if (!allowedExts.includes(ext)) {
    throw new BadRequestException(
      `File extension '${ext || 'none'}' does not match MIME type '${mime}'.`,
    );
  }

  if (file.buffer && !validateMagicBytes(file.buffer, mime)) {
    throw new BadRequestException(
      'Uploaded file signature does not match declared MIME type.',
    );
  }
}
