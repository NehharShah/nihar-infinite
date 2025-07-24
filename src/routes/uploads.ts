import { Router, Request, Response } from 'express';
import { FileUploadService, FileUploadRequest } from '../services/fileUploadService.js';
import { auditMiddleware } from '../middleware/audit.js';
import { AuthService } from '../middleware/auth.js';
import { AuditAction } from '../middleware/audit.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { ApiResponse } from '../types/payment.js';

const router = Router();
const fileUploadService = new FileUploadService();
const authService = new AuthService();

/**
 * @swagger
 * /api/v1/uploads/generate-url:
 *   post:
 *     summary: Generate upload URL for file upload
 *     tags: [File Uploads]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - resource_type
 *               - resource_id
 *               - file_name
 *               - file_size
 *               - content_type
 *             properties:
 *               resource_type:
 *                 type: string
 *                 enum: [account, customer, transfer, payment]
 *                 description: Type of resource the file belongs to
 *               resource_id:
 *                 type: string
 *                 description: ID of the resource
 *               file_name:
 *                 type: string
 *                 description: Name of the file to upload
 *               file_size:
 *                 type: integer
 *                 description: Size of the file in bytes
 *               content_type:
 *                 type: string
 *                 description: MIME type of the file
 *     responses:
 *       200:
 *         description: Upload URL generated successfully
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
 *                         upload_id:
 *                           type: string
 *                         upload_url:
 *                           type: string
 *                         file_id:
 *                           type: string
 *                         expires_at:
 *                           type: string
 *                         fields:
 *                           type: object
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post(
  '/generate-url',
  authService.validateToken.bind(authService),
  auditMiddleware(AuditAction.CREATE, 'file_upload'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const uploadRequest: FileUploadRequest = {
        ...req.body,
        user_id: req.user!.id
      };

      const uploadResponse = await fileUploadService.generateUploadUrl(uploadRequest);
      
      const response: ApiResponse<any> = {
        success: true,
        data: uploadResponse,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Error generating upload URL:', error);
      
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: error.code || 'UPLOAD_URL_GENERATION_FAILED',
          message: error.message || 'Failed to generate upload URL'
        },
        timestamp: new Date().toISOString()
      };

      res.status(400).json(response);
    }
  }
);

/**
 * @swagger
 * /api/v1/uploads/{fileId}/download:
 *   get:
 *     summary: Generate download URL for uploaded file
 *     tags: [File Uploads]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - name: fileId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the file to download
 *     responses:
 *       200:
 *         description: Download URL generated successfully
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
 *                         download_url:
 *                           type: string
 *                         file_name:
 *                           type: string
 *                         content_type:
 *                           type: string
 *                         file_size:
 *                           type: integer
 *                         expires_at:
 *                           type: string
 *       404:
 *         description: File not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get(
  '/:fileId/download',
  authService.validateToken.bind(authService),
  auditMiddleware(AuditAction.READ, 'file_upload'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { fileId } = req.params;
      const userId = req.user!.id;

      const downloadResponse = await fileUploadService.generateDownloadUrl(fileId, userId);
      
      const response: ApiResponse<any> = {
        success: true,
        data: downloadResponse,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Error generating download URL:', error);
      
      const statusCode = error.message.includes('not found') ? 404 : 400;
      
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: error.code || 'DOWNLOAD_URL_GENERATION_FAILED',
          message: error.message || 'Failed to generate download URL'
        },
        timestamp: new Date().toISOString()
      };

      res.status(statusCode).json(response);
    }
  }
);

/**
 * @swagger
 * /api/v1/uploads/{fileId}/complete:
 *   post:
 *     summary: Mark file upload as completed
 *     tags: [File Uploads]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - name: fileId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the file to mark as uploaded
 *     responses:
 *       200:
 *         description: File marked as uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       404:
 *         description: File not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post(
  '/:fileId/complete',
  authService.validateToken.bind(authService),
  auditMiddleware(AuditAction.UPDATE, 'file_upload'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { fileId } = req.params;

      await fileUploadService.markFileAsUploaded(fileId);
      
      const response: ApiResponse<null> = {
        success: true,
        data: null,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Error marking file as uploaded:', error);
      
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: error.code || 'FILE_UPLOAD_COMPLETION_FAILED',
          message: error.message || 'Failed to mark file as uploaded'
        },
        timestamp: new Date().toISOString()
      };

      res.status(400).json(response);
    }
  }
);

/**
 * @swagger
 * /api/v1/uploads/resource/{resourceType}/{resourceId}:
 *   get:
 *     summary: Get files for a specific resource
 *     tags: [File Uploads]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - name: resourceType
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [account, customer, transfer, payment]
 *         description: Type of resource
 *       - name: resourceId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the resource
 *     responses:
 *       200:
 *         description: Files retrieved successfully
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
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           file_name:
 *                             type: string
 *                           file_size:
 *                             type: integer
 *                           content_type:
 *                             type: string
 *                           upload_status:
 *                             type: string
 *                           created_at:
 *                             type: string
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get(
  '/resource/:resourceType/:resourceId',
  authService.validateToken.bind(authService),
  auditMiddleware(AuditAction.READ, 'file_upload'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { resourceType, resourceId } = req.params;
      const userId = req.user!.id;

      const files = await fileUploadService.getFilesForResource(resourceType, resourceId, userId);
      
      const response: ApiResponse<any> = {
        success: true,
        data: files,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Error getting files for resource:', error);
      
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: error.code || 'FILE_RETRIEVAL_FAILED',
          message: error.message || 'Failed to get files for resource'
        },
        timestamp: new Date().toISOString()
      };

      res.status(400).json(response);
    }
  }
);

/**
 * @swagger
 * /api/v1/uploads/{fileId}:
 *   delete:
 *     summary: Delete a file
 *     tags: [File Uploads]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - name: fileId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the file to delete
 *     responses:
 *       200:
 *         description: File deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       404:
 *         description: File not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.delete(
  '/:fileId',
  authService.validateToken.bind(authService),
  auditMiddleware(AuditAction.DELETE, 'file_upload'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { fileId } = req.params;
      const userId = req.user!.id;

      await fileUploadService.deleteFile(fileId, userId);
      
      const response: ApiResponse<null> = {
        success: true,
        data: null,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Error deleting file:', error);
      
      const statusCode = error.message.includes('not found') ? 404 : 400;
      
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: error.code || 'FILE_DELETION_FAILED',
          message: error.message || 'Failed to delete file'
        },
        timestamp: new Date().toISOString()
      };

      res.status(statusCode).json(response);
    }
  }
);

export default router; 