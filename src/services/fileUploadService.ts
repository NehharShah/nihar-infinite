import { v4 as uuidv4 } from 'uuid';
import { Database } from '../database/database.js';

export interface FileUploadRequest {
  resource_type: 'account' | 'customer' | 'transfer' | 'payment';
  resource_id: string;
  file_name: string;
  file_size: number;
  content_type: string;
  user_id: string;
}

export interface FileUploadResponse {
  upload_id: string;
  upload_url: string;
  file_id: string;
  expires_at: string;
  fields: Record<string, string>;
}

export interface FileMetadata {
  id: string;
  resource_type: string;
  resource_id: string;
  file_name: string;
  file_size: number;
  content_type: string;
  gcp_bucket: string;
  gcp_key: string;
  upload_status: 'pending' | 'uploaded' | 'failed';
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface FileDownloadResponse {
  download_url: string;
  file_name: string;
  content_type: string;
  file_size: number;
  expires_at: string;
}

export class FileUploadService {
  private db: Database;
  private gcpBucketName: string;
  private gcpProjectId: string;

  constructor() {
    this.db = Database.getInstance();
    this.gcpBucketName = process.env.GCP_BUCKET_NAME || 'crossborder-payments-invoices';
    this.gcpProjectId = process.env.GCP_PROJECT_ID || 'crossborder-payments-dev';
  }

  /**
   * Generate upload URL for file upload to GCP bucket
   */
  async generateUploadUrl(request: FileUploadRequest): Promise<FileUploadResponse> {
    // Validate request
    this.validateUploadRequest(request);

    // Generate unique file ID and GCP key
    const fileId = uuidv4();
    const uploadId = uuidv4();
    const gcpKey = this.generateGcpKey(request.resource_type, request.resource_id, fileId, request.file_name);

    // Create file metadata record
    const fileMetadata: Omit<FileMetadata, 'created_at' | 'updated_at'> = {
      id: fileId,
      resource_type: request.resource_type,
      resource_id: request.resource_id,
      file_name: request.file_name,
      file_size: request.file_size,
      content_type: request.content_type,
      gcp_bucket: this.gcpBucketName,
      gcp_key: gcpKey,
      upload_status: 'pending',
      user_id: request.user_id
    };

    await this.db.run(
      `INSERT INTO file_uploads 
       (id, resource_type, resource_id, file_name, file_size, content_type, 
        gcp_bucket, gcp_key, upload_status, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fileMetadata.id,
        fileMetadata.resource_type,
        fileMetadata.resource_id,
        fileMetadata.file_name,
        fileMetadata.file_size,
        fileMetadata.content_type,
        fileMetadata.gcp_bucket,
        fileMetadata.gcp_key,
        fileMetadata.upload_status,
        fileMetadata.user_id
      ]
    );

    // Generate signed upload URL (mock implementation for now)
    const uploadUrl = await this.generateSignedUploadUrl(gcpKey, request.content_type);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    return {
      upload_id: uploadId,
      upload_url: uploadUrl,
      file_id: fileId,
      expires_at: expiresAt,
      fields: {
        'Content-Type': request.content_type,
        'x-goog-meta-resource-type': request.resource_type,
        'x-goog-meta-resource-id': request.resource_id,
        'x-goog-meta-user-id': request.user_id
      }
    };
  }

  /**
   * Generate download URL for uploaded file
   */
  async generateDownloadUrl(fileId: string, userId: string): Promise<FileDownloadResponse> {
    // Get file metadata
    const fileMetadata = await this.db.get<FileMetadata>(
      'SELECT * FROM file_uploads WHERE id = ? AND user_id = ?',
      [fileId, userId]
    );

    if (!fileMetadata) {
      throw new Error('File not found or access denied');
    }

    if (fileMetadata.upload_status !== 'uploaded') {
      throw new Error('File upload not completed');
    }

    // Generate signed download URL (mock implementation for now)
    const downloadUrl = await this.generateSignedDownloadUrl(fileMetadata.gcp_key);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    return {
      download_url: downloadUrl,
      file_name: fileMetadata.file_name,
      content_type: fileMetadata.content_type,
      file_size: fileMetadata.file_size,
      expires_at: expiresAt
    };
  }

  /**
   * Mark file as uploaded (called after successful upload)
   */
  async markFileAsUploaded(fileId: string): Promise<void> {
    await this.db.run(
      'UPDATE file_uploads SET upload_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['uploaded', fileId]
    );
  }

  /**
   * Get files for a specific resource
   */
  async getFilesForResource(resourceType: string, resourceId: string, userId: string): Promise<FileMetadata[]> {
    return await this.db.all<FileMetadata>(
      `SELECT * FROM file_uploads 
       WHERE resource_type = ? AND resource_id = ? AND user_id = ?
       ORDER BY created_at DESC`,
      [resourceType, resourceId, userId]
    );
  }

  /**
   * Delete file (mark as deleted)
   */
  async deleteFile(fileId: string, userId: string): Promise<void> {
    const result = await this.db.run(
      'DELETE FROM file_uploads WHERE id = ? AND user_id = ?',
      [fileId, userId]
    );

    if (result.changes === 0) {
      throw new Error('File not found or access denied');
    }
  }

  /**
   * Validate upload request
   */
  private validateUploadRequest(request: FileUploadRequest): void {
    if (!request.resource_type || !['account', 'customer', 'transfer', 'payment'].includes(request.resource_type)) {
      throw new Error('Invalid resource type');
    }

    if (!request.resource_id) {
      throw new Error('Resource ID is required');
    }

    if (!request.file_name) {
      throw new Error('File name is required');
    }

    if (!request.content_type) {
      throw new Error('Content type is required');
    }

    if (request.file_size <= 0 || request.file_size > 50 * 1024 * 1024) { // 50MB limit
      throw new Error('File size must be between 1 byte and 50MB');
    }

    // Validate file type (only allow common document types)
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (!allowedTypes.includes(request.content_type)) {
      throw new Error('File type not allowed. Only PDF, images, and Office documents are supported');
    }
  }

  /**
   * Generate GCP key for file storage
   */
  private generateGcpKey(resourceType: string, resourceId: string, fileId: string, fileName: string): string {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const extension = fileName.split('.').pop() || '';
    return `${resourceType}/${resourceId}/${timestamp}/${fileId}.${extension}`;
  }

  /**
   * Generate signed upload URL (mock implementation)
   * In production, this would use Google Cloud Storage signed URLs
   */
  private async generateSignedUploadUrl(gcpKey: string, contentType: string): Promise<string> {
    // Mock implementation - in production, this would use @google-cloud/storage
    const baseUrl = `https://storage.googleapis.com/${this.gcpBucketName}`;
    const signedUrl = `${baseUrl}/upload/${gcpKey}?contentType=${encodeURIComponent(contentType)}`;
    
    console.log(`Generated mock upload URL: ${signedUrl}`);
    return signedUrl;
  }

  /**
   * Generate signed download URL (mock implementation)
   * In production, this would use Google Cloud Storage signed URLs
   */
  private async generateSignedDownloadUrl(gcpKey: string): Promise<string> {
    // Mock implementation - in production, this would use @google-cloud/storage
    const baseUrl = `https://storage.googleapis.com/${this.gcpBucketName}`;
    const signedUrl = `${baseUrl}/download/${gcpKey}`;
    
    console.log(`Generated mock download URL: ${signedUrl}`);
    return signedUrl;
  }
} 