#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const os = require('os');

// HTTP Agent for connection pooling
class HTTPAgent {
  constructor() {
    // Global fetch with connection pooling (Node.js 18+)
    this.fetchOptions = {
      keepalive: true,
      // Allow more concurrent connections
      headers: {
        'User-Agent': 'Link-Checker/1.0'
      }
    };
  }
}

class LinkChecker {
  constructor(options = {}) {
    this.brokenLinks = [];
    this.checkedUrls = new Set();
    this.ignoreGithubAuth = options.ignoreGithubAuth || false;
    this.githubAuthPagesSkipped = 0;
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

  async checkUrl(url, filePath, lineNumber, maxRetries = 2) {
    if (this.checkedUrls.has(url)) {
      return;
    }
    
    this.checkedUrls.add(url);
    
    // 除外パターンをチェック
    if (this.excludePatterns.some(pattern => pattern.test(url))) {
      return;
    }

    console.log(`Checking: ${url}`);
    
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
          this.githubAuthPagesSkipped++;
          console.log(`  🔐 GitHub認証必要ページをスキップ: ${url}`);
          return;
        }

        // 明確な404エラーのみを壊れたリンクとして判定
        const brokenCodes = [404, 410]; // 404 Not Found, 410 Gone のみ
        
        if (brokenCodes.includes(response.status)) {
          this.brokenLinks.push({
            url,
            status: response.status,
            file: filePath,
            line: lineNumber
          });
        }
        return; // 成功したら終了
        
      } catch (error) {
        if (attempt === maxRetries) {
          // ネットワークエラーも明確に判別
          if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
            // DNSエラーや接続拒否は明確な壊れたリンク
            this.brokenLinks.push({
              url,
              status: error.message.includes('ENOTFOUND') ? 'DNS_ERROR' : 'CONNECTION_REFUSED',
              file: filePath,
              line: lineNumber
            });
          }
          // その他のネットワークエラー（timeout等）は無視
        } else {
          // リトライ前に少し待機
          console.log(`  Retry ${attempt + 1}/${maxRetries}: ${url}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }
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

  extractLinks(content) {
    const links = [];
    
    // Markdown link pattern: [text](url)
    const markdownLinks = content.match(/\[([^\]]*)\]\(([^)]+)\)/g) || [];
    markdownLinks.forEach(match => {
      const urlMatch = match.match(/\[([^\]]*)\]\(([^)]+)\)/);
      if (urlMatch) {
        let url = this.cleanUrl(urlMatch[2]);
        if (url.startsWith('http://') || url.startsWith('https://')) {
          links.push(url);
        }
      }
    });

    // Broken Markdown pattern: [text](url](url) - よくある記載ミス
    const brokenMarkdownLinks = content.match(/\[([^\]]*)\]\(([^)]+)\]\(([^)]+)\)/g) || [];
    brokenMarkdownLinks.forEach(match => {
      const urlMatch = match.match(/\[([^\]]*)\]\(([^)]+)\]\(([^)]+)\)/);
      if (urlMatch) {
        // 最初のURLを使用
        let url = this.cleanUrl(urlMatch[2]);
        if (url.startsWith('http://') || url.startsWith('https://')) {
          links.push(url);
        }
      }
    });

    // HTML img tags
    const imgTags = content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi) || [];
    imgTags.forEach(match => {
      const urlMatch = match.match(/src=["']([^"']+)["']/i);
      if (urlMatch) {
        let url = this.cleanUrl(urlMatch[1]);
        if (url.startsWith('http://') || url.startsWith('https://')) {
          links.push(url);
        }
      }
    });

    // Direct URL pattern
    const directUrls = content.match(/https?:\/\/[^\s\)]+/g) || [];
    directUrls.forEach(rawUrl => {
      let url = this.cleanUrl(rawUrl);
      links.push(url);
    });

    // HTML anchor tags
    const htmlLinks = content.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/g) || [];
    htmlLinks.forEach(match => {
      const urlMatch = match.match(/href=["']([^"']+)["']/);
      if (urlMatch) {
        let url = this.cleanUrl(urlMatch[1]);
        if (url.startsWith('http://') || url.startsWith('https://')) {
          links.push(url);
        }
      }
    });

    return [...new Set(links)]; // Remove duplicates
  }

  async checkFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      // ファイル内の全リンクを収集
      const linkTasks = [];
      for (let i = 0; i < lines.length; i++) {
        const links = this.extractLinks(lines[i]);
        for (const url of links) {
          linkTasks.push({ url, filePath, lineNumber: i + 1 });
        }
      }
      
      return linkTasks;
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error.message);
      return [];
    }
  }

  async findMarkdownFiles(target) {
    const files = [];
    
    // Check if target is a file
    if (fs.statSync(target).isFile()) {
      if (target.endsWith('.md')) {
        files.push(target);
      }
      return files;
    }
    
    // Target is a directory
    const entries = fs.readdirSync(target, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(target, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules and .git directories
        if (entry.name !== 'node_modules' && entry.name !== '.git') {
          files.push(...await this.findMarkdownFiles(fullPath));
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  async processInBatches(tasks, batchSize = 100) {
    const results = [];
    console.log(`Processing ${tasks.length} links in batches of ${batchSize}`);
    
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(task => this.checkUrl(task.url, task.filePath, task.lineNumber))
      );
      results.push(...batchResults);
      
      // 進捗表示
      const progress = Math.round(((i + batchSize) / tasks.length) * 100);
      console.log(`Progress: ${Math.min(progress, 100)}% (${Math.min(i + batchSize, tasks.length)}/${tasks.length})`);
      
      // 高速化のため遅延を削除
      // if (i + batchSize < tasks.length) {
      //   await new Promise(resolve => setTimeout(resolve, 50));
      // }
    }
    return results;
  }

  async processWithWorkers(tasks, numWorkers = null) {
    if (!numWorkers) {
      // 大幅に並列度を向上（CPUコア数×4、最大16）
      numWorkers = Math.min(16, os.cpus().length * 4);
    }

    const workerPath = path.join(__dirname, 'link-checker-worker.js');
    
    // より小さなチャンクで分割して負荷分散を改善
    const chunkSize = Math.max(10, Math.ceil(tasks.length / (numWorkers * 3)));
    const chunks = [];
    
    for (let i = 0; i < tasks.length; i += chunkSize) {
      chunks.push(tasks.slice(i, i + chunkSize));
    }

    console.log(`Using ${numWorkers} workers with ${chunks.length} chunks (${chunkSize} tasks per chunk)`);

    // ワーカープールを作成
    const workers = [];
    for (let i = 0; i < numWorkers; i++) {
      workers.push({
        worker: new Worker(workerPath),
        busy: false,
        id: i
      });
    }

    let chunkIndex = 0;
    const results = [];

    const processChunk = (workerInfo) => {
      return new Promise((resolve, reject) => {
        if (chunkIndex >= chunks.length) {
          resolve();
          return;
        }

        const chunk = chunks[chunkIndex++];
        workerInfo.busy = true;

        workerInfo.worker.postMessage({ 
          tasks: chunk, 
          options: { ignoreGithubAuth: this.ignoreGithubAuth }
        });

        const onMessage = (result) => {
          workerInfo.worker.off('message', onMessage);
          workerInfo.worker.off('error', onError);
          
          if (result.success) {
            this.brokenLinks.push(...result.brokenLinks);
            workerInfo.busy = false;
            
            // 次のチャンクを処理
            processChunk(workerInfo).then(resolve).catch(reject);
          } else {
            reject(new Error(result.error));
          }
        };

        const onError = (error) => {
          workerInfo.worker.off('message', onMessage);
          workerInfo.worker.off('error', onError);
          reject(error);
        };

        workerInfo.worker.on('message', onMessage);
        workerInfo.worker.on('error', onError);
      });
    };

    // 全ワーカーで並列処理開始
    await Promise.all(workers.map(processChunk));

    // ワーカーを終了
    workers.forEach(workerInfo => {
      workerInfo.worker.terminate();
    });
  }

  async run(directory = '.') {
    console.log('🔍 Starting link check...');
    
    const markdownFiles = await this.findMarkdownFiles(directory);
    console.log(`Found ${markdownFiles.length} markdown files`);
    
    // 全ファイルからリンクタスクを収集
    console.log('📄 Collecting links from all files...');
    const allLinkTasks = [];
    for (const filePath of markdownFiles) {
      const linkTasks = await this.checkFile(filePath);
      allLinkTasks.push(...linkTasks);
    }
    
    // 重複URLを除去（最初に見つかったファイル情報を保持）
    const uniqueTasks = [];
    const seenUrls = new Set();
    for (const task of allLinkTasks) {
      if (!seenUrls.has(task.url)) {
        seenUrls.add(task.url);
        uniqueTasks.push(task);
      }
    }
    
    console.log(`Found ${allLinkTasks.length} total links (${uniqueTasks.length} unique)`);
    
    // Worker Threadsを使って並列処理
    console.log('🚀 Checking links with optimized parallel processing...');
    if (uniqueTasks.length > 50) {
      // 50個以上でWorker Threads使用（閾値を下げる）
      await this.processWithWorkers(uniqueTasks);
    } else {
      // 少量の場合は高速化されたバッチ処理
      console.log('Using optimized single-threaded processing for small dataset');
      await this.processInBatches(uniqueTasks, 100);
    }
    
    console.log('\n✅ Link check completed');
    
    // GitHub認証ページのスキップ数を表示
    if (this.ignoreGithubAuth && this.githubAuthPagesSkipped > 0) {
      console.log(`🔐 GitHub認証必要ページを ${this.githubAuthPagesSkipped} 個スキップしました`);
    }
    
    if (this.brokenLinks.length > 0) {
      console.log(`\n❌ Found ${this.brokenLinks.length} broken links:`);
      
      this.brokenLinks.forEach(link => {
        console.log(`  - ${link.url}`);
        console.log(`    Status: ${link.status}`);
        console.log(`    File: ${link.file}:${link.line}`);
        console.log('');
      });
      
      // Create a report file
      const report = {
        timestamp: new Date().toISOString(),
        totalBrokenLinks: this.brokenLinks.length,
        brokenLinks: this.brokenLinks
      };
      
      fs.writeFileSync('link-check-report.json', JSON.stringify(report, null, 2));
      console.log('📝 Report saved to link-check-report.json');
      
      process.exit(1);
    } else {
      console.log('\n🎉 All links are working!');
    }
  }
}

// Run the script if called directly
if (require.main === module) {
  const checker = new LinkChecker();
  const directory = process.argv[2] || '.';
  checker.run(directory).catch(console.error);
}

module.exports = LinkChecker;