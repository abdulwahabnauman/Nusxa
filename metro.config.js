const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add support for @ alias in Metro bundler
config.resolver = {
  ...getDefaultConfig(__dirname).resolver,
  // Allow imports with @/ prefix
  unstable_enableSymlinks: true,
};

// Add custom path extensions if needed
if (!config.resolver) {
  config.resolver = {};
}

// Extend resolver configuration for @ alias
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // If importing from @/... pattern, convert to relative path
  if (moduleName.startsWith('@/')) {
    const relativePath = moduleName.replace('@/', './src/');
    return context.resolveRequest(
      { ...context, importedFrom: context.importedFrom },
      relativePath,
      platform
    );
  }
  
  // Fall back to default resolution
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
