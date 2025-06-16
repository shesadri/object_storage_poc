const { Storage } = require('@google-cloud/storage');
const fs = require('fs-extra');
const path = require('path');
const { BaseStorageProvider } = require('./base');
const mimeTypes = require('mime-types');

class GCPStorageProvider extends BaseStorageProvider {
  constructor(config) {
    super(config);
    this.name = 'gcp';
    this.storage = null;
    this.bucket = null;
    this.bucketName = config.bucket;
  }

  async initialize() {
    this.validateConfig();
    
    // Configure Google Cloud Storage
    const storageOptions = {
      projectId: this.config.projectId
    };

    if (this.config.keyFilename) {
      storageOptions.keyFilename = this.config.keyFilename;
    } else if (this.config.credentials) {
      storageOptions.credentials = this.config.credentials;
    }

    this.storage = new Storage(storageOptions);
    this.bucket = this.storage.bucket(this.bucketName);

    // Test connection
    try {
      const [exists] = await this.bucket.exists();
      if (!exists) {
        throw new Error(`Bucket '${this.bucketName}' does not exist`);
      }
    } catch (error) {
      throw new Error(`Failed to connect to Google Cloud Storage: ${error.message}`);
    }
  }

  async upload(key, data, options = {}) {
    const startTime = Date.now();
    
    let contentLength = 0;
    let contentType = options.contentType;

    const file = this.bucket.file(key);
    
    const uploadOptions = {
      metadata: {
        contentType: contentType || 'application/octet-stream',
        metadata: options.metadata || {}
      },
      resumable: false
    };

    try {
      if (typeof data === 'string' && fs.existsSync(data)) {
        const stats = await fs.stat(data);
        contentLength = stats.size;
        
        if (!contentType) {
          contentType = mimeTypes.lookup(data) || 'application/octet-stream';
          uploadOptions.metadata.contentType = contentType;
        }

        if (contentLength > 5 * 1024 * 1024) {
          uploadOptions.resumable = true;
        }

        await file.save(await fs.readFile(data), uploadOptions);
      } else {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        contentLength = buffer.length;
        await file.save(buffer, uploadOptions);
      }

      const endTime = Date.now();
      
      return {
        success: true,
        key: key,
        location: `gs://${this.bucketName}/${key}`,
        size: contentLength,
        uploadTime: endTime - startTime,
        provider: this.name
      };
    } catch (error) {
      throw new Error(`GCP Storage upload failed: ${error.message}`);
    }
  }

  async download(key, destinationPath) {
    const startTime = Date.now();
    
    try {
      const file = this.bucket.file(key);
      
      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        throw new Error(`Object '${key}' not found`);
      }

      // Ensure destination directory exists
      await fs.ensureDir(path.dirname(destinationPath));
      
      // Download file
      await file.download({ destination: destinationPath });
      
      // Get file stats
      const stats = await fs.stat(destinationPath);
      const endTime = Date.now();
      
      return {
        success: true,
        key: key,
        destinationPath: destinationPath,
        size: stats.size,
        downloadTime: endTime - startTime,
        provider: this.name
      };
    } catch (error) {
      throw new Error(`GCP Storage download failed: ${error.message}`);
    }
  }

  async getMetadata(key) {
    try {
      const file = this.bucket.file(key);
      const [metadata] = await file.getMetadata();
      
      return {
        key: key,
        size: parseInt(metadata.size),
        lastModified: new Date(metadata.updated),
        etag: metadata.etag,
        contentType: metadata.contentType,
        metadata: metadata.metadata || {},
        provider: this.name
      };
    } catch (error) {
      if (error.code === 404) {
        throw new Error(`Object '${key}' not found`);
      }
      throw new Error(`Failed to get metadata: ${error.message}`);
    }
  }

  async list(options = {}) {
    try {
      const queryOptions = {
        maxResults: options.limit || 1000
      };

      if (options.prefix) {
        queryOptions.prefix = options.prefix;
      }

      if (options.pageToken) {
        queryOptions.pageToken = options.pageToken;
      }

      const [files, , metadata] = await this.bucket.getFiles(queryOptions);
      
      const objects = files.map(file => ({
        key: file.name,
        size: parseInt(file.metadata.size),
        lastModified: new Date(file.metadata.updated),
        etag: file.metadata.etag,
        storageClass: file.metadata.storageClass
      }));

      return {
        objects: objects,
        isTruncated: !!metadata.nextPageToken,
        nextPageToken: metadata.nextPageToken,
        provider: this.name
      };
    } catch (error) {
      throw new Error(`GCP Storage list failed: ${error.message}`);
    }
  }

  async delete(key) {
    try {
      const file = this.bucket.file(key);
      await file.delete();
      
      return {
        success: true,
        key: key,
        provider: this.name
      };
    } catch (error) {
      throw new Error(`GCP Storage delete failed: ${error.message}`);
    }
  }

  async exists(key) {
    try {
      const file = this.bucket.file(key);
      const [exists] = await file.exists();
      return exists;
    } catch (error) {
      throw new Error(`Failed to check existence: ${error.message}`);
    }
  }

  async getSignedUrl(key, options = {}) {
    try {
      const action = options.method === 'PUT' ? 'write' : 'read';
      const expires = options.expires ? new Date(Date.now() + options.expires * 1000) : new Date(Date.now() + 3600000);
      
      const file = this.bucket.file(key);
      
      const [url] = await file.getSignedUrl({
        action: action,
        expires: expires
      });
      
      return {
        url: url,
        expires: expires,
        provider: this.name
      };
    } catch (error) {
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  async copy(sourceKey, destinationKey) {
    try {
      const sourceFile = this.bucket.file(sourceKey);
      const destinationFile = this.bucket.file(destinationKey);
      
      await sourceFile.copy(destinationFile);
      
      return {
        success: true,
        sourceKey: sourceKey,
        destinationKey: destinationKey,
        provider: this.name
      };
    } catch (error) {
      throw new Error(`GCP Storage copy failed: ${error.message}`);
    }
  }

  validateConfig() {
    super.validateConfig();
    
    const required = ['projectId', 'bucket'];
    const missing = required.filter(field => !this.config[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required GCP configuration: ${missing.join(', ')}`);
    }

    if (!this.config.keyFilename && !this.config.credentials) {
      throw new Error('Either keyFilename or credentials must be provided for GCP');
    }
  }

  getInfo() {
    const baseInfo = super.getInfo();
    return {
      ...baseInfo,
      name: 'Google Cloud Storage',
      bucket: this.bucketName,
      projectId: this.config.projectId
    };
  }
}

module.exports = { GCPStorageProvider };