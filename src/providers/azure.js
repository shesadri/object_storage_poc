const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');
const fs = require('fs-extra');
const path = require('path');
const { BaseStorageProvider } = require('./base');
const mimeTypes = require('mime-types');

class AzureStorageProvider extends BaseStorageProvider {
  constructor(config) {
    super(config);
    this.name = 'azure';
    this.blobServiceClient = null;
    this.containerClient = null;
    this.containerName = config.containerName;
  }

  async initialize() {
    this.validateConfig();
    
    try {
      if (this.config.connectionString) {
        this.blobServiceClient = BlobServiceClient.fromConnectionString(this.config.connectionString);
      } else {
        const credential = new StorageSharedKeyCredential(this.config.accountName, this.config.accountKey);
        this.blobServiceClient = new BlobServiceClient(
          `https://${this.config.accountName}.blob.core.windows.net`,
          credential
        );
      }

      this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);

      // Test connection
      const exists = await this.containerClient.exists();
      if (!exists) {
        throw new Error(`Container '${this.containerName}' does not exist`);
      }
    } catch (error) {
      throw new Error(`Failed to connect to Azure Blob Storage: ${error.message}`);
    }
  }

  async upload(key, data, options = {}) {
    const startTime = Date.now();
    
    let uploadData;
    let contentLength = 0;
    let contentType = options.contentType;

    try {
      const blobClient = this.containerClient.getBlockBlobClient(key);
      
      if (typeof data === 'string' && fs.existsSync(data)) {
        const stats = await fs.stat(data);
        contentLength = stats.size;
        
        if (!contentType) {
          contentType = mimeTypes.lookup(data) || 'application/octet-stream';
        }

        uploadData = await fs.readFile(data);
      } else {
        uploadData = Buffer.isBuffer(data) ? data : Buffer.from(data);
        contentLength = uploadData.length;
      }

      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: contentType || 'application/octet-stream'
        },
        metadata: options.metadata || {}
      };

      const uploadResponse = await blobClient.upload(uploadData, contentLength, uploadOptions);
      const endTime = Date.now();
      
      return {
        success: true,
        key: key,
        location: blobClient.url,
        etag: uploadResponse.etag,
        size: contentLength,
        uploadTime: endTime - startTime,
        provider: this.name
      };
    } catch (error) {
      throw new Error(`Azure Blob Storage upload failed: ${error.message}`);
    }
  }

  async download(key, destinationPath) {
    const startTime = Date.now();
    
    try {
      const blobClient = this.containerClient.getBlockBlobClient(key);
      
      // Check if blob exists
      const exists = await blobClient.exists();
      if (!exists) {
        throw new Error(`Object '${key}' not found`);
      }

      // Ensure destination directory exists
      await fs.ensureDir(path.dirname(destinationPath));
      
      // Download blob
      await blobClient.downloadToFile(destinationPath);
      
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
      throw new Error(`Azure Blob Storage download failed: ${error.message}`);
    }
  }

  async getMetadata(key) {
    try {
      const blobClient = this.containerClient.getBlockBlobClient(key);
      const properties = await blobClient.getProperties();
      
      return {
        key: key,
        size: properties.contentLength,
        lastModified: properties.lastModified,
        etag: properties.etag,
        contentType: properties.contentType,
        metadata: properties.metadata || {},
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
      const listOptions = {
        includeMetadata: true
      };

      if (options.prefix) {
        listOptions.prefix = options.prefix;
      }

      const objects = [];
      let count = 0;
      const limit = options.limit || 1000;
      
      for await (const blob of this.containerClient.listBlobsFlat(listOptions)) {
        if (count >= limit) break;
        
        objects.push({
          key: blob.name,
          size: blob.properties.contentLength,
          lastModified: blob.properties.lastModified,
          etag: blob.properties.etag,
          contentType: blob.properties.contentType
        });
        
        count++;
      }

      return {
        objects: objects,
        isTruncated: count >= limit,
        provider: this.name
      };
    } catch (error) {
      throw new Error(`Azure Blob Storage list failed: ${error.message}`);
    }
  }

  async delete(key) {
    try {
      const blobClient = this.containerClient.getBlockBlobClient(key);
      await blobClient.delete();
      
      return {
        success: true,
        key: key,
        provider: this.name
      };
    } catch (error) {
      throw new Error(`Azure Blob Storage delete failed: ${error.message}`);
    }
  }

  async exists(key) {
    try {
      const blobClient = this.containerClient.getBlockBlobClient(key);
      return await blobClient.exists();
    } catch (error) {
      throw new Error(`Failed to check existence: ${error.message}`);
    }
  }

  async getSignedUrl(key, options = {}) {
    try {
      const blobClient = this.containerClient.getBlockBlobClient(key);
      const expires = options.expires || 3600;
      const permissions = options.method === 'PUT' ? BlobSASPermissions.parse('w') : BlobSASPermissions.parse('r');
      
      const sasToken = generateBlobSASQueryParameters({
        containerName: this.containerName,
        blobName: key,
        permissions: permissions,
        startsOn: new Date(),
        expiresOn: new Date(Date.now() + expires * 1000)
      }, this.blobServiceClient.credential).toString();
      
      const url = `${blobClient.url}?${sasToken}`;
      
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
      const sourceBlobClient = this.containerClient.getBlockBlobClient(sourceKey);
      const destinationBlobClient = this.containerClient.getBlockBlobClient(destinationKey);
      
      const copyResponse = await destinationBlobClient.startCopyFromURL(sourceBlobClient.url);
      
      // Wait for copy to complete
      let copyStatus = 'pending';
      while (copyStatus === 'pending') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const properties = await destinationBlobClient.getProperties();
        copyStatus = properties.copyStatus;
      }
      
      if (copyStatus !== 'success') {
        throw new Error(`Copy operation failed with status: ${copyStatus}`);
      }
      
      return {
        success: true,
        sourceKey: sourceKey,
        destinationKey: destinationKey,
        copyId: copyResponse.copyId,
        provider: this.name
      };
    } catch (error) {
      throw new Error(`Azure Blob Storage copy failed: ${error.message}`);
    }
  }

  validateConfig() {
    super.validateConfig();
    
    if (!this.config.containerName) {
      throw new Error('Container name is required for Azure Blob Storage');
    }

    if (!this.config.connectionString) {
      const required = ['accountName', 'accountKey'];
      const missing = required.filter(field => !this.config[field]);
      
      if (missing.length > 0) {
        throw new Error(`Missing required Azure configuration: ${missing.join(', ')} (or provide connectionString)`);
      }
    }
  }

  getInfo() {
    const baseInfo = super.getInfo();
    return {
      ...baseInfo,
      name: 'Azure Blob Storage',
      container: this.containerName,
      accountName: this.config.accountName
    };
  }
}

module.exports = { AzureStorageProvider };