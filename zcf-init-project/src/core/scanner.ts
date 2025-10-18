/**
 * 项目扫描器核心接口和基础实现
 */

import { EventEmitter } from 'events';
import {
  IScanner,
  ScanOptions,
  ScanPhase,
  ProjectScanResult,
  ScanPhaseRecord,
  ScanConfig,
  ScanEvent,
  ProgressInfo,
  ScanError
} from '../types/index.js';

export abstract class BaseScanner extends EventEmitter implements IScanner {
  protected config: ScanConfig;
  protected options: ScanOptions;
  protected scanResult: ProjectScanResult;
  protected currentPhase: ScanPhase | null = null;

  constructor(config: ScanConfig) {
    super();
    this.config = config;
    this.options = {};
    this.scanResult = this.initializeScanResult();
  }

  /**
   * 主扫描方法 - 协调三个扫描阶段
   */
  async scan(path: string, options: ScanOptions = {}): Promise<ProjectScanResult> {
    this.options = { ...this.options, ...options };
    this.scanResult.rootPath = path;

    this.emitEvent('start', { path, options });

    const phases = options.phases || [ScanPhase.QUICK, ScanPhase.MODULE, ScanPhase.DEEP];
    const phaseRecords: ScanPhaseRecord[] = [];

    for (const phase of phases) {
      try {
        this.currentPhase = phase;
        const phaseRecord = await this.scanPhase(phase, path, options);
        phaseRecords.push(phaseRecord);
        this.scanResult.scanPhases.push(phaseRecord);
      } catch (error) {
        this.handleError(error as Error, phase);
        break;
      }
    }

    this.finalizeScan();
    this.emitEvent('complete', { result: this.scanResult });

    return this.scanResult;
  }

  /**
   * 单阶段扫描 - 子类实现具体逻辑
   */
  async scanPhase(phase: ScanPhase, path: string, options: ScanOptions = {}): Promise<ScanPhaseRecord> {
    const startTime = new Date();
    this.currentPhase = phase;

    this.emitEvent('phase_start', { phase, path });

    const record: ScanPhaseRecord = {
      phase,
      startTime,
      endTime: new Date(),
      duration: 0,
      filesProcessed: 0,
      status: 'running'
    };

    try {
      switch (phase) {
        case ScanPhase.QUICK:
          await this.performQuickScan(path, record);
          break;
        case ScanPhase.MODULE:
          await this.performModuleScan(path, record);
          break;
        case ScanPhase.DEEP:
          await this.performDeepScan(path, record);
          break;
        default:
          throw new ScanError(`Unknown scan phase: ${phase}`, 'UNKNOWN_PHASE', path, phase);
      }

      record.status = 'completed';
      record.endTime = new Date();
      record.duration = record.endTime.getTime() - startTime.getTime();

      this.emitEvent('phase_complete', { phase, record });

      return record;
    } catch (error) {
      record.status = 'failed';
      record.error = (error as Error).message;
      record.endTime = new Date();
      record.duration = record.endTime.getTime() - startTime.getTime();

      this.emitEvent('error', { phase, error, record });
      throw error;
    }
  }

  /**
   * 阶段A：全仓清点扫描 - 快速识别项目结构
   */
  protected abstract performQuickScan(path: string, record: ScanPhaseRecord): Promise<void>;

  /**
   * 阶段B：模块优先扫描 - 深度分析模块
   */
  protected abstract performModuleScan(path: string, record: ScanPhaseRecord): Promise<void>;

  /**
   * 阶段C：深度补捞扫描 - 按需深度分析
   */
  protected abstract performDeepScan(path: string, record: ScanPhaseRecord): Promise<void>;

  /**
   * 初始化扫描结果
   */
  protected initializeScanResult(): ProjectScanResult {
    return {
      rootPath: '',
      projectType: 'unknown' as any,
      modules: [],
      globalFiles: [],
      ignoredFiles: [],
      scanStatistics: {
        totalFiles: 0,
        scannedFiles: 0,
        ignoredFiles: 0,
        modulesFound: 0,
        scanDuration: 0,
        fileSize: 0,
        linesOfCode: 0,
        coverage: 0
      },
      scanPhases: [],
      recommendations: []
    };
  }

