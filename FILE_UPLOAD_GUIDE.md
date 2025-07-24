# File Upload System Guide

## Overview

The Cross-Border Payment API now includes a comprehensive file upload system that enables secure file uploads for invoices and documents. The system integrates with Google Cloud Storage (GCP) buckets and provides a complete workflow for uploading, managing, and downloading files.

## Features

- **Secure File Uploads**: Direct upload to GCP buckets with signed URLs
- **Resource-Based Organization**: Files are organized by resource type (payment, account, customer, transfer)
- **Progress Feedback**: Real-time upload progress tracking
- **File Validation**: Type and size validation with configurable limits
- **Download Management**: Secure download URLs with expiration
- **Audit Logging**: Complete audit trail for all file operations
- **Frontend Integration**: Ready-to-use HTML/JavaScript demo

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Server    │    │   GCP Storage   │
│   (Browser)     │    │   (Node.js)     │    │   (Bucket)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │ 1. Request Upload URL │                       │
         │──────────────────────▶│                       │
         │                       │                       │
         │ 2. Upload URL + Fields│                       │
         │◀──────────────────────│                       │
         │                       │                       │
         │ 3. Upload File        │                       │
         │──────────────────────────────────────────────▶│
         │                       │                       │
         │ 4. Mark Complete      │                       │
         │──────────────────────▶│                       │
         │                       │                       │
         │ 5. Success Response   │                       │
         │◀──────────────────────│                       │
```

## Setup Instructions

### 1. Environment Configuration

Add the following environment variables to your `.env` file:

```bash
# GCP Configuration
GCP_BUCKET_NAME=crossborder-payments-invoices
GCP_PROJECT_ID=crossborder-payments-dev

# Optional: GCP Service Account (for production)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup

The file upload tables will be automatically created when you start the server:

```bash
npm run dev
```

### 4. GCP Bucket Setup (Production)

For production use, you'll need to:

1. Create a GCP project
2. Enable Cloud Storage API
3. Create a storage bucket
4. Set up service account credentials
5. Configure bucket permissions

## API Endpoints

### Generate Upload URL

**POST** `/api/v1/uploads/generate-url`

Generate a signed URL for direct file upload to GCP.

**Request Body:**
```json
{
  "resource_type": "payment",
  "resource_id": "payment-123",
  "file_name": "invoice.pdf",
  "file_size": 1024000,
  "content_type": "application/pdf"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "upload_id": "upload-456",
    "upload_url": "https://storage.googleapis.com/...",
    "file_id": "file-789",
    "expires_at": "2024-01-01T12:00:00Z",
    "fields": {
      "Content-Type": "application/pdf",
      "x-goog-meta-resource-type": "payment",
      "x-goog-meta-resource-id": "payment-123"
    }
  }
}
```

### Mark Upload Complete

**POST** `/api/v1/uploads/{fileId}/complete`

Mark a file upload as completed after successful upload to GCP.

**Response:**
```json
{
  "success": true,
  "data": null
}
```

### Get Files for Resource

**GET** `/api/v1/uploads/resource/{resourceType}/{resourceId}`

Retrieve all files associated with a specific resource.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "file-789",
      "file_name": "invoice.pdf",
      "file_size": 1024000,
      "content_type": "application/pdf",
      "upload_status": "uploaded",
      "created_at": "2024-01-01T10:00:00Z"
    }
  ]
}
```

### Generate Download URL

**GET** `/api/v1/uploads/{fileId}/download`

Generate a signed download URL for a file.

**Response:**
```json
{
  "success": true,
  "data": {
    "download_url": "https://storage.googleapis.com/...",
    "file_name": "invoice.pdf",
    "content_type": "application/pdf",
    "file_size": 1024000,
    "expires_at": "2024-01-02T10:00:00Z"
  }
}
```

### Delete File

**DELETE** `/api/v1/uploads/{fileId}`

Delete a file from the system.

**Response:**
```json
{
  "success": true,
  "data": null
}
```

## Frontend Integration

### Demo Page

Access the file upload demo at: `http://localhost:3000/upload-demo`

The demo includes:
- Drag-and-drop file upload
- Progress tracking
- File management interface
- Download functionality

### JavaScript Integration

