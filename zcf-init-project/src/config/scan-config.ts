/**
 * 扫描配置管理
 */

import { join, resolve, dirname } from 'path';
import { promises as fs } from 'fs';
import { ScanConfig, PerformanceLimits, FileFilter, IgnoreRule } from '../types/index.js';
import { FileFilterSystem } from '../filters/file-filter.js';

export interface ScanConfigOptions {
  performanceLimits?: Partial<PerformanceLimits>;
  customFilters?: FileFilter[];
  customIgnoreRules?: IgnoreRule[];
  loadGitignore?: boolean;
  configFile?: string;
}

export class ScanConfigManager {
  private static readonly DEFAULT_CONFIG: ScanConfig = {
    fileFilters: [],
    moduleDetectors: [],
    ignoreRules: [],
    performanceLimits: {
      maxFiles: 100000,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxDepth: 10,
      timeout: 300000, // 5分钟
      memoryLimit: 512 * 1024 * 1024 // 512MB
    }
  };

  /**
   * 创建默认扫描配置
   */
  static createDefault(options: ScanConfigOptions = {}): ScanConfig {
    const config = { ...ScanConfigManager.DEFAULT_CONFIG };

    // 应用性能限制
    if (options.performanceLimits) {
      config.performanceLimits = {
        ...config.performanceLimits,
        ...options.performanceLimits
      };
    }

    // 创建文件过滤器系统
    const fileFilterSystem = new FileFilterSystem({
      filters: options.customFilters,
      ignoreRules: options.customIgnoreRules
    });

    // 提取过滤器配置
    const filters = fileFilterSystem.getFilters();
    config.fileFilters = [...filters.include, ...filters.exclude];
    config.ignoreRules = fileFilterSystem.getIgnoreRules();

    return config;
  }

