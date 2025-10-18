/**
 * 文件过滤器和忽略规则系统
 */

import { join, relative, sep } from 'path';
import { promises as fs } from 'fs';
import { minimatch } from 'minimatch';
import {
  FileFilter,
  IgnoreRule,
  FileInfo,
  ScanError
} from '../types/index.js';

export class FileFilterSystem {
  private includeFilters: FileFilter[] = [];
  private excludeFilters: FileFilter[] = [];
  private ignoreRules: IgnoreRule[] = [];
  private ignoreCache: Map<string, boolean> = new Map();

  constructor(config?: { filters?: FileFilter[]; ignoreRules?: IgnoreRule[] }) {
    this.initializeDefaultFilters();
    this.initializeDefaultIgnoreRules();

    if (config?.filters) {
      this.addFilters(config.filters);
    }

    if (config?.ignoreRules) {
      this.addIgnoreRules(config.ignoreRules);
    }
  }

  /**
   * 初始化默认过滤器
   */
  private initializeDefaultFilters(): void {
    // 默认包含的文件类型
    const defaultIncludeFilters: FileFilter[] = [
      {
        name: 'Source files',
        pattern: '**/*.{js,ts,jsx,tsx,py,go,rs,java,cpp,c,h,hpp}',
        action: 'include',
        priority: 10
      },
      {
        name: 'Config files',
        pattern: '**/*.{json,yaml,yml,toml,xml,ini,conf,config}',
        action: 'include',
        priority: 9
      },
      {
        name: 'Documentation',
        pattern: '**/*.{md,txt,rst,adoc}',
        action: 'include',
        priority: 8
      },
      {
        name: 'Project files',
        pattern: '**/package.json',
        action: 'include',
        priority: 10
      },
      {
        name: 'Project files',
        pattern: '**/go.mod',
        action: 'include',
        priority: 10
      },
      {
        name: 'Project files',
        pattern: '**/pyproject.toml',
        action: 'include',
        priority: 10
      }
    ];

    // 默认排除的文件类型
    const defaultExcludeFilters: FileFilter[] = [
      {
        name: 'Binary files',
        pattern: '**/*.{exe,dll,so,dylib,a,lib}',
        action: 'exclude',
        priority: 10
      },
      {
        name: 'Large media files',
        pattern: '**/*.{mp4,avi,mov,wmv,flv,webm,mkv,mp3,wav,flac}',
        action: 'exclude',
        priority: 10
      },
      {
        name: 'Archive files',
        pattern: '**/*.{zip,tar,gz,bz2,rar,7z}',
        action: 'exclude',
        priority: 9
      },
      {
        name: 'Font files',
        pattern: '**/*.{ttf,otf,woff,woff2,eot}',
        action: 'exclude',
        priority: 8
      },
      {
        name: 'Image files (large)',
        pattern: '**/*.{psd,tiff,bmp}',
        action: 'exclude',
        priority: 7
      }
    ];

    this.includeFilters.push(...defaultIncludeFilters);
    this.excludeFilters.push(...defaultExcludeFilters);
  }

