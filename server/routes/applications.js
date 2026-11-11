// Applications — placement/job tracker. Thin route; rules live in applicationService.
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listApplications,
  createApplication,
  updateApplication,
  deleteApplication
} from '../services/applicationService.js';

const router = Router();
router.use(requireAuth);

function fail(res, err) {
  res.status(err.status ?? 500).json({ error: err.message });
}

// GET /api/applications?stage=oa&channel=off_campus&active=1
router.get('/', async (req, res) => {
  try {
    const { stage, channel, active } = req.query;
    const applications = await listApplications(req.user.id, {
      stage: stage ? String(stage) : undefined,
      channel: channel ? String(channel) : undefined,
      activeOnly: active === '1' || active === 'true'
    });
    res.json({ applications });
  } catch (err) {
    fail(res, err);
  }
});

// POST /api/applications
router.post('/', async (req, res) => {
  try {
    const application = await createApplication(req.user.id, req.body ?? {});
    res.status(201).json({ application });
  } catch (err) {
    fail(res, err);
  }
});

// PATCH /api/applications/:id — stage changes are recorded in stage_history
router.patch('/:id', async (req, res) => {
  try {
    const application = await updateApplication(req.user.id, req.params.id, req.body ?? {});
    res.json({ application });
  } catch (err) {
    fail(res, err);
  }
});

// DELETE /api/applications/:id
router.delete('/:id', async (req, res) => {
  try {
    await deleteApplication(req.user.id, req.params.id);
    res.status(204).end();
  } catch (err) {
    fail(res, err);
  }
});

export default router;
