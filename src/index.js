#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const { StorageProviderFactory } = require('./providers/factory');
const { TestRunner } = require('./tests/runner');
const { BenchmarkRunner } = require('./utils/benchmark');
const config = require('./config/loader');

const program = new Command();

program
  .name('object-storage-poc')
  .description('Object Storage POC - Test and benchmark object storage providers')
  .version('1.0.0');

program
  .command('test')
  .description('Run tests against object storage providers')
  .option('-p, --provider <provider>', 'specific provider to test (aws, gcp, azure, minio)', 'all')
  .option('-t, --type <type>', 'test type (basic, performance, security)', 'basic')
  .option('-v, --verbose', 'verbose output')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🚀 Starting Object Storage POC Tests\n'));
      
      const testRunner = new TestRunner(config);
      const results = await testRunner.run(options);
      
      console.log(chalk.green('✅ Tests completed successfully'));
      console.log(results);
    } catch (error) {
      console.error(chalk.red('❌ Test execution failed:'), error.message);
      process.exit(1);
    }
  });

program
  .command('benchmark')
  .description('Run performance benchmarks')
  .option('-p, --provider <provider>', 'provider to benchmark')
  .option('-f, --file-size <size>', 'file size for testing (e.g., 1MB, 10MB)', '1MB')
  .option('-c, --concurrent <count>', 'number of concurrent operations', '5')
  .action(async (options) => {
    try {
      console.log(chalk.blue('📊 Starting Performance Benchmarks\n'));
      
      const benchmarkRunner = new BenchmarkRunner(config);
      const results = await benchmarkRunner.run(options);
      
      console.log(chalk.green('✅ Benchmarks completed'));
      console.log(results);
    } catch (error) {
      console.error(chalk.red('❌ Benchmark execution failed:'), error.message);
      process.exit(1);
    }
  });

program
  .command('upload')
  .description('Upload a file to object storage')
  .requiredOption('-f, --file <file>', 'file path to upload')
  .requiredOption('-p, --provider <provider>', 'storage provider')
  .option('-k, --key <key>', 'object key (defaults to filename)')
  .action(async (options) => {
    try {
      const provider = StorageProviderFactory.create(options.provider, config.providers[options.provider]);
      const key = options.key || require('path').basename(options.file);
      
      console.log(chalk.blue(`📤 Uploading ${options.file} to ${options.provider}...`));
      
      const result = await provider.upload(key, options.file);
      
      console.log(chalk.green('✅ Upload successful:'), result);
    } catch (error) {
      console.error(chalk.red('❌ Upload failed:'), error.message);
      process.exit(1);
    }
  });

program
  .command('download')
  .description('Download a file from object storage')
  .requiredOption('-k, --key <key>', 'object key to download')
  .requiredOption('-p, --provider <provider>', 'storage provider')
  .option('-o, --output <o>', 'output file path')
  .action(async (options) => {
    try {
      const provider = StorageProviderFactory.create(options.provider, config.providers[options.provider]);
      const outputPath = options.output || options.key;
      
      console.log(chalk.blue(`📥 Downloading ${options.key} from ${options.provider}...`));
      
      const result = await provider.download(options.key, outputPath);
      
      console.log(chalk.green('✅ Download successful:'), result);
    } catch (error) {
      console.error(chalk.red('❌ Download failed:'), error.message);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List objects in storage')
  .requiredOption('-p, --provider <provider>', 'storage provider')
  .option('--prefix <prefix>', 'object key prefix filter')
  .option('--limit <limit>', 'maximum number of objects to list', '100')
  .action(async (options) => {
    try {
      const provider = StorageProviderFactory.create(options.provider, config.providers[options.provider]);
      
      console.log(chalk.blue(`📋 Listing objects from ${options.provider}...`));
      
      const objects = await provider.list({ prefix: options.prefix, limit: parseInt(options.limit) });
      
      console.log(chalk.green(`✅ Found ${objects.length} objects:`));
      objects.forEach(obj => {
        console.log(`  ${obj.key} (${obj.size} bytes, ${obj.lastModified})`);
      });
    } catch (error) {
      console.error(chalk.red('❌ List operation failed:'), error.message);
      process.exit(1);
    }
  });

if (require.main === module) {
  program.parse();
}

module.exports = { program };
