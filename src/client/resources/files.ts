/**
 * Files resource (3.0 API): upload, download, preview, search and manage files.
 *
 * Covers operations tagged "Files" in the bexio API docs
 * (https://docs.bexio.com/#tag/Files).
 */
import type { BexioHttp } from '../http.js';

/** Type of the source (web, mobile, etc.) a file has been uploaded from. */
export type FileSourceType = 'web' | 'email' | 'mobile';

/** Archived-state filter of the list/search endpoints. */
export type FileArchivedState = 'all' | 'archived' | 'not_archived';

/** A file stored in bexio (named `BexioFile` to avoid clashing with the global `File`). */
export interface BexioFile {
  /** The id of the file. */
  id: number;
  /** The uuid of the file. */
  uuid: string;
  /** The name of the file. */
  name: string;
  /** The size of the file in bytes. */
  size_in_bytes: number;
  /** The extension of the file, e.g. `png`. */
  extension: string;
  /** The mime type of the file, e.g. `image/png`. */
  mime_type: string;
  /** Email of the sender if the file was added by email. */
  uploader_email: string | null;
  /** The id of the user which originally uploaded the file (references a user object). */
  user_id: number;
  /** Is file archived? */
  is_archived: boolean;
  /**
   * ID of the source (web, mobile, etc.) this file has been uploaded from.
   * @deprecated Use {@link BexioFile.source_type} instead.
   */
  source_id: number;
  /** Type of the source (web, mobile, etc.) this file has been uploaded from. */
  source_type: FileSourceType | null;
  /** Whether the file is referenced to a document or not. */
  is_referenced: boolean;
  /** File upload date (ISO 8601). */
  created_at: string;
}

/** Where a file is used (attached documents). */
export interface FileUsage {
  /** The id of the file. */
  id: number;
  /** The reference to the class this file is attached, e.g. `KbInvoice`. */
  ref_class: string;
  /** The title set on the reference class, e.g. `RE-00001`. */
  title: string;
  /** The internal document number set on the reference class. */
  document_nr: string;
}

/** PATCH payload for an existing file. All fields optional. */
export interface FileUpdate {
  /** The name of the file. */
  name?: string;
  /** Define archived state. */
  is_archived?: boolean;
  /** Type of the source (web, mobile, etc.) this file has been uploaded from. */
  source_type?: FileSourceType | null;
}

/** Response of DELETE `/3.0/files/{file_id}`. */
export interface FileDeleteResponse {
  /** If file got marked as deleted. */
  success: boolean;
}

/** File content to upload. */
export interface FileUpload {
  /** File name (including extension) sent as the multipart filename. */
  name: string;
  /** Raw file content. */
  content: Uint8Array;
  /** Optional MIME type of the content. */
  mimeType?: string;
}

/** Query parameters of GET `/3.0/files`. */
export interface ListFilesParams {
  /** Include/exclude archived files (`all`, `archived`, `not_archived`). */
  archived_state?: FileArchivedState;
  /** Skip over a number of elements by specifying an offset value for the query. */
  offset?: number;
  /**
   * Order of the results: `id`, `created_at`, `source_id`, `uuid`, `name` or
   * `size_in_bytes`. Combine multiple fields with a comma; append `_asc`/`_desc`
   * to sort ascending (default) or descending.
   */
  order_by?: string;
}

/** Query parameters of POST `/3.0/files/search`. */
export interface SearchFilesParams {
  /** Include/exclude archived files (`all`, `archived`, `not_archived`). */
  archived_state?: FileArchivedState;
  /** Limit the number of results (max is 2000). */
  limit?: number;
  /** Skip over a number of elements by specifying an offset value for the query. */
  offset?: number;
}

/** Comparison operators of the 3.0 files search endpoint. */
export type FileSearchOperator =
  | '='
  | '=='
  | 'equal'
  | '!='
  | 'not_equal'
  | '>'
  | 'greater_than'
  | '>='
  | 'greater_equal'
  | '<'
  | 'less_than'
  | '<='
  | 'less_equal'
  | 'like'
  | 'not_like'
  | 'is_null'
  | 'not_null'
  | 'in'
  | 'not_in';

