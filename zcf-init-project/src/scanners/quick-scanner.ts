/**
 * 阶段A：全仓清点扫描器 - 快速识别项目结构和模块
 */

import { promises as fs } from 'fs';
import { join, relative, sep } from 'path';
import { BaseScanner } from '../core/scanner.js';
import { DetectorManager } from '../detectors/detector-manager.js';
import { FileFilterSystem } from '../filters/file-filter.js';
import { ScanConfigManager } from '../config/scan-config.js';
import {
  ScanPhase,
  ScanPhaseRecord,
  FileInfo,
  ScanOptions,
  ProjectType,
  ModuleInfo,
  ScanError
} from '../types/index.js';

export class QuickScanner extends BaseScanner {
  private detectorManager: DetectorManager;
  private fileFilter: FileFilterSystem;

  constructor(config?: any) {
    const scanConfig = config || ScanConfigManager.createDefault();
    super(scanConfig);
    this.detectorManager = new DetectorManager();
    this.fileFilter = new FileFilterSystem(scanConfig);
  }

  /**
   * 阶段A：全仓清点扫描 - 快速识别项目结构
   */
  protected async performQuickScan(path: string, record: ScanPhaseRecord): Promise<void> {
    const startTime = Date.now();
    this.reportProgress(0, 100, '开始快速扫描...');

    try {
      // 1. 加载.gitignore规则
      await this.fileFilter.loadGitignore(path);

      // 2. 快速遍历目录结构
      const allFiles = await this.quickTraverseDirectory(path, record);
      this.reportProgress(30, 100, '已发现文件，开始过滤...');

      // 3. 过滤文件
      const filteredFiles = await this.fileFilter.filterFiles(allFiles, path);
      this.reportProgress(50, 100, '文件过滤完成，开始检测模块...');

      // 4. 识别项目类型
      this.scanResult.projectType = await this.detectorManager.detectProjectType(path);

      // 5. 快速识别模块
      const modulePaths = await this.quickIdentifyModules(filteredFiles, path);
      this.reportProgress(70, 100, '模块识别完成，开始分析...');

      // 6. 快速分析模块
      const moduleInfos = await this.quickAnalyzeModules(modulePaths, path);
      this.scanResult.modules = moduleInfos;

      // 7. 更新统计信息
      this.updateStatistics(allFiles, filteredFiles, moduleInfos);
      this.reportProgress(90, 100, '更新统计信息...');

      // 8. 生成初步推荐
      this.generateQuickRecommendations();

      this.reportProgress(100, 100, '快速扫描完成');

    } catch (error) {
      throw new ScanError(
        `快速扫描失败: ${(error as Error).message}`,
        'QUICK_SCAN_FAILED',
        path,
        ScanPhase.QUICK
      );
    }

    record.filesProcessed = this.scanResult.scanStatistics.totalFiles;
  }

