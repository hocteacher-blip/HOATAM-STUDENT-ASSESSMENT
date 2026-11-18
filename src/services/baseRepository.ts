import { db, formatDbError } from '../db/database';
import type { AuditLog, BaseEntity, ServiceResult } from '../types/models';

export function createEntityId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function createBaseFields(): BaseEntity {
  const now = new Date().toISOString();
  return {
    id: createEntityId(),
    createdAt: now,
    updatedAt: now,
  };
}

export async function recordAuditLog(
  action: AuditLog['action'],
  entityTable: string,
  summary: string,
  entityId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const base = createBaseFields();
    await db.auditLogs.add({
      ...base,
      action,
      entityTable,
      entityId,
      summary,
      actorName: 'Giáo viên',
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    });
  } catch {
    // Audit logging must not crash primary user transactions
  }
}

export async function executeService<T>(
  fn: () => Promise<T>,
  fallbackError = 'Không thể thực hiện thao tác dữ liệu.'
): Promise<ServiceResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: formatDbError(error, fallbackError) };
  }
}
