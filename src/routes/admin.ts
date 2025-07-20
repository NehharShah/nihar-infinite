import { Router, Request, Response } from 'express';
import { AuthenticatedRequest, requireAuthOrApiKey, requireRoleOrAdminPermission, UserRole } from '../middleware/auth.js';
import { auditService, AuditAction, SecurityEventType, SecuritySeverity } from '../middleware/audit.js';
import { authService } from '../middleware/auth.js';
import { ApiResponse } from '../types/payment.js';

const router = Router();

/**
 * @swagger
 * /api/v1/admin/users:
 *   get:
 *     summary: Get all users (Admin only)
 *     description: Retrieve a list of all users in the system. Requires admin privileges.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized - Missing or invalid authentication
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       403:
 *         description: Forbidden - Insufficient permissions
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
router.get('/users', requireAuthOrApiKey, requireRoleOrAdminPermission(UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { Database } = await import('../database/database.js');
    const db = Database.getInstance();
    
    const users = await db.all(`
      SELECT id, email, role, is_active, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
    `);

    const response: ApiResponse<any> = {
      success: true,
      data: users,
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error fetching users:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'USERS_FETCH_FAILED',
        message: 'Failed to fetch users'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/v1/admin/users:
 *   post:
 *     summary: Create a new user (Admin only)
 *     description: Create a new user account with specified role and permissions. Requires admin privileges.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserRequest'
 *     responses:
 *       201:
 *         description: User created successfully
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
 *                           description: Authentication token for the new user
 *                           example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
 *       400:
 *         description: Bad request - Invalid input data
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
 *       403:
 *         description: Forbidden - Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       409:
 *         description: Conflict - User already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/users', requireAuthOrApiKey, requireRoleOrAdminPermission(UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'Email, password, and role are required'
        },
        timestamp: new Date().toISOString()
      });
    }

    if (!Object.values(UserRole).includes(role)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ROLE',
          message: 'Invalid role specified'
        },
        timestamp: new Date().toISOString()
      });
    }

    const authToken = await authService.createUser(email, password, role);

    const response: ApiResponse<any> = {
      success: true,
      data: { auth_token: authToken },
      timestamp: new Date().toISOString()
    };

    res.status(201).json(response);
  } catch (error: any) {
    console.error('Error creating user:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'USER_CREATION_FAILED',
        message: error.message || 'Failed to create user'
      },
      timestamp: new Date().toISOString()
    };

    res.status(400).json(response);
  }
});

/**
 * @swagger
 * /api/v1/admin/api-keys:
 *   get:
 *     summary: Get all API keys (Admin only)
 *     description: Retrieve a list of all API keys in the system. Requires admin privileges.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of API keys retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ApiKey'
 *       401:
 *         description: Unauthorized - Missing or invalid authentication
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       403:
 *         description: Forbidden - Insufficient permissions
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
router.get('/api-keys', requireAuthOrApiKey, requireRoleOrAdminPermission(UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { Database } = await import('../database/database.js');
    const db = Database.getInstance();
    
    const apiKeys = await db.all(`
      SELECT id, name, permissions, is_active, expires_at, created_at, updated_at
      FROM api_keys
      ORDER BY created_at DESC
    `);

    // Parse permissions JSON
    const formattedKeys = apiKeys.map((key: any) => ({
      ...key,
      permissions: JSON.parse(key.permissions)
    }));

    const response: ApiResponse<any> = {
      success: true,
      data: formattedKeys,
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error fetching API keys:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'API_KEYS_FETCH_FAILED',
        message: 'Failed to fetch API keys'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/v1/admin/api-keys:
 *   post:
 *     summary: Create a new API key (Admin only)
 *     description: Create a new API key with specified permissions and optional expiration. Requires admin privileges.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateApiKeyRequest'
 *     responses:
 *       201:
 *         description: API key created successfully
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
 *                         api_key:
 *                           type: string
 *                           description: The generated API key (only shown once)
 *                           example: 'cbp_1234567890abcdef1234567890abcdef'
 *       400:
 *         description: Bad request - Invalid input data
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
 *       403:
 *         description: Forbidden - Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/api-keys', requireAuthOrApiKey, requireRoleOrAdminPermission(UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, permissions, expires_at } = req.body;

    if (!name || !permissions || !Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'Name and permissions array are required'
        },
        timestamp: new Date().toISOString()
      });
    }

    const expiresAt = expires_at ? new Date(expires_at) : undefined;
    const apiKey = await authService.generateApiKey(name, permissions, expiresAt);

    const response: ApiResponse<any> = {
      success: true,
      data: { api_key: apiKey },
      timestamp: new Date().toISOString()
    };

    res.status(201).json(response);
  } catch (error: any) {
    console.error('Error creating API key:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'API_KEY_CREATION_FAILED',
        message: error.message || 'Failed to create API key'
      },
      timestamp: new Date().toISOString()
    };

    res.status(400).json(response);
  }
});

/**
 * @swagger
 * /api/v1/admin/audit-logs:
 *   get:
 *     summary: Get audit logs (Admin only)
 *     description: Retrieve audit logs with optional filtering by action, resource type, and date range. Requires admin privileges.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by specific action (e.g., payment_created, user_login)
 *         example: payment_created
 *       - in: query
 *         name: resource_type
 *         schema:
 *           type: string
 *         description: Filter by resource type (e.g., payment, user, api_key)
 *         example: payment
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for filtering (YYYY-MM-DD)
 *         example: '2024-01-01'
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for filtering (YYYY-MM-DD)
 *         example: '2024-01-31'
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           minimum: 1
 *           maximum: 1000
 *         description: Number of records to return
 *         example: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *         description: Number of records to skip for pagination
 *         example: 0
 *     responses:
 *       200:
 *         description: Audit logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/AuditLog'
 *       401:
 *         description: Unauthorized - Missing or invalid authentication
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       403:
 *         description: Forbidden - Insufficient permissions
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
router.get('/audit-logs', requireAuthOrApiKey, requireRoleOrAdminPermission(UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { action, resource_type, start_date, end_date, limit, offset } = req.query;

    const filters = {
      action: action as AuditAction,
      resourceType: resource_type as string,
      startDate: start_date ? new Date(start_date as string) : undefined,
      endDate: end_date ? new Date(end_date as string) : undefined,
      limit: limit ? parseInt(limit as string) : 100,
      offset: offset ? parseInt(offset as string) : 0
    };

    const logs = await auditService.getAuditLogs(filters);

    const response: ApiResponse<any> = {
      success: true,
      data: logs,
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error fetching audit logs:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'AUDIT_LOGS_FETCH_FAILED',
        message: 'Failed to fetch audit logs'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/v1/admin/security-events:
 *   get:
 *     summary: Get security events (Admin only)
 *     description: Retrieve security events with optional filtering by event type, severity, and date range. Requires admin privileges.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: event_type
 *         schema:
 *           type: string
 *           enum: [failed_login, invalid_api_key, rate_limit_exceeded, suspicious_activity, permission_denied, sql_injection_attempt, xss_attempt]
 *         description: Filter by security event type
 *         example: failed_login
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter by event severity level
 *         example: medium
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for filtering (YYYY-MM-DD)
 *         example: '2024-01-01'
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for filtering (YYYY-MM-DD)
 *         example: '2024-01-31'
 *     responses:
 *       200:
 *         description: Security events retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/SecurityEvent'
 *       401:
 *         description: Unauthorized - Missing or invalid authentication
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       403:
 *         description: Forbidden - Insufficient permissions
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
router.get('/security-events', requireAuthOrApiKey, requireRoleOrAdminPermission(UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { event_type, severity, start_date, end_date } = req.query;

    const filters = {
      eventType: event_type as SecurityEventType,
      severity: severity as SecuritySeverity,
      startDate: start_date ? new Date(start_date as string) : undefined,
      endDate: end_date ? new Date(end_date as string) : undefined
    };

    const events = await auditService.getSecurityEvents(filters);

    const response: ApiResponse<any> = {
      success: true,
      data: events,
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error fetching security events:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'SECURITY_EVENTS_FETCH_FAILED',
        message: 'Failed to fetch security events'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/v1/admin/audit-stats:
 *   get:
 *     summary: Get audit statistics (Admin only)
 *     description: Retrieve comprehensive audit statistics including total events, events by action, events by user, and recent activity. Requires admin privileges.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Audit statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AuditStats'
 *       401:
 *         description: Unauthorized - Missing or invalid authentication
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       403:
 *         description: Forbidden - Insufficient permissions
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
router.get('/audit-stats', requireAuthOrApiKey, requireRoleOrAdminPermission(UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await auditService.getAuditStats();

    const response: ApiResponse<any> = {
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error fetching audit stats:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'AUDIT_STATS_FETCH_FAILED',
        message: 'Failed to fetch audit statistics'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

export default router; 