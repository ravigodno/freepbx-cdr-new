import type { Express, NextFunction, Request, Response } from 'express';
import { buildCallIntelligenceCore, buildCallIntelligenceDiagnosis, buildCallIntelligenceLogs, buildCallIntelligenceQuality, buildCallIntelligenceSecurity, buildCallIntelligenceSip, getCallIntelligenceCandidates, type CallIntelligenceDeps } from './service.js';

type Checker = (req: Request, permission: string) => Promise<boolean>;
const fail = (res: Response, status: number, message: string) => res.status(status).json({ success: false, error: message });
const input = (req: Request, signal: AbortSignal) => ({ query: String(req.query.query || '').trim(), queryType: String(req.query.queryType || 'auto'), from: String(req.query.from || ''), to: String(req.query.to || ''), limit: Number(req.query.limit || 50), signal });

export function registerCallIntelligenceRoutes(app: Express, requireAuth: any, check: Checker, deps: CallIntelligenceDeps) {
  const permit = async (req: Request, res: Response, next: NextFunction) => {
    if (!(await check(req, 'view_call_intelligence'))) return fail(res, 403, 'Недостаточно прав для карточки звонка');
    next();
  };
  const view = [requireAuth(), permit];
  const route = (path: string, worker: (deps: CallIntelligenceDeps, value: any) => Promise<any>) => app.get(path, ...view, async (req, res) => {
    const controller = new AbortController(); req.once('aborted', () => controller.abort());
    try { res.json({ success: true, data: await worker(deps, input(req, controller.signal)) }); }
    catch (error: any) { fail(res, error?.name === 'AbortError' ? 499 : 400, error?.message || 'Ошибка карточки звонка'); }
  });
  route('/api/monitoring/call-intelligence/candidates', getCallIntelligenceCandidates);
  route('/api/monitoring/call-intelligence/core', buildCallIntelligenceCore);
  route('/api/monitoring/call-intelligence/logs', buildCallIntelligenceLogs);
  route('/api/monitoring/call-intelligence/sip', buildCallIntelligenceSip);
  route('/api/monitoring/call-intelligence/quality', buildCallIntelligenceQuality);
  route('/api/monitoring/call-intelligence/security', buildCallIntelligenceSecurity);
  app.get('/api/monitoring/call-intelligence/diagnosis/:id', ...view, async (req, res) => {
    const controller = new AbortController(); req.once('aborted', () => controller.abort());
    try {
      const value = { ...input(req, controller.signal), query: String(req.params.id || '').trim() };
      if (!value.query || value.query.length > 255) return fail(res, 400, 'Некорректный идентификатор звонка');
      res.json({ success: true, data: await buildCallIntelligenceDiagnosis(deps, value) });
    } catch (error: any) { fail(res, error?.name === 'AbortError' ? 499 : 400, error?.message || 'Ошибка диагностики звонка'); }
  });
  app.get('/api/monitoring/call-intelligence/export', ...view, async (req, res) => {
    const controller = new AbortController(); req.once('aborted', () => controller.abort());
    try {
      const value = input(req, controller.signal);
      const [core, logs, sip, quality, security] = await Promise.all([
        buildCallIntelligenceCore(deps,value), buildCallIntelligenceLogs(deps,value), buildCallIntelligenceSip(deps,value),
        buildCallIntelligenceQuality(deps,value), buildCallIntelligenceSecurity(deps,value)
      ]);
      res.setHeader('Content-Disposition', `attachment; filename="pbxpuls-call-${String(value.query).replace(/[^A-Za-z0-9_.-]/g,'_')}.json"`);
      res.json({ success: true, core, logs, sip, quality, security });
    } catch (error: any) { fail(res, 400, error?.message || 'Ошибка экспорта'); }
  });
}
