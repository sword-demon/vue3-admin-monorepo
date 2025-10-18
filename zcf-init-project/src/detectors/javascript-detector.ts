/**
 * JavaScript/TypeScript 项目检测器
 */

import { join } from 'path';
import { BaseProjectDetector } from './base-detector.js';
import { ProjectType, ModuleInfo } from '../types/index.js';

interface PackageJson {
  name?: string;
  version?: string;
  description?: string;
  author?: string | { name?: string };
  license?: string;
  repository?: string | { url?: string };
  keywords?: string[];
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  main?: string;
  module?: string;
  types?: string;
  typescript?: any;
  workspaces?: string[] | { packages: string[] };
}

export class JavaScriptProjectDetector extends BaseProjectDetector {
  name = 'JavaScript/TypeScript';
  type = ProjectType.JAVASCRIPT;
  patterns = [
    'package.json',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'tsconfig.json',
    'jsconfig.json',
    'tsconfig.base.json'
  ];

  /**
   * 检测是否为JavaScript/TypeScript项目
   */
  async detect(path: string): Promise<boolean> {
    const packageJsonPath = join(path, 'package.json');
    return await this.fileExists(packageJsonPath);
  }

  /**
   * 分析JavaScript/TypeScript项目
   */
  async analyze(path: string): Promise<ModuleInfo> {
    const packageJsonPath = join(path, 'package.json');
    const packageJson = await this.readJsonFile<PackageJson>(packageJsonPath);

    if (!packageJson) {
      throw new Error(`Invalid package.json found at ${packageJsonPath}`);
    }

    // 检测是否为TypeScript项目
    const isTypeScript = await this.detectTypeScript(path);
    const projectType = isTypeScript ? ProjectType.TYPESCRIPT : ProjectType.JAVASCRIPT;

    const moduleName = packageJson.name || this.extractModuleName(path);
    const moduleInfo = this.createBaseModuleInfo(path, moduleName, {
      description: packageJson.description,
      author: typeof packageJson.author === 'string'
        ? packageJson.author
        : packageJson.author?.name || '',
      license: packageJson.license,
      repository: typeof packageJson.repository === 'string'
        ? packageJson.repository
        : packageJson.repository?.url || '',
      keywords: packageJson.keywords || [],
      scripts: packageJson.scripts || {},
      engines: packageJson.engines || {}
    });

    moduleInfo.type = projectType;

    // 解析依赖
    moduleInfo.dependencies = this.parseDependencies(packageJson.dependencies, 'production');
    moduleInfo.devDependencies = [
      ...this.parseDependencies(packageJson.devDependencies, 'development'),
      ...this.parseDependencies(packageJson.peerDependencies, 'peer'),
      ...this.parseDependencies(packageJson.optionalDependencies, 'optional')
    ];

    // 查找入口文件
    moduleInfo.entryPoints = await this.findEntryPoints(path, packageJson, isTypeScript);

    // 查找关键文件
    moduleInfo.keyFiles = await this.findKeyFiles(path, isTypeScript);

    // 查找测试文件
    moduleInfo.testFiles = await this.findTestFiles(path, isTypeScript);

    // 查找配置文件
    moduleInfo.configFiles = await this.findConfigFiles(path, isTypeScript);

    // 查找文档文件
    moduleInfo.docs = await this.findDocFiles(path);

    return moduleInfo;
  }

  /**
   * 检测是否为TypeScript项目
   */
  private async detectTypeScript(path: string): Promise<boolean> {
    const tsConfigFiles = [
      'tsconfig.json',
      'tsconfig.base.json',
      'tsconfig.build.json',
      'tsconfig.eslint.json'
    ];

    for (const configFile of tsConfigFiles) {
      if (await this.fileExists(join(path, configFile))) {
        return true;
      }
    }

    // 检查是否有.ts或.tsx文件
    const hasTsFiles = await this.hasTypeScriptFiles(path);
    return hasTsFiles;
  }

  /**
   * 检查是否有TypeScript文件
   */
  private async hasTypeScriptFiles(path: string): Promise<boolean> {
    const { promises: fs } = await import('fs');

    try {
      const entries = await fs.readdir(path, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          return true;
        }
      }
    } catch {
      // 忽略错误
    }

