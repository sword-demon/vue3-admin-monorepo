/**
 * Go 项目检测器
 */

import { join } from 'path';
import { BaseProjectDetector } from './base-detector.js';
import { ProjectType, ModuleInfo } from '../types/index.js';

interface GoMod {
  'module'?: {
    path?: string;
  };
  'go'?: string;
  'require'?: Array<{
    path?: string;
    version?: string;
  }>;
  'replace'?: Array<{
    old?: { path?: string };
    new?: { path?: string; version?: string };
  }>;
}

interface GoSum {
  // go.sum文件格式比较复杂，这里简化处理
  version: string;
  checksum: string;
}

export class GoProjectDetector extends BaseProjectDetector {
  name = 'Go';
  type = ProjectType.GO;
  patterns = [
    'go.mod',
    'go.sum',
    'main.go',
    'cmd/**/*.go',
    'pkg/**/*.go',
    'internal/**/*.go',
    'api/**/*.go',
    'vendor/**/*'
  ];

  /**
   * 检测是否为Go项目
   */
  async detect(path: string): Promise<boolean> {
    const goIndicators = [
      'go.mod',
      'main.go',
      'cmd/main.go'
    ];

    for (const indicator of goIndicators) {
      if (await this.fileExists(join(path, indicator))) {
        return true;
      }
    }

    // 检查是否有Go文件
    return await this.hasGoFiles(path);
  }

  /**
   * 分析Go项目
   */
  async analyze(path: string): Promise<ModuleInfo> {
    const moduleName = await this.extractModuleName(path);
    const moduleInfo = this.createBaseModuleInfo(path, moduleName);

    // 读取go.mod文件
    const goMod = await this.readGoMod(path);

    // 提取模块信息
    if (goMod?.module?.path) {
      moduleInfo.name = goMod.module.path;
      moduleInfo.metadata.description = `Go module: ${goMod.module.path}`;
    }

    // 解析Go版本
    if (goMod?.go) {
      moduleInfo.metadata.engines = { go: goMod.go };
    }

    // 解析依赖
    this.extractDependencies(moduleInfo, goMod);

    // 查找入口文件
    moduleInfo.entryPoints = await this.findEntryPoints(path);

    // 查找关键文件
    moduleInfo.keyFiles = await this.findKeyFiles(path);

    // 查找测试文件
    moduleInfo.testFiles = await this.findTestFiles(path);

    // 查找配置文件
    moduleInfo.configFiles = await this.findConfigFiles(path);

    // 查找文档文件
    moduleInfo.docs = await this.findDocFiles(path);

    return moduleInfo;
  }

  /**
   * 检查是否有Go文件
   */
  private async hasGoFiles(path: string): Promise<boolean> {
    const { promises: fs } = await import('fs');

    try {
      const entries = await fs.readdir(path, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.go')) {
          return true;
        }
      }
    } catch {
      // 忽略错误
    }

