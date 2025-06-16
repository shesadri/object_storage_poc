const fs = require('fs-extra');
const path = require('path');

// Global test setup
beforeAll(async () => {
  // Ensure test data directory exists
  const testDataDir = path.join(__dirname, '../../test-data');
  await fs.ensureDir(testDataDir);
  
  // Create test files
  await createTestFiles(testDataDir);
});

afterAll(async () => {
  // Cleanup test data if configured
  if (process.env.CLEANUP_AFTER_TESTS !== 'false') {
    const testDataDir = path.join(__dirname, '../../test-data');
    await fs.remove(testDataDir);
  }
});

async function createTestFiles(testDataDir) {
  // Create various sized test files
  const testFiles = [
    { name: 'small.txt', size: 1024, content: 'A'.repeat(1024) },
    { name: 'medium.txt', size: 1024 * 1024, content: 'B'.repeat(1024 * 1024) },
    { name: 'large.txt', size: 10 * 1024 * 1024, content: 'C'.repeat(10 * 1024 * 1024) }
  ];
  
  for (const file of testFiles) {
    const filePath = path.join(testDataDir, file.name);
    if (!await fs.pathExists(filePath)) {
      await fs.writeFile(filePath, file.content);
    }
  }
  
  // Create a binary test file
  const binaryPath = path.join(testDataDir, 'binary.dat');
  if (!await fs.pathExists(binaryPath)) {
    const buffer = Buffer.alloc(1024);
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = i % 256;
    }
    await fs.writeFile(binaryPath, buffer);
  }
  
  // Create a JSON test file
  const jsonPath = path.join(testDataDir, 'test.json');
  if (!await fs.pathExists(jsonPath)) {
    const testData = {
      name: 'Test Object',
      timestamp: new Date().toISOString(),
      data: {
        numbers: [1, 2, 3, 4, 5],
        nested: {
          value: 'test'
        }
      }
    };
    await fs.writeFile(jsonPath, JSON.stringify(testData, null, 2));
  }
}

// Global test utilities
global.testUtils = {
  createTestFiles,
  getTestDataDir: () => path.join(__dirname, '../../test-data'),
  generateTestData: (size) => {
    return Buffer.alloc(size, 'test data ');
  },
  createTempFile: async (content, filename = 'temp.txt') => {
    const tempDir = path.join(__dirname, '../../test-data/temp');
    await fs.ensureDir(tempDir);
    const tempFile = path.join(tempDir, filename);
    await fs.writeFile(tempFile, content);
    return tempFile;
  }
};