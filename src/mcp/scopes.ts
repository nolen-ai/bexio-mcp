/**
 * bexio API scopes required per tool group, derived from the per-operation
 * `security` declarations of the official OpenAPI specification.
 *
 * Notes from the spec:
 * - Write scopes imply the matching read scope (e.g. `contact_edit` ⊃ `contact_show`).
 * - Some read endpoints genuinely require write-ish scopes (stock reads need
 *   `stock_edit`, all accounting endpoints use `accounting`, file endpoints use `file`).
 * - The pseudo-scope `general` that appears on some operations is granted
 *   implicitly and must NOT be requested from the IdP.
 */
import type { ToolGroup, WriteMode } from './registry.js';

interface GroupScopes {
  /** Scopes needed for the group's read (GET/search) operations. */
  read: readonly string[];
  /** Additional scopes needed for the group's write operations. */
  write: readonly string[];
}

export const GROUP_SCOPES: Record<ToolGroup, GroupScopes> = {
  contacts: { read: ['contact_show'], write: ['contact_edit'] },
  sales: {
    read: ['kb_offer_show', 'kb_order_show', 'kb_invoice_show', 'kb_delivery_show'],
    write: ['kb_offer_edit', 'kb_order_edit', 'kb_invoice_edit', 'kb_delivery_edit'],
  },
  purchase: {
    read: ['kb_article_order_show', 'kb_bill_show', 'contact_show'],
    write: ['kb_article_order_edit', 'bank_payment_edit'],
  },
  accounting: { read: ['accounting'], write: ['accounting'] },
  banking: { read: ['bank_account_show', 'bank_payment_show'], write: ['bank_payment_edit'] },
  items: { read: ['article_show', 'stock_edit'], write: ['article_edit'] },
  projects: { read: ['project_show', 'monitoring_show'], write: ['project_edit', 'monitoring_edit'] },
  files: { read: ['file'], write: ['file'] },
  payroll: {
    read: ['payroll_employee_show', 'payroll_absence_show', 'payroll_paystub_show'],
    write: ['payroll_employee_edit', 'payroll_absence_edit'],
  },
  misc: { read: ['note_show', 'task_show'], write: ['note_edit', 'task_edit'] },
};

/**
 * Draft mode deliberately grants only the edit scopes needed by its small
 * write allowlist. All other group operations remain read-only even when
 * their write scopes would normally be requested in full mode.
 */
export const DRAFT_WRITE_SCOPES: Partial<Record<ToolGroup, readonly string[]>> = {
  contacts: ['contact_edit'],
  sales: ['kb_offer_edit'],
};

/**
 * Computes the API scopes to request for a login covering the given tool
 * groups (default: all groups). A boolean second argument is retained for
 * compatibility (`true` means read-only, `false` means full access).
 */
export function scopesForGroups(
  groups: readonly ToolGroup[] | undefined,
  modeOrReadOnly: WriteMode | boolean = 'full',
): string[] {
  const writeMode: WriteMode =
    typeof modeOrReadOnly === 'boolean' ? (modeOrReadOnly ? 'read-only' : 'full') : modeOrReadOnly;
  const selected = groups && groups.length > 0 ? groups : (Object.keys(GROUP_SCOPES) as ToolGroup[]);
  const result = new Set<string>();
  for (const group of selected) {
    const spec = GROUP_SCOPES[group];
    for (const scope of spec.read) result.add(scope);
    const writeScopes = writeMode === 'full' ? spec.write : writeMode === 'drafts' ? DRAFT_WRITE_SCOPES[group] ?? [] : [];
    for (const scope of writeScopes) result.add(scope);
  }
  return [...result].sort();
}
