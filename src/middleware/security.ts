import { Request, Response, NextFunction } from 'express';
import { auditService, SecurityEventType, SecuritySeverity } from './audit.js';

/**
 * Security middleware to protect against common attacks
 */
export class SecurityMiddleware {
  /**
   * SQL Injection protection
   */
  static sqlInjectionProtection(req: Request, res: Response, next: NextFunction) {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
      /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i,
      /(\b(OR|AND)\s+['"]?\w+['"]?\s*=\s*['"]?\w+['"]?)/i,
      /(--|#|\/\*|\*\/)/,
      /(\b(WAITFOR|DELAY)\b)/i,
      /(\b(SLEEP|BENCHMARK)\b)/i
    ];

    const body = JSON.stringify(req.body);
    const query = JSON.stringify(req.query);
    const params = JSON.stringify(req.params);

    for (const pattern of sqlPatterns) {
      if (pattern.test(body) || pattern.test(query) || pattern.test(params)) {
        auditService.logSecurityEvent(
          SecurityEventType.SQL_INJECTION_ATTEMPT,
          `SQL injection attempt detected from IP ${req.ip}`,
          SecuritySeverity.HIGH,
          req,
          { body, query, params }
        );

        return res.status(400).json({
          success: false,
          error: {
            code: 'SECURITY_VIOLATION',
            message: 'Invalid request detected'
          },
          timestamp: new Date().toISOString()
        });
      }
    }

    next();
  }

  /**
   * XSS protection
   */
  static xssProtection(req: Request, res: Response, next: NextFunction) {
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe[^>]*>/gi,
      /<object[^>]*>/gi,
      /<embed[^>]*>/gi,
      /<link[^>]*>/gi,
      /<meta[^>]*>/gi,
      /<style[^>]*>/gi,
      /<form[^>]*>/gi,
      /<input[^>]*>/gi,
      /<textarea[^>]*>/gi,
      /<select[^>]*>/gi,
      /<button[^>]*>/gi,
      /<img[^>]*>/gi,
      /<svg[^>]*>/gi,
      /<math[^>]*>/gi,
      /<applet[^>]*>/gi,
      /<base[^>]*>/gi,
      /<bgsound[^>]*>/gi,
      /<link[^>]*>/gi,
      /<meta[^>]*>/gi,
      /<title[^>]*>/gi,
      /<xml[^>]*>/gi,
      /<xmp[^>]*>/gi,
      /<plaintext[^>]*>/gi,
      /<listing[^>]*>/gi,
      /<marquee[^>]*>/gi,
      /<blink[^>]*>/gi,
      /<isindex[^>]*>/gi,
      /<nextid[^>]*>/gi,
      /<spacer[^>]*>/gi,
      /<wbr[^>]*>/gi,
      /<noembed[^>]*>/gi,
      /<noframes[^>]*>/gi,
      /<noscript[^>]*>/gi,
      /<nobr[^>]*>/gi,
      /<noindex[^>]*>/gi,
      /<nolayer[^>]*>/gi,
      /<nosmartquotes[^>]*>/gi,
      /<nospellcheck[^>]*>/gi,
      /<nobr[^>]*>/gi,
      /<noembed[^>]*>/gi,
      /<noframes[^>]*>/gi,
      /<noscript[^>]*>/gi,
      /<nobr[^>]*>/gi,
      /<noindex[^>]*>/gi,
      /<nolayer[^>]*>/gi,
      /<nosmartquotes[^>]*>/gi,
      /<nospellcheck[^>]*>/gi
    ];

    const body = JSON.stringify(req.body);
    const query = JSON.stringify(req.query);
    const params = JSON.stringify(req.params);

    for (const pattern of xssPatterns) {
      if (pattern.test(body) || pattern.test(query) || pattern.test(params)) {
        auditService.logSecurityEvent(
          SecurityEventType.XSS_ATTEMPT,
          `XSS attempt detected from IP ${req.ip}`,
          SecuritySeverity.HIGH,
          req,
          { body, query, params }
        );

        return res.status(400).json({
          success: false,
          error: {
            code: 'SECURITY_VIOLATION',
            message: 'Invalid request detected'
          },
          timestamp: new Date().toISOString()
        });
      }
    }

    next();
  }

  /**
   * Rate limiting by IP
   */
  static rateLimitByIP(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxRequests = 100;

    // Simple in-memory rate limiting (in production, use Redis)
    if (!global.rateLimitStore) {
      global.rateLimitStore = new Map();
    }

    const key = `rate_limit:${ip}`;
    const current = global.rateLimitStore.get(key) || { count: 0, resetTime: now + windowMs };

    if (now > current.resetTime) {
      current.count = 1;
      current.resetTime = now + windowMs;
    } else {
      current.count++;
    }

    global.rateLimitStore.set(key, current);

    if (current.count > maxRequests) {
      auditService.logSecurityEvent(
        SecurityEventType.RATE_LIMIT_EXCEEDED,
        `Rate limit exceeded for IP ${ip}`,
        SecuritySeverity.MEDIUM,
        req,
        { count: current.count, maxRequests }
      );

      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests from this IP'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Add rate limit headers
    res.set('X-RateLimit-Limit', maxRequests.toString());
    res.set('X-RateLimit-Remaining', Math.max(0, maxRequests - current.count).toString());
    res.set('X-RateLimit-Reset', new Date(current.resetTime).toISOString());

    next();
  }

  /**
   * Request size limiting
   */
  static requestSizeLimit(req: Request, res: Response, next: NextFunction) {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const contentLength = parseInt(req.headers['content-length'] || '0');

    if (contentLength > maxSize) {
      auditService.logSecurityEvent(
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        `Large request detected from IP ${req.ip}`,
        SecuritySeverity.MEDIUM,
        req,
        { contentLength, maxSize }
      );

      return res.status(413).json({
        success: false,
        error: {
          code: 'REQUEST_TOO_LARGE',
          message: 'Request entity too large'
        },
        timestamp: new Date().toISOString()
      });
    }

    next();
  }

  /**
   * Content type validation
   */
  static validateContentType(req: Request, res: Response, next: NextFunction) {
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      const contentType = req.headers['content-type'];
      
      if (!contentType || !contentType.includes('application/json')) {
        auditService.logSecurityEvent(
          SecurityEventType.SUSPICIOUS_ACTIVITY,
          `Invalid content type from IP ${req.ip}`,
          SecuritySeverity.LOW,
          req,
          { contentType, method: req.method }
        );

        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CONTENT_TYPE',
            message: 'Content-Type must be application/json'
          },
          timestamp: new Date().toISOString()
        });
      }
    }

    next();
  }

  /**
   * User agent validation
   */
  static validateUserAgent(req: Request, res: Response, next: NextFunction) {
    const userAgent = req.headers['user-agent'];
    
    if (!userAgent) {
      auditService.logSecurityEvent(
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        `Missing User-Agent from IP ${req.ip}`,
        SecuritySeverity.LOW,
        req
      );
    } else if (userAgent.length > 500) {
      auditService.logSecurityEvent(
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        `Suspicious User-Agent length from IP ${req.ip}`,
        SecuritySeverity.MEDIUM,
        req,
        { userAgentLength: userAgent.length }
      );
    }

    next();
  }

  /**
   * Request timeout protection
   */
  static requestTimeout(timeoutMs: number = 30000) {
    return (req: Request, res: Response, next: NextFunction) => {
      const timeout = setTimeout(() => {
        auditService.logSecurityEvent(
          SecurityEventType.SUSPICIOUS_ACTIVITY,
          `Request timeout from IP ${req.ip}`,
          SecuritySeverity.MEDIUM,
          req,
          { timeoutMs }
        );

        if (!res.headersSent) {
          res.status(408).json({
            success: false,
            error: {
              code: 'REQUEST_TIMEOUT',
              message: 'Request timeout'
            },
            timestamp: new Date().toISOString()
          });
        }
      }, timeoutMs);

      res.on('finish', () => {
        clearTimeout(timeout);
      });

      next();
    };
  }

  /**
   * Comprehensive security middleware
   */
  static comprehensive(req: Request, res: Response, next: NextFunction) {
    // Apply all security checks
    this.sqlInjectionProtection(req, res, (err) => {
      if (err) return next(err);
      
      this.xssProtection(req, res, (err) => {
        if (err) return next(err);
        
        this.rateLimitByIP(req, res, (err) => {
          if (err) return next(err);
          
          this.requestSizeLimit(req, res, (err) => {
            if (err) return next(err);
            
            this.validateContentType(req, res, (err) => {
              if (err) return next(err);
              
              this.validateUserAgent(req, res, next);
            });
          });
        });
      });
    });
  }
}

// Extend global types
declare global {
  var rateLimitStore: Map<string, { count: number; resetTime: number }>;
}

// Export middleware functions
export const sqlInjectionProtection = SecurityMiddleware.sqlInjectionProtection.bind(SecurityMiddleware);
export const xssProtection = SecurityMiddleware.xssProtection.bind(SecurityMiddleware);
export const rateLimitByIP = SecurityMiddleware.rateLimitByIP.bind(SecurityMiddleware);
export const requestSizeLimit = SecurityMiddleware.requestSizeLimit.bind(SecurityMiddleware);
export const validateContentType = SecurityMiddleware.validateContentType.bind(SecurityMiddleware);
export const validateUserAgent = SecurityMiddleware.validateUserAgent.bind(SecurityMiddleware);
export const requestTimeout = SecurityMiddleware.requestTimeout.bind(SecurityMiddleware);
export const comprehensiveSecurity = SecurityMiddleware.comprehensive.bind(SecurityMiddleware); 