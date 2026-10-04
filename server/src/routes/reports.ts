import { Router, Request, Response, NextFunction } from 'express';
import { getRepository } from '../db/index.js';
import { extractReport } from '../services/ai/extractReport.js';
import { processReportPipeline } from '../services/automation/pipeline.js';
import { SEED_REPORTS_RAW } from '../db/seedData.js';

export const reportsRouter = Router();

// GET /api/reports
reportsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    const { status, source } = req.query;
    const reports = await repo.getReports({
      status: status ? String(status) : undefined,
      source: source ? String(source) : undefined,
    });
    res.json({ data: reports, error: null });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/:id
reportsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    const report = await repo.getReportById(String(req.params.id));
    if (!report) {
      res.status(404).json({ data: null, error: { message: 'Report not found' } });
      return;
    }
    res.json({ data: report, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/reports/analyze (Preview extraction without DB write)
reportsRouter.post('/analyze', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { raw_text } = req.body;
    if (!raw_text || typeof raw_text !== 'string') {
      res.status(400).json({ data: null, error: { message: 'raw_text is required' } });
      return;
    }
    const extraction = await extractReport(raw_text);
    res.json({ data: extraction, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/reports (Full pipeline ingestion)
reportsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { raw_text, source = 'form', reporter } = req.body;
    if (!raw_text) {
      res.status(400).json({ data: null, error: { message: 'raw_text is required' } });
      return;
    }
    const repo = await getRepository();
    const result = await processReportPipeline({ raw_text, source, reporter }, repo);
    res.status(201).json({ data: result, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/reports/batch (Sample batch ingestion)
reportsRouter.post('/batch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    const items = req.body.reports || SEED_REPORTS_RAW;
    const results = [];

    for (const item of items) {
      const res = await processReportPipeline(
        {
          raw_text: item.raw_text,
          source: item.source || 'social',
          reporter: item.reporter,
        },
        repo
      );
      results.push(res);
    }

    res.json({
      data: {
        ingestedCount: results.length,
        items: results,
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
});
