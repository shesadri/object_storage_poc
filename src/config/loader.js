const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

class ConfigLoader {
  constructor() {
    this.config = this.loadConfig();
  }

  loadConfig() {
    const configPath = this.findConfigFile();
    
    if (!configPath) {
      console.warn('No config file found, using environment variables and defaults');
      return this.loadFromEnvironment();
    }

    try {
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      
      // Merge with environment variables
      return this.mergeWithEnvironment(config);
    } catch (error) {
      console.error('Error loading config file:', error.message);
      return this.loadFromEnvironment();
    }
  }

  findConfigFile() {
    const possiblePaths = [
      path.join(process.cwd(), 'config/config.json'),
      path.join(process.cwd(), 'config.json'),
      path.join(__dirname, '../../config/config.json'),
      path.join(__dirname, '../config.json')
    ];

    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }

    return null;
  }

  loadFromEnvironment() {
    return {
      providers: {
        aws: {
          region: process.env.AWS_REGION || 'us-west-2',
          bucket: process.env.AWS_BUCKET || 'test-bucket',
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          endpoint: process.env.AWS_ENDPOINT // For S3-compatible services
        },
        gcp: {
          projectId: process.env.GCP_PROJECT_ID,
          bucket: process.env.GCP_BUCKET || 'test-bucket',
          keyFilename: process.env.GCP_KEY_FILE,
          credentials: process.env.GCP_CREDENTIALS ? JSON.parse(process.env.GCP_CREDENTIALS) : null
        },
        azure: {
          accountName: process.env.AZURE_ACCOUNT_NAME,
          accountKey: process.env.AZURE_ACCOUNT_KEY,
          containerName: process.env.AZURE_CONTAINER || 'test-container',
          connectionString: process.env.AZURE_CONNECTION_STRING
        },
        minio: {
          endPoint: process.env.MINIO_ENDPOINT || 'localhost',
          port: parseInt(process.env.MINIO_PORT) || 9000,
          useSSL: process.env.MINIO_USE_SSL === 'true',
          accessKey: process.env.MINIO_ACCESS_KEY,
          secretKey: process.env.MINIO_SECRET_KEY,
          bucket: process.env.MINIO_BUCKET || 'test-bucket'
        }
      },
      testing: {
        timeout: parseInt(process.env.TEST_TIMEOUT) || 30000,
        retryAttempts: parseInt(process.env.RETRY_ATTEMPTS) || 3,
        concurrentConnections: parseInt(process.env.CONCURRENT_CONNECTIONS) || 10,
        testDataDir: process.env.TEST_DATA_DIR || 'test-data',
        cleanupAfterTests: process.env.CLEANUP_AFTER_TESTS !== 'false'
      },
      benchmark: {
        fileSizes: [
          { name: '1KB', size: 1024 },
          { name: '1MB', size: 1024 * 1024 },
          { name: '10MB', size: 10 * 1024 * 1024 },
          { name: '100MB', size: 100 * 1024 * 1024 }
        ],
        iterations: parseInt(process.env.BENCHMARK_ITERATIONS) || 5,
        warmupRuns: parseInt(process.env.BENCHMARK_WARMUP) || 2
      }
    };
  }

  mergeWithEnvironment(fileConfig) {
    const envConfig = this.loadFromEnvironment();
    
    // Deep merge function
    const deepMerge = (target, source) => {
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          target[key] = target[key] || {};
          deepMerge(target[key], source[key]);
        } else if (source[key] !== undefined && source[key] !== null) {
          target[key] = source[key];
        }
      }
      return target;
    };

    return deepMerge(fileConfig, envConfig);
  }

  getProvider(providerName) {
    const provider = this.config.providers[providerName];
    if (!provider) {
      throw new Error(`Provider '${providerName}' not found in configuration`);
    }
    return provider;
  }

  getAllProviders() {
    return Object.keys(this.config.providers);
  }

  getTestingConfig() {
    return this.config.testing || {};
  }

  getBenchmarkConfig() {
    return this.config.benchmark || {};
  }

  validateProvider(providerName) {
    const provider = this.getProvider(providerName);
    const validators = {
      aws: (config) => {
        return config.region && config.bucket && 
               (config.accessKeyId && config.secretAccessKey);
      },
      gcp: (config) => {
        return config.projectId && config.bucket && 
               (config.keyFilename || config.credentials);
      },
      azure: (config) => {
        return config.accountName && config.containerName && 
               (config.accountKey || config.connectionString);
      },
      minio: (config) => {
        return config.endPoint && config.accessKey && config.secretKey && config.bucket;
      }
    };

    const validator = validators[providerName];
    if (!validator) {
      throw new Error(`No validator found for provider '${providerName}'`);
    }

    const isValid = validator(provider);
    if (!isValid) {
      throw new Error(`Invalid configuration for provider '${providerName}'`);
    }

    return true;
  }
}

module.exports = new ConfigLoader();