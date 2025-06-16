/**
 * Base storage provider interface
 * All storage providers must implement these methods
 */
class BaseStorageProvider {
  constructor(config) {
    this.config = config;
    this.name = 'base';
  }

  /**
   * Initialize the storage provider connection
   */
  async initialize() {
    throw new Error('initialize() method must be implemented');
  }

  /**
   * Upload a file to storage
   * @param {string} key - Object key/name
   * @param {string|Buffer|Stream} data - File data or path
   * @param {Object} options - Upload options (metadata, content-type, etc.)
   * @returns {Promise<Object>} Upload result
   */
  async upload(key, data, options = {}) {
    throw new Error('upload() method must be implemented');
  }

  /**
   * Download a file from storage
   * @param {string} key - Object key/name
   * @param {string} destinationPath - Local file path to save
   * @returns {Promise<Object>} Download result
   */
  async download(key, destinationPath) {
    throw new Error('download() method must be implemented');
  }

  /**
   * Get object metadata
   * @param {string} key - Object key/name
   * @returns {Promise<Object>} Object metadata
   */
  async getMetadata(key) {
    throw new Error('getMetadata() method must be implemented');
  }

  /**
   * List objects in storage
   * @param {Object} options - List options (prefix, limit, etc.)
   * @returns {Promise<Array>} List of objects
   */
  async list(options = {}) {
    throw new Error('list() method must be implemented');
  }

  /**
   * Delete an object
   * @param {string} key - Object key/name
   * @returns {Promise<Object>} Delete result
   */
  async delete(key) {
    throw new Error('delete() method must be implemented');
  }

  /**
   * Check if an object exists
   * @param {string} key - Object key/name
   * @returns {Promise<boolean>} True if exists
   */
  async exists(key) {
    throw new Error('exists() method must be implemented');
  }

  /**
   * Generate a signed URL for accessing an object
   * @param {string} key - Object key/name
   * @param {Object} options - URL options (expiration, method, etc.)
   * @returns {Promise<string>} Signed URL
   */
  async getSignedUrl(key, options = {}) {
    throw new Error('getSignedUrl() method must be implemented');
  }

  /**
   * Copy an object within the same storage
   * @param {string} sourceKey - Source object key
   * @param {string} destinationKey - Destination object key
   * @returns {Promise<Object>} Copy result
   */
  async copy(sourceKey, destinationKey) {
    throw new Error('copy() method must be implemented');
  }

  /**
   * Get storage provider health/status
   * @returns {Promise<Object>} Health status
   */
  async getHealth() {
    try {
      await this.list({ limit: 1 });
      return {
        status: 'healthy',
        provider: this.name,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        provider: this.name,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    // Base implementation does nothing
    // Override in specific providers if needed
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    if (!this.config) {
      throw new Error('Configuration is required');
    }
  }

  /**
   * Get provider-specific information
   */
  getInfo() {
    return {
      name: this.name,
      version: '1.0.0',
      capabilities: {
        upload: true,
        download: true,
        list: true,
        delete: true,
        metadata: true,
        signedUrls: true,
        copy: true
      }
    };
  }

  /**
   * Format file size for display
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Generate a unique test key
   * @param {string} prefix - Key prefix
   * @returns {string} Unique key
   */
  generateTestKey(prefix = 'test') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${random}`;
  }
}

module.exports = { BaseStorageProvider };