const { parentPort } = require('worker_threads');

class LinkCheckerWorker {
  constructor(options = {}) {
    this.ignoreGithubAuth = options.ignoreGithubAuth || false;
    this.excludePatterns = [
      /^mailto:/,
      /^tel:/,
      /^#/,
      /localhost/,
      /127\.0\.0\.1/,
      /^javascript:/,
      /example\.com/,
      /your-.*-id/,
      /\{\{.*\}\}/,
      // サンプル・プレースホルダー URL
      /GitHubユーザー名/,
      /github\.io.*リポジトリ名/,
      /xxxx\.github\.io/,
      /ユーザー名\.github\.io/,
      /hoge\.com/,
      /APP_PATH/,
      /hook\.us1\.make\.com\/xxxxx/,
      /xxxxx/,
      /<ココ>/,
      /\[ユーザー名\]/,
      /\[リポジトリ名\]/,
      // 一般的なプレースホルダー
      /your-[\w-]+/,
      /\{[\w-]+\}/,
      /\[[\w\s]+\]/,
      /<[\w\s-]+>/,  // <ユーザー名>のようなプレースホルダー
      /○+/,  // ○○○○○のような日本語プレースホルダー
      // 英語圏ドメインに日本語テキストが含まれる場合（プレースホルダー）
      /github\.com\/.*[ぁ-ゟァ-ヶー一-龯]/,
      /google\.com\/.*[ぁ-ゟァ-ヶー一-龯]/,
      /microsoft\.com\/.*[ぁ-ゟァ-ヶー一-龯]/,
      /amazon\.com\/.*[ぁ-ゟァ-ヶー一-龯]/,
      /amazonaws\.com\/.*[ぁ-ゟァ-ヶー一-龯]/,
      /facebook\.com\/.*[ぁ-ゟァ-ヶー一-龯]/,
      /twitter\.com\/.*[ぁ-ゟァ-ヶー一-龯]/,
      /linkedin\.com\/.*[ぁ-ゟァ-ヶー一-龯]/,
      /stackoverflow\.com\/.*[ぁ-ゟァ-ヶー一-龯]/,
      /npmjs\.com\/.*[ぁ-ゟァ-ヶー一-龯]/,
      /heroku\.com\/.*[ぁ-ゟァ-ヶー一-龯]/,
      /railway\.app\/.*[ぁ-ゟァ-ヶー一-龯]/,
      /vercel\.com\/.*[ぁ-ゟァ-ヶー一-龯]/,
      /netlify\.com\/.*[ぁ-ゟァ-ヶー一-龯]/,
      /firebase\.google\.com\/.*[ぁ-ゟァ-ヶー一-龯]/,
      /openai\.com\/.*[ぁ-ゟァ-ヶー一-龯]/,
      /docs\.rs\/.*[ぁ-ゟァ-ヶー一-龯]/,
      /stripe\.com\/.*[ぁ-ゟァ-ヶー一-龯]/,
      /slack\.com\/.*[ぁ-ゟァ-ヶー一-龯]/
    ];
  }

  /**
   * GitHub認証が必要なページかどうかを判定
   */
  isGithubAuthRequired(url, status) {
    if (!url.includes('github.com')) {
      return false;
    }

    // GitHub認証が必要なパスパターン
    const authRequiredPatterns = [
      /github\.com\/orgs\/[^/]+\/projects\//,           // 組織プロジェクト
      /github\.com\/orgs\/[^/]+\/teams\//,              // チーム管理
      /github\.com\/[^/]+\/[^/]+\/settings\//,          // リポジトリ設定
      /github\.com\/settings\//,                        // ユーザー設定  
      /github\.com\/notifications/,                     // 通知
      /github\.com\/[^/]+\/[^/]+\/security\//,          // セキュリティ設定
      /github\.com\/[^/]+\/[^/]+\/pulse/,               // プライベートリポジトリのPulse
      /github\.com\/[^/]+\/[^/]+\/graphs\//,            // プライベートリポジトリのGraphs
      /github\.com\/[^/]+\/[^/]+\/network\//,           // プライベートリポジトリのNetwork
      /github\.com\/[^/]+\/[^/]+\/issues\/\d+/,         // プライベートリポジトリのIssue
      /github\.com\/[^/]+\/[^/]+\/pull\/\d+/,           // プライベートリポジトリのPR
    ];

    // パスパターンでのマッチング
    if (authRequiredPatterns.some(pattern => pattern.test(url))) {
      return true;
    }

    // 403 Forbidden または 404 Not Found の場合、GitHub認証が必要な可能性
    if (status === 403 || status === 404) {
      return true;
    }

    return false;
  }

