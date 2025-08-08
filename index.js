/**
 * handson-md-link-checker
 * 高性能並列処理マークダウンリンクチェッカー
 * 
 * @example
 * // 基本的な使用方法
 * const LinkChecker = require('handson-md-link-checker');
 * 
 * const checker = new LinkChecker();
 * checker.run('./docs').then(() => {
 *   console.log('チェック完了');
 * });
 * 
 * @example
 * // カスタム設定での使用
 * const { LinkChecker } = require('handson-md-link-checker');
 * 
 * const checker = new LinkChecker({
 *   maxWorkers: 8,
 *   timeout: 5000,
 *   excludePatterns: [/example\.com/]
 * });
 * 
 * const result = await checker.checkDirectory('./docs');
 * console.log(`${result.brokenLinks.length} broken links found`);
 */

const LinkCheckerClass = require('./check-links.js');

/**
 * LinkCheckerクラスをカスタム設定で拡張
 */
class LinkChecker extends LinkCheckerClass {
  constructor(options = {}) {
    super();
    
    // カスタムオプションを適用
    if (options.maxWorkers) {
      this.maxWorkers = options.maxWorkers;
    }
    
    if (options.timeout) {
      this.timeout = options.timeout;
    }
    
    if (options.excludePatterns && Array.isArray(options.excludePatterns)) {
      this.excludePatterns.push(...options.excludePatterns);
    }
    
    if (options.batchSize) {
      this.batchSize = options.batchSize;
    }
    
    if (options.ignoreGithubAuth !== undefined) {
      this.ignoreGithubAuth = options.ignoreGithubAuth;
    }
    
    if (options.explicitLinksOnly !== undefined) {
      this.explicitLinksOnly = options.explicitLinksOnly;
    }
  }
  
  /**
   * ディレクトリまたはファイルをチェックして結果オブジェクトを返す
   * @param {string} target - チェック対象のパスまたはファイル
   * @param {boolean} silent - コンソール出力を抑制するかどうか
   * @returns {Promise<Object>} 結果オブジェクト
   */
  async checkDirectory(target = '.', silent = false) {
    const originalConsoleLog = console.log;
    
    if (silent) {
      console.log = () => {}; // コンソール出力を無効化
    }
    
    try {
      // 既存のbrokenLinksをリセット
      this.brokenLinks = [];
      this.checkedUrls = new Set();
      
      const markdownFiles = await this.findMarkdownFiles(target);
      const allLinkTasks = [];
      
      for (const filePath of markdownFiles) {
        const linkTasks = await this.checkFile(filePath);
        allLinkTasks.push(...linkTasks);
      }
      
      // 重複URLを除去
      const uniqueTasks = [];
      const seenUrls = new Set();
      for (const task of allLinkTasks) {
        if (!seenUrls.has(task.url)) {
          seenUrls.add(task.url);
          uniqueTasks.push(task);
        }
      }
      
      // リンクをチェック
      if (uniqueTasks.length > 50) {
        await this.processWithWorkers(uniqueTasks);
      } else {
        await this.processInBatches(uniqueTasks, 100);
      }
      
      return {
        timestamp: new Date().toISOString(),
        totalFiles: markdownFiles.length,
        totalLinks: allLinkTasks.length,
        uniqueLinks: uniqueTasks.length,
        totalBrokenLinks: this.brokenLinks.length,
        brokenLinks: this.brokenLinks,
        success: this.brokenLinks.length === 0
      };
      
    } finally {
      if (silent) {
        console.log = originalConsoleLog; // コンソール出力を復元
      }
    }
  }
  
  /**
   * 単一URLをチェック（プログラマティック用）
   * @param {string} url - チェック対象のURL
   * @returns {Promise<Object|null>} 壊れたリンクの情報またはnull
   */
  async checkSingleUrl(url) {
    return await this.checkUrl(url, 'programmatic', 1);
  }
  
  /**
   * 複数のURLを並列でチェック
   * @param {string[]} urls - チェック対象のURL配列
   * @param {boolean} silent - コンソール出力を抑制するかどうか
   * @returns {Promise<Object[]>} 壊れたリンクの配列
   */
  async checkUrls(urls, silent = false) {
    const originalConsoleLog = console.log;
    
    if (silent) {
      console.log = () => {};
    }
    
    try {
      this.brokenLinks = [];
      this.checkedUrls = new Set();
      
      const tasks = urls.map((url, index) => ({
        url,
        filePath: 'programmatic',
        lineNumber: index + 1
      }));
      
      if (tasks.length > 50) {
        await this.processWithWorkers(tasks);
      } else {
        await this.processInBatches(tasks, 100);
      }
      
      return this.brokenLinks;
      
    } finally {
      if (silent) {
        console.log = originalConsoleLog;
      }
    }
  }
}

// 複数のエクスポート方法をサポート
module.exports = LinkChecker;
module.exports.LinkChecker = LinkChecker;
module.exports.default = LinkChecker;

// TypeScript用の型定義（JSDoc）
/**
 * @typedef {Object} LinkCheckResult
 * @property {string} timestamp - チェック実行時刻
 * @property {number} totalFiles - チェックしたファイル数
 * @property {number} totalLinks - 見つかったリンクの総数
 * @property {number} uniqueLinks - ユニークなリンクの数
 * @property {number} totalBrokenLinks - 壊れたリンクの数
 * @property {Object[]} brokenLinks - 壊れたリンクの詳細
 * @property {boolean} success - チェックが成功したかどうか
 */

/**
 * @typedef {Object} BrokenLink
 * @property {string} url - 壊れたURL
 * @property {string|number} status - HTTPステータスコードまたはエラー
 * @property {string} file - ファイルパス
 * @property {number} line - 行番号
 */

/**
 * @typedef {Object} LinkCheckerOptions
 * @property {number} [maxWorkers] - 最大ワーカー数（デフォルト: CPU数×4、最大16）
 * @property {number} [timeout] - タイムアウト時間（ms、デフォルト: 8000）
 * @property {RegExp[]} [excludePatterns] - 除外パターンの追加
 * @property {number} [batchSize] - バッチサイズ（デフォルト: 100）
 * @property {boolean} [ignoreGithubAuth] - GitHub認証が必要なページを除外（デフォルト: false）
 * @property {boolean} [explicitLinksOnly] - 明示的リンクのみをチェック（デフォルト: false）
 */