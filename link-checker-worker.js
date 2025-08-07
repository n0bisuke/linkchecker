const { parentPort } = require('worker_threads');

class LinkCheckerWorker {
  constructor() {
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
    ];
  }

  cleanUrl(url) {
    // HTMLタグの残骸を完全除去
    url = url.replace(/\\"[^"]*$/, '');     // \"で終わる部分
    url = url.replace(/\\">.*$/, '');      // \">以降すべて
    url = url.replace(/<[^>]*$/, '');      // 不完全なHTMLタグ
    url = url.replace(/>[^>]*$/, '');      // >以降の文字列
    url = url.replace(/\\".*$/, '');       // \"以降すべて
    
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
          timeout: 15000, // タイムアウトを延長
          redirect: 'follow'
        });
        
        // HEADが失敗した場合はGETで再試行
        if (!response.ok && response.status !== 405) {
          response = await fetch(url, {
            method: 'GET',
            timeout: 15000,
            redirect: 'follow'
          });
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
    // 安定性重視で並列度をさらに抑制
    const batchSize = 20; // 20個同時処理（安定性最優先）
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
      
      // バッチ間の遅延を増加してネットワーク負荷を軽減
      if (i + batchSize < tasks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // nullを除外して壊れたリンクのみ返す
    return allResults.filter(result => result !== null);
  }
}

// ワーカースレッドのメッセージハンドリング
parentPort.on('message', async (tasks) => {
  const worker = new LinkCheckerWorker();
  try {
    const brokenLinks = await worker.processBatch(tasks);
    parentPort.postMessage({ success: true, brokenLinks });
  } catch (error) {
    parentPort.postMessage({ success: false, error: error.message });
  }
});