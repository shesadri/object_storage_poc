const { AWSStorageProvider } = require('./aws');
const { GCPStorageProvider } = require('./gcp');
const { AzureStorageProvider } = require('./azure');
const { MinioStorageProvider } = require('./minio');
const { LocalStorageProvider } = require('./local');

class StorageProviderFactory {
  static create(providerName, config) {
    const providers = {
      aws: AWSStorageProvider,
      gcp: GCPStorageProvider,
      azure: AzureStorageProvider,
      minio: MinioStorageProvider,
      local: LocalStorageProvider
    };

    const ProviderClass = providers[providerName.toLowerCase()];
    
    if (!ProviderClass) {
      throw new Error(`Unknown storage provider: ${providerName}. Available providers: ${Object.keys(providers).join(', ')}`);
    }

    return new ProviderClass(config);
  }

  static getAvailableProviders() {
    return ['aws', 'gcp', 'azure', 'minio', 'local'];
  }

  static async createAndInitialize(providerName, config) {
    const provider = this.create(providerName, config);
    await provider.initialize();
    return provider;
  }
}

module.exports = { StorageProviderFactory };