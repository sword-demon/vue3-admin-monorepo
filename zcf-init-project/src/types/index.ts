/**
 * 项目AI上下文初始化系统的核心类型定义
 */

// 项目类型枚举
export enum ProjectType {
  JAVASCRIPT = 'javascript',
  TYPESCRIPT = 'typescript',
  PYTHON = 'python',
  GO = 'go',
  RUST = 'rust',
  JAVA = 'java',
  CSHARP = 'csharp',
  PHP = 'php',
  RUBY = 'ruby',
  UNKNOWN = 'unknown'
}

// 扫描阶段枚举
export enum ScanPhase {
  QUICK = 'quick',        // 阶段A：全仓清点
  MODULE = 'module',      // 阶段B：模块优先
  DEEP = 'deep'          // 阶段C：深度补捞
}

// 文件类型
export interface FileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  isDirectory: boolean;
  lastModified: Date;
  relativePath: string;
}

// 模块信息
export interface ModuleInfo {
  path: string;
  name: string;
  type: ProjectType;
  entryPoints: string[];
  dependencies: Dependency[];
  devDependencies: Dependency[];
  keyFiles: string[];
  testFiles: string[];
  configFiles: string[];
  docs: string[];
  metadata: ModuleMetadata;
}

// 依赖信息
export interface Dependency {
  name: string;
  version: string;
  type: 'production' | 'development' | 'peer' | 'optional';
  resolved?: string;
}

// 模块元数据
export interface ModuleMetadata {
  description?: string;
  author?: string;
  license?: string;
  repository?: string;
  keywords: string[];
  scripts: Record<string, string>;
  engines: Record<string, string>;
}

// 项目扫描结果
export interface ProjectScanResult {
  rootPath: string;
  projectType: ProjectType;
  modules: ModuleInfo[];
  globalFiles: FileInfo[];
  ignoredFiles: FileInfo[];
  scanStatistics: ScanStatistics;
  scanPhases: ScanPhaseRecord[];
  recommendations: Recommendation[];
}

// 扫描统计信息
export interface ScanStatistics {
  totalFiles: number;
  scannedFiles: number;
  ignoredFiles: number;
  modulesFound: number;
  scanDuration: number; // 毫秒
  fileSize: number; // 字节
  linesOfCode: number;
  coverage: number; // 0-100
}

// 扫描阶段记录
export interface ScanPhaseRecord {
  phase: ScanPhase;
  startTime: Date;
  endTime: Date;
  duration: number;
  filesProcessed: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  error?: string;
}

// 推荐建议
export interface Recommendation {
  type: 'scan_deeper' | 'add_config' | 'fix_structure' | 'add_docs' | 'optimize';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  targetPath?: string;
  action?: string;
}

// 文档生成配置
export interface DocumentationConfig {
  includeMermaid: boolean;
  includeBreadcrumbs: boolean;
  includeStatistics: boolean;
  includeRecommendations: boolean;
  templatePath?: string;
  customTemplates?: Record<string, string>;
  outputPath?: string;
}

// 文档生成结果
export interface DocumentationResult {
  rootDocument: {
    path: string;
    content: string;
    size: number;
  };
  moduleDocuments: Array<{
    modulePath: string;
    documentPath: string;
    content: string;
    size: number;
  }>;
  mermaidDiagrams: Array<{
    name: string;
    content: string;
    type: 'graph' | 'flowchart' | 'class' | 'sequence';
  }>;
  statistics: {
    documentsGenerated: number;
    totalSize: number;
    generationTime: number;
  };
}

// 扫描器接口
export interface IScanner {
  scan(path: string, options?: ScanOptions): Promise<ProjectScanResult>;
  scanPhase(phase: ScanPhase, path: string, options?: ScanOptions): Promise<ScanPhaseRecord>;
}

// 扫描选项
export interface ScanOptions {
  phases?: ScanPhase[];
  includePatterns?: string[];
  excludePatterns?: string[];
  maxDepth?: number;
  maxFileSize?: number;
  followSymlinks?: boolean;
  enableCache?: boolean;
  verbose?: boolean;
  config?: ScanConfig;
}

// 扫描配置
export interface ScanConfig {
  fileFilters: FileFilter[];
  moduleDetectors: ModuleDetector[];
  ignoreRules: IgnoreRule[];
  performanceLimits: PerformanceLimits;
}

// 文件过滤器
export interface FileFilter {
  name: string;
  pattern: string | RegExp;
  action: 'include' | 'exclude';
  priority: number;
}

// 模块检测器
export interface ModuleDetector {
  name: string;
  type: ProjectType;
  patterns: string[];
  detect: (path: string) => Promise<boolean>;
  analyze: (path: string) => Promise<ModuleInfo>;
}

// 忽略规则
export interface IgnoreRule {
  pattern: string;
  description: string;
  priority: number;
  global?: boolean;
}

// 性能限制
export interface PerformanceLimits {
  maxFiles: number;
  maxFileSize: number;
  maxDepth: number;
  timeout: number; // 毫秒
  memoryLimit: number; // 字节
}

// 错误类型
export class ScanError extends Error {
  constructor(
    message: string,
    public code: string,
    public path?: string,
    public phase?: ScanPhase
  ) {
    super(message);
    this.name = 'ScanError';
  }
}

// 事件类型
export interface ScanEvent {
  type: 'start' | 'phase_start' | 'phase_complete' | 'file_found' | 'module_found' | 'progress' | 'complete' | 'error';
  timestamp: Date;
  data: any;
}

// 进度信息
export interface ProgressInfo {
  phase: ScanPhase;
  current: number;
  total: number;
  message: string;
  percentage: number;
  eta?: number; // 预计剩余时间（秒）
}