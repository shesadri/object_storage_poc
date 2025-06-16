const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { BaseStorageProvider } = require('./base');
const mimeTypes = require('mime-types');

class LocalStorageProvider extends BaseStorageProvider {
  constructor(config) {
    super(config);
    this.name = 'local';
    this.basePath = config.basePath || path.join(process.cwd(), 'local-storage');
    this.metadataPath = path.join(this.basePath, '.metadata');
  }

  async initialize() {
    this.validateConfig();
    
    try {
      await fs.ensureDir(this.basePath);
      await fs.ensureDir(this.metadataPath);
      
      console.log(`Local storage initialized at: ${this.basePath}`);
    } catch (error) {
      throw new Error(`Failed to initialize local storage: ${error.message}`);
    }
  }

  async upload(key, data, options = {}) {
    const startTime = Date.now();
    
    try {
      const filePath = this._getFilePath(key);
      const metadataFile = this._getMetadataPath(key);
      
      await fs.ensureDir(path.dirname(filePath));
      
      let contentLength = 0;
      let contentType = options.contentType;
      
      if (typeof data === 'string' && fs.existsSync(data)) {
        await fs.copy(data, filePath);
        const stats = await fs.stat(filePath);
        contentLength = stats.size;
        
        if (!contentType) {
          contentType = mimeTypes.lookup(data) || 'application/octet-stream';
        }
      } else {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        await fs.writeFile(filePath, buffer);
        contentLength = buffer.length;
      }
      
      const hash = await this._calculateHash(filePath);
      const metadata = {
        key: key,
        size: contentLength,
        contentType: contentType || 'application/octet-stream',
        hash: hash,
        uploadTime: new Date().toISOString(),
        metadata: options.metadata || {}
      };
      
      await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));
      
      const endTime = Date.now();
      
