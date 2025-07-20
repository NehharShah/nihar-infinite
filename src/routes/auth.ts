import { Router, Request, Response } from 'express';
import { AuthenticatedRequest, requireAuth, authService } from '../middleware/auth.js';
import { auditService, AuditAction } from '../middleware/audit.js';
import { ApiResponse } from '../types/payment.js';

const router = Router();

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticate user with email and password to receive an access token.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User email address
 *                 example: 'user@example.com'
 *               password:
 *                 type: string
 *                 description: User password
 *                 example: 'securepassword123'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         auth_token:
 *                           type: string
 *                           description: JWT access token
 *                           example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
 *                         user:
 *                           $ref: '#/components/schemas/User'
 *       400:
 *         description: Bad request - Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: Unauthorized - Invalid email or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       429:
 *         description: Too many requests - Rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CREDENTIALS',
          message: 'Email and password are required'
        },
        timestamp: new Date().toISOString()
      });
    }

    const result = await authService.login(email, password);

    // Log successful login
    await auditService.logAuditEvent(
      req as any,
      AuditAction.USER_LOGIN,
      'user',
      result.user.id
    );

    const response: ApiResponse<any> = {
      success: true,
      data: {
        auth_token: result.token,
        user: {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          is_active: result.user.is_active,
          created_at: result.user.created_at,
          updated_at: result.user.updated_at
        }
      },
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Login error:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'LOGIN_FAILED',
        message: error.message || 'Invalid email or password'
      },
      timestamp: new Date().toISOString()
    };

    res.status(401).json(response);
  }
});

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: User logout
 *     description: Invalidate the current user session and log the logout action.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: Unauthorized - Missing or invalid authentication
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/logout', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Log logout action
    await auditService.logAuditEvent(
      req,
      AuditAction.USER_LOGOUT,
      'user',
      req.user!.id
    );

    const response: ApiResponse<any> = {
      success: true,
      data: { message: 'Logged out successfully' },
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Logout error:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'LOGOUT_FAILED',
        message: 'Failed to logout'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current user profile
 *     description: Retrieve the current authenticated user's profile information.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized - Missing or invalid authentication
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const response: ApiResponse<any> = {
      success: true,
      data: {
        id: req.user!.id,
        email: req.user!.email,
        role: req.user!.role,
        is_active: true, // Default to true for authenticated users
        created_at: new Date().toISOString(), // We don't have this in the interface
        updated_at: new Date().toISOString()  // We don't have this in the interface
      },
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error fetching user profile:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'PROFILE_FETCH_FAILED',
        message: 'Failed to fetch user profile'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     description: Generate a new access token using the current valid token. Useful for extending sessions.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         auth_token:
 *                           type: string
 *                           description: New JWT access token
 *                           example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
 *       401:
 *         description: Unauthorized - Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/refresh', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const newToken = await authService.refreshToken(req.user!.id);

    const response: ApiResponse<any> = {
      success: true,
      data: { auth_token: newToken },
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Token refresh error:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'TOKEN_REFRESH_FAILED',
        message: 'Failed to refresh token'
      },
      timestamp: new Date().toISOString()
    };

    res.status(401).json(response);
  }
});

export default router; 