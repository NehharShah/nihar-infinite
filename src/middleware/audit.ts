import { Request, Response, NextFunction } from 'express';
import { Database } from '../database/database.js';
import { AuthenticatedRequest } from './auth.js';

export enum AuditAction {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  LOGIN = 'login',
  LOGOUT = 'logout',
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  USER_CREATED = 'user_created',
  USER_UPDATED = 'user_updated',
  API_KEY_CREATED = 'api_key_created',
  API_KEY_REVOKED = 'api_key_revoked',
  API_KEY_USED = 'api_key_used',
  PAYMENT_CREATED = 'payment_created',
  PAYMENT_UPDATED = 'payment_updated',
  PAYMENT_COMPLETED = 'payment_completed',
  PAYMENT_FAILED = 'payment_failed',
  WEBHOOK_SENT = 'webhook_sent',
  WEBHOOK_FAILED = 'webhook_failed',
  AUDIT_LOG_VIEWED = 'audit_log_viewed',
  SECURITY_EVENT_VIEWED = 'security_event_viewed'
}

export enum SecurityEventType {
  FAILED_LOGIN = 'failed_login',
  INVALID_API_KEY = 'invalid_api_key',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  PERMISSION_DENIED = 'permission_denied',
  SQL_INJECTION_ATTEMPT = 'sql_injection_attempt',
  XSS_ATTEMPT = 'xss_attempt'
}

export enum SecuritySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export class AuditService {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  /**
   * Log audit event
   */
  async logAuditEvent(
    req: AuthenticatedRequest,
    action: AuditAction,
    resourceType: string,
    resourceId?: string,
    details?: Record<string, any>
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      const apiKeyId = req.apiKey?.id;

      await this.db.run(
        `INSERT INTO audit_logs 
         (user_id, api_key_id, action, resource_type, resource_id, details, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          apiKeyId,
          action,
          resourceType,
          resourceId,
          details ? JSON.stringify(details) : null,
          req.ip,
          req.get('User-Agent')
        ]
      );
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }

  /**
   * Log security event
   */
  async logSecurityEvent(
    eventType: SecurityEventType,
    description: string,
    severity: SecuritySeverity = SecuritySeverity.MEDIUM,
    req?: Request,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest)?.user?.id;
      const apiKeyId = (req as AuthenticatedRequest)?.apiKey?.id;

      await this.db.run(
        `INSERT INTO security_events 
         (event_type, severity, description, ip_address, user_id, api_key_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          eventType,
          severity,
          description,
          req?.ip,
          userId,
          apiKeyId,
          metadata ? JSON.stringify(metadata) : null
        ]
      );

      // Log to console for immediate visibility
      console.warn(`[SECURITY] ${severity.toUpperCase()}: ${eventType} - ${description}`);
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Get audit logs with filtering
   */
  async getAuditLogs(
    filters: {
      userId?: string;
      apiKeyId?: string;
      action?: AuditAction;
      resourceType?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<any[]> {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.userId) {
      conditions.push('user_id = ?');
      params.push(filters.userId);
    }

    if (filters.apiKeyId) {
      conditions.push('api_key_id = ?');
      params.push(filters.apiKeyId);
    }

    if (filters.action) {
      conditions.push('action = ?');
      params.push(filters.action);
    }

    if (filters.resourceType) {
      conditions.push('resource_type = ?');
      params.push(filters.resourceType);
    }

    if (filters.startDate) {
      conditions.push('created_at >= ?');
      params.push(filters.startDate.toISOString());
    }

    if (filters.endDate) {
      conditions.push('created_at <= ?');
      params.push(filters.endDate.toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : 'LIMIT 100';
    const offsetClause = filters.offset ? `OFFSET ${filters.offset}` : '';

    const query = `
      SELECT 
        al.*,
        u.email as user_email,
        ak.name as api_key_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      LEFT JOIN api_keys ak ON al.api_key_id = ak.id
      ${whereClause}
      ORDER BY al.created_at DESC
      ${limitClause}
      ${offsetClause}
    `;

    return await this.db.all(query, params);
  }

  /**
   * Get security events with filtering
   */
  async getSecurityEvents(
    filters: {
      eventType?: SecurityEventType;
      severity?: SecuritySeverity;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<any[]> {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.eventType) {
      conditions.push('event_type = ?');
      params.push(filters.eventType);
    }

    if (filters.severity) {
      conditions.push('severity = ?');
      params.push(filters.severity);
    }

    if (filters.startDate) {
      conditions.push('created_at >= ?');
      params.push(filters.startDate.toISOString());
    }

    if (filters.endDate) {
      conditions.push('created_at <= ?');
      params.push(filters.endDate.toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : 'LIMIT 100';
    const offsetClause = filters.offset ? `OFFSET ${filters.offset}` : '';

    const query = `
      SELECT 
        se.*,
        u.email as user_email,
        ak.name as api_key_name
      FROM security_events se
      LEFT JOIN users u ON se.user_id = u.id
      LEFT JOIN api_keys ak ON se.api_key_id = ak.id
      ${whereClause}
      ORDER BY se.created_at DESC
      ${limitClause}
      ${offsetClause}
    `;

    return await this.db.all(query, params);
  }

  /**
   * Get audit statistics
   */
  async getAuditStats(): Promise<{
    totalEvents: number;
    eventsByAction: Record<string, number>;
    eventsByUser: Record<string, number>;
    recentActivity: any[];
  }> {
    const totalEvents = await this.db.get<{ count: number }>('SELECT COUNT(*) as count FROM audit_logs');
    
    const eventsByAction = await this.db.all<{ action: string; count: number }>(`
      SELECT action, COUNT(*) as count 
      FROM audit_logs 
      GROUP BY action 
      ORDER BY count DESC
    `);

    const eventsByUser = await this.db.all<{ actor: string; count: number }>(`
      SELECT 
        COALESCE(u.email, ak.name, 'Unknown') as actor,
        COUNT(*) as count 
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      LEFT JOIN api_keys ak ON al.api_key_id = ak.id
      GROUP BY al.user_id, al.api_key_id
      ORDER BY count DESC
      LIMIT 10
    `);

    const recentActivity = await this.db.all(`
      SELECT 
        al.*,
        COALESCE(u.email, ak.name, 'Unknown') as actor
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      LEFT JOIN api_keys ak ON al.api_key_id = ak.id
      ORDER BY al.created_at DESC
      LIMIT 20
    `);

    return {
      totalEvents: totalEvents?.count || 0,
      eventsByAction: Object.fromEntries(
        eventsByAction.map(row => [row.action, row.count])
      ),
      eventsByUser: Object.fromEntries(
        eventsByUser.map(row => [row.actor, row.count])
      ),
      recentActivity
    };
  }
}

// Export singleton instance
export const auditService = new AuditService();

// Middleware to automatically log requests
export const auditMiddleware = (action: AuditAction, resourceType: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Log the audit event after response is sent
      const resourceId = req.params.id || req.body?.id;
      const details = {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        responseSize: typeof data === 'string' ? data.length : JSON.stringify(data).length
      };

      auditService.logAuditEvent(req, action, resourceType, resourceId, details);
      
      return originalSend.call(this, data);
    };

    next();
  };
}; 