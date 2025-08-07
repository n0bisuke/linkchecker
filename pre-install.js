const { execSync } = require('child_process');
const path = require('path');

// アクションのファイルが置かれているディレクトリを取得します
const actionDir = __dirname;

try {
  console.log(`Running npm install in ${actionDir}...`);
  // `cwd`オプションで、npm installの実行場所をアクションのディレクトリに指定します
  execSync('npm install', { cwd: actionDir, stdio: 'inherit' });
  console.log('npm install completed successfully.');
} catch (error) {
  console.error(`Failed to run npm install in ${actionDir}:`);
  console.error(error);
  process.exit(1);
}