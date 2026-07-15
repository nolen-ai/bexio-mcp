/**
 * Helpers for tools that return documents (PDFs, file downloads).
 *
 * bexio returns documents either as JSON `{ name, size, mime, content }` with
 * base64 content (PDF endpoints) or as raw bytes (file download endpoints).
 * Tools accept an optional `save_path`; when given, the document is written to
 * disk and only metadata is returned — keeping large blobs out of the context.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ToolResult } from './registry.js';

/** Zod-free descriptor of a fetched document. */
export interface DocumentPayload {
  /** Suggested file name. */
  name?: string;
  /** MIME type, e.g. `application/pdf`. */
  mime?: string;
  /** Base64-encoded content (mutually exclusive with `bytes`). */
  base64?: string;
  /** Raw content (mutually exclusive with `base64`). */
  bytes?: Uint8Array;
}

const INLINE_BASE64_LIMIT = 700_000; // ~0.5 MB of raw data

/**
 * Renders a document either to disk (when `savePath` is given) or inline as base64.
 * Inline output is refused above {@link INLINE_BASE64_LIMIT} to protect the context window.
 */
export async function documentResult(doc: DocumentPayload, savePath?: string): Promise<ToolResult> {
  const bytes = doc.bytes ?? (doc.base64 !== undefined ? Buffer.from(doc.base64, 'base64') : undefined);
  if (bytes === undefined) {
    return { content: [{ type: 'text', text: 'The API returned no document content.' }], isError: true };
  }

  if (savePath) {
    const target = resolve(savePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    const meta = {
      saved_to: target,
      name: doc.name,
      mime: doc.mime,
      size_bytes: bytes.byteLength,
    };
    return { content: [{ type: 'text', text: JSON.stringify(meta, null, 2) }] };
  }

  const base64 = doc.base64 ?? Buffer.from(bytes).toString('base64');
  if (base64.length > INLINE_BASE64_LIMIT) {
    return {
      content: [
        {
          type: 'text',
          text:
            `The document is too large to return inline (${bytes.byteLength} bytes). ` +
            `Call the tool again with "save_path" set to write it to disk.`,
        },
      ],
      isError: true,
    };
  }
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ name: doc.name, mime: doc.mime, size_bytes: bytes.byteLength, content_base64: base64 }, null, 2),
      },
    ],
  };
}