  /**
   * 快速遍历目录
   */
  private async quickTraverseDirectory(rootPath: string, record: ScanPhaseRecord): Promise<string[]> {
    const allFiles: string[] = [];
    const maxDepth = this.config.performanceLimits?.maxDepth || 10;
    let filesProcessed = 0;

    async function traverseDirectory(currentPath: string, depth: number): Promise<void> {
      if (depth > maxDepth) return;
      if (this.shouldStopScan()) return;

      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          if (this.shouldStopScan()) return;

          // 跳过隐藏目录（除了项目根目录）
          if (entry.name.startsWith('.') && currentPath !== rootPath) {
            continue;
          }

          const fullPath = join(currentPath, entry.name);

          if (entry.isDirectory()) {
            // 递归扫描子目录
            await traverseDirectory(fullPath, depth + 1);
          } else {
            allFiles.push(fullPath);
            filesProcessed++;

            // 定期更新进度
            if (filesProcessed % 100 === 0) {
              record.filesProcessed = filesProcessed;
              this.reportProgress(
                Math.min(filesProcessed / 1000 * 30, 30), // 最多30%进度
                100,
                `已扫描 ${filesProcessed} 个文件...`
              );
            }
          }
        }
      } catch (error) {
        // 忽略无法访问的目录
        console.warn(`无法访问目录 ${currentPath}:`, error);
      }
    }

    await traverseDirectory.call(this, rootPath, 0);
    return allFiles;
  }

  /**
   * 快速识别模块
   */
  private async quickIdentifyModules(files: string[], rootPath: string): Promise<string[]> {
    const modulePaths = new Set<string>();
    const moduleIndicators = [
      'package.json',
      'go.mod',
      'pyproject.toml',
      'setup.py',
      'Cargo.toml',
      'pom.xml',
      'build.gradle',
      'csproj',
      'sln'
    ];

    // 根据文件路径快速识别可能的模块根目录
    for (const filePath of files) {
      const relativePath = relative(rootPath, filePath);
      const pathParts = relativePath.split(sep);

      // 检查是否是模块指示文件
      const fileName = pathParts[pathParts.length - 1];
      if (moduleIndicators.includes(fileName)) {
        const moduleRoot = join(rootPath, ...pathParts.slice(0, -1));
        modulePaths.add(moduleRoot);
      }
    }

    // 检查常见的模块目录结构
    const commonModuleDirs = [
      'packages',
      'libs',
      'modules',
      'apps',
      'services',
      'components'
    ];

    for (const moduleDir of commonModuleDirs) {
      const moduleDirPath = join(rootPath, moduleDir);
      try {
        await fs.access(moduleDirPath);
        const subDirs = await this.findSubdirectories(moduleDirPath);
        subDirs.forEach(subDir => {
          // 检查子目录是否可能是模块
          if (await this.detectorManager.isModuleRoot(subDir)) {
            modulePaths.add(subDir);
          }
        });
      } catch {
        // 目录不存在，忽略
      }
    }

    return Array.from(modulePaths);
  }

  /**
   * 查找子目录
   */
  private async findSubdirectories(dirPath: string): Promise<string[]> {
    const subdirs: string[] = [];
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          subdirs.push(join(dirPath, entry.name));
        }
      }
    } catch {
      // 忽略错误
    }
    return subdirs;
  }

  /**
   * 快速分析模块
   */
  private async quickAnalyzeModules(modulePaths: string[], rootPath: string): Promise<ModuleInfo[]> {
    const moduleInfos: ModuleInfo[] = [];

    for (const modulePath of modulePaths) {
      try {
        if (this.shouldStopScan()) break;

        // 快速检测项目类型
        const projectType = await this.detectorManager.detectProjectType(modulePath);
        if (projectType === ProjectType.UNKNOWN) {
          continue;
        }

        // 快速分析模块（仅获取基本信息）
        const moduleInfo = await this.quickAnalyzeModule(modulePath, projectType);
        moduleInfos.push(moduleInfo);

      } catch (error) {
        console.warn(`快速分析模块 ${modulePath} 失败:`, error);
      }
    }

    return moduleInfos;
  }

  /**
   * 快速分析单个模块
   */
  private async quickAnalyzeModule(modulePath: string, projectType: ProjectType): Promise<ModuleInfo> {
    const moduleName = this.extractModuleName(modulePath);
    const detector = this.detectorManager.getDetector(projectType);

    if (!detector) {
      throw new ScanError(
        `找不到 ${projectType} 类型的检测器`,
        'DETECTOR_NOT_FOUND',
        modulePath
      );
    }

    // 只进行检测，不进行完整分析
    const isMatch = await detector.detect(modulePath);
    if (!isMatch) {
      throw new ScanError(
        `模块类型检测失败`,
        'MODULE_TYPE_MISMATCH',
        modulePath
      );
    }

    // 创建基础模块信息
    return {
      path: modulePath,
      name: moduleName,
      type: projectType,
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
        engines: {}
      }
    };
  }

  /**
   * 提取模块名称
   */
  private extractModuleName(modulePath: string): string {
    const pathParts = modulePath.split(sep);
    return pathParts[pathParts.length - 1] || 'unknown';
  }

  /**
   * 更新统计信息
   */
  private updateStatistics(allFiles: string[], filteredFiles: string[], modules: ModuleInfo[]): void {
    const stats = this.scanResult.scanStatistics;

    stats.totalFiles = allFiles.length;
    stats.scannedFiles = filteredFiles.length;
    stats.ignoredFiles = allFiles.length - filteredFiles.length;
    stats.modulesFound = modules.length;

    // 计算覆盖率
    if (stats.totalFiles > 0) {
      stats.coverage = (stats.scannedFiles / stats.totalFiles) * 100;
    }
  }

  /**
   * 生成初步推荐
   */
  private generateQuickRecommendations(): void {
    const recommendations = [];
    const stats = this.scanResult.scanStatistics;

    // 如果没有找到模块
    if (stats.modulesFound === 0) {
      recommendations.push({
        type: 'scan_deeper' as any,
        priority: 'high' as any,
        title: '未找到模块，建议进行深度扫描',
        description: '快速扫描未发现项目模块，建议启用模块和深度扫描以获得更准确的分析',
        action: '使用 --phases quick,module,deep 参数进行完整扫描'
      });
    }

    // 如果覆盖率很低
    if (stats.coverage < 30) {
      recommendations.push({
        type: 'scan_deeper' as any,
        priority: 'medium' as any,
        title: '扫描覆盖率较低',
        description: `当前扫描覆盖率仅为 ${stats.coverage.toFixed(1)}%，建议检查文件过滤配置或进行深度扫描`,
        action: '调整过滤器配置或启用深度扫描'
      });
    }

    // 如果项目类型未知
    if (this.scanResult.projectType === ProjectType.UNKNOWN) {
      recommendations.push({
        type: 'add_config' as any,
        priority: 'medium' as any,
        title: '未识别的项目类型',
        description: '无法识别项目类型，建议手动配置或添加自定义检测器',
        action: '手动指定项目类型或创建自定义检测器'
      });
    }

    // 如果找到模块，建议深度分析
    if (stats.modulesFound > 0) {
      recommendations.push({
        type: 'scan_deeper' as any,
        priority: 'low' as any,
        title: '建议进行模块深度分析',
        description: `发现 ${stats.modulesFound} 个模块，建议进行模块扫描以获得更详细的依赖和结构信息`,
        action: '使用 --phases module 参数进行模块扫描'
      });
    }

    this.scanResult.recommendations = recommendations;
  }

  /**
   * 阶段B：模块优先扫描 - 由具体实现类提供
   */
  protected async performModuleScan(path: string, record: ScanPhaseRecord): Promise<void> {
    // 在快速扫描器中，这个方法不会被调用
    throw new ScanError(
      'QuickScanner 不支持模块扫描阶段',
      'UNSUPPORTED_PHASE',
      path,
      ScanPhase.MODULE
    );
  }

  /**
   * 阶段C：深度补捞扫描 - 由具体实现类提供
   */
  protected async performDeepScan(path: string, record: ScanPhaseRecord): Promise<void> {
    // 在快速扫描器中，这个方法不会被调用
    throw new ScanError(
      'QuickScanner 不支持深度扫描阶段',
      'UNSUPPORTED_PHASE',
      path,
      ScanPhase.DEEP
    );
  }
}