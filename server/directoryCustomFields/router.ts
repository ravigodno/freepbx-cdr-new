import crypto from 'node:crypto';
import type { Express, Request, RequestHandler } from 'express';
import { queryPBXPulsDb, sanitizePBXPulsDbError, withPBXPulsTransaction } from '../pbxpulsDb.js';
import { writePBXPulsAuditLog } from '../pbxpulsEvents.js';

type Dependencies = {
  requireAuth: () => RequestHandler;
  canManage: (req: Request) => boolean;
  secret: string;
};

const allowedTypes = new Set(['string', 'text', 'number', 'date', 'boolean', 'phone', 'email']);
const id = (value: unknown) => String(value || '').trim().slice(0, 64);
const actor = (req: Request) => String((req as any).user?.username || (req as any).user?.id || 'unknown');

function normalizeInput(body: any) {
  const fieldName = String(body?.fieldName || '').trim().slice(0, 100);
  const fieldType = String(body?.fieldType || 'string');
  if (fieldName.length < 2) throw new Error('Название столбца должно содержать минимум 2 символа');
  if (!allowedTypes.has(fieldType)) throw new Error('Недопустимый тип столбца');
  return { fieldName, fieldType, showInSearch: body?.showInSearch === true };
}

function token(secret: string, payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${crypto.createHmac('sha256', secret).update(encoded).digest('base64url')}`;
}

function verify(secret: string, value: unknown, expected: Record<string, unknown>) {
  try {
    const [encoded, signature] = String(value || '').split('.');
    const calculated = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
    if (!signature || signature.length !== calculated.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(calculated))) return false;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return Number(payload.expiresAt) > Date.now() && Object.entries(expected).every(([key, item]) => payload[key] === item);
  } catch { return false; }
}

async function loadManagedField(fieldId: string) {
  const rows = await queryPBXPulsDb(
    `SELECT id,field_key AS fieldKey,field_name AS fieldName,field_type AS fieldType,
            is_required AS isRequired,is_visible AS isVisible,show_in_card AS showInCard,
            show_in_search AS showInSearch,sort_order AS sortOrder,created_by AS createdBy
       FROM directory_custom_fields
      WHERE id=? AND entity_type='directory_contact' AND created_by IS NOT NULL LIMIT 1`,
    [fieldId]
  );
  return rows[0] || null;
}

async function valueImpact(fieldId: string, fieldType: string) {
  const rows = await queryPBXPulsDb(
    `SELECT COUNT(*) AS valueCount,
            COALESCE(SUM(CASE
              WHEN ? IN ('string','text') THEN 0
              WHEN ?='number' AND TRIM(COALESCE(value,'')) REGEXP '^-?[0-9]+([.][0-9]+)?$' THEN 0
              WHEN ?='date' AND TRIM(COALESCE(value,'')) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN 0
              WHEN ?='boolean' AND LOWER(TRIM(COALESCE(value,''))) IN ('0','1','true','false','yes','no','да','нет') THEN 0
              WHEN ?='phone' AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(value,'')),' ',''),'-',''),'(',''),')',''),'+','') REGEXP '^[0-9]{3,20}$' THEN 0
              WHEN ?='email' AND TRIM(COALESCE(value,'')) REGEXP '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN 0
              ELSE 1 END),0) AS incompatibleCount
       FROM directory_contact_metadata
      WHERE field_id=? AND TRIM(COALESCE(value,''))<>''`,
    [fieldType, fieldType, fieldType, fieldType, fieldType, fieldType, fieldId]
  );
  return { valueCount: Number(rows[0]?.valueCount || 0), incompatibleCount: Number(rows[0]?.incompatibleCount || 0) };
}

export function registerDirectoryCustomFieldRoutes(app: Express, deps: Dependencies) {
  const auth = deps.requireAuth();
  const guard = (req: Request, res: any) => {
    if (deps.canManage(req)) return true;
    res.status(403).json({ error: 'Access denied: su/admin required' });
    return false;
  };

  app.post('/api/directory/custom-fields/:id/update-preview', auth, async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const fieldId = id(req.params.id), current = await loadManagedField(fieldId);
      if (!current) return res.status(404).json({ error: 'Пользовательский столбец не найден или является системным' });
      const next = normalizeInput(req.body), impact = await valueImpact(fieldId, next.fieldType);
      const expiresAt = Date.now() + 5 * 60_000;
      res.json({ action: 'update', current, next, ...impact, typeChanged: current.fieldType !== next.fieldType,
        previewToken: token(deps.secret, { action: 'update', fieldId, actor: actor(req), fieldName: next.fieldName, fieldType: next.fieldType, showInSearch: next.showInSearch, expiresAt }),
        expiresAt: new Date(expiresAt).toISOString() });
    } catch (error: any) { res.status(400).json({ error: sanitizePBXPulsDbError(error) }); }
  });

  app.post('/api/directory/custom-fields/:id/update-apply', auth, async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const fieldId = id(req.params.id), next = normalizeInput(req.body);
      if (!verify(deps.secret, req.body?.previewToken, { action: 'update', fieldId, actor: actor(req), fieldName: next.fieldName, fieldType: next.fieldType, showInSearch: next.showInSearch }))
        return res.status(400).json({ error: 'Предварительный просмотр устарел. Повторите проверку.' });
      const current = await loadManagedField(fieldId);
      if (!current) return res.status(404).json({ error: 'Пользовательский столбец не найден или является системным' });
      const impact = await valueImpact(fieldId, next.fieldType);
      if (impact.incompatibleCount > 0 && req.body?.confirmIncompatible !== true)
        return res.status(409).json({ error: `Найдено несовместимых значений: ${impact.incompatibleCount}. Требуется явное подтверждение.` });
      await queryPBXPulsDb('UPDATE directory_custom_fields SET field_name=?,field_type=?,show_in_search=?,updated_at=NOW() WHERE id=? AND created_by IS NOT NULL', [next.fieldName, next.fieldType, next.showInSearch ? 1 : 0, fieldId]);
      await writePBXPulsAuditLog({ actor_label: actor(req), action: 'directory.custom_field.updated', entity_type: 'directory_custom_field', entity_id: fieldId,
        details: { before: current, after: next, ...impact }, ip_address: req.ip, user_agent: req.get('user-agent') });
      res.json({ success: true, item: { ...current, fieldName: next.fieldName, fieldType: next.fieldType, showInSearch: next.showInSearch ? 1 : 0 } });
    } catch (error: any) { res.status(400).json({ error: sanitizePBXPulsDbError(error) }); }
  });

  app.post('/api/directory/custom-fields/:id/delete-preview', auth, async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const fieldId = id(req.params.id), current = await loadManagedField(fieldId);
      if (!current) return res.status(404).json({ error: 'Пользовательский столбец не найден или является системным' });
      const impact = await valueImpact(fieldId, 'string'), expiresAt = Date.now() + 5 * 60_000;
      res.json({ action: 'delete', current, valueCount: impact.valueCount, valuesWillBeDeleted: true,
        previewToken: token(deps.secret, { action: 'delete', fieldId, actor: actor(req), expiresAt }), expiresAt: new Date(expiresAt).toISOString() });
    } catch (error: any) { res.status(400).json({ error: sanitizePBXPulsDbError(error) }); }
  });

  app.post('/api/directory/custom-fields/:id/delete-apply', auth, async (req, res) => {
    if (!guard(req, res)) return;
    const fieldId = id(req.params.id);
    if (!verify(deps.secret, req.body?.previewToken, { action: 'delete', fieldId, actor: actor(req) }))
      return res.status(400).json({ error: 'Предварительный просмотр устарел. Повторите проверку.' });
    try {
      const current = await loadManagedField(fieldId);
      if (!current) return res.status(404).json({ error: 'Пользовательский столбец не найден или является системным' });
      const impact = await valueImpact(fieldId, 'string');
      await withPBXPulsTransaction(async connection => {
        await connection.execute('DELETE FROM directory_contact_metadata WHERE field_id=?', [fieldId]);
        await connection.execute("DELETE FROM directory_custom_fields WHERE id=? AND entity_type='directory_contact' AND created_by IS NOT NULL", [fieldId]);
      });
      await writePBXPulsAuditLog({ actor_label: actor(req), action: 'directory.custom_field.deleted', entity_type: 'directory_custom_field', entity_id: fieldId,
        details: { fieldKey: current.fieldKey, fieldName: current.fieldName, deletedValues: impact.valueCount }, ip_address: req.ip, user_agent: req.get('user-agent') });
      res.json({ success: true, fieldId, fieldKey: current.fieldKey, deletedValues: impact.valueCount });
    } catch (error: any) { res.status(400).json({ error: sanitizePBXPulsDbError(error) }); }
  });
}