      return {
        success: true,
        key: key,
        location: filePath,
        etag: hash,
        size: contentLength,
        uploadTime: endTime - startTime,
        provider: this.name
      };
    } catch (error) {
      throw new Error(`Local storage upload failed: ${error.message}`);
    }
  }

  async download(key, destinationPath) {
    const startTime = Date.now();
    
    try {
      const filePath = this._getFilePath(key);
      
      const exists = await fs.pathExists(filePath);
      if (!exists) {
        throw new Error(`Object '${key}' not found`);
      }
      
      await fs.ensureDir(path.dirname(destinationPath));
      await fs.copy(filePath, destinationPath);
      
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
      throw new Error(`Local storage download failed: ${error.message}`);
    }
  }

  async getMetadata(key) {
    try {
      const metadataFile = this._getMetadataPath(key);
      const filePath = this._getFilePath(key);
      
      const exists = await fs.pathExists(metadataFile);
      if (!exists) {
        throw new Error(`Object '${key}' not found`);
      }
      
      const metadata = JSON.parse(await fs.readFile(metadataFile, 'utf8'));
      const stats = await fs.stat(filePath);
      
      return {
        key: key,
        size: metadata.size,
        lastModified: stats.mtime,
        etag: metadata.hash,
        contentType: metadata.contentType,
        metadata: metadata.metadata || {},
        provider: this.name
      };
    } catch (error) {
      throw new Error(`Failed to get metadata: ${error.message}`);
    }
  }

  async list(options = {}) {
    try {
      const objects = [];
      const metadataFiles = await this._findMetadataFiles(this.metadataPath);
      
      let count = 0;
      const limit = options.limit || 1000;
      
      for (const metadataFile of metadataFiles) {
        if (count >= limit) break;
        
        try {
          const metadata = JSON.parse(await fs.readFile(metadataFile, 'utf8'));
          
          if (options.prefix && !metadata.key.startsWith(options.prefix)) {
            continue;
          }
          
          const filePath = this._getFilePath(metadata.key);
          const stats = await fs.stat(filePath);
          
          objects.push({
            key: metadata.key,
            size: metadata.size,
            lastModified: stats.mtime,
            etag: metadata.hash,
            contentType: metadata.contentType
          });
          
          count++;
        } catch (error) {
          console.warn(`Skipping invalid metadata file: ${metadataFile}`);
        }
      }
      
      return {
        objects: objects.sort((a, b) => a.key.localeCompare(b.key)),
        isTruncated: count >= limit,
        provider: this.name
      };
    } catch (error) {
      throw new Error(`Local storage list failed: ${error.message}`);
    }
  }

  async delete(key) {
    try {
      const filePath = this._getFilePath(key);
      const metadataFile = this._getMetadataPath(key);
      
      await fs.remove(filePath);
      await fs.remove(metadataFile);
      
      return {
        success: true,
        key: key,
        provider: this.name
      };
    } catch (error) {
      throw new Error(`Local storage delete failed: ${error.message}`);
    }
  }

  async exists(key) {
    try {
      const filePath = this._getFilePath(key);
      return await fs.pathExists(filePath);
    } catch (error) {
      throw new Error(`Failed to check existence: ${error.message}`);
    }
  }

  async getSignedUrl(key, options = {}) {
    // For local storage, return file:// URL
    const filePath = this._getFilePath(key);
    const exists = await fs.pathExists(filePath);
    
    if (!exists) {
      throw new Error(`Object '${key}' not found`);
    }
    
    return {
      url: `file://${path.resolve(filePath)}`,
      expires: new Date(Date.now() + (options.expires || 3600) * 1000),
      provider: this.name
    };
  }

  async copy(sourceKey, destinationKey) {
    try {
      const sourceFilePath = this._getFilePath(sourceKey);
      const destinationFilePath = this._getFilePath(destinationKey);
      const sourceMetadataPath = this._getMetadataPath(sourceKey);
      const destinationMetadataPath = this._getMetadataPath(destinationKey);
      
      const exists = await fs.pathExists(sourceFilePath);
      if (!exists) {
        throw new Error(`Source object '${sourceKey}' not found`);
      }
      
      await fs.ensureDir(path.dirname(destinationFilePath));
      await fs.copy(sourceFilePath, destinationFilePath);
      
      // Copy and update metadata
      const sourceMetadata = JSON.parse(await fs.readFile(sourceMetadataPath, 'utf8'));
      const destinationMetadata = {
        ...sourceMetadata,
        key: destinationKey,
        uploadTime: new Date().toISOString()
      };
      
      await fs.writeFile(destinationMetadataPath, JSON.stringify(destinationMetadata, null, 2));
      
      return {
        success: true,
        sourceKey: sourceKey,
        destinationKey: destinationKey,
        provider: this.name
      };
    } catch (error) {
      throw new Error(`Local storage copy failed: ${error.message}`);
    }
  }

  _getFilePath(key) {
    // Sanitize key to be filesystem-safe
    const sanitizedKey = key.replace(/[^a-zA-Z0-9._\/-]/g, '_');
    return path.join(this.basePath, sanitizedKey);
  }

  _getMetadataPath(key) {
    const sanitizedKey = key.replace(/[^a-zA-Z0-9._\/-]/g, '_');
    return path.join(this.metadataPath, `${sanitizedKey}.json`);
  }

  async _calculateHash(filePath) {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    
    return new Promise((resolve, reject) => {
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async _findMetadataFiles(dir) {
    const files = [];
    
    const items = await fs.readdir(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stats = await fs.stat(fullPath);
      
      if (stats.isDirectory()) {
        const subFiles = await this._findMetadataFiles(fullPath);
        files.push(...subFiles);
      } else if (item.endsWith('.json')) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  validateConfig() {
    super.validateConfig();
    // Local storage doesn't require specific configuration
  }

  getInfo() {
    const baseInfo = super.getInfo();
    return {
      ...baseInfo,
      name: 'Local Filesystem',
      basePath: this.basePath
    };
  }
}

module.exports = { LocalStorageProvider };