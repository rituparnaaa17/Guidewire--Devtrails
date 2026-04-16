import { Router }        from 'express';
import { getLiveWeather } from '../controllers/weatherController.js';

const router = Router();

// GET /api/weather/live?lat=xx&lon=yy  — no auth needed for dashboard widget
router.get('/live', getLiveWeather);

export default router;
