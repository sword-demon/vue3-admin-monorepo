/**
 * 项目检测器管理器
 */

import { join, dirname } from 'path';
import { promises as fs } from 'fs';
import {
  ProjectType,
  ModuleDetector,
  ModuleInfo,
  ScanError
} from '../types/index.js';
import { JavaScriptProjectDetector } from './javascript-detector.js';
import { PythonProjectDetector } from './python-detector.js';
import { GoProjectDetector } from './go-detector.js';

export class DetectorManager {
  private detectors: Map<ProjectType, ModuleDetector> = new Map();

  constructor() {
    this.initializeDetectors();
  }

  /**
   * 初始化所有检测器
   */
  private initializeDetectors(): void {
    // 注册JavaScript/TypeScript检测器
    const jsDetector = new JavaScriptProjectDetector();
    this.detectors.set(ProjectType.JAVASCRIPT, jsDetector);
    this.detectors.set(ProjectType.TYPESCRIPT, jsDetector);

    // 注册Python检测器
    const pyDetector = new PythonProjectDetector();
    this.detectors.set(ProjectType.PYTHON, pyDetector);

    // 注册Go检测器
    const goDetector = new GoProjectDetector();
    this.detectors.set(ProjectType.GO, goDetector);

    // 未来可以添加更多检测器：
    // const rustDetector = new RustProjectDetector();
    // this.detectors.set(ProjectType.RUST, rustDetector);
  }

  /**
   * 检测路径的项目类型
   */
  async detectProjectType(path: string): Promise<ProjectType> {
    const detectionResults: Array<{ type: ProjectType; confidence: number }> = [];

    // 对每个检测器进行检测
    for (const [type, detector] of this.detectors) {
      try {
        const isMatch = await detector.detect(path);
        if (isMatch) {
          // 简单的置信度评分（可以根据需要改进）
          const confidence = this.calculateConfidence(path, type, detector);
          detectionResults.push({ type, confidence });
        }
      } catch (error) {
        // 忽略单个检测器的错误，继续尝试其他检测器
        console.warn(`检测器 ${detector.name} 在路径 ${path} 检测失败:`, error);
      }
    }

    if (detectionResults.length === 0) {
      return ProjectType.UNKNOWN;
    }

    // 按置信度排序，返回置信度最高的类型
    detectionResults.sort((a, b) => b.confidence - a.confidence);
    return detectionResults[0].type;
  }

  /**
   * 分析指定路径的模块信息
   */
  async analyzeModule(path: string, projectType?: ProjectType): Promise<ModuleInfo> {
    // 如果没有指定项目类型，先进行检测
    const type = projectType || await this.detectProjectType(path);

    if (type === ProjectType.UNKNOWN) {
      throw new ScanError(
        `无法识别项目类型: ${path}`,
        'UNKNOWN_PROJECT_TYPE',
        path
      );
    }

    const detector = this.detectors.get(type);
    if (!detector) {
      throw new ScanError(
        `找不到项目类型 ${type} 的检测器`,
        'DETECTOR_NOT_FOUND',
        path
      );
    }

    try {
      return await detector.analyze(path);
    } catch (error) {
      throw new ScanError(
        `模块分析失败: ${(error as Error).message}`,
        'MODULE_ANALYSIS_FAILED',
        path
      );
    }
  }

  /**
   * 批量检测多个路径的项目类型
   */
  async detectProjectTypes(paths: string[]): Promise<Map<string, ProjectType>> {
    const results = new Map<string, ProjectType>();

    for (const path of paths) {
      try {
        const type = await this.detectProjectType(path);
        results.set(path, type);
      } catch (error) {
        console.warn(`检测路径 ${path} 失败:`, error);
        results.set(path, ProjectType.UNKNOWN);
      }
    }

    return results;
  }

  /**
   * 批量分析多个模块
   */
  async analyzeModules(
    paths: string[],
    projectTypes?: Map<string, ProjectType>
  ): Promise<Map<string, ModuleInfo>> {
    const results = new Map<string, ModuleInfo>();

    for (const path of paths) {
      try {
        const projectType = projectTypes?.get(path);
        const moduleInfo = await this.analyzeModule(path, projectType);
        results.set(path, moduleInfo);
      } catch (error) {
        console.warn(`分析模块 ${path} 失败:`, error);
      }
    }

    return results;
  }

  /**
   * 获取所有支持的检测器
   */
  getSupportedDetectors(): Array<{ type: ProjectType; name: string; patterns: string[] }> {
    const result: Array<{ type: ProjectType; name: string; patterns: string[] }> = [];

    for (const [type, detector] of this.detectors) {
      result.push({
        type,
        name: detector.name,
        patterns: detector.patterns
      });
    }

    return result;
  }

  /**
   * 检查路径是否为模块根目录
   */
  async isModuleRoot(path: string): Promise<boolean> {
    const projectType = await this.detectProjectType(path);
    return projectType !== ProjectType.UNKNOWN;
  }

  /**
   * 查找指定路径下的所有模块
   */
  async findModules(rootPath: string, maxDepth: number = 3): Promise<string[]> {
    const modules: string[] = [];

    async function scanDirectory(currentPath: string, depth: number): Promise<void> {
      if (depth > maxDepth) return;

      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            const fullPath = join(currentPath, entry.name);

            // 检查是否为模块根目录
            if (await this.isModuleRoot(fullPath)) {
              modules.push(fullPath);
            } else {
              // 递归扫描子目录
              await scanDirectory(fullPath, depth + 1);
            }
          }
        }
      } catch (error) {
        // 忽略无法访问的目录
        console.warn(`扫描目录 ${currentPath} 失败:`, error);
      }
    }

    await scanDirectory(rootPath, 0);
    return modules;
  }

  /**
   * 计算检测置信度
   */
  private calculateConfidence(path: string, type: ProjectType, detector: ModuleDetector): number {
    let confidence = 50; // 基础置信度

    // 根据匹配的模式数量调整置信度
    const patternMatches = detector.patterns.filter(pattern =>
      this.checkPatternMatch(path, pattern)
    ).length;

    confidence += patternMatches * 10;

    // 根据项目类型给出额外置信度
    switch (type) {
      case ProjectType.TYPESCRIPT:
        // TypeScript项目通常有更多配置文件
        if (detector.patterns.includes('tsconfig.json')) {
          confidence += 20;
        }
        break;
      case ProjectType.PYTHON:
        // Python项目如果有pyproject.toml，置信度更高
        if (detector.patterns.includes('pyproject.toml')) {
          confidence += 15;
        }
        break;
      case ProjectType.GO:
        // Go项目如果有go.mod，置信度更高
        if (detector.patterns.includes('go.mod')) {
          confidence += 25;
        }
        break;
    }

    return Math.min(100, confidence);
  }

  /**
   * 检查模式是否匹配
   */
  private async checkPatternMatch(path: string, pattern: string): Promise<boolean> {
    try {
      const fullPath = join(path, pattern);
      return await this.fileExists(fullPath);
    } catch {
      return false;
    }
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 注册自定义检测器
   */
  registerDetector(type: ProjectType, detector: ModuleDetector): void {
    this.detectors.set(type, detector);
  }

  /**
   * 移除检测器
   */
  unregisterDetector(type: ProjectType): boolean {
    return this.detectors.delete(type);
  }

  /**
   * 获取检测器
   */
  getDetector(type: ProjectType): ModuleDetector | undefined {
    return this.detectors.get(type);
  }
}