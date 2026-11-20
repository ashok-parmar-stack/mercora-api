import { Readable } from 'stream';

declare global {
  namespace Express {
    namespace Multer {
      interface File {
        /** Field name specified in the form */
        fieldname: string;
        /** Name of the file on the user's computer */
        originalname: string;
        /** Encoding type of the file */
        encoding: string;
        /** Mime type of the file */
        mimetype: string;
        /** Size of the file in bytes */
        size: number;
        /** A Buffer of the entire file (MemoryStorage) */
        buffer: Buffer;
        /** The folder to which the file has been saved (DiskStorage) */
        destination?: string;
        /** The name of the file within the destination (DiskStorage) */
        filename?: string;
        /** Location of the uploaded file (DiskStorage) */
        path?: string;
        /** A readable stream of the file */
        stream?: Readable;
      }
    }
  }
}

declare module 'multer' {
  export interface StorageEngine {
    _handleFile(req: any, file: any, cb: (error?: any, info?: any) => void): void;
    _removeFile(req: any, file: any, cb: (error: any) => void): void;
  }
  export interface Options {
    dest?: string;
    storage?: StorageEngine;
    limits?: any;
    preservePath?: boolean;
    fileFilter?(req: any, file: Express.Multer.File, cb: (error: Error | null, acceptFile: boolean) => void): void;
  }
  export function memoryStorage(): StorageEngine;
  export function diskStorage(options?: any): StorageEngine;
  const multer: (options?: Options) => any;
  export default multer;
}

export {};
