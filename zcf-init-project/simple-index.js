#!/usr/bin/env node

/**
 * 简化版 ZCF 项目初始化工具
 */

import { promises as fs } from 'fs';
import { join, relative, sep } from 'path';

class SimpleZcfInitProject {
  constructor() {
    this.moduleIndicators = [
      'package.json',
      'go.mod',
      'pyproject.toml',
      'setup.py',
      'Cargo.toml',
      'pom.xml',
      'build.gradle'
    ];
  }

  async scanProject(projectPath) {
    console.log('🔍 开始扫描项目...');

    try {
      // 1. 识别项目类型
      const projectType = await this.detectProjectType(projectPath);

      // 2. 扫描文件
      const allFiles = await this.scanFiles(projectPath);

      // 3. 识别模块
      const modules = await this.identifyModules(allFiles, projectPath);

      // 4. 过滤文件
      const filteredFiles = this.filterFiles(allFiles);

      const result = {
        projectType,
        modules,
        statistics: {
          totalFiles: allFiles.length,
          scannedFiles: filteredFiles.length,
          modulesFound: modules.length,
          coverage: allFiles.length > 0 ? (filteredFiles.length / allFiles.length * 100) : 0
        },
        recommendations: this.generateRecommendations(modules, projectType)
      };

      console.log(`✅ 扫描完成！`);
      console.log(`📁 模块数量: ${result.statistics.modulesFound}`);
      console.log(`📄 总文件数: ${result.statistics.totalFiles}`);
      console.log(`📊 扫描覆盖率: ${result.statistics.coverage.toFixed(1)}%`);

      return result;

    } catch (error) {
      console.error('❌ 扫描失败:', error.message);
      throw error;
    }
  }

  async detectProjectType(projectPath) {
    // 检查常见项目配置文件
    const indicators = {
      javascript: ['package.json', 'tsconfig.json', 'webpack.config.js'],
      python: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile'],
      go: ['go.mod', 'go.sum', 'main.go'],
      rust: ['Cargo.toml', 'Cargo.lock'],
      java: ['pom.xml', 'build.gradle', 'src/main/java'],
      csharp: ['*.csproj', '*.sln', 'Program.cs'],
      php: ['composer.json', 'index.php']
    };

    for (const [type, files] of Object.entries(indicators)) {
      for (const file of files) {
        try {
          await fs.access(join(projectPath, file));
          return type;
        } catch {
          // 文件不存在，继续检查
        }
      }
    }

    return 'unknown';
  }

  async scanFiles(rootPath, maxDepth = 5) {
    const allFiles = [];

    async function traverseDirectory(currentPath, depth) {
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

  async identifyModules(files, rootPath) {
    const modules = [];
    const modulePaths = new Set();

    // 查找模块指示文件
    for (const file of files) {
      const fileName = file.split(sep).pop();
      if (this.moduleIndicators.includes(fileName || '')) {
        const modulePath = file.substring(0, file.lastIndexOf(sep));
        modulePaths.add(modulePath);
      }
    }

    // 为每个模块识别类型
    for (const modulePath of modulePaths) {
      const moduleType = await this.detectProjectType(modulePath);
      const moduleName = modulePath.split(sep).pop() || 'unknown';

      modules.push({
        name: moduleName,
        path: relative(rootPath, modulePath),
        type: moduleType
      });
    }

    return modules;
  }

  filterFiles(files) {
    const ignoredPatterns = [
      'node_modules',
      '.git',
      '.idea',
      '.vscode',
      'dist',
      'build',
      'coverage',
      '__pycache__',
      'target',
      '.DS_Store',
      'Thumbs.db',
      '*.log',
      '*.tmp',
      '*.cache'
    ];

    return files.filter(file => {
      const fileName = file.split(sep).pop() || '';
      return !ignoredPatterns.some(pattern => {
        if (pattern.includes('*')) {
          return fileName.includes(pattern.replace('*', ''));
        }
        return file.includes(pattern);
      });
    });
  }

  generateRecommendations(modules, projectType) {
    const recommendations = [];

    if (modules.length === 0) {
      recommendations.push({
        type: 'scan_deeper',
        priority: 'high',
        title: '未找到项目模块',
        description: '建议检查项目结构或手动配置模块识别规则'
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

  async generateDocumentation(projectPath, scanResult) {
    console.log('📝 开始生成文档...');

    const timestamp = new Date().toLocaleString('zh-CN');

    let content = `# 项目AI上下文文档

> 🤖 Generated with Claude Code
> 生成时间: ${timestamp}

## 项目概览

这是一个 **${scanResult.statistics.modulesFound > 0 ? '多模块' : '单模块'}** 项目，包含 **${scanResult.statistics.modulesFound}** 个模块。

## 项目结构

### 项目类型
${scanResult.projectType}

### 模块列表

| 模块名称 | 类型 | 路径 |
|---------|------|------|
`;

    for (const module of scanResult.modules) {
      content += `\n| ${module.name} | ${module.type} | \`${module.path}\` |`;
    }

    content += `

## 扫描统计

- **总文件数**: ${scanResult.statistics.totalFiles}
- **已扫描文件**: ${scanResult.statistics.scannedFiles}
- **扫描覆盖率**: ${scanResult.statistics.coverage.toFixed(1)}%

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

此文档由 ZCF 项目初始化工具自动生成，为 AI 辅助开发提供项目上下文信息。

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

---

*此文档由 ZCF 项目初始化工具自动生成*
`;

    // 写入根级文档
    await fs.writeFile(join(projectPath, 'CLAUDE.md'), content, 'utf-8');

    // 为每个模块生成文档
    for (const module of scanResult.modules) {
      const moduleDocContent = `# ${module.name} 模块

> 🤖 Generated with Claude Code

## 模块信息

- **名称**: ${module.name}
- **类型**: ${module.type}
- **路径**: \`${module.path}\`

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

      const moduleDocPath = join(projectPath, module.path, 'CLAUDE.md');

      // 确保目录存在
      await fs.mkdir(join(projectPath, module.path), { recursive: true });

      await fs.writeFile(moduleDocPath, moduleDocContent, 'utf-8');
    }

    console.log('✅ 文档生成完成！');
    return {
      documentsGenerated: scanResult.modules.length + 1,
      totalSize: content.length
    };
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const projectPath = args[0] || '.';

  try {
    const initProject = new SimpleZcfInitProject();

    // 扫描项目
    const scanResult = await initProject.scanProject(projectPath);

    // 生成文档
    const docsResult = await initProject.generateDocumentation(projectPath, scanResult);

    console.log(`📊 生成 ${docsResult.documentsGenerated} 个文档`);

  } catch (error) {
    console.error('❌ 初始化失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default SimpleZcfInitProject;