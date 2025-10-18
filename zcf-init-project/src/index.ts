/**
 * ZCF项目AI上下文初始化系统 - 主入口
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import {
  ProjectScanResult,
  ScanOptions,
  DocumentationConfig,
  DocumentationResult,
  ScanPhase,
  ScanError
} from './types/index.js';
import { DetectorManager } from './detectors/detector-manager.js';
import { FileFilterSystem } from './filters/file-filter.js';
import { ScanConfigManager } from './config/scan-config.js';

export interface InitializeOptions {
  path: string;
  outputPath?: string;
  configFile?: string;
  force?: boolean;
  verbose?: boolean;
  phases?: ScanPhase[];
  maxFiles?: number;
  maxDepth?: number;
  timeout?: number;
  dryRun?: boolean;
  documentationConfig?: DocumentationConfig;
}

export interface ScanResult {
  modules: Array<{
    name: string;
    path: string;
    type: string;
  }>;
  statistics: {
    totalFiles: number;
    scannedFiles: number;
    modulesFound: number;
    coverage: number;
    scanDuration: number;
  };
  recommendations: Array<{
    type: string;
    priority: string;
    title: string;
    description: string;
  }>;
}

export interface DocsResult {
  documentsGenerated: number;
  totalSize: number;
  generationTime: number;
}

export class ZcfInitProject {
  private detectorManager: DetectorManager;
  private fileFilter: FileFilterSystem;

  constructor() {
    this.detectorManager = new DetectorManager();
    this.fileFilter = new FileFilterSystem();
  }

  /**
   * 主要初始化方法
   */
  async initialize(options: InitializeOptions): Promise<{
    scanResult: ScanResult;
    docsResult: DocsResult;
  }> {
    const spinner = ora('正在初始化项目...').start();

    try {
      // 1. 扫描项目
      const scanResult = await this.scanOnly(options.path, {
        phases: options.phases || [ScanPhase.QUICK],
        verbose: options.verbose,
        maxFiles: options.maxFiles,
        maxDepth: options.maxDepth,
        timeout: options.timeout
      });

      spinner.succeed('项目扫描完成');

      // 2. 生成文档
      if (!options.dryRun) {
        spinner.start('正在生成文档...');
        const docsResult = await this.generateDocsOnly(options.path, {
          outputPath: options.outputPath,
          includeMermaid: options.documentationConfig?.includeMermaid !== false,
          includeBreadcrumbs: options.documentationConfig?.includeBreadcrumbs !== false
        });
        spinner.succeed('文档生成完成');

        return {
          scanResult,
          docsResult
        };
      } else {
        spinner.info('干运行模式 - 跳过文档生成');
        return {
          scanResult,
          docsResult: {
            documentsGenerated: 0,
            totalSize: 0,
            generationTime: 0
          }
        };
      }

    } catch (error) {
      spinner.fail('初始化失败');
      throw error;
    }
  }

  /**
   * 仅执行扫描
   */
  async scanOnly(projectPath: string, options: {
    phases?: ScanPhase[];
    verbose?: boolean;
    maxFiles?: number;
    maxDepth?: number;
    timeout?: number;
  } = {}): Promise<ScanResult> {
    const phases = options.phases || [ScanPhase.QUICK];
    const startTime = Date.now();

    if (options.verbose) {
      console.log(chalk.blue('🔍 开始扫描项目...'));
      console.log(chalk.gray(`路径: ${projectPath}`));
      console.log(chalk.gray(`阶段: ${phases.join(', ')}`));
    }

    try {
      // 加载.gitignore规则
      await this.fileFilter.loadGitignore(projectPath);

      // 识别项目类型
      const projectType = await this.detectorManager.detectProjectType(projectPath);

      // 快速扫描文件
      const allFiles = await this.scanFiles(projectPath, options.maxDepth || 5);

      // 过滤文件
      const filteredFiles = await this.fileFilter.filterFiles(allFiles, projectPath);

      // 识别模块
      const modules = await this.identifyModules(filteredFiles, projectPath);

      const scanDuration = Date.now() - startTime;
      const coverage = allFiles.length > 0 ? (filteredFiles.length / allFiles.length) * 100 : 0;

      const result: ScanResult = {
        modules: modules.map(m => ({
          name: m.name,
          path: m.path,
          type: m.type
        })),
        statistics: {
          totalFiles: allFiles.length,
          scannedFiles: filteredFiles.length,
          modulesFound: modules.length,
          coverage: Math.round(coverage * 100) / 100,
          scanDuration
        },
        recommendations: this.generateRecommendations(modules, coverage, projectType)
      };

      if (options.verbose) {
        console.log(chalk.green('✅ 扫描完成'));
        console.log(chalk.blue(`📁 模块数量: ${result.statistics.modulesFound}`));
        console.log(chalk.blue(`📄 总文件数: ${result.statistics.totalFiles}`));
        console.log(chalk.blue(`📊 扫描覆盖率: ${result.statistics.coverage}%`));
        console.log(chalk.blue(`⏱️  扫描耗时: ${result.statistics.scanDuration}ms`));
      }

      return result;

    } catch (error) {
      throw new ScanError(
        `扫描失败: ${(error as Error).message}`,
        'SCAN_FAILED',
        projectPath
      );
    }
  }

  /**
   * 仅生成文档
   */
  async generateDocsOnly(projectPath: string, options: {
    outputPath?: string;
    includeMermaid?: boolean;
    includeBreadcrumbs?: boolean;
  } = {}): Promise<DocsResult> {
    const startTime = Date.now();
    const outputPath = options.outputPath || projectPath;

    // 首先执行快速扫描
    const scanResult = await this.scanOnly(projectPath);

    // 生成根级文档
    const rootDocContent = this.generateRootDocumentation(scanResult, {
      includeMermaid: options.includeMermaid !== false,
      includeBreadcrumbs: options.includeBreadcrumbs !== false
    });

    // 生成模块级文档
    const moduleDocs = await this.generateModuleDocumentation(scanResult, outputPath, {
      includeBreadcrumbs: options.includeBreadcrumbs !== false
    });

    // 写入文档文件
    const docFiles = [
      { path: join(outputPath, 'CLAUDE.md'), content: rootDocContent },
      ...moduleDocs
    ];

    let totalSize = 0;
    for (const docFile of docFiles) {
      await fs.writeFile(docFile.path, docFile.content, 'utf-8');
      totalSize += docFile.content.length;
    }

    return {
      documentsGenerated: docFiles.length,
      totalSize,
      generationTime: Date.now() - startTime
    };
  }

  /**
   * 扫描文件
   */
  private async scanFiles(rootPath: string, maxDepth: number = 5): Promise<string[]> {
    const allFiles: string[] = [];

    async function traverseDirectory(currentPath: string, depth: number): Promise<void> {
      if (depth > maxDepth) return;

      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.name.startsWith('.') && currentPath !== rootPath) {
            continue; // 跳过隐藏文件/目录
          }

          const fullPath = join(currentPath, entry.name);

          if (entry.isDirectory()) {
            await traverseDirectory(fullPath, depth + 1);
          } else {
            allFiles.push(fullPath);
          }
        }
      } catch {
        // 忽略无法访问的目录
      }
    }

    await traverseDirectory(rootPath, 0);
    return allFiles;
  }

  /**
   * 识别模块
   */
  private async identifyModules(files: string[], rootPath: string): Promise<Array<{
    name: string;
    path: string;
    type: string;
  }>> {
    const modules: Array<{ name: string; path: string; type: string }> = [];
    const moduleIndicators = new Set<string>();

    // 查找模块指示文件
    for (const file of files) {
      const fileName = file.split('/').pop();
      if (['package.json', 'go.mod', 'pyproject.toml', 'Cargo.toml'].includes(fileName || '')) {
        moduleIndicators.add(file);
      }
    }

    // 为每个指示文件分析模块
    for (const indicatorFile of moduleIndicators) {
      try {
        const modulePath = dirname(indicatorFile);
        const projectType = await this.detectorManager.detectProjectType(modulePath);

        if (projectType !== 'unknown') {
          const moduleName = modulePath.split('/').pop() || 'unknown';
          modules.push({
            name: moduleName,
            path: modulePath,
            type: projectType
          });
        }
      } catch {
        // 忽略分析失败的模块
      }
    }

    return modules;
  }

  /**
   * 生成推荐
   */
  private generateRecommendations(
    modules: Array<{ name: string; path: string; type: string }>,
    coverage: number,
    projectType: string
  ): ScanResult['recommendations'] {
    const recommendations: ScanResult['recommendations'] = [];

    if (modules.length === 0) {
      recommendations.push({
        type: 'scan_deeper',
        priority: 'high',
        title: '未找到项目模块',
        description: '建议检查项目结构或手动配置模块识别规则'
      });
    }

    if (coverage < 50) {
      recommendations.push({
        type: 'scan_deeper',
        priority: 'medium',
        title: '扫描覆盖率较低',
        description: `当前覆盖率 ${coverage.toFixed(1)}%，建议检查文件过滤配置`
      });
    }

    if (projectType === 'unknown') {
      recommendations.push({
        type: 'add_config',
        priority: 'medium',
        title: '未识别项目类型',
        description: '建议手动指定项目类型或添加自定义检测器'
      });
    }

    return recommendations;
  }

  /**
   * 生成根级文档
   */
  private generateRootDocumentation(
    scanResult: ScanResult,
    options: { includeMermaid: boolean; includeBreadcrumbs: boolean }
  ): string {
    const timestamp = new Date().toLocaleString('zh-CN');

    let content = `# 项目AI上下文文档

> 🤖 Generated with [Claude Code](https://claude.com/claude-code)
>
> 生成时间: ${timestamp}

## 项目概览

这是一个 **${scanResult.statistics.modulesFound > 0 ? '多模块' : '单模块'}** 项目，包含 **${scanResult.statistics.modulesFound}** 个模块。

### 项目结构
`;

    // 添加Mermaid图表
    if (options.includeMermaid) {
      content += `
### 项目架构图

\`\`\`mermaid
graph TD
    A[${scanResult.modulesFound > 0 ? '项目根目录' : '根目录'}`;

      for (const module of scanResult.modules) {
        content += `\n    A --> ${module.name}`;
      }

      content += `
\`\`\`

### 模块依赖关系

\`\`\`mermaid
graph LR
`;

      for (let i = 0; i < scanResult.modules.length; i++) {
        const module = scanResult.modules[i];
        content += `\n    ${module.name} --> 模块${i + 1}`;
      }

      content += `
\`\`\n\n`;
    }

    // 添加模块列表
    if (scanResult.modules.length > 0) {
      content += `### 模块列表

| 模块名称 | 类型 | 路径 |
|---------|------|------|
`;

      for (const module of scanResult.modules) {
        content += `\n| ${module.name} | ${module.type} | \`${module.path}\` |`;
      }

      content += '\n\n';
    }

    // 添加统计信息
    content += `## 扫描统计

- **总文件数**: ${scanResult.statistics.totalFiles}
- **已扫描文件**: ${scanResult.statistics.scannedFiles}
- **扫描覆盖率**: ${scanResult.statistics.coverage}%
- **扫描耗时**: ${scanResult.statistics.scanDuration}ms

## 推荐建议

`;

    for (const rec of scanResult.recommendations) {
      const priorityEmoji = {
        low: '🟢',
        medium: '🟡',
        high: '🟠',
        critical: '🔴'
      }[rec.priority] || '⚪';

      content += `### ${priorityEmoji} ${rec.title}

${rec.description}

`;
    }

    content += `
---

## 使用说明

此文档由 ZCF 项目初始化工具自动生成，为 AI 助助开发提供项目上下文信息。

### 如何使用

1. **项目理解**: AI 可以通过此文档快速了解项目结构和模块关系
2. **代码生成**: 基于模块信息生成符合项目规范的代码
3. **问题诊断**: 根据依赖关系快速定位问题所在
4. **重构建议**: 基于架构图提供重构建议

### 文档更新

要更新此文档，请运行：

\`\`\`bash
zcf-init-project [项目路径]
\`\`\

或使用配置文件：

\`\`\`bash
zcf-init-project --config .zcf-scan.json
\`\`\n`;

    return content;
  }

  /**
   * 生成模块级文档
   */
  private async generateModuleDocumentation(
    scanResult: ScanResult,
    outputPath: string,
    options: { includeBreadcrumbs: boolean }
  ): Promise<Array<{ path: string; content: string }>> {
    const moduleDocs: Array<{ path: string; content: string }> = [];

    for (const module of scanResult.modules) {
      const content = this.generateModuleDocContent(module, scanResult, options);
      const docPath = join(module.path, 'CLAUDE.md');

      // 确保目录存在
      await fs.mkdir(dirname(docPath), { recursive: true });

      moduleDocs.push({
        path: docPath,
        content
      });
    }

    return moduleDocs;
  }

  /**
   * 生成单个模块的文档内容
   */
  private generateModuleDocContent(
    module: { name: string; path: string; type: string },
    scanResult: ScanResult,
    options: { includeBreadcrumbs: boolean }
  ): string {
    let content = `# ${module.name} 模块

> 🤖 Generated with [Claude Code](https://claude.com/claude-code)

## 模块信息

- **名称**: ${module.name}
- **类型**: ${module.type}
- **路径**: \`${module.path}\`
`;

    // 添加面包屑导航
    if (options.includeBreadcrumbs) {
      content += `
## 导航

🏠 [项目根目录](../../../CLAUDE.md) > 📦 ${module.name} 模块
`;
    }

    content += `

## 模块描述

这是一个 ${module.type} 类型的模块。

## 开发指南

### 快速开始

1. 了解模块的依赖关系
2. 查看模块的入口文件
3. 运行模块的测试

### 注意事项

- 修改代码时请遵循项目的编码规范
- 提交前请确保所有测试通过
- 更新依赖时请检查兼容性

---

*此文档由 ZCF 项目初始化工具自动生成*
`;

    return content;
  }
}

// 导出主要类
export default ZcfInitProject;