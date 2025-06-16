# Object Storage POC

A comprehensive proof of concept for testing Amazon S3 and other object storage capabilities.

## Overview

This POC provides a testing framework for evaluating object storage services with support for:
- Amazon S3
- Google Cloud Storage
- Azure Blob Storage
- MinIO (S3-compatible)
- Local filesystem simulation

## Features

- **Multi-provider support**: Test against different object storage providers
- **Comprehensive operations**: Upload, download, list, delete, metadata operations
- **Performance testing**: Benchmark upload/download speeds, concurrent operations
- **Security testing**: Access control, encryption, signed URLs
- **Reliability testing**: Error handling, retry mechanisms, connection stability
- **Configuration management**: Easy switching between providers and environments

## Project Structure

```
object_storage_poc/
├── src/
│   ├── providers/          # Storage provider implementations
│   ├── tests/             # Test suites
│   ├── utils/             # Utility functions
│   └── config/            # Configuration management
├── examples/              # Usage examples
├── docs/                  # Documentation
├── scripts/               # Helper scripts
└── docker/                # Docker configurations
```

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure providers**:
   ```bash
   cp config/config.example.json config/config.json
   # Edit config.json with your provider credentials
   ```

3. **Run tests**:
   ```bash
   npm test
   ```

4. **Run performance benchmarks**:
   ```bash
   npm run benchmark
   ```

## Configuration

Create a `config/config.json` file with your provider settings:

```json
{
  "providers": {
    "aws": {
      "region": "us-west-2",
      "bucket": "your-test-bucket",
      "accessKeyId": "your-access-key",
      "secretAccessKey": "your-secret-key"
    },
    "gcp": {
      "projectId": "your-project-id",
      "bucket": "your-gcp-bucket",
      "keyFilename": "path/to/service-account.json"
    }
  }
}
```

## Running Tests

- **All tests**: `npm test`
- **Specific provider**: `npm test -- --provider=aws`
- **Performance tests**: `npm run test:performance`
- **Security tests**: `npm run test:security`

## License

MIT License
