# handson-md-link-checker

※AIが書いてます。

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
md-link-checker                               # カレントディレクトリをチェック
md-link-checker ./docs                        # docsディレクトリをチェック  
md-link-checker --ignore-github-auth ./docs  # GitHub認証ページを除外してチェック
md-link-checker --explicit-links-only ./docs # 明示的リンクのみチェック
md-link-checker ./article.md                  # 特定のファイルをチェック

# ヘルプ表示
md-link-checker --help
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
  ignoreGithubAuth: true,  // GitHub認証必要ページを除外
  explicitLinksOnly: true, // 明示的リンクのみをチェック
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

### 明示的リンク（常にチェック）
- Markdownリンク: `[テキスト](https://example.com)`
- HTMLリンク: `<a href="https://example.com">テキスト</a>`
- HTML画像: `<img src="https://example.com/image.jpg">`
- 壊れたMarkdown: `[テキスト](url](url)` などの記載ミス

### 暗示的リンク（オプションで除外可能）
- 直接URL: `https://example.com`
- 技術文書の説明用URL: `API: \`https://api.example.com/v1/users\``

`--explicit-links-only` オプションを使用すると、暗示的リンクをスキップして明示的リンクのみをチェックします。これにより、技術文書でのAPI説明などで発生する偽陽性を回避できます。

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

このツールは、GitHub Actionsのカスタムアクションとして利用するのが最も簡単で推奨される方法です。
CI/CDパイプラインに組み込むことで、リポジトリ内のリンク切れを継続的にチェックできます。

### 使い方 (アクションとして使用)

外部のリポジトリからこのアクションを呼び出すには、ワークフローファイル（例: `.github/workflows/link-check.yml`）に以下のように記述します。

**基本的な使用例:**

```yaml
# .github/workflows/link-check.yml

name: Check Markdown Links

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
  workflow_dispatch: # 手動実行を可能にする

jobs:
  check-links:
    runs-on: ubuntu-latest
    steps:
      # 1. 自分のリポジトリのコードをチェックアウトする
      - name: Checkout repository
        uses: actions/checkout@v4

      # 2. Markdown Link Checker アクションを呼び出す
      - name: Run Markdown Link Checker
        id: link-check
        # uses: {オーナー名}/{リポジトリ名}@{ブランチ名 or タグ}
        uses: n0bisuke/linkchecker@main
        with:
          # 自分のリポジトリ内でチェックしたいディレクトリを指定
          directory: './docs' # 例: docsフォルダ
```

**入力 (`inputs`)**:

*   `directory`: チェック対象のディレクトリまたはファイルパス。デフォルトは `.` (カレントディレクトリ)。

**出力 (`outputs`)**:

*   `broken_links_count`: 見つかった壊れたリンクの数。この出力を後続のステップで利用できます。

### レポートを自動コミットするワークフロー

リンクチェックを実行し、結果レポート (`link-check-report.json`) に変更があった場合に自動でリポジトリにコミットするワークフローの例です。

**注意点:**
*   このワークフローがリポジトリに書き込む（`git push`する）ためには、ジョブに `permissions: contents: write` を設定する必要があります。
*   コミットメッセージに `[skip ci]` を含めることで、このコミットによってワークフローが再度トリガーされる無限ループを防ぎます。

```yaml
# .github/workflows/check-links-and-commit.yml

name: Check Links and Commit Report

on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  check-and-commit:
    runs-on: ubuntu-latest
    # ジョブにリポジトリへの書き込み権限を付与
    permissions:
      contents: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Run Markdown Link Checker
        id: link-check
        uses: n0bisuke/linkchecker@main
        with:
          directory: '.' # リポジトリ全体をチェック

      - name: Commit and push if report changed
        run: |
          # Gitのユーザー情報を設定
          git config --global user.name 'github-actions[bot]'
          git config --global user.email 'github-actions[bot]@users.noreply.github.com'

          # link-check-report.json に変更があるか確認
          if [[ -n $(git status --porcelain link-check-report.json) ]]; then
            echo "Report has changes. Committing and pushing..."
            git add link-check-report.json
            # [skip ci] を含めて無限ループを防止
            git commit -m "docs: Update link check report [skip ci]"
            git push
          else
            echo "No changes to the report. Nothing to commit."
          fi
```

### npmパッケージとして使用する (上級者向け)

アクションを使わずに、npmパッケージとして直接インストールして実行することも可能です。

```yaml
# ...
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
        run: md-link-checker ./docs
        
      - name: Upload Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: link-check-report
          path: link-check-report.json
```

### ワークフローの挙動について

**リンク切れを検出した場合、ワークフローは「失敗」します**

このアクションは、壊れたリンクを1つでも検出すると、意図的にワークフローを失敗させます（非ゼロの終了コードを返します）。これは、問題の存在を明確に知らせるための、CI/CDツールにおける一般的な挙動です。

もし、リンク切れが見つかってもワークフローを止めずに後続の処理を続けたい場合は、`continue-on-error` オプションを利用してください。

**continue-on-error の使用例:**

```yaml
      - name: Run Markdown Link Checker
        id: link-check
        uses: n0bisuke/linkchecker@main
        continue-on-error: true # リンク切れがあってもワークフローを止めない
        with:
          directory: '.'
```

## 設定オプション

| オプション | デフォルト | 説明 |
|-----------|-----------|------|
| `maxWorkers` | CPU数×4（最大16） | 並列ワーカー数 |
| `timeout` | 8000 | HTTPリクエストタイムアウト（ms） |
| `batchSize` | 100 | バッチ処理サイズ |
| `ignoreGithubAuth` | false | GitHub認証必要ページを除外 |
| `explicitLinksOnly` | false | 明示的リンクのみをチェック |
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

### v0.0.1
- 初回リリース
- Worker Threads による並列処理
- 日本語プレースホルダー除外機能
- GitHub Actions 統合
- プログラマティック API