  /**
   * 从配置文件加载配置
   */
  static async loadFromFile(configPath: string): Promise<ScanConfig> {
    try {
      const absolutePath = resolve(configPath);
      const content = await fs.readFile(absolutePath, 'utf-8');

      let configData: any;

      if (configPath.endsWith('.json')) {
        configData = JSON.parse(content);
      } else if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
        const yaml = await import('yaml');
        configData = yaml.parse(content);
      } else {
        throw new Error(`Unsupported config file format: ${configPath}`);
      }

      return this.mergeWithDefaults(configData);
    } catch (error) {
      throw new Error(`Failed to load config from ${configPath}: ${(error as Error).message}`);
    }
  }

  /**
   * 保存配置到文件
   */
  static async saveToFile(config: ScanConfig, configPath: string): Promise<void> {
    try {
      const absolutePath = resolve(configPath);
      const dir = dirname(absolutePath);

      // 确保目录存在
      await fs.mkdir(dir, { recursive: true });

      let content: string;

      if (configPath.endsWith('.json')) {
        content = JSON.stringify(config, null, 2);
      } else if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
        const yaml = await import('yaml');
        content = yaml.stringify(config);
      } else {
        throw new Error(`Unsupported config file format: ${configPath}`);
      }

      await fs.writeFile(absolutePath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save config to ${configPath}: ${(error as Error).message}`);
    }
  }

  /**
   * 从项目根目录查找并加载配置文件
   */
  static async loadFromProjectRoot(projectPath: string): Promise<ScanConfig> {
    const configFiles = [
      '.zcf-scan.json',
      '.zcf-scan.yaml',
      '.zcf-scan.yml',
      'zcf-scan.config.json',
      'zcf-scan.config.yaml',
      'zcf-scan.config.yml'
    ];

    for (const configFile of configFiles) {
      const configPath = join(projectPath, configFile);
      try {
        await fs.access(configPath);
        return await this.loadFromFile(configPath);
      } catch {
        // 文件不存在，继续尝试下一个
      }
    }

    // 如果没有找到配置文件，返回默认配置
    return this.createDefault({ loadGitignore: true });
  }

  /**
   * 合并配置与默认值
   */
  private static mergeWithDefaults(configData: any): ScanConfig {
    const defaultConfig = this.DEFAULT_CONFIG;

    return {
      fileFilters: configData.fileFilters || defaultConfig.fileFilters,
      moduleDetectors: configData.moduleDetectors || defaultConfig.moduleDetectors,
      ignoreRules: configData.ignoreRules || defaultConfig.ignoreRules,
      performanceLimits: {
        ...defaultConfig.performanceLimits,
        ...(configData.performanceLimits || {})
      }
    };
  }

  /**
   * 验证配置
   */
  static validateConfig(config: ScanConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 验证性能限制
    if (config.performanceLimits) {
      if (config.performanceLimits.maxFiles <= 0) {
        errors.push('maxFiles must be greater than 0');
      }

      if (config.performanceLimits.maxFileSize <= 0) {
        errors.push('maxFileSize must be greater than 0');
      }

      if (config.performanceLimits.maxDepth <= 0) {
        errors.push('maxDepth must be greater than 0');
      }

      if (config.performanceLimits.timeout <= 0) {
        errors.push('timeout must be greater than 0');
      }

      if (config.performanceLimits.memoryLimit <= 0) {
        errors.push('memoryLimit must be greater than 0');
      }
    }

    // 验证过滤器
    if (config.fileFilters) {
      for (const filter of config.fileFilters) {
        if (!filter.name || !filter.pattern || !filter.action) {
          errors.push(`Invalid filter: ${JSON.stringify(filter)}`);
        }

        if (!['include', 'exclude'].includes(filter.action)) {
          errors.push(`Filter action must be 'include' or 'exclude': ${filter.action}`);
        }
      }
    }

    // 验证忽略规则
    if (config.ignoreRules) {
      for (const rule of config.ignoreRules) {
        if (!rule.pattern || !rule.description) {
          errors.push(`Invalid ignore rule: ${JSON.stringify(rule)}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 创建环境特定的配置
   */
  static createEnvironmentConfig(env: 'development' | 'production' | 'test'): ScanConfig {
    const baseConfig = this.createDefault();

    switch (env) {
      case 'development':
        // 开发环境：更宽松的限制，更多的调试信息
        return {
          ...baseConfig,
          performanceLimits: {
            ...baseConfig.performanceLimits,
            maxFiles: 50000,
            timeout: 600000, // 10分钟
            memoryLimit: 1024 * 1024 * 1024 // 1GB
          }
        };

      case 'production':
        // 生产环境：严格的性能限制
        return {
          ...baseConfig,
          performanceLimits: {
            ...baseConfig.performanceLimits,
            maxFiles: 50000,
            maxFileSize: 5 * 1024 * 1024, // 5MB
            timeout: 120000, // 2分钟
            memoryLimit: 256 * 1024 * 1024 // 256MB
          }
        };

      case 'test':
        // 测试环境：最小限制
        return {
          ...baseConfig,
          performanceLimits: {
            ...baseConfig.performanceLimits,
            maxFiles: 1000,
            maxFileSize: 1024 * 1024, // 1MB
            timeout: 30000, // 30秒
            memoryLimit: 64 * 1024 * 1024 // 64MB
          }
        };

      default:
        return baseConfig;
    }
  }

  /**
   * 创建大型项目配置
   */
  static createLargeProjectConfig(): ScanConfig {
    const config = this.createDefault();

    return {
      ...config,
      performanceLimits: {
        ...config.performanceLimits,
        maxFiles: 1000000,
        maxFileSize: 50 * 1024 * 1024, // 50MB
        timeout: 1800000, // 30分钟
        memoryLimit: 2048 * 1024 * 1024 // 2GB
      }
    };
  }

  /**
   * 创建小型项目配置
   */
  static createSmallProjectConfig(): ScanConfig {
    const config = this.createDefault();

    return {
      ...config,
      performanceLimits: {
        ...config.performanceLimits,
        maxFiles: 10000,
        maxFileSize: 5 * 1024 * 1024, // 5MB
        timeout: 60000, // 1分钟
        memoryLimit: 128 * 1024 * 1024 // 128MB
      }
    };
  }

  /**
   * 获取配置摘要
   */
  static getConfigSummary(config: ScanConfig): {
    filters: number;
    ignoreRules: number;
    performanceLimits: PerformanceLimits;
  } {
    return {
      filters: config.fileFilters.length,
      ignoreRules: config.ignoreRules.length,
      performanceLimits: config.performanceLimits
    };
  }

  /**
   * 克隆配置
   */
  static cloneConfig(config: ScanConfig): ScanConfig {
    return JSON.parse(JSON.stringify(config));
  }

  /**
   * 合并两个配置
   */
  static mergeConfigs(base: ScanConfig, override: Partial<ScanConfig>): ScanConfig {
    return {
      fileFilters: override.fileFilters || base.fileFilters,
      moduleDetectors: override.moduleDetectors || base.moduleDetectors,
      ignoreRules: override.ignoreRules || base.ignoreRules,
      performanceLimits: {
        ...base.performanceLimits,
        ...(override.performanceLimits || {})
      }
    };
  }
}