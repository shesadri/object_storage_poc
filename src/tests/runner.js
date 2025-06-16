const { StorageProviderFactory } = require('../providers/factory');
const chalk = require('chalk');
const ora = require('ora');
const { table } = require('table');

class TestRunner {
  constructor(config) {
    this.config = config;
    this.results = [];
  }

  async run(options = {}) {
    const { provider, type, verbose } = options;
    
    const providersToTest = provider === 'all' 
      ? this.config.getAllProviders()
      : [provider];

    console.log(chalk.blue(`Testing providers: ${providersToTest.join(', ')}`));
    console.log(chalk.blue(`Test type: ${type}\n`));

    for (const providerName of providersToTest) {
      await this.testProvider(providerName, type, verbose);
    }

    return this.generateReport();
  }

  async testProvider(providerName, testType, verbose) {
    const spinner = ora(`Testing ${providerName}...`).start();
    
    try {
      const providerConfig = this.config.getProvider(providerName);
      const provider = await StorageProviderFactory.createAndInitialize(providerName, providerConfig);
      
      const testResult = {
        provider: providerName,
        tests: {},
        overall: 'pending'
      };

      switch (testType) {
        case 'basic':
          await this.runBasicTests(provider, testResult, verbose);
          break;
        case 'performance':
          await this.runPerformanceTests(provider, testResult, verbose);
          break;
        case 'security':
          await this.runSecurityTests(provider, testResult, verbose);
          break;
        default:
          await this.runBasicTests(provider, testResult, verbose);
      }

      // Calculate overall result
      const testResults = Object.values(testResult.tests);
      const passed = testResults.filter(r => r.status === 'passed').length;
      const total = testResults.length;
      
      testResult.overall = passed === total ? 'passed' : 'failed';
      testResult.passRate = `${passed}/${total}`;
      
      this.results.push(testResult);
      
      spinner.succeed(`${providerName} - ${testResult.overall} (${testResult.passRate})`);
      
      await provider.cleanup();
    } catch (error) {
      spinner.fail(`${providerName} - failed: ${error.message}`);
      
      this.results.push({
        provider: providerName,
        tests: {},
        overall: 'error',
        error: error.message
      });
    }
  }

  async runBasicTests(provider, testResult, verbose) {
    const tests = [
      { name: 'Health Check', fn: () => this.testHealth(provider) },
      { name: 'Upload File', fn: () => this.testUpload(provider) },
      { name: 'Download File', fn: () => this.testDownload(provider) },
      { name: 'List Objects', fn: () => this.testList(provider) },
      { name: 'Get Metadata', fn: () => this.testMetadata(provider) },
      { name: 'Object Exists', fn: () => this.testExists(provider) },
      { name: 'Delete Object', fn: () => this.testDelete(provider) }
    ];

    for (const test of tests) {
      try {
        await test.fn();
        testResult.tests[test.name] = { status: 'passed' };
        if (verbose) {
          console.log(chalk.green(`  ✅ ${test.name}`));
        }
      } catch (error) {
        testResult.tests[test.name] = { status: 'failed', error: error.message };
        if (verbose) {
          console.log(chalk.red(`  ❌ ${test.name}: ${error.message}`));
        }
      }
    }
  }

  async runPerformanceTests(provider, testResult, verbose) {
    const tests = [
      { name: 'Upload Speed', fn: () => this.testUploadSpeed(provider) },
      { name: 'Download Speed', fn: () => this.testDownloadSpeed(provider) },
      { name: 'Concurrent Uploads', fn: () => this.testConcurrentUploads(provider) },
      { name: 'Large File Handling', fn: () => this.testLargeFile(provider) }
    ];

    for (const test of tests) {
      try {
        const result = await test.fn();
        testResult.tests[test.name] = { status: 'passed', metrics: result };
        if (verbose) {
          console.log(chalk.green(`  ✅ ${test.name}`), result);
        }
      } catch (error) {
        testResult.tests[test.name] = { status: 'failed', error: error.message };
        if (verbose) {
          console.log(chalk.red(`  ❌ ${test.name}: ${error.message}`));
        }
      }
    }
  }

  async runSecurityTests(provider, testResult, verbose) {
    const tests = [
      { name: 'Signed URL Generation', fn: () => this.testSignedUrl(provider) },
      { name: 'Access Control', fn: () => this.testAccessControl(provider) },
      { name: 'Metadata Security', fn: () => this.testMetadataSecurity(provider) }
    ];

    for (const test of tests) {
      try {
        await test.fn();
        testResult.tests[test.name] = { status: 'passed' };
        if (verbose) {
          console.log(chalk.green(`  ✅ ${test.name}`));
        }
      } catch (error) {
        testResult.tests[test.name] = { status: 'failed', error: error.message };
        if (verbose) {
          console.log(chalk.red(`  ❌ ${test.name}: ${error.message}`));
        }
      }
    }
  }

  // Individual test methods
  async testHealth(provider) {
    const health = await provider.getHealth();
    if (health.status !== 'healthy') {
      throw new Error(`Provider unhealthy: ${health.error}`);
    }
  }

  async testUpload(provider) {
    const testKey = provider.generateTestKey('upload-test');
    const testData = 'Hello, Object Storage!';
    
    const result = await provider.upload(testKey, testData);
    
    if (!result.success) {
      throw new Error('Upload failed');
    }
    
    // Store for later tests
    this.testKey = testKey;
  }

