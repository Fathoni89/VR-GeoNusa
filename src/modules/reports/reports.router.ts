import { Router, type Request, type RequestHandler } from 'express';
import type { AuthenticatedRequest } from '../../middleware/authenticate';
import type { ReportQueryInput } from './reports.schema';
import type { ReportsService } from './reports.service';

type AsyncHandler = (
  request: Request,
  response: Parameters<RequestHandler>[1],
) => Promise<void>;

function forwardAsync(handler: AsyncHandler): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

function queryInput(request: Request): ReportQueryInput {
  return {
    school_id: request.query.school_id,
    class_id: request.query.class_id,
    page: request.query.page,
    pageSize: request.query.pageSize,
  };
}

export interface ReportsRouterOptions {
  service: ReportsService;
  requireAuth: RequestHandler;
  requireStaffReportAccess: RequestHandler;
}

export function createReportsRouter(options: ReportsRouterOptions): Router {
  const router = Router();
  const access = [options.requireAuth, options.requireStaffReportAccess];

  router.get('/summary', ...access, forwardAsync(async (request, response) => {
    const result = await options.service.summary(
      (request as AuthenticatedRequest).account,
      queryInput(request),
    );
    if (!result.ok) {
      response.status(result.status).json({ success: false, message: result.message });
      return;
    }
    response.json({ success: true, data: result.value });
  }));

  router.get('/export.csv', ...access, forwardAsync(async (request, response) => {
    const result = await options.service.exportCsv(
      (request as AuthenticatedRequest).account,
      queryInput(request),
    );
    if (!result.ok) {
      response.status(result.status).json({ success: false, message: result.message });
      return;
    }
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="vr-geonusa-sessions.csv"',
    );
    response.send(result.value);
  }));

  return router;
}