```javascript
// 1. Generate upload URL
const uploadResponse = await fetch('/api/v1/uploads/generate-url', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-token'
  },
  body: JSON.stringify({
    resource_type: 'payment',
    resource_id: 'payment-123',
    file_name: file.name,
    file_size: file.size,
    content_type: file.type
  })
});

const uploadData = await uploadResponse.json();

// 2. Upload file to GCP
const formData = new FormData();
formData.append('file', file);
Object.keys(uploadData.data.fields).forEach(key => {
  formData.append(key, uploadData.data.fields[key]);
});

await fetch(uploadData.data.upload_url, {
  method: 'POST',
  body: formData
});

// 3. Mark upload complete
await fetch(`/api/v1/uploads/${uploadData.data.file_id}/complete`, {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-token'
  }
});
```

## File Validation

### Supported File Types

- **Documents**: PDF, DOC, DOCX, XLS, XLSX
- **Images**: JPEG, PNG, GIF
- **Size Limit**: 50MB maximum

### Validation Rules

```javascript
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

const maxFileSize = 50 * 1024 * 1024; // 50MB
```

## Security Features

### Authentication
- All endpoints require valid authentication (Bearer token or API key)
- User-based access control for file operations

### File Security
- Signed URLs with expiration times
- Direct upload to GCP (no server storage)
- File type validation
- Size limits enforcement

### Audit Logging
- All file operations are logged
- User activity tracking
- Security event monitoring

## Testing

### Run File Upload Tests

```bash
npm run test:file-upload
```

### Manual Testing

1. Start the server: `npm run dev`
2. Access the demo: `http://localhost:3000/upload-demo`
3. Configure API settings
4. Test file upload functionality

## Production Considerations

### GCP Configuration

1. **Service Account Setup**:
   ```bash
   # Create service account
   gcloud iam service-accounts create file-upload-service
   
   # Grant storage permissions
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
     --member="serviceAccount:file-upload-service@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/storage.objectAdmin"
   
   # Download key file
   gcloud iam service-accounts keys create key.json \
     --iam-account=file-upload-service@YOUR_PROJECT_ID.iam.gserviceaccount.com
   ```

2. **Bucket Configuration**:
   ```bash
   # Create bucket
   gsutil mb gs://your-bucket-name
   
   # Set CORS policy
   gsutil cors set cors.json gs://your-bucket-name
   ```

### CORS Configuration

Create `cors.json`:
```json
[
  {
    "origin": ["https://yourdomain.com"],
    "method": ["GET", "POST", "PUT", "DELETE"],
    "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"],
    "maxAgeSeconds": 3600
  }
]
```

### Environment Variables

```bash
# Production environment
NODE_ENV=production
GCP_BUCKET_NAME=your-production-bucket
GCP_PROJECT_ID=your-production-project
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

## Monitoring and Logging

### File Upload Metrics

Monitor the following metrics:
- Upload success/failure rates
- File size distributions
- Upload duration
- Storage usage

### Log Analysis

```sql
-- Query file upload statistics
SELECT 
  resource_type,
  COUNT(*) as total_files,
  AVG(file_size) as avg_size,
  SUM(file_size) as total_size
FROM file_uploads 
WHERE upload_status = 'uploaded'
GROUP BY resource_type;
```

## Troubleshooting

### Common Issues

1. **Upload URL Expired**
   - Generate a new upload URL
   - Check system clock synchronization

2. **File Type Rejected**
   - Verify file type is in allowed list
   - Check file extension matches content type

3. **File Too Large**
   - Reduce file size or compress
   - Check file size limits

4. **GCP Upload Failed**
   - Verify GCP credentials
   - Check bucket permissions
   - Review CORS configuration

### Debug Mode

Enable debug logging:
```bash
DEBUG=file-upload:* npm run dev
```

## API Documentation

Full API documentation is available at:
- **Swagger UI**: `http://localhost:3000/docs`
- **OpenAPI Spec**: `http://localhost:3000/docs/swagger.json`

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review server logs
3. Test with the demo page
4. Consult API documentation

## Future Enhancements

- **File Processing**: OCR, text extraction
- **Image Processing**: Thumbnail generation, compression
- **Search**: Full-text search across file contents
- **Versioning**: File version management
- **Sharing**: Secure file sharing links
- **Integration**: Webhook notifications for file events 