  async testDownload(provider) {
    if (!this.testKey) {
      throw new Error('No test key available from upload test');
    }
    
    const tempPath = require('path').join(require('os').tmpdir(), 'download-test.txt');
    
    const result = await provider.download(this.testKey, tempPath);
    
    if (!result.success) {
      throw new Error('Download failed');
    }
    
    // Verify content
    const fs = require('fs-extra');
    const content = await fs.readFile(tempPath, 'utf8');
    
    if (content !== 'Hello, Object Storage!') {
      throw new Error('Downloaded content does not match uploaded content');
    }
    
    await fs.remove(tempPath);
  }

  async testList(provider) {
    const result = await provider.list({ limit: 10 });
    
    if (!Array.isArray(result.objects)) {
      throw new Error('List result should contain objects array');
    }
  }

  async testMetadata(provider) {
    if (!this.testKey) {
      throw new Error('No test key available');
    }
    
    const metadata = await provider.getMetadata(this.testKey);
    
    if (!metadata.key || !metadata.size) {
      throw new Error('Metadata incomplete');
    }
  }

  async testExists(provider) {
    if (!this.testKey) {
      throw new Error('No test key available');
    }
    
    const exists = await provider.exists(this.testKey);
    
    if (!exists) {
      throw new Error('Object should exist');
    }
  }

  async testDelete(provider) {
    if (!this.testKey) {
      throw new Error('No test key available');
    }
    
    const result = await provider.delete(this.testKey);
    
    if (!result.success) {
      throw new Error('Delete failed');
    }
    
    // Verify it's deleted
    const exists = await provider.exists(this.testKey);
    
    if (exists) {
      throw new Error('Object should not exist after deletion');
    }
  }

  async testUploadSpeed(provider) {
    const testData = Buffer.alloc(1024 * 1024, 'test'); // 1MB
    const testKey = provider.generateTestKey('speed-test');
    
    const startTime = Date.now();
    await provider.upload(testKey, testData);
    const endTime = Date.now();
    
    const speed = (testData.length / (endTime - startTime)) * 1000; // bytes per second
    
    await provider.delete(testKey);
    
    return {
      speed: `${(speed / 1024 / 1024).toFixed(2)} MB/s`,
      time: `${endTime - startTime}ms`
    };
  }

  async testDownloadSpeed(provider) {
    const testData = Buffer.alloc(1024 * 1024, 'test'); // 1MB
    const testKey = provider.generateTestKey('download-speed-test');
    
    await provider.upload(testKey, testData);
    
    const tempPath = require('path').join(require('os').tmpdir(), 'speed-test.tmp');
    
    const startTime = Date.now();
    await provider.download(testKey, tempPath);
    const endTime = Date.now();
    
    const speed = (testData.length / (endTime - startTime)) * 1000;
    
    await provider.delete(testKey);
    await require('fs-extra').remove(tempPath);
    
    return {
      speed: `${(speed / 1024 / 1024).toFixed(2)} MB/s`,
      time: `${endTime - startTime}ms`
    };
  }

  async testConcurrentUploads(provider) {
    const concurrency = 5;
    const testData = 'Concurrent test data';
    
    const uploads = Array.from({ length: concurrency }, (_, i) => {
      const testKey = provider.generateTestKey(`concurrent-${i}`);
      return provider.upload(testKey, testData);
    });
    
    const startTime = Date.now();
    const results = await Promise.all(uploads);
    const endTime = Date.now();
    
    const successful = results.filter(r => r.success).length;
    
    // Cleanup
    for (let i = 0; i < concurrency; i++) {
      try {
        const testKey = provider.generateTestKey(`concurrent-${i}`);
        await provider.delete(testKey);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    
    return {
      successful: `${successful}/${concurrency}`,
      time: `${endTime - startTime}ms`
    };
  }

  async testLargeFile(provider) {
    const largeData = Buffer.alloc(10 * 1024 * 1024, 'large'); // 10MB
    const testKey = provider.generateTestKey('large-file-test');
    
    const startTime = Date.now();
    await provider.upload(testKey, largeData);
    const endTime = Date.now();
    
    await provider.delete(testKey);
    
    return {
      size: '10MB',
      time: `${endTime - startTime}ms`
    };
  }

  async testSignedUrl(provider) {
    const testKey = provider.generateTestKey('signed-url-test');
    await provider.upload(testKey, 'Test data for signed URL');
    
    const signedUrl = await provider.getSignedUrl(testKey);
    
    if (!signedUrl.url) {
      throw new Error('Signed URL not generated');
    }
    
    await provider.delete(testKey);
  }

  async testAccessControl(provider) {
    // Basic access control test - try to access non-existent object
    const nonExistentKey = 'non-existent-object';
    
    try {
      await provider.getMetadata(nonExistentKey);
      throw new Error('Should not be able to access non-existent object');
    } catch (error) {
      if (!error.message.includes('not found')) {
        throw error;
      }
    }
  }

  async testMetadataSecurity(provider) {
    const testKey = provider.generateTestKey('metadata-security-test');
    const sensitiveMetadata = {
      'user-id': '12345',
      'sensitive-data': 'should-be-encrypted'
    };
    
    await provider.upload(testKey, 'Test data', { metadata: sensitiveMetadata });
    
    const metadata = await provider.getMetadata(testKey);
    
    if (!metadata.metadata || !metadata.metadata['user-id']) {
      throw new Error('Metadata not properly stored');
    }
    
    await provider.delete(testKey);
  }

  generateReport() {
    const tableData = [['Provider', 'Overall', 'Pass Rate', 'Status']];
    
    for (const result of this.results) {
      const status = result.error ? 'Error' : result.overall;
      const passRate = result.passRate || 'N/A';
      const statusIcon = result.overall === 'passed' ? '✅' : '❌';
      
      tableData.push([
        result.provider,
        status,
        passRate,
        statusIcon
      ]);
    }
    
    return '\n' + table(tableData) + '\n';
  }
}

module.exports = { TestRunner };