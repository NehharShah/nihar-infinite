import { Request, Response, NextFunction } from 'express';
import { Database } from '../database/database.js';
import { v4 as uuidv4 } from 'uuid';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    permissions: string[];
  };
  apiKey?: {
    id: string;
    name: string;
    permissions: string[];
  };
}

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  READONLY = 'readonly'
}

export class AuthService {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  /**
   * Validate API key middleware
   */
  async validateApiKey(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_API_KEY',
          message: 'API key is required'
        },
        timestamp: new Date().toISOString()
      });
    }

    try {
      const keyData = await this.db.get<{
        id: string;
        name: string;
        permissions: string;
        is_active: boolean;
        expires_at?: string;
      }>(
        'SELECT id, name, permissions, is_active, expires_at FROM api_keys WHERE key_hash = ?',
        [this.hashApiKey(apiKey)]
      );

      if (!keyData || !keyData.is_active) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_API_KEY',
            message: 'Invalid or inactive API key'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Check if key is expired
      if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'EXPIRED_API_KEY',
            message: 'API key has expired'
          },
          timestamp: new Date().toISOString()
        });
      }

      req.apiKey = {
        id: keyData.id,
        name: keyData.name,
        permissions: JSON.parse(keyData.permissions)
      };

      // Log API key usage
      await this.logApiKeyUsage(keyData.id, req.ip, req.originalUrl);

      next();
    } catch (error) {
      console.error('API key validation error:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Authentication service error'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Validate user authentication middleware
   */
  async validateUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Bearer token is required'
        },
        timestamp: new Date().toISOString()
      });
    }

    const token = authHeader.substring(7);

    try {
      const userData = await this.db.get<{
        id: string;
        email: string;
        role: string;
        permissions: string;
        is_active: boolean;
      }>(
        'SELECT id, email, role, permissions, is_active FROM users WHERE auth_token = ?',
        [this.hashToken(token)]
      );

      if (!userData || !userData.is_active) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or inactive user token'
          },
          timestamp: new Date().toISOString()
        });
      }

      req.user = {
        id: userData.id,
        email: userData.email,
        role: userData.role as UserRole,
        permissions: JSON.parse(userData.permissions)
      };

      next();
    } catch (error) {
      console.error('User validation error:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Authentication service error'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Combined authentication middleware that supports both Bearer tokens and API keys
   */
  async validateAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    // Try API key first
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey) {
      return this.validateApiKey(req, res, next);
    }

    // Try Bearer token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return this.validateUser(req, res, next);
    }

    // No authentication provided
    return res.status(401).json({
      success: false,
      error: {
        code: 'MISSING_AUTH',
        message: 'Authentication required. Provide either Bearer token or X-API-Key'
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Check permission middleware
   */
  requirePermission(permission: string) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const userPermissions = req.user?.permissions || req.apiKey?.permissions || [];
      
      if (!userPermissions.includes(permission)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: `Permission '${permission}' is required`
          },
          timestamp: new Date().toISOString()
        });
      }

      next();
    };
  }

  /**
   * Check role middleware
   */
  requireRole(role: UserRole) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (req.user?.role !== role) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_ROLE',
            message: `Role '${role}' is required`
          },
          timestamp: new Date().toISOString()
        });
      }

      next();
    };
  }

  /**
   * Check role or admin permission middleware
   */
  requireRoleOrAdminPermission(role: UserRole) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      // If user has the required role, allow
      if (req.user?.role === role) {
        return next();
      }

      // If API key has admin permissions, allow
      if (req.apiKey?.permissions.includes('system:admin')) {
        return next();
      }

      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Role '${role}' or admin permissions required`
        },
        timestamp: new Date().toISOString()
      });
    };
  }

  /**
   * Generate API key
   */
  async generateApiKey(name: string, permissions: string[], expiresAt?: Date): Promise<string> {
    const apiKey = `cbp_${uuidv4().replace(/-/g, '')}`;
    const keyHash = this.hashApiKey(apiKey);
    const keyId = uuidv4();

    await this.db.run(
      `INSERT INTO api_keys (id, name, key_hash, permissions, is_active, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        keyId,
        name,
        keyHash,
        JSON.stringify(permissions),
        true,
        expiresAt?.toISOString() || null
      ]
    );

    return apiKey;
  }

  /**
   * Create user account
   */
  async createUser(email: string, password: string, role: UserRole = UserRole.USER): Promise<string> {
    const userId = uuidv4();
    const passwordHash = await this.hashPassword(password);
    const authToken = `user_${uuidv4().replace(/-/g, '')}`;
    const tokenHash = this.hashToken(authToken);

    const defaultPermissions = this.getDefaultPermissions(role);

    await this.db.run(
      `INSERT INTO users (id, email, password_hash, auth_token, role, permissions, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        userId,
        email,
        passwordHash,
        tokenHash,
        role,
        JSON.stringify(defaultPermissions),
        true
      ]
    );

    return authToken;
  }

  /**
   * Hash API key for storage
   */
  private hashApiKey(apiKey: string): string {
    // In production, use proper cryptographic hashing
    return Buffer.from(apiKey).toString('base64');
  }

  /**
   * Hash token for storage
   */
  private hashToken(token: string): string {
    // In production, use proper cryptographic hashing
    return Buffer.from(token).toString('base64');
  }

  /**
   * Hash password for storage
   */
  private async hashPassword(password: string): Promise<string> {
    // In production, use bcrypt or similar
    return Buffer.from(password).toString('base64');
  }

  /**
   * Get default permissions for role
   */
  private getDefaultPermissions(role: UserRole): string[] {
    switch (role) {
      case UserRole.ADMIN:
        return ['payments:read', 'payments:write', 'payments:delete', 'users:read', 'users:write', 'system:admin'];
      case UserRole.USER:
        return ['payments:read', 'payments:write'];
      case UserRole.READONLY:
        return ['payments:read'];
      default:
        return [];
    }
  }

  /**
   * Log API key usage
   */
  private async logApiKeyUsage(apiKeyId: string, ip: string, endpoint: string): Promise<void> {
    try {
      await this.db.run(
        `INSERT INTO api_key_usage (api_key_id, ip_address, endpoint, used_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [apiKeyId, ip, endpoint]
      );
    } catch (error) {
      console.error('Failed to log API key usage:', error);
    }
  }

  /**
   * User login
   */
  async login(email: string, password: string): Promise<{ user: any; token: string }> {
    const user = await this.db.get<{
      id: string;
      email: string;
      role: string;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>(
      'SELECT id, email, role, is_active, created_at, updated_at FROM users WHERE email = ?',
      [email]
    );

    if (!user || !user.is_active) {
      throw new Error('Invalid email or password');
    }

    // In a real implementation, you would verify the password hash
    // For now, we'll just check if the user exists and is active
    const token = this.generateToken();
    
    // Store the token hash in the database
    await this.db.run(
      'UPDATE users SET auth_token = ? WHERE id = ?',
      [this.hashToken(token), user.id]
    );

    return {
      user,
      token
    };
  }

  /**
   * Refresh user token
   */
  async refreshToken(userId: string): Promise<string> {
    const user = await this.db.get<{ id: string; is_active: boolean }>(
      'SELECT id, is_active FROM users WHERE id = ?',
      [userId]
    );

    if (!user || !user.is_active) {
      throw new Error('User not found or inactive');
    }

    const newToken = this.generateToken();
    
    // Update the token hash in the database
    await this.db.run(
      'UPDATE users SET auth_token = ? WHERE id = ?',
      [this.hashToken(newToken), userId]
    );

    return newToken;
  }

  /**
   * Generate a new token
   */
  private generateToken(): string {
    return `token_${uuidv4()}_${Date.now()}`;
  }
}

// Export middleware functions
export const authService = new AuthService();

export const requireApiKey = authService.validateApiKey.bind(authService);
export const requireAuth = authService.validateUser.bind(authService);
export const requireAuthOrApiKey = authService.validateAuth.bind(authService);
export const requirePermission = authService.requirePermission.bind(authService);
export const requireRole = authService.requireRole.bind(authService);
export const requireRoleOrAdminPermission = authService.requireRoleOrAdminPermission.bind(authService); 