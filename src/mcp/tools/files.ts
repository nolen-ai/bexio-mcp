/**
 * MCP tools for the files domain: upload, download, preview, search and manage
 * files stored in bexio (3.0 API).
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { z } from 'zod';
import { defineTool, requireArg, searchCriteriaSchema, unknownAction } from '../registry.js';
import { documentResult } from '../binary.js';
import type { BexioClient } from '../../client/index.js';
import type { FilesApi } from '../../client/resources/files.js';

/**
 * Typed access to `client.files`. The integrator mounts {@link FilesApi} on
 * `BexioClient` as `files`; this accessor keeps the module compilable standalone.
 */
function filesApi(client: BexioClient): FilesApi {
  return (client as BexioClient & { files: FilesApi }).files;
}

const filePayloadSchema = z
  .object({
    name: z.string().max(255).describe('The name of the file'),
    is_archived: z.boolean().describe('Archived state of the file'),
    source_type: z
      .enum(['web', 'email', 'mobile'])
      .nullable()
      .describe('Type of the source (web, mobile, etc.) this file has been uploaded from'),
  })
  .partial()
  .describe('File fields for "update"; send only the fields to change (PATCH semantics).');

export const filesTools = [
  defineTool({
    name: 'bexio_files',
    title: 'bexio Files',
    description:
      'Manage files stored in bexio (uploads, attachments; 3.0 API). Actions: ' +
      '"list" (all files; optional archived_state, offset, order_by — order_by fields: id, created_at, source_id, uuid, name, size_in_bytes, comma-combinable with "_asc"/"_desc" suffix), ' +
      '"search" (search_criteria required; searchable fields: id, uuid, created_at, name, extension, size_in_bytes, mime_type, user_id, is_archived, source_id; optional archived_state, limit, offset), ' +
      '"get" (file metadata by id), ' +
      '"download" (file content by id; returns base64 or writes to optional save_path), ' +
      '"preview" (preview image of the file by id; returns base64 or writes to optional save_path), ' +
      '"usage" (where the file is attached: reference class, title, document number; by id), ' +
      '"upload" (create a new file from file_path on disk OR content_base64 + file_name; file_name overrides the file_path basename), ' +
      '"update" (id + payload: name, is_archived, source_type), ' +
      '"delete" (marks the file as deleted by id — cannot be undone).',
    group: 'files',
    writeActions: ['upload', 'update', 'delete'],
    destructiveActions: ['delete'],
    inputSchema: {
      action: z
        .enum(['list', 'search', 'get', 'download', 'preview', 'usage', 'upload', 'update', 'delete'])
        .describe('Operation to perform'),
      id: z
        .number()
        .int()
        .optional()
        .describe('File id (required for get/download/preview/usage/update/delete)'),
      search_criteria: searchCriteriaSchema.optional(),
      archived_state: z
        .enum(['all', 'archived', 'not_archived'])
        .optional()
        .describe('Include/exclude archived files for "list" and "search"'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(2000)
        .optional()
        .describe('Maximum number of results for "search" (default 500, max 2000)'),
      offset: z.number().int().min(0).optional().describe('Number of results to skip for "list"/"search"'),
      order_by: z
        .string()
        .optional()
        .describe(
          'Sort order for "list": id, created_at, source_id, uuid, name or size_in_bytes; ' +
            'append "_asc"/"_desc" and combine multiple fields with a comma',
        ),
      payload: filePayloadSchema.optional(),
      file_path: z.string().optional().describe('Path of a local file to upload (for "upload")'),
      content_base64: z
        .string()
        .optional()
        .describe('Base64-encoded file content to upload (for "upload", alternative to file_path)'),
      file_name: z
        .string()
        .optional()
        .describe('File name including extension (required for "upload" with content_base64; overrides the file_path basename)'),
      save_path: z
        .string()
        .optional()
        .describe('For "download"/"preview": write the file to this local path instead of returning base64 inline'),
    },
    handler: async (client, args) => {
      const files = filesApi(client);
      switch (args.action) {
        case 'list':
          return files.listFiles({
            archived_state: args.archived_state,
            offset: args.offset,
            order_by: args.order_by,
          });
        case 'search':
          return files.searchFiles(requireArg(args.search_criteria, 'search_criteria', 'search'), {
            archived_state: args.archived_state,
            limit: args.limit,
            offset: args.offset,
          });
        case 'get':
          return files.getFile(requireArg(args.id, 'id', 'get'));
        case 'download': {
          const fileId = requireArg(args.id, 'id', 'download');
          const bytes = await files.downloadFile(fileId);
          return documentResult({ name: `file-${fileId}`, bytes }, args.save_path);
        }
        case 'preview': {
          const fileId = requireArg(args.id, 'id', 'preview');
          const bytes = await files.previewFile(fileId);
          return documentResult({ name: `file-${fileId}-preview`, bytes }, args.save_path);
        }
        case 'usage':
          return files.getFileUsage(requireArg(args.id, 'id', 'usage'));
        case 'upload': {
          let content: Uint8Array;
          let name: string;
          if (args.file_path !== undefined) {
            content = await readFile(args.file_path);
            name = args.file_name ?? basename(args.file_path);
          } else {
            const base64 = requireArg(args.content_base64, 'file_path or content_base64', 'upload');
            content = Buffer.from(base64, 'base64');
            name = requireArg(args.file_name, 'file_name', 'upload');
          }
          return files.uploadFile({ name, content });
        }
        case 'update':
          return files.updateFile(
            requireArg(args.id, 'id', 'update'),
            requireArg(args.payload, 'payload', 'update'),
          );
        case 'delete':
          return files.deleteFile(requireArg(args.id, 'id', 'delete'));
        default:
          return unknownAction(args.action);
      }
    },
  }),
];

/** Operation IDs covered by the files tools (used by coverage tests). */
export const filesToolOperations = [
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
