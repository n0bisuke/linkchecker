# handson-md-link-checker

高性能並列処理マークダウンリンクチェッカー - Markdown文書内の壊れたリンク（404/410エラー）を正確に検出

## 特徴

- ⚡ **高速並列処理**: Worker Threadsによる最大16並列処理
- 🎯 **正確な検出**: 404/410エラーのみを検出（アクセス制限は無視）
- 🌏 **日本語対応**: 日本語プレースホルダーを自動除外
- 📊 **詳細レポート**: JSON形式の詳細な結果出力
- 🔧 **GitHub Actions統合**: CI/CDパイプラインに簡単統合
- 📝 **複数形式対応**: Markdown、HTML、直接URL記載に対応

## インストール

```bash
# グローバルインストール（CLI使用）
npm install -g handson-md-link-checker

# ローカルインストール（プログラマティック使用）
npm install handson-md-link-checker

# npxで一回限りの実行
npx handson-md-link-checker ./docs
```

## CLI使用方法

```bash
# 基本的な使用方法
po-link-checker                    # カレントディレクトリをチェック
po-link-checker ./docs             # docsディレクトリをチェック  
po-link-checker ./article.md       # 特定のファイルをチェック

# ヘルプ表示
po-link-checker --help
```

### CLI出力例

```
🔗 handson-md-link-checker v1.0.0
📁 Target: /path/to/docs

🔍 Starting link check...
Found 45 markdown files
📄 Collecting links from all files...
Found 234 total links (198 unique)
🚀 Checking links with optimized parallel processing...
Using 8 workers with 24 chunks (8 tasks per chunk)

✅ Link check completed

❌ Found 3 broken links:
  - https://example.com/broken-page
    Status: 404
    File: docs/example.md:26

📝 Report saved to link-check-report.json
```

## プログラマティック使用方法

### 基本的な使用方法

```javascript
const LinkChecker = require('handson-md-link-checker');

const checker = new LinkChecker();

// ディレクトリをチェック
checker.run('./docs').then(() => {
  console.log('チェック完了');
}).catch(error => {
  console.error('エラー:', error);
});
```

### 詳細な結果を取得

```javascript
const LinkChecker = require('handson-md-link-checker');

const checker = new LinkChecker();

async function checkLinks() {
  try {
    const result = await checker.checkDirectory('./docs', true); // silentモード
    
    console.log(`チェック結果:`);
    console.log(`- ファイル数: ${result.totalFiles}`);
    console.log(`- 総リンク数: ${result.totalLinks}`);
    console.log(`- 壊れたリンク数: ${result.totalBrokenLinks}`);
    
    if (!result.success) {
      result.brokenLinks.forEach(link => {
        console.log(`❌ ${link.url} (${link.status}) in ${link.file}:${link.line}`);
      });
    }
    
    return result.success;
  } catch (error) {
    console.error('チェック中にエラーが発生しました:', error);
    return false;
  }
}

checkLinks();
```

### カスタム設定

```javascript
const { LinkChecker } = require('handson-md-link-checker');

const checker = new LinkChecker({
  maxWorkers: 4,           // 最大ワーカー数
  timeout: 5000,           // タイムアウト時間（ms）
  batchSize: 50,           // バッチサイズ
  excludePatterns: [       // 追加の除外パターン
    /internal\.example\.com/,
    /test\.localhost/
  ]
});

const result = await checker.checkDirectory('./docs');
```

### 単一URLのチェック

```javascript
const LinkChecker = require('handson-md-link-checker');

const checker = new LinkChecker();

// 単一URLをチェック
const result = await checker.checkSingleUrl('https://example.com');
if (result) {
  console.log(`壊れたリンク: ${result.url} (${result.status})`);
} else {
  console.log('リンクは正常です');
}
```

### 複数URLの一括チェック

```javascript
const LinkChecker = require('handson-md-link-checker');

const checker = new LinkChecker();

const urls = [
  'https://example.com',
  'https://github.com',
  'https://broken-link.example.com'
];

const brokenLinks = await checker.checkUrls(urls, true);
console.log(`${brokenLinks.length} 個の壊れたリンクが見つかりました`);
```

## 検出対象

### 報告される問題
- `404 Not Found` - ページが存在しない
- `410 Gone` - ページが永続的に削除された  
- `DNS_ERROR` - ドメインが存在しない
- `CONNECTION_REFUSED` - サーバーがダウンしている

### 無視される問題（偽陽性回避）
- `403 Forbidden` - アクセス制限（リンクは有効）
- `405 Method Not Allowed` - HEADリクエストが無効（リンクは有効）
- `429 Too Many Requests` - レート制限（一時的）
- `503 Service Unavailable` - サービス停止（一時的）
- タイムアウトエラー - ネットワークの一時的問題

## サポートするURL形式

- Markdownリンク: `[テキスト](https://example.com)`
- HTMLリンク: `<a href="https://example.com">テキスト</a>`
- HTML画像: `<img src="https://example.com/image.jpg">`
- 直接URL: `https://example.com`
- 壊れたMarkdown: `[テキスト](url](url)` などの記載ミス

## 自動除外パターン

以下のパターンは自動的に除外されます：

```javascript
// プレースホルダー
/example\\.com/, /localhost/, /your-[\\w-]+/

// 日本語プレースホルダー  
/ユーザー名\\.github\\.io/, /<ココ>/, /○+/

// 英語圏ドメイン + 日本語（プレースホルダー）
/github\\.com\\/.*[ぁ-ゟァ-ヶー一-龯]/

// その他
/^mailto:/, /^tel:/, /^#/, /^javascript:/
```

## GitHub Actions統合

```yaml
name: Link Check

on:
  schedule:
    - cron: '0 0 */3 * *'  # 3日に1回実行
  push:
    branches: [main]

jobs:
  check-links:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install Link Checker
        run: npm install -g handson-md-link-checker
        
      - name: Check Links
        run: po-link-checker ./docs
        
      - name: Upload Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: link-check-report
          path: link-check-report.json
```

## 設定オプション

| オプション | デフォルト | 説明 |
|-----------|-----------|------|
| `maxWorkers` | CPU数×4（最大16） | 並列ワーカー数 |
| `timeout` | 8000 | HTTPリクエストタイムアウト（ms） |
| `batchSize` | 100 | バッチ処理サイズ |
| `excludePatterns` | [内蔵パターン] | 追加の除外正規表現 |

## パフォーマンス

- **1000+ URL**: 約30-45秒
- **メモリ効率**: ワーカースレッドによる制御された並列処理
- **ネットワーク負荷**: 適切なレート制限とリトライロジック
- **CI/CD最適化**: 最小限のリソース使用

## トラブルシューティング

### よくある問題

1. **偽陽性が多い**
   - 除外パターンを追加してください
   - アクセス制限のあるサイトは自動的に無視されます

2. **処理が遅い**
   - `maxWorkers`を調整してください
   - `timeout`を短くしてください

3. **メモリ使用量が多い**
   - `batchSize`を小さくしてください
   - `maxWorkers`を減らしてください

## ライセンス

MIT

## 貢献

Issues and Pull Requests are welcome!

Repository: https://github.com/n0bisuke/linkchecker

## リリースノート

### v1.0.0
- 初回リリース
- Worker Threads による並列処理
- 日本語プレースホルダー除外機能
- GitHub Actions 統合
- プログラマティック API