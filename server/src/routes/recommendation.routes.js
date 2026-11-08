import { Router } from 'express';
import { getRecommendations } from '../controllers/ai.controller.js';
import { optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { recommendationsQuerySchema } from '../validators/pricing.validator.js';

const router = Router();

// Works for everyone; logged-in users get personalised results.
router.get('/', optionalAuth, validate(recommendationsQuerySchema, 'query'), getRecommendations);

export default router;
