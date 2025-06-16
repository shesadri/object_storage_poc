const AWS = require('aws-sdk');
const fs = require('fs-extra');
const path = require('path');
const { BaseStorageProvider } = require('./base');
const mimeTypes = require('mime-types');

class AWSStorageProvider extends BaseStorageProvider {
  constructor(config) {
    super(config);
    this.name = 'aws';
    this.s3 = null;
    this.bucket = config.bucket;
  }

  async initialize() {
    this.validateConfig();
    
    // Configure AWS SDK
    const awsConfig = {
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey
    };

    // Support for S3-compatible services
    if (this.config.endpoint) {
      awsConfig.endpoint = this.config.endpoint;
      awsConfig.s3ForcePathStyle = true;
    }

    this.s3 = new AWS.S3(awsConfig);

    // Test connection
    try {
      await this.s3.headBucket({ Bucket: this.bucket }).promise();
    } catch (error) {
      if (error.statusCode === 404) {
        throw new Error(`Bucket '${this.bucket}' does not exist`);
      }
      throw new Error(`Failed to connect to AWS S3: ${error.message}`);
    }
  }

  async upload(key, data, options = {}) {
    const startTime = Date.now();
    
    let uploadData;
    let contentLength = 0;
    let contentType = options.contentType;

    // Handle different data types
    if (typeof data === 'string' && fs.existsSync(data)) {
      // File path
      uploadData = fs.createReadStream(data);
      const stats = await fs.stat(data);
      contentLength = stats.size;
      
      if (!contentType) {
        contentType = mimeTypes.lookup(data) || 'application/octet-stream';
      }
    } else if (Buffer.isBuffer(data)) {
      // Buffer
      uploadData = data;
      contentLength = data.length;
    } else {
      // String or other
      uploadData = Buffer.from(data);
      contentLength = uploadData.length;
    }

    const params = {
      Bucket: this.bucket,
      Key: key,
      Body: uploadData,
      ContentType: contentType || 'application/octet-stream',
      Metadata: options.metadata || {}
    };

    // Add server-side encryption if specified
    if (options.encryption) {
      params.ServerSideEncryption = 'AES256';
    }

    try {
      const result = await this.s3.upload(params).promise();
      const endTime = Date.now();
      
      return {
        success: true,
        key: key,
        location: result.Location,
        etag: result.ETag,
        size: contentLength,
        uploadTime: endTime - startTime,
        provider: this.name
      };
    } catch (error) {
      throw new Error(`AWS S3 upload failed: ${error.message}`);
    }
  }

  async download(key, destinationPath) {
    const startTime = Date.now();
    
    try {
      const params = {
        Bucket: this.bucket,
        Key: key
      };

      const result = await this.s3.getObject(params).promise();
      
      // Ensure destination directory exists
      await fs.ensureDir(path.dirname(destinationPath));
      
      // Write file
      await fs.writeFile(destinationPath, result.Body);
      
      const endTime = Date.now();
      
      return {
        success: true,
        key: key,
        destinationPath: destinationPath,
        size: result.ContentLength,
        downloadTime: endTime - startTime,
        metadata: result.Metadata,
        provider: this.name
      };
    } catch (error) {
      if (error.statusCode === 404) {
        throw new Error(`Object '${key}' not found`);
      }
      throw new Error(`AWS S3 download failed: ${error.message}`);
    }
  }

  async getMetadata(key) {
    try {
      const params = {
        Bucket: this.bucket,
        Key: key
      };

      const result = await this.s3.headObject(params).promise();
      
      return {
        key: key,
        size: result.ContentLength,
        lastModified: result.LastModified,
        etag: result.ETag,
        contentType: result.ContentType,
        metadata: result.Metadata,
        provider: this.name
      };
    } catch (error) {
      if (error.statusCode === 404) {
        throw new Error(`Object '${key}' not found`);
      }
      throw new Error(`Failed to get metadata: ${error.message}`);
    }
  }

  async list(options = {}) {
    try {
      const params = {
        Bucket: this.bucket,
        MaxKeys: options.limit || 1000
      };

      if (options.prefix) {
        params.Prefix = options.prefix;
      }

      if (options.continuationToken) {
        params.ContinuationToken = options.continuationToken;
      }

      const result = await this.s3.listObjectsV2(params).promise();
      
      const objects = result.Contents.map(obj => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
        etag: obj.ETag,
        storageClass: obj.StorageClass
      }));

      return {
        objects: objects,
        isTruncated: result.IsTruncated,
        nextContinuationToken: result.NextContinuationToken,
        provider: this.name
      };
    } catch (error) {
      throw new Error(`AWS S3 list failed: ${error.message}`);
    }
  }

  async delete(key) {
    try {
      const params = {
        Bucket: this.bucket,
        Key: key
      };

      await this.s3.deleteObject(params).promise();
      
      return {
        success: true,
        key: key,
        provider: this.name
      };
    } catch (error) {
      throw new Error(`AWS S3 delete failed: ${error.message}`);
    }
  }

  async exists(key) {
    try {
      const params = {
        Bucket: this.bucket,
        Key: key
      };

      await this.s3.headObject(params).promise();
      return true;
    } catch (error) {
      if (error.statusCode === 404) {
        return false;
      }
      throw new Error(`Failed to check existence: ${error.message}`);
    }
  }

  async getSignedUrl(key, options = {}) {
    try {
      const operation = options.method || 'getObject';
      const expires = options.expires || 3600; // 1 hour default
      
      const params = {
        Bucket: this.bucket,
        Key: key,
        Expires: expires
      };

      const url = this.s3.getSignedUrl(operation, params);
      
      return {
        url: url,
        expires: new Date(Date.now() + expires * 1000),
        provider: this.name
      };
    } catch (error) {
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  async copy(sourceKey, destinationKey) {
    try {
      const params = {
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destinationKey
      };

      const result = await this.s3.copyObject(params).promise();
      
      return {
        success: true,
        sourceKey: sourceKey,
        destinationKey: destinationKey,
        etag: result.CopyObjectResult.ETag,
        provider: this.name
      };
    } catch (error) {
      throw new Error(`AWS S3 copy failed: ${error.message}`);
    }
  }

  validateConfig() {
    super.validateConfig();
    
    const required = ['region', 'bucket', 'accessKeyId', 'secretAccessKey'];
    const missing = required.filter(field => !this.config[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required AWS configuration: ${missing.join(', ')}`);
    }
  }

  getInfo() {
    const baseInfo = super.getInfo();
    return {
      ...baseInfo,
      name: 'AWS S3',
      bucket: this.bucket,
      region: this.config.region,
      endpoint: this.config.endpoint || 'AWS S3'
    };
  }
}

module.exports = { AWSStorageProvider };