  /**
   * 初始化默认忽略规则
   */
  private initializeDefaultIgnoreRules(): void {
    const defaultIgnoreRules: IgnoreRule[] = [
      // 版本控制
      { pattern: '.git/**', description: 'Git版本控制文件', priority: 10 },
      { pattern: '.gitignore', description: 'Git忽略文件', priority: 10 },
      { pattern: '.gitmodules', description: 'Git子模块配置', priority: 9 },

      // Node.js
      { pattern: 'node_modules/**', description: 'Node.js依赖目录', priority: 10 },
      { pattern: 'npm-debug.log*', description: 'npm调试日志', priority: 8 },
      { pattern: 'yarn-debug.log*', description: 'yarn调试日志', priority: 8 },
      { pattern: 'yarn-error.log*', description: 'yarn错误日志', priority: 8 },
      { pattern: '.pnpm-debug.log*', description: 'pnpm调试日志', priority: 8 },

      // 构建输出
      { pattern: 'dist/**', description: '构建输出目录', priority: 9 },
      { pattern: 'build/**', description: '构建输出目录', priority: 9 },
      { pattern: 'out/**', description: '构建输出目录', priority: 9 },
      { pattern: '.next/**', description: 'Next.js构建目录', priority: 9 },
      { pattern: '.nuxt/**', description: 'Nuxt.js构建目录', priority: 9 },
      { pattern: '.cache/**', description: '缓存目录', priority: 8 },

      // Python
      { pattern: '__pycache__/**', description: 'Python字节码缓存', priority: 10 },
      { pattern: '*.py[cod]', description: 'Python字节码文件', priority: 9 },
      { pattern: '.pytest_cache/**', description: 'pytest缓存', priority: 8 },
      { pattern: '.mypy_cache/**', description: 'mypy缓存', priority: 8 },
      { pattern: '.tox/**', description: 'tox测试环境', priority: 8 },
      { pattern: '.venv/**', description: 'Python虚拟环境', priority: 9 },
      { pattern: 'venv/**', description: 'Python虚拟环境', priority: 9 },
      { pattern: 'env/**', description: 'Python虚拟环境', priority: 9 },

      // Go
      { pattern: 'vendor/**', description: 'Go依赖目录', priority: 9 },

      // IDE和编辑器
      { pattern: '.vscode/**', description: 'VS Code配置', priority: 7 },
      { pattern: '.idea/**', description: 'IntelliJ IDEA配置', priority: 7 },
      { pattern: '*.swp', description: 'Vim交换文件', priority: 7 },
      { pattern: '*.swo', description: 'Vim交换文件', priority: 7 },
      { pattern: '.DS_Store', description: 'macOS系统文件', priority: 7 },
      { pattern: 'Thumbs.db', description: 'Windows缩略图', priority: 7 },

      // 操作系统
      { pattern: '.DS_Store/**', description: 'macOS系统文件', priority: 8 },
      { pattern: '.Spotlight-V100/**', description: 'macOS Spotlight索引', priority: 6 },
      { pattern: '.Trashes/**', description: 'macOS回收站', priority: 6 },

      // 临时文件
      { pattern: '*.tmp', description: '临时文件', priority: 6 },
      { pattern: '*.temp', description: '临时文件', priority: 6 },
      { pattern: '*.log', description: '日志文件', priority: 5 },
      { pattern: '.env.local', description: '本地环境变量', priority: 8 },
      { pattern: '.env.*.local', description: '本地环境变量', priority: 8 },

      // 测试覆盖率
      { pattern: 'coverage/**', description: '测试覆盖率报告', priority: 8 },
      { pattern: '.coverage', description: 'Python测试覆盖率文件', priority: 8 },
      { pattern: 'coverage.xml', description: '测试覆盖率报告', priority: 7 },

      // 依赖锁定文件（通常很大但有用）
      { pattern: 'package-lock.json', description: 'npm锁定文件', priority: 5 },
      { pattern: 'yarn.lock', description: 'yarn锁定文件', priority: 5 },
      { pattern: 'pnpm-lock.yaml', description: 'pnpm锁定文件', priority: 5 },
      { pattern: 'poetry.lock', description: 'Poetry锁定文件', priority: 5 }
    ];

    this.ignoreRules.push(...defaultIgnoreRules);
  }

