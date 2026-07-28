import type { Express, Request, Response } from 'express';
import { MTS_BUSINESS_SOURCE_ID, MtsBusinessBalanceService, safeMtsBusinessError, sanitizeBalanceStorageError } from './mtsBusinessService.js';
import { MtsUsageService } from './mtsUsageService.js';

type Dependencies = {
  requireAuth: any;
  checkPermission: (req: Request, permission: string) => Promise<boolean>;
  hashSecret: string;
  queryCdr: (sql: string, params: any[]) => Promise<any[]>;
};

export function registerBalanceRoutes(app: Express, deps: Dependencies): MtsBusinessBalanceService {
  const service = new MtsBusinessBalanceService();
  const usage = new MtsUsageService(() => service.getUsageProvider(), deps.hashSecret, deps.queryCdr);

  app.get('/api/balance/sources', deps.requireAuth(), async (req: Request, res: Response) => {
    if (!(await deps.checkPermission(req, 'view_balance'))) {
      return res.status(403).json({ error: 'Access denied: view_balance permission required' });
    }
    try {
      return res.json({ success: true, sources: await service.listSources() });
    } catch (error) {
      return res.status(503).json({ success: false, error: 'Balance storage unavailable', safeErrorCode: sanitizeBalanceStorageError(error) });
    }
  });

  app.post('/api/balance/sources/mts-business/test', deps.requireAuth(), async (req: Request, res: Response) => {
    if (!(await deps.checkPermission(req, 'manage_balance_sources'))) {
      return res.status(403).json({ error: 'Access denied: manage_balance_sources permission required' });
    }
    return res.json(await service.diagnose());
  });

  app.post('/api/balance/sources/:id/sync', deps.requireAuth(), async (req: Request, res: Response) => {
    if (!(await deps.checkPermission(req, 'manage_balance_sources'))) {
      return res.status(403).json({ error: 'Access denied: manage_balance_sources permission required' });
    }
    if (String(req.params.id) !== MTS_BUSINESS_SOURCE_ID) {
      return res.status(404).json({ success: false, safeErrorCode: 'balance_source_not_found', safeMessage: 'Источник баланса не найден' });
    }
    try {
      const result = await service.sync();
      return res.json({
        success: true,
        sourceId: MTS_BUSINESS_SOURCE_ID,
        balance: result.balance,
        currency: result.currency,
        creditLimit: result.creditLimit,
        accountNumberMasked: result.accountNumber ? `${result.accountNumber.slice(0, 1)}${'*'.repeat(Math.max(3, result.accountNumber.length - 4))}${result.accountNumber.slice(-3)}` : null,
        msisdnMasked: result.msisdn ? `${result.msisdn.slice(0, 1)}${'*'.repeat(Math.max(3, result.msisdn.length - 4))}${result.msisdn.slice(-3)}` : null,
        measuredAt: result.measuredAt
      });
    } catch (error) {
      const safe = safeMtsBusinessError(error);
      return res.status(503).json({ success: false, ...safe });
    }
  });

  app.get('/api/balance/sources/:id/usage', deps.requireAuth(), async (req: Request, res: Response) => {
    if (!(await deps.checkPermission(req, 'view_balance_analytics'))) {
      return res.status(403).json({ error: 'Access denied: view_balance_analytics permission required' });
    }
    if (String(req.params.id) !== MTS_BUSINESS_SOURCE_ID) {
      return res.status(404).json({ success: false, safeErrorCode: 'balance_source_not_found' });
    }
    try {
      return res.json({ success: true, ...(await usage.list(MTS_BUSINESS_SOURCE_ID, req.query as any)) });
    } catch (error: any) {
      return res.status(400).json({ success: false, safeErrorCode: String(error?.message || 'usage_list_failed').slice(0, 64) });
    }
  });

  app.get('/api/balance/sources/:id/usage/summary', deps.requireAuth(), async (req: Request, res: Response) => {
    if (!(await deps.checkPermission(req, 'view_balance_analytics'))) {
      return res.status(403).json({ error: 'Access denied: view_balance_analytics permission required' });
    }
    if (String(req.params.id) !== MTS_BUSINESS_SOURCE_ID) {
      return res.status(404).json({ success: false, safeErrorCode: 'balance_source_not_found' });
    }
    try {
      return res.json({ success: true, summary: await usage.summary(MTS_BUSINESS_SOURCE_ID, req.query as any) });
    } catch (error: any) {
      return res.status(400).json({ success: false, safeErrorCode: String(error?.message || 'usage_summary_failed').slice(0, 64) });
    }
  });

  app.post('/api/balance/sources/:id/usage/sync', deps.requireAuth(), async (req: Request, res: Response) => {
    if (!(await deps.checkPermission(req, 'manage_balance_sources'))) {
      return res.status(403).json({ error: 'Access denied: manage_balance_sources permission required' });
    }
    if (String(req.params.id) !== MTS_BUSINESS_SOURCE_ID) {
      return res.status(404).json({ success: false, safeErrorCode: 'balance_source_not_found' });
    }
    try {
      return res.json({ success: true, ...(await usage.sync(MTS_BUSINESS_SOURCE_ID, req.body || {})) });
    } catch (error) {
      const safe = safeMtsBusinessError(error);
      return res.status(503).json({ success: false, ...safe });
    }
  });

  return service;
}