  /**
   * 最终化扫描结果
   */
  protected finalizeScan(): void {
    // 计算总扫描时间
    const totalTime = this.scanResult.scanPhases.reduce((sum, phase) => sum + phase.duration, 0);
    this.scanResult.scanStatistics.scanDuration = totalTime;

    // 计算覆盖率
    if (this.scanResult.scanStatistics.totalFiles > 0) {
      this.scanResult.scanStatistics.coverage =
        (this.scanResult.scanStatistics.scannedFiles / this.scanResult.scanStatistics.totalFiles) * 100;
    }

    // 生成推荐建议
    this.generateRecommendations();
  }

  /**
   * 生成推荐建议
   */
  protected generateRecommendations(): void {
    // 基于扫描结果生成智能推荐
    const recommendations = [];

    // 如果覆盖率过低，建议深度扫描
    if (this.scanResult.scanStatistics.coverage < 50) {
      recommendations.push({
        type: 'scan_deeper' as any,
        priority: 'medium' as any,
        title: '建议进行深度扫描',
        description: '当前扫描覆盖率较低，建议启用深度扫描以获得更完整的项目分析',
        action: '运行包含深度扫描的完整扫描'
      });
    }

    // 如果发现模块但没有文档，建议添加文档
    const modulesWithoutDocs = this.scanResult.modules.filter(m => m.docs.length === 0);
    if (modulesWithoutDocs.length > 0) {
      recommendations.push({
        type: 'add_docs' as any,
        priority: 'high' as any,
        title: '建议为模块添加文档',
        description: `发现 ${modulesWithoutDocs.length} 个模块缺少文档，建议添加 README 或 API 文档`,
        targetPath: modulesWithoutDocs.map(m => m.path).join(', ')
      });
    }

    this.scanResult.recommendations = recommendations;
  }

  /**
   * 处理错误
   */
  protected handleError(error: Error, phase?: ScanPhase): void {
    this.emitEvent('error', { error, phase });

    if (error instanceof ScanError) {
      throw error;
    } else {
      throw new ScanError(
        `Scan failed: ${error.message}`,
        'SCAN_ERROR',
        this.scanResult.rootPath,
        phase
      );
    }
  }

  /**
   * 发送事件
   */
  protected emitEvent(type: string, data: any): void {
    const event: ScanEvent = {
      type: type as any,
      timestamp: new Date(),
      data
    };
    this.emit(type, event);
  }

  /**
   * 发送进度更新
   */
  protected reportProgress(current: number, total: number, message: string): void {
    if (this.currentPhase) {
      const progress: ProgressInfo = {
        phase: this.currentPhase,
        current,
        total,
        message,
        percentage: Math.round((current / total) * 100)
      };

      this.emitEvent('progress', progress);
    }
  }

  /**
   * 检查是否应该停止扫描
   */
  protected shouldStopScan(): boolean {
    // 检查性能限制
    if (this.config.performanceLimits) {
      const limits = this.config.performanceLimits;

      if (this.scanResult.scanStatistics.totalFiles >= limits.maxFiles) {
        throw new ScanError(
          `Maximum file limit reached: ${limits.maxFiles}`,
          'FILE_LIMIT_EXCEEDED',
          this.scanResult.rootPath,
          this.currentPhase || undefined
        );
      }

      if (this.scanResult.scanStatistics.fileSize >= limits.memoryLimit) {
        throw new ScanError(
          `Memory limit reached: ${limits.memoryLimit} bytes`,
          'MEMORY_LIMIT_EXCEEDED',
          this.scanResult.rootPath,
          this.currentPhase || undefined
        );
      }
    }

    return false;
  }

  /**
   * 获取当前扫描统计
   */
  public getStatistics() {
    return { ...this.scanResult.scanStatistics };
  }

  /**
   * 获取当前进度
   */
  public getCurrentProgress(): ProgressInfo | null {
    const currentPhaseRecord = this.scanResult.scanPhases[this.scanResult.scanPhases.length - 1];
    if (!currentPhaseRecord) return null;

    return {
      phase: currentPhaseRecord.phase,
      current: currentPhaseRecord.filesProcessed,
      total: this.scanResult.scanStatistics.totalFiles,
      message: `正在执行 ${currentPhaseRecord.phase} 阶段扫描`,
      percentage: Math.round((currentPhaseRecord.filesProcessed / Math.max(1, this.scanResult.scanStatistics.totalFiles)) * 100)
    };
  }
}