  /**
   * 添加过滤器
   */
  addFilters(filters: FileFilter[]): void {
    for (const filter of filters) {
      if (filter.action === 'include') {
        this.includeFilters.push(filter);
      } else {
        this.excludeFilters.push(filter);
      }
    }

    // 按优先级排序
    this.includeFilters.sort((a, b) => b.priority - a.priority);
    this.excludeFilters.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 添加忽略规则
   */
  addIgnoreRules(rules: IgnoreRule[]): void {
    this.ignoreRules.push(...rules);
    this.ignoreRules.sort((a, b) => b.priority - a.priority);
    this.clearCache();
  }

  /**
   * 检查文件是否应该被包含
   */
  async shouldInclude(filePath: string, rootPath: string): Promise<boolean> {
    const relativePath = relative(rootPath, filePath);

    // 检查缓存
    const cacheKey = relativePath;
    if (this.ignoreCache.has(cacheKey)) {
      return this.ignoreCache.get(cacheKey)!;
    }

    try {
      // 获取文件信息
      const fileStats = await fs.stat(filePath);
      const fileInfo: FileInfo = {
        path: filePath,
        name: filePath.split(sep).pop() || '',
        extension: filePath.split('.').pop() || '',
        size: fileStats.size,
        isDirectory: fileStats.isDirectory(),
        lastModified: fileStats.mtime,
        relativePath
      };

      // 应用忽略规则
      if (this.shouldIgnore(relativePath, fileInfo)) {
        this.ignoreCache.set(cacheKey, false);
        return false;
      }

      // 应用过滤器
      const shouldInclude = this.applyFilters(relativePath, fileInfo);
      this.ignoreCache.set(cacheKey, shouldInclude);
      return shouldInclude;
    } catch (error) {
      // 如果无法获取文件信息，默认不包含
      this.ignoreCache.set(cacheKey, false);
      return false;
    }
  }

  /**
   * 检查是否应该忽略
   */
  private shouldIgnore(relativePath: string, fileInfo: FileInfo): boolean {
    for (const rule of this.ignoreRules) {
      if (this.matchPattern(relativePath, rule.pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 应用过滤器
   */
  private applyFilters(relativePath: string, fileInfo: FileInfo): boolean {
    // 首先检查排除过滤器
    for (const filter of this.excludeFilters) {
      if (this.matchPattern(relativePath, filter.pattern)) {
        return false;
      }
    }

    // 然后检查包含过滤器
    for (const filter of this.includeFilters) {
      if (this.matchPattern(relativePath, filter.pattern)) {
        return true;
      }
    }

    // 如果没有匹配任何过滤器，默认包含（除非有其他规则）
    return true;
  }

  /**
   * 匹配模式
   */
  private matchPattern(path: string, pattern: string | RegExp): boolean {
    if (pattern instanceof RegExp) {
      return pattern.test(path);
    }

    try {
      return minimatch(path, pattern, { dot: true });
    } catch (error) {
      console.warn(`Invalid pattern: ${pattern}`, error);
      return false;
    }
  }

  /**
   * 过滤文件列表
   */
  async filterFiles(filePaths: string[], rootPath: string): Promise<string[]> {
    const includedFiles: string[] = [];

    for (const filePath of filePaths) {
      if (await this.shouldInclude(filePath, rootPath)) {
        includedFiles.push(filePath);
      }
    }

    return includedFiles;
  }

  /**
   * 批量过滤文件信息
   */
  async filterFileInfos(fileInfos: FileInfo[], rootPath: string): Promise<FileInfo[]> {
    const includedFiles: FileInfo[] = [];

    for (const fileInfo of fileInfos) {
      if (await this.shouldInclude(fileInfo.path, rootPath)) {
        includedFiles.push(fileInfo);
      }
    }

    return includedFiles;
  }

  /**
   * 从.gitignore文件加载忽略规则
   */
  async loadGitignore(rootPath: string): Promise<void> {
    const gitignorePath = join(rootPath, '.gitignore');

    try {
      const content = await fs.readFile(gitignorePath, 'utf-8');
      const lines = content.split('\n');

      const gitignoreRules: IgnoreRule[] = [];

      for (const line of lines) {
        const trimmedLine = line.trim();

        // 跳过空行和注释
        if (!trimmedLine || trimmedLine.startsWith('#')) {
          continue;
        }

        gitignoreRules.push({
          pattern: trimmedLine,
          description: `From .gitignore: ${trimmedLine}`,
          priority: 6 // 中等优先级，低于默认规则
        });
      }

      this.addIgnoreRules(gitignoreRules);
    } catch (error) {
      // .gitignore文件不存在或无法读取，忽略错误
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.ignoreCache.clear();
  }

  /**
   * 获取过滤器统计信息
   */
  getStatistics(): {
    includeFilters: number;
    excludeFilters: number;
    ignoreRules: number;
    cacheSize: number;
  } {
    return {
      includeFilters: this.includeFilters.length,
      excludeFilters: this.excludeFilters.length,
      ignoreRules: this.ignoreRules.length,
      cacheSize: this.ignoreCache.size
    };
  }

  /**
   * 获取所有过滤器
   */
  getFilters(): { include: FileFilter[]; exclude: FileFilter[] } {
    return {
      include: [...this.includeFilters],
      exclude: [...this.excludeFilters]
    };
  }

  /**
   * 获取所有忽略规则
   */
  getIgnoreRules(): IgnoreRule[] {
    return [...this.ignoreRules];
  }

  /**
   * 重置为默认配置
   */
  reset(): void {
    this.includeFilters = [];
    this.excludeFilters = [];
    this.ignoreRules = [];
    this.ignoreCache.clear();
    this.initializeDefaultFilters();
    this.initializeDefaultIgnoreRules();
  }

  /**
   * 导出配置
   */
  exportConfig(): { filters: FileFilter[]; ignoreRules: IgnoreRule[] } {
    return {
      filters: [...this.includeFilters, ...this.excludeFilters],
      ignoreRules: [...this.ignoreRules]
    };
  }

  /**
   * 导入配置
   */
  importConfig(config: { filters: FileFilter[]; ignoreRules: IgnoreRule[] }): void {
    this.reset();
    this.addFilters(config.filters);
    this.addIgnoreRules(config.ignoreRules);
  }
}