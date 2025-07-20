import express from 'express';
import { Database } from '../database/database.js';
import { AuthService, AuthenticatedRequest } from '../middleware/auth.js';

const router = express.Router();
const db = Database.getInstance();
const authService = new AuthService();

// Get transaction ledger for authenticated user
router.get('/transactions', authService.validateAuth.bind(authService), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const apiKeyId = req.apiKey?.id;
    
    if (!userId && !apiKeyId) {
      return res.status(401).json({ error: { message: 'Authentication required' } });
    }

    const { page = 1, limit = 50, status, type, startDate, endDate } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClause = '';
    const params: any[] = [];

    if (userId) {
      whereClause = 'WHERE p.user_id = ?';
      params.push(userId);
    } else if (apiKeyId) {
      // For API key users, we need to join with audit logs to get their transactions
      whereClause = 'WHERE al.api_key_id = ?';
      params.push(apiKeyId);
    }

    if (status) {
      whereClause += whereClause ? ' AND p.status = ?' : 'WHERE p.status = ?';
      params.push(status);
    }

    if (type) {
      whereClause += whereClause ? ' AND t.type = ?' : 'WHERE t.type = ?';
      params.push(type);
    }

    if (startDate) {
      whereClause += whereClause ? ' AND p.created_at >= ?' : 'WHERE p.created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += whereClause ? ' AND p.created_at <= ?' : 'WHERE p.created_at <= ?';
      params.push(endDate);
    }

    // Get transactions with payment details
    const transactions = await db.all(`
      SELECT 
        p.id as payment_id,
        p.user_id,
        p.source_amount,
        p.source_currency,
        p.destination_amount,
        p.destination_currency,
        p.exchange_rate,
        p.status as payment_status,
        p.fee_amount,
        p.total_amount,
        p.created_at as payment_created_at,
        p.updated_at as payment_updated_at,
        t.id as transaction_id,
        t.type as transaction_type,
        t.amount as transaction_amount,
        t.currency as transaction_currency,
        t.status as transaction_status,
        t.external_reference,
        t.provider,
        t.metadata,
        t.created_at as transaction_created_at,
        t.updated_at as transaction_updated_at
      FROM payments p
      LEFT JOIN transactions t ON p.id = t.payment_id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, Number(limit), offset]);

    // Get total count for pagination
    const countResult = await db.get<{ total: number }>(`
      SELECT COUNT(DISTINCT p.id) as total
      FROM payments p
      LEFT JOIN transactions t ON p.id = t.payment_id
      ${whereClause}
    `, params);

    const total = countResult?.total || 0;

    // Get summary statistics
    const stats = await db.get(`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END) as completed_transactions,
        SUM(CASE WHEN p.status = 'failed' THEN 1 ELSE 0 END) as failed_transactions,
        SUM(CASE WHEN p.status = 'pending' THEN 1 ELSE 0 END) as pending_transactions,
        SUM(p.total_amount) as total_volume,
        SUM(p.fee_amount) as total_fees,
        AVG(p.exchange_rate) as avg_exchange_rate
      FROM payments p
      ${whereClause}
    `, params);

    res.json({
      data: {
        transactions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        },
        statistics: stats
      }
    });

  } catch (error) {
    console.error('Error fetching ledger:', error);
    res.status(500).json({ error: { message: 'Failed to fetch transaction ledger' } });
  }
});

// Get transaction details by ID
router.get('/transactions/:transactionId', authService.validateAuth.bind(authService), async (req: AuthenticatedRequest, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user?.id;
    const apiKeyId = req.apiKey?.id;

    if (!userId && !apiKeyId) {
      return res.status(401).json({ error: { message: 'Authentication required' } });
    }

    let whereClause = 'WHERE t.id = ?';
    const params = [transactionId];

    if (userId) {
      whereClause += ' AND p.user_id = ?';
      params.push(userId);
    } else if (apiKeyId) {
      whereClause += ' AND al.api_key_id = ?';
      params.push(apiKeyId);
    }

    const transaction = await db.get(`
      SELECT 
        p.id as payment_id,
        p.user_id,
        p.source_amount,
        p.source_currency,
        p.destination_amount,
        p.destination_currency,
        p.exchange_rate,
        p.status as payment_status,
        p.fee_amount,
        p.total_amount,
        p.created_at as payment_created_at,
        p.updated_at as payment_updated_at,
        t.id as transaction_id,
        t.type as transaction_type,
        t.amount as transaction_amount,
        t.currency as transaction_currency,
        t.status as transaction_status,
        t.external_reference,
        t.provider,
        t.metadata,
        t.created_at as transaction_created_at,
        t.updated_at as transaction_updated_at
      FROM transactions t
      JOIN payments p ON t.payment_id = p.id
      ${whereClause}
    `, params);

    if (!transaction) {
      return res.status(404).json({ error: { message: 'Transaction not found' } });
    }

    // Parse metadata if it exists
    if ((transaction as any).metadata) {
      try {
        (transaction as any).metadata = JSON.parse((transaction as any).metadata as string);
      } catch (error) {
        // Keep as string if parsing fails
      }
    }

    res.json({ data: transaction });

  } catch (error) {
    console.error('Error fetching transaction details:', error);
    res.status(500).json({ error: { message: 'Failed to fetch transaction details' } });
  }
});

// Get analytics/summary data
router.get('/analytics', authService.validateAuth.bind(authService), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const apiKeyId = req.apiKey?.id;
    
    if (!userId && !apiKeyId) {
      return res.status(401).json({ error: { message: 'Authentication required' } });
    }

    let whereClause = '';
    const params: any[] = [];

    if (userId) {
      whereClause = 'WHERE p.user_id = ?';
      params.push(userId);
    } else if (apiKeyId) {
      whereClause = 'WHERE al.api_key_id = ?';
      params.push(apiKeyId);
    }

    // Get daily volume for the last 30 days
    const dailyVolume = await db.all(`
      SELECT 
        DATE(p.created_at) as date,
        COUNT(*) as transaction_count,
        SUM(p.total_amount) as total_volume,
        SUM(p.fee_amount) as total_fees,
        AVG(p.exchange_rate) as avg_exchange_rate
      FROM payments p
      ${whereClause}
      AND p.created_at >= DATE('now', '-30 days')
      GROUP BY DATE(p.created_at)
      ORDER BY date DESC
    `, params);

    // Get currency breakdown
    const currencyBreakdown = await db.all(`
      SELECT 
        p.source_currency,
        p.destination_currency,
        COUNT(*) as transaction_count,
        SUM(p.total_amount) as total_volume,
        AVG(p.exchange_rate) as avg_exchange_rate
      FROM payments p
      ${whereClause}
      GROUP BY p.source_currency, p.destination_currency
      ORDER BY total_volume DESC
    `, params);

    // Get status breakdown
    const statusBreakdown = await db.all(`
      SELECT 
        p.status,
        COUNT(*) as count,
        SUM(p.total_amount) as total_volume
      FROM payments p
      ${whereClause}
      GROUP BY p.status
    `, params);

    res.json({
      data: {
        dailyVolume,
        currencyBreakdown,
        statusBreakdown
      }
    });

  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: { message: 'Failed to fetch analytics' } });
  }
});

export default router; 