# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the link checker tools in this directory.

## Overview

This directory contains a sophisticated link checker system designed to detect broken links (404/410 errors) in markdown documentation. The system is optimized for accuracy, avoiding false positives from placeholder URLs, access restrictions, and temporary network issues.

## Key Files

### Core Scripts
- `check-links.js` - Main link checker script with Worker Threads support
- `link-checker-worker.js` - Worker thread implementation for parallel processing

### Execution Methods
```bash
# Direct execution
node tools/check-links.js [directory]

# npm scripts (recommended)
npm run check-links              # Check entire repository
npm run check-links:articles     # Check articles/ folder only
npm run check-links:books        # Check books/ folder only
npm run check-links:lessons      # Check lessons/ folder only
```

## Architecture

### High-Performance Design
- **Worker Threads**: Uses multiple workers for parallel processing (up to 8 workers)
- **Batch Processing**: Processes 20 URLs concurrently per worker
- **Smart Scaling**: Automatically switches between single-thread and multi-thread based on URL count
- **Retry Logic**: Up to 3 attempts per URL with exponential backoff
- **Connection Pooling**: Optimized HTTP connections for better performance

### URL Extraction Patterns
The system detects URLs from multiple formats:

1. **Markdown Links**: `[text](url)`
2. **Broken Markdown**: `[text](url](url)` - common writing mistakes
3. **HTML Images**: `<img src="url">`
4. **HTML Anchors**: `<a href="url">`
5. **Direct URLs**: `https://example.com`

### Advanced URL Cleaning
Removes various contaminations:
- HTML tag remnants: `url"><img` → `url`
- Markdown size specifications: `url =200x` → `url`
- Image titles: `url "screenshot"` → `url`
- Broken markdown syntax: `url](other` → `url`
- Quotes, backticks, and trailing punctuation

### Strict Error Detection
**Only reports actual broken links:**
- ✅ `404 Not Found` - Page doesn't exist
- ✅ `410 Gone` - Page permanently removed  
- ✅ `DNS_ERROR` - Domain doesn't exist
- ✅ `CONNECTION_REFUSED` - Server down

**Ignores temporary/access issues:**
- ❌ `403 Forbidden` - Access restricted but link valid
- ❌ `405 Method Not Allowed` - HEAD request blocked
- ❌ `429 Too Many Requests` - Rate limiting
- ❌ `503 Service Unavailable` - Temporary downtime
- ❌ Timeout/network errors - Temporary issues

### Comprehensive Exclusion Patterns
Automatically skips placeholder/sample URLs:
```javascript
// Japanese placeholders
/GitHubユーザー名/, /ユーザー名\.github\.io/, /<ココ>/

// English placeholders  
/xxxx\.github\.io/, /hoge\.com/, /APP_PATH/

// Service placeholders
/hook\.us1\.make\.com\/xxxxx/, /your-[\w-]+/

// General patterns
/example\.com/, /localhost/, /\{.*\}/
```

## Output and Reporting

### Console Output
- Real-time progress indicators
- Retry attempts logging
- Final summary with broken link count

### JSON Report (`link-check-report.json`)
```json
{
  "timestamp": "2025-08-07T10:14:14.457Z",
  "totalBrokenLinks": 32,
  "brokenLinks": [
    {
      "url": "https://example.com/broken-page",
      "status": 404,
      "file": "articles/example.md", 
      "line": 26
    }
  ]
}
```

## Performance Characteristics

### Optimized for Large Repositories
- **1000+ URLs**: ~30-45 seconds execution time
- **Memory efficient**: Worker threads with controlled batch sizes
- **Network friendly**: Rate limiting and retry logic
- **CI/CD optimized**: Minimal resource usage

### Scalability Features
- Automatic worker count based on CPU cores (max 8)
- Dynamic batch sizing based on dataset size
- Progress reporting for long-running checks
- Artifact generation for CI systems

## GitHub Actions Integration

### Automated Scheduling
```yaml
schedule:
  - cron: '0 0 */3 * *'  # Every 3 days at 9 AM JST
```

### Smart Issue Management
- Creates GitHub Issues for broken links
- Groups results by file for readability
- Updates existing issues instead of creating duplicates
- Adds `broken-links` and `maintenance` labels

### Workflow Features
- Runs on push/PR for immediate feedback
- Uploads reports as artifacts (30-day retention)
- Comments on PRs with broken link details
- Supports manual execution via `workflow_dispatch`

## Common Use Cases

### Development Workflow
```bash
# Before committing changes
npm run check-links:articles

# Check specific file
node tools/check-links.js path/to/file.md

# Full repository check
npm run check-links
```

### Troubleshooting False Positives
1. **Add to exclusion patterns** in both `check-links.js` and `link-checker-worker.js`
2. **Check URL cleaning logic** - may need regex adjustment
3. **Verify extraction patterns** - ensure proper URL detection

### Performance Tuning
- **Increase batch size** for faster processing (risk: network errors)
- **Reduce worker count** for limited resources
- **Adjust retry count** for unreliable networks
- **Modify timeout** for slow websites

## Error Handling

### Graceful Degradation
- Worker failures don't crash entire process
- Network errors trigger automatic retries
- Malformed URLs are safely cleaned or skipped
- Progress continues even with individual failures

### Debugging Features
- Detailed console logging with timestamps
- Worker thread status reporting
- Batch processing progress indicators
- Error categorization in reports

## Maintenance Notes

### Regular Updates Needed
- **Exclusion patterns**: Add new placeholder patterns as they appear
- **Timeout values**: Adjust based on network conditions  
- **Batch sizes**: Optimize based on performance testing
- **Worker counts**: Scale with infrastructure changes

### Code Organization
- **Main logic**: `check-links.js` (single-threaded + coordination)
- **Worker logic**: `link-checker-worker.js` (parallel processing)
- **Configuration**: Exclusion patterns and settings in constructors
- **Integration**: npm scripts in `package.json`, GitHub Actions in `.github/workflows/`

This system prioritizes accuracy over speed, ensuring that only genuine maintenance issues are reported while avoiding noise from temporary problems or documentation placeholders.