    return false;
  }

  /**
   * 提取模块名称
   */
  private async extractModuleName(path: string): Promise<string> {
    // 尝试从go.mod获取模块名
    const goMod = await this.readGoMod(path);
    if (goMod?.module?.path) {
      return goMod.module.path;
    }

    // 使用目录名
    return this.extractModuleName(path);
  }

  /**
   * 读取go.mod文件
   */
  private async readGoMod(path: string): Promise<GoMod | null> {
    try {
      const content = await this.readFile(join(path, 'go.mod'));
      if (!content) return null;

      const goMod: GoMod = {};
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmedLine = line.trim();

        // 解析module行
        if (trimmedLine.startsWith('module ')) {
          goMod.module = { path: trimmedLine.substring(7).trim() };
        }

        // 解析go版本
        else if (trimmedLine.startsWith('go ')) {
          goMod.go = trimmedLine.substring(3).trim();
        }

        // 解析require块
        else if (trimmedLine.startsWith('require')) {
          const requireContent = trimmedLine.substring(8).trim();
          if (requireContent && !requireContent.startsWith('(')) {
            // 单行require
            const match = requireContent.match(/([^\s]+)\s+([^\s]+)/);
            if (match) {
              if (!goMod.require) goMod.require = [];
              goMod.require.push({ path: match[1], version: match[2] });
            }
          }
        }

        // 解析require块内的依赖
        else if (trimmedLine && !trimmedLine.startsWith('//') && goMod.require) {
          const match = trimmedLine.match(/([^\s]+)\s+([^\s]+)/);
          if (match) {
            goMod.require.push({ path: match[1], version: match[2] });
          }
        }

        // 解析replace块
        else if (trimmedLine.startsWith('replace')) {
          const replaceContent = trimmedLine.substring(8).trim();
          if (replaceContent && !replaceContent.startsWith('(')) {
            // 单行replace
            const match = replaceContent.match(/([^\s]+)\s+=>\s+([^\s]+)(?:\s+([^\s]+))?/);
            if (match) {
              if (!goMod.replace) goMod.replace = [];
              goMod.replace.push({
                old: { path: match[1] },
                new: { path: match[2], version: match[3] || '' }
              });
            }
          }
        }

        // 解析replace块内的替换
        else if (trimmedLine && !trimmedLine.startsWith('//') && goMod.replace) {
          const match = trimmedLine.match(/([^\s]+)\s+=>\s+([^\s]+)(?:\s+([^\s]+))?/);
          if (match) {
            goMod.replace.push({
              old: { path: match[1] },
              new: { path: match[2], version: match[3] || '' }
            });
          }
        }
      }

      return goMod;
    } catch {
      return null;
    }
  }

  /**
   * 提取依赖
   */
  private extractDependencies(moduleInfo: ModuleInfo, goMod: GoMod | null): void {
    if (!goMod?.require) return;

    moduleInfo.dependencies = goMod.require.map(req => ({
      name: req.path || '',
      version: req.version || '',
      type: 'production' as const
    }));
  }

  /**
   * 查找入口文件
   */
  private async findEntryPoints(path: string): Promise<string[]> {
    const entryPatterns = [
      'main.go',
      'cmd/main.go',
      'cmd/**/main.go',
      'app/main.go',
      'server/main.go',
      'cli/main.go'
    ];

    const entryPoints: string[] = [];

    for (const pattern of entryPatterns) {
      if (pattern.includes('**/')) continue; // 简化处理

      const fullPath = join(path, pattern);
      if (await this.fileExists(fullPath)) {
        entryPoints.push(fullPath);
      }
    }

    return entryPoints;
  }

  /**
   * 查找关键文件
   */
  private async findKeyFiles(path: string): Promise<string[]> {
    const keyPatterns = [
      'README.md',
      'README',
      'CHANGELOG.md',
      'LICENSE',
      'CONTRIBUTING.md',
      'cmd/**/*.go',
      'pkg/**/*.go',
      'internal/**/*.go',
      'api/**/*.go',
      'lib/**/*.go'
    ];

    const keyFiles: string[] = [];

    for (const pattern of keyPatterns) {
      if (pattern.includes('**/*')) continue; // 简化处理

      const fullPath = join(path, pattern);
      if (await this.fileExists(fullPath)) {
        keyFiles.push(fullPath);
      }
    }

    return keyFiles;
  }

  /**
   * 查找测试文件
   */
  private async findTestFiles(path: string): Promise<string[]> {
    const testPatterns = [
      '**/*_test.go',
      '**/test_*.go',
      'tests/**/*.go',
      'test/**/*.go'
    ];

    const testFiles: string[] = [];

    for (const pattern of testPatterns) {
      if (pattern.includes('**/*')) continue; // 简化处理

      const fullPath = join(path, pattern);
      if (await this.fileExists(fullPath)) {
        testFiles.push(fullPath);
      }
    }

    return testFiles;
  }

  /**
   * 查找配置文件
   */
  private async findConfigFiles(path: string): Promise<string[]> {
    const configPatterns = [
      'go.mod',
      'go.sum',
      'Makefile',
      'makefile',
      'Taskfile.yml',
      'Taskfile.yaml',
      'Dockerfile',
      'docker-compose.yml',
      'docker-compose.yaml',
      '.golangci.yml',
      '.golangci.yaml',
      '.golangci-lint.yml',
      'go.work',
      'go.work.sum',
      '.air.toml',
      'buf.yaml',
      'buf.gen.yaml',
      'buf.work.yaml'
    ];

    const configFiles: string[] = [];

    for (const pattern of configPatterns) {
      const fullPath = join(path, pattern);
      if (await this.fileExists(fullPath)) {
        configFiles.push(fullPath);
      }
    }

    return configFiles;
  }

  /**
   * 查找文档文件
   */
  private async findDocFiles(path: string): Promise<string[]> {
    const docPatterns = [
      'README.md',
      'README',
      'CHANGELOG.md',
      'LICENSE',
      'CONTRIBUTING.md',
      'docs/**/*',
      'doc/**/*',
      'documentation/**/*',
      'examples/**/*',
      'api/**/*',
      'proto/**/*.proto'
    ];

    const docFiles: string[] = [];

    for (const pattern of docPatterns) {
      if (pattern.includes('**/*')) continue; // 简化处理

      const fullPath = join(path, pattern);
      if (await this.fileExists(fullPath)) {
        docFiles.push(fullPath);
      }
    }

    return docFiles;
  }
}