  cleanUrl(url) {
    // HTMLタグの残骸を完全除去
    url = url.replace(/\\"[^"]*$/, '');     // \"で終わる部分
    url = url.replace(/\\">.*$/, '');      // \">以降すべて
    url = url.replace(/<[^>]*$/, '');      // 不完全なHTMLタグ
    url = url.replace(/>[^>]*$/, '');      // >以降の文字列
    url = url.replace(/\\".*$/, '');       // \"以降すべて
    
    // HTMLタグの終了部分を除去 (scriptタグなど)
    url = url.replace(/\"><\/.*$/, '');     // "></script など
    url = url.replace(/\">\s*<\/.*$/, '');  // "> </script など
    
    // Markdownの記載ミス対応: ]( が重複している場合
    url = url.replace(/\]\([^)]*$/, '');   // ](以降を除去
    
    // Markdownの画像サイズ指定を除去 (例: =200x, =500x400, =x300)
    url = url.replace(/\s*=[0-9]*x[0-9]*$/, '');
    url = url.replace(/\s*=x[0-9]+$/, '');
    url = url.replace(/\s*=[0-9]+x$/, '');
    
    // Markdownの画像タイトルを除去 (例: "タイトル")
    url = url.replace(/\s*"[^"]*"$/, '');
    url = url.replace(/\s*'[^']*'$/, '');
    
    // HTMLの余分な属性やクオートを除去
    url = url.replace(/"\s*$/, '');
    url = url.replace(/'\s*$/, '');
    url = url.replace(/>\s*$/, '');
    
    // バッククオートを除去
    url = url.replace(/`+$/, '');
    url = url.replace(/^`+/, '');
    
    // 末尾の句読点や余分な文字を除去
    url = url.replace(/[.,;!?]+$/, '');
    
    // JavaScriptのコメント記号や日本語説明文を除去
    url = url.replace(/\";\/\/.*$/, '');
    url = url.replace(/\";\s*$/, '');
    url = url.replace(/;\/\/.*$/, '');
    url = url.replace(/;.*$/, '');
    
    // 末尾のクォート除去
    url = url.replace(/'$/, '');
    url = url.replace(/"$/, '');
    
    // JavaScriptコード中のカンマやオブジェクト記法を除去
    url = url.replace(/',\{.*$/, '');     // ',{ で始まる部分
    url = url.replace(/'\s*,.*$/, '');    // ', で始まる部分
    url = url.replace(/",\{.*$/, '');     // ",{ で始まる部分
    url = url.replace(/"\s*,.*$/, '');    // ", で始まる部分
    
    // 日本語説明文やバッククォートの文章を除去
    url = url.replace(/`[ぁ-ゟ]+.*$/, '');
    url = url.replace(/`を[^`]*$/, '');
    url = url.replace(/`.*を[^`]*$/, '');
    url = url.replace(/`[^`]*を[^`]*$/, '');
    url = url.replace(/`[^`]*ましょう[^`]*$/, '');
    
    // 単独のバッククォートも除去
    url = url.replace(/`$/, '');
    
    // 末尾の空白を除去
    url = url.trim();
    
    return url;
  }

  async checkUrl(url, filePath, lineNumber, maxRetries = 2) {
    // 除外パターンをチェック
    if (this.excludePatterns.some(pattern => pattern.test(url))) {
      return null;
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // まずHEADリクエストを試す
        let response = await fetch(url, {
          method: 'HEAD',
          timeout: 8000, // 高速化のためタイムアウト短縮
          redirect: 'follow'
        });
        
        // HEADが失敗した場合はGETで再試行
        if (!response.ok && response.status !== 405) {
          response = await fetch(url, {
            method: 'GET',
            timeout: 8000,
            redirect: 'follow'
          });
        }
        
        // GitHub認証必要ページの判定
        if (this.ignoreGithubAuth && this.isGithubAuthRequired(url, response.status)) {
          return null; // GitHub認証必要ページはスキップ
        }

        // 明確な404エラーのみを壊れたリンクとして判定
        const brokenCodes = [404, 410]; // 404 Not Found, 410 Gone のみ
        
        if (brokenCodes.includes(response.status)) {
          return {
            url,
            status: response.status,
            file: filePath,
            line: lineNumber
          };
        }
        return null; // 成功
        
      } catch (error) {
        if (attempt === maxRetries) {
          // ネットワークエラーも明確に判別
          if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
            // DNSエラーや接続拒否は明確な壊れたリンク
            return {
              url,
              status: error.message.includes('ENOTFOUND') ? 'DNS_ERROR' : 'CONNECTION_REFUSED',
              file: filePath,
              line: lineNumber
            };
          }
          // その他のネットワークエラー（timeout等）は無視してnullを返す
          return null;
        } else {
          // リトライ前に少し待機
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }
  }

  async processBatch(tasks) {
    // 高速化のため並列度を大幅向上
    const batchSize = 50; // 50個同時処理（高速化優先）
    const allResults = [];
    
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (task) => {
          try {
            return await this.checkUrl(task.url, task.filePath, task.lineNumber);
          } catch (error) {
            // 追加のエラーハンドリング
            return {
              url: task.url,
              status: `Worker error: ${error.message}`,
              file: task.filePath,
              line: task.lineNumber
            };
          }
        })
      );
      allResults.push(...batchResults);
      
      // 高速化のため遅延を削除
      // if (i + batchSize < tasks.length) {
      //   await new Promise(resolve => setTimeout(resolve, 100));
      // }
    }
    
    // nullを除外して壊れたリンクのみ返す
    return allResults.filter(result => result !== null);
  }
}

// ワーカースレッドのメッセージハンドリング
parentPort.on('message', async (data) => {
  const { tasks, options = {} } = data;
  const worker = new LinkCheckerWorker(options);
  try {
    const brokenLinks = await worker.processBatch(tasks);
    parentPort.postMessage({ success: true, brokenLinks });
  } catch (error) {
    parentPort.postMessage({ success: false, error: error.message });
  }
});