/**
 * One condition of a 3.0 files search request. Conditions are combined with
 * logical AND; `criteria` defaults to `like` when omitted.
 */
export interface FileSearchCriteria {
  /** Field which should be searched over. */
  field: string;
  /** Value to search for (the API documents string values; scalars are accepted). */
  value: string | number | boolean | null | Array<string | number>;
  /** Comparison operator (default: `like`). */
  criteria?: FileSearchOperator;
}

export class FilesApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of files.
   * @see v3ReadFiles — scope `file`
   */
  listFiles(params?: ListFilesParams): Promise<BexioFile[]> {
    return this.http.get('/3.0/files', { query: { ...params } });
  }

  /**
   * Search files. Supported search fields: `id`, `uuid`, `created_at`, `name`,
   * `extension`, `size_in_bytes`, `mime_type`, `user_id`, `is_archived`, `source_id`.
   * @see v3SearchFile — scope `file`
   */
  searchFiles(criteria: FileSearchCriteria[], params?: SearchFilesParams): Promise<BexioFile[]> {
    return this.http.post('/3.0/files/search', { body: criteria, query: { ...params } });
  }

  /**
   * Get single file (metadata only; use {@link downloadFile} for the content).
   * @see v3ReadFile — scope `file`
   */
  getFile(fileId: number): Promise<BexioFile> {
    return this.http.get(`/3.0/files/${fileId}`);
  }

  /**
   * Download file content as raw bytes.
   * @see v3DownloadFile — scope `file`
   */
  downloadFile(fileId: number): Promise<Uint8Array> {
    return this.http.get(`/3.0/files/${fileId}/download`, { responseType: 'binary' });
  }

  /**
   * Get file preview (rendered preview image) as raw bytes.
   * @see v3PreviewFile — scope `file`
   */
  previewFile(fileId: number): Promise<Uint8Array> {
    return this.http.get(`/3.0/files/${fileId}/preview`, { responseType: 'binary' });
  }

  /**
   * Show file usage (which document/reference class the file is attached to).
   * @see v3ShowFile — scope `file`
   */
  getFileUsage(fileId: number): Promise<FileUsage> {
    return this.http.get(`/3.0/files/${fileId}/usage`);
  }

  /**
   * Create new file (multipart upload). Returns the created file(s) as an array.
   * @see v3CreateFile — scope `file`
   */
  uploadFile(file: FileUpload): Promise<BexioFile[]> {
    const form = new FormData();
    // Copy into a fresh ArrayBuffer-backed view so Blob accepts it regardless of the
    // source buffer type (Node Buffer, SharedArrayBuffer-backed views, strings).
    const bytes = typeof file.content === 'string' ? new TextEncoder().encode(file.content) : Uint8Array.from(file.content);
    const blob = file.mimeType !== undefined ? new Blob([bytes], { type: file.mimeType }) : new Blob([bytes]);
    form.append('file', blob, file.name);
    return this.http.post('/3.0/files', { form });
  }

  /**
   * Update existing file (name, archived state, source type).
   * @see v3UpdateFile — scope `file`
   */
  updateFile(fileId: number, payload: FileUpdate): Promise<BexioFile> {
    return this.http.patch(`/3.0/files/${fileId}`, { body: payload });
  }

  /**
   * Delete an existing file (sets its state to deleted; cannot be undone).
   * @see v3DeleteFile — scope `file`
   */
  deleteFile(fileId: number): Promise<FileDeleteResponse> {
    return this.http.delete(`/3.0/files/${fileId}`);
  }
}

/** Operation IDs of the bexio API covered by {@link FilesApi} (used by coverage tests). */
export const filesOperations = [
  'v3ReadFiles',
  'v3SearchFile',
  'v3ReadFile',
  'v3DownloadFile',
  'v3PreviewFile',
  'v3ShowFile',
  'v3CreateFile',
  'v3UpdateFile',
  'v3DeleteFile',
] as const;
