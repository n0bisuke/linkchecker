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
  constructor() {
    this.brokenLinks = [];
    this.checkedUrls = new Set();
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

  async processInBatches(tasks, batchSize = 20) {
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
      
      // 安定性のため遅延を追加
      if (i + batchSize < tasks.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    return results;
  }

  async processWithWorkers(tasks, numWorkers = null) {
    if (!numWorkers) {
      // より多くのワーカーを使用（CPUコア数×2、最大8）
      numWorkers = Math.min(8, os.cpus().length * 2);
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

        workerInfo.worker.postMessage(chunk);

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