    return false;
  }

  /**
   * 查找入口文件
   */
  private async findEntryPoints(path: string, packageJson: PackageJson, isTypeScript: boolean): Promise<string[]> {
    const entryPoints: string[] = [];

    // 从package.json中指定的入口文件
    if (packageJson.main) {
      entryPoints.push(join(path, packageJson.main));
    }

    if (packageJson.module) {
      entryPoints.push(join(path, packageJson.module));
    }

    if (packageJson.types && isTypeScript) {
      entryPoints.push(join(path, packageJson.types));
    }

    // 常见的入口文件模式
    const commonEntryPatterns = isTypeScript ? [
      'src/index.ts',
      'src/main.ts',
      'src/app.ts',
      'index.ts',
      'main.ts',
      'app.ts',
      'lib/index.ts',
      'src/index.tsx',
      'src/main.tsx',
      'index.tsx',
      'main.tsx'
    ] : [
      'src/index.js',
      'src/main.js',
      'src/app.js',
      'index.js',
      'main.js',
      'app.js',
      'lib/index.js',
      'src/index.jsx',
      'src/main.jsx',
      'index.jsx',
      'main.jsx'
    ];

    for (const pattern of commonEntryPatterns) {
      const fullPath = join(path, pattern);
      if (await this.fileExists(fullPath) && !entryPoints.includes(fullPath)) {
        entryPoints.push(fullPath);
      }
    }

    return entryPoints;
  }

  /**
   * 查找关键文件
   */
  private async findKeyFiles(path: string, isTypeScript: boolean): Promise<string[]> {
    const keyFilePatterns = [
      'README.md',
      'README',
      'CHANGELOG.md',
      'LICENSE',
      'CONTRIBUTING.md',
      'src/**/*.{js,ts,jsx,tsx}',
      'lib/**/*.{js,ts}',
      'dist/**/*',
      'build/**/*'
    ];

    const keyFiles: string[] = [];

    for (const pattern of keyFilePatterns) {
      if (pattern.includes('**/*')) {
        // 对于通配符模式，这里简化处理，实际实现可能需要更复杂的文件搜索
        continue;
      }

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
  private async findTestFiles(path: string, isTypeScript: boolean): Promise<string[]> {
    const testPatterns = isTypeScript ? [
      'tests/**/*.ts',
      'test/**/*.ts',
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
      '**/*.test.ts',
      '**/*.spec.ts',
      '__tests__/**/*.ts'
    ] : [
      'tests/**/*.js',
      'test/**/*.js',
      'src/**/*.test.js',
      'src/**/*.spec.js',
      '**/*.test.js',
      '**/*.spec.js',
      '__tests__/**/*.js'
    ];

    const testFiles: string[] = [];

    for (const pattern of testPatterns) {
      if (pattern.includes('**/*')) {
        continue; // 简化处理
      }

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
  private async findConfigFiles(path: string, isTypeScript: boolean): Promise<string[]> {
    const configPatterns = [
      'package.json',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      '.eslintrc.js',
      '.eslintrc.json',
      '.eslintrc.yml',
      '.eslintrc.yaml',
      '.prettierrc',
      '.prettierrc.js',
      '.prettierrc.json',
      'tsconfig.json',
      'tsconfig.base.json',
      'tsconfig.build.json',
      'webpack.config.js',
      'webpack.config.ts',
      'rollup.config.js',
      'rollup.config.ts',
      'vite.config.js',
      'vite.config.ts',
      'jest.config.js',
      'jest.config.ts',
      'babel.config.js',
      'babel.config.json',
      '.babelrc',
      '.babelrc.js',
      'nuxt.config.js',
      'nuxt.config.ts',
      'next.config.js',
      'angular.json',
      'vue.config.js',
      'svelte.config.js',
      'solid.config.js'
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
      'CHANGELOG',
      'LICENSE',
      'LICENSE.md',
      'CONTRIBUTING.md',
      'CONTRIBUTING',
      'docs/**/*',
      'doc/**/*',
      'documentation/**/*',
      'guides/**/*',
      'api/**/*',
      'examples/**/*'
    ];

    const docFiles: string[] = [];

    for (const pattern of docPatterns) {
      if (pattern.includes('**/*')) {
        continue; // 简化处理
      }

      const fullPath = join(path, pattern);
      if (await this.fileExists(fullPath)) {
        docFiles.push(fullPath);
      }
    }

    return docFiles;
  }
}