/**
 * 项目类型检测器基础类
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import {
  ProjectType,
  ModuleDetector,
  ModuleInfo,
  Dependency,
  ModuleMetadata
} from '../types/index.js';

export abstract class BaseProjectDetector implements ModuleDetector {
  abstract name: string;
  abstract type: ProjectType;
  abstract patterns: string[];

  /**
   * 检测指定路径是否为当前类型的项目
   */
  abstract detect(path: string): Promise<boolean>;

  /**
   * 分析指定路径的项目信息
   */
  abstract analyze(path: string): Promise<ModuleInfo>;

  /**
   * 检查文件是否存在
   */
  protected async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 读取并解析JSON文件
   */
  protected async readJsonFile<T = any>(filePath: string): Promise<T | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  /**
   * 读取文件内容
   */
  protected async readFile(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * 创建基本的模块信息
   */
  protected createBaseModuleInfo(
    path: string,
    name: string,
    metadata: Partial<ModuleMetadata> = {}
  ): ModuleInfo {
    return {
      path,
      name,
      type: this.type,
      entryPoints: [],
      dependencies: [],
      devDependencies: [],
      keyFiles: [],
      testFiles: [],
      configFiles: [],
      docs: [],
      metadata: {
        description: '',
        author: '',
        license: '',
        repository: '',
        keywords: [],
        scripts: {},
        engines: {},
        ...metadata
      }
    };
  }

  /**
   * 从依赖对象创建依赖数组
   */
  protected parseDependencies(
    deps: Record<string, string> = {},
    type: 'production' | 'development' | 'peer' | 'optional' = 'production'
  ): Dependency[] {
    return Object.entries(deps).map(([name, version]) => ({
      name,
      version,
      type
    }));
  }

  /**
   * 查找可能的入口文件
   */
  protected async findEntryFiles(path: string, patterns: string[]): Promise<string[]> {
    const entryFiles: string[] = [];

    for (const pattern of patterns) {
      const fullPath = join(path, pattern);
      if (await this.fileExists(fullPath)) {
        entryFiles.push(fullPath);
      }
    }

    return entryFiles;
  }

  /**
   * 查找测试文件
   */
  protected async findTestFiles(path: string, patterns: string[]): Promise<string[]> {
    const testFiles: string[] = [];

    for (const pattern of patterns) {
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
  protected async findConfigFiles(path: string, patterns: string[]): Promise<string[]> {
    const configFiles: string[] = [];

    for (const pattern of patterns) {
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
  protected async findDocFiles(path: string, patterns: string[]): Promise<string[]> {
    const docFiles: string[] = [];

    for (const pattern of patterns) {
      const fullPath = join(path, pattern);
      if (await this.fileExists(fullPath)) {
        docFiles.push(fullPath);
      }
    }

    return docFiles;
  }

  /**
   * 从文件路径提取模块名称
   */
  protected extractModuleName(path: string): string {
    const pathParts = path.split(/[/\\]/);
    return pathParts[pathParts.length - 1] || 'unknown';
  }
}