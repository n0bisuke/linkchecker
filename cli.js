#!/usr/bin/env node

const LinkChecker = require('./check-links.js');
const path = require('path');

function showHelp() {
  console.log(`
handson-md-link-checker - 高性能並列処理マークダウンリンクチェッカー

使用方法:
  md-link-checker [options] [directory]

オプション:
  directory                チェック対象のディレクトリまたはファイル（デフォルト: カレントディレクトリ）
  -h, --help              このヘルプを表示
  --ignore-github-auth    GitHub認証が必要なページを除外（推奨）
  --explicit-links-only   明示的リンクのみをチェック（[text](url)、<a href>など）

例:
  md-link-checker                              # カレントディレクトリをチェック
  md-link-checker ./docs                       # docsディレクトリをチェック
  md-link-checker --ignore-github-auth ./docs  # GitHub認証ページを除外してチェック
  md-link-checker --explicit-links-only ./docs # 明示的リンクのみをチェック
  md-link-checker ./article.md                 # 特定のファイルをチェック

機能:
  ✓ Worker Threadsによる高速並列処理（最大16ワーカー）
  ✓ 404/410エラーのみを検出（アクセス制限は無視）
  ✓ 日本語プレースホルダー自動除外
  ✓ JSON形式のレポート出力
  ✓ GitHub Actions統合対応

報告される問題:
  • 404 Not Found - ページが存在しない
  • 410 Gone - ページが削除された
  • DNS_ERROR - ドメインが存在しない
  • CONNECTION_REFUSED - サーバーがダウン

無視される問題:
  • 403 Forbidden - アクセス制限（リンクは有効）
  • 429 Too Many Requests - レート制限
  • タイムアウト - 一時的な問題

詳細: https://github.com/n0bisuke/linkchecker
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  // ヘルプオプションの処理
  if (args.includes('-h') || args.includes('--help')) {
    showHelp();
    process.exit(0);
  }
  
  // オプションの解析
  const ignoreGithubAuth = args.includes('--ignore-github-auth');
  const explicitLinksOnly = args.includes('--explicit-links-only');
  
  // オプションを除いた引数からディレクトリを取得
  const directory = args.filter(arg => !arg.startsWith('--'))[0] || '.';
  
  try {
    // 絶対パスに変換
    const targetPath = path.resolve(directory);
    
    console.log(`🔗 handson-md-link-checker v${require('./package.json').version}`);
    console.log(`📁 Target: ${targetPath}`);
    if (ignoreGithubAuth) {
      console.log(`🔐 GitHub認証ページを除外モード: 有効`);
    }
    if (explicitLinksOnly) {
      console.log(`📝 明示的リンクのみチェックモード: 有効`);
    }
    console.log('');
    
    const checker = new LinkChecker({ ignoreGithubAuth, explicitLinksOnly });
    await checker.run(targetPath);
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    
    if (error.code === 'ENOENT') {
      console.error(`指定されたパス "${directory}" が見つかりません。`);
    } else if (error.code === 'EACCES') {
      console.error(`指定されたパス "${directory}" にアクセスできません。`);
    }
    
    console.error('');
    console.error('ヘルプを表示するには: md-link-checker --help');
    
    process.exit(1);
  }
}

// 未処理のPromise拒否をキャッチ
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未処理のPromise拒否:', reason);
  process.exit(1);
});

// 未処理の例外をキャッチ
process.on('uncaughtException', (error) => {
  console.error('❌ 未処理の例外:', error);
  process.exit(1);
});

main();