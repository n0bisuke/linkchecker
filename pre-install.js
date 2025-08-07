const { execSync } = require('child_process');

try {
  console.log('Running npm install...');
  execSync('npm install', { stdio: 'inherit' });
  console.log('npm install completed successfully.');
} catch (error) {
  console.error('Failed to run npm install:');
  console.error(error);
  process.exit(1);
}
