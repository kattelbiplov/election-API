import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import { asyncHandler } from '../../utils/asyncHandler';
import { changePasswordSchema, loginSchema, refreshSchema } from './auth.validation';
import {
  changePasswordHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
} from './auth.controller';

const router = Router();

router.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(loginHandler));
router.post('/refresh', authLimiter, validate({ body: refreshSchema }), asyncHandler(refreshHandler));
router.post('/logout', validate({ body: refreshSchema }), asyncHandler(logoutHandler));
router.get('/me', authenticate, asyncHandler(meHandler));
router.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler(changePasswordHandler),
);

export default router;
