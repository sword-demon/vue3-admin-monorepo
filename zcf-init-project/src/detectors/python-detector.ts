/**
 * Python 项目检测器
 */

import { join } from 'path';
import { BaseProjectDetector } from './base-detector.js';
import { ProjectType, ModuleInfo } from '../types/index.js';

interface PyProjectToml {
  'build-system'?: {
    'requires'?: string[];
    'build-backend'?: string;
  };
  'project'?: {
    'name'?: string;
    'version'?: string;
    'description'?: string;
    'authors'?: Array<{ 'name'?: string; 'email'?: string }>;
    'license'?: { 'text'?: string } | string;
    'keywords'?: string[];
    'scripts'?: Record<string, string>;
    'dependencies'?: string[];
    'optional-dependencies'?: Record<string, string[]>;
  };
  'tool'?: {
    'poetry'?: {
      'name'?: string;
      'version'?: string;
      'description'?: string;
      'authors'?: Array<{ 'name'?: string }>;
      'license'?: string;
      'keywords'?: string[];
      'dependencies'?: Record<string, string>;
      'dev-dependencies'?: Record<string, string>;
    };
    'setuptools'?: {
      'script-files'?: string[];
    };
    'pytest'?: Record<string, any>;
    'black'?: Record<string, any>;
    'mypy'?: Record<string, any>;
  };
}

interface SetupPy {
  name?: string;
  version?: string;
  description?: string;
  author?: string;
  author_email?: string;
  license?: string;
  keywords?: string[];
  scripts?: Record<string, string>;
  install_requires?: string[];
  extras_require?: Record<string, string[]>;
  python_requires?: string;
}

interface RequirementsTxt {
  dependencies: string[];
}

export class PythonProjectDetector extends BaseProjectDetector {
  name = 'Python';
  type = ProjectType.PYTHON;
  patterns = [
    'pyproject.toml',
    'setup.py',
    'requirements.txt',
    'requirements-dev.txt',
    'requirements.in',
    'Pipfile',
    'Pipfile.lock',
    'poetry.lock',
    'setup.cfg',
    'tox.ini',
    'pytest.ini',
    '.python-version'
  ];

  /**
   * 检测是否为Python项目
   */
  async detect(path: string): Promise<boolean> {
    const pythonIndicators = [
      'pyproject.toml',
      'setup.py',
      'requirements.txt',
      'Pipfile',
      'setup.cfg'
    ];

    for (const indicator of pythonIndicators) {
      if (await this.fileExists(join(path, indicator))) {
        return true;
      }
    }

    // 检查是否有Python文件
    return await this.hasPythonFiles(path);
  }

  /**
   * 分析Python项目
   */
  async analyze(path: string): Promise<ModuleInfo> {
    const moduleName = await this.extractProjectName(path);
    const moduleInfo = this.createBaseModuleInfo(path, moduleName);

    // 解析项目配置文件
    const pyProject = await this.readPyProjectToml(path);
    const setupPy = await this.readSetupPy(path);
    const requirements = await this.readRequirementsTxt(path);

    // 提取项目元数据
    this.extractMetadata(moduleInfo, pyProject, setupPy);

    // 解析依赖
    this.extractDependencies(moduleInfo, pyProject, setupPy, requirements);

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
   * 检查是否有Python文件
   */
  private async hasPythonFiles(path: string): Promise<boolean> {
    const { promises: fs } = await import('fs');

    try {
      const entries = await fs.readdir(path, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.py')) {
          return true;
        }
      }
    } catch {
      // 忽略错误
    }

    return false;
  }

  /**
   * 提取项目名称
   */
  private async extractProjectName(path: string): Promise<string> {
    // 尝试从pyproject.toml获取
    const pyProject = await this.readPyProjectToml(path);
    if (pyProject?.project?.name) {
      return pyProject.project.name;
    }
    if (pyProject?.tool?.poetry?.name) {
      return pyProject.tool.poetry.name;
    }

    // 尝试从setup.py获取
    const setupPy = await this.readSetupPy(path);
    if (setupPy?.name) {
      return setupPy.name;
    }

    // 使用目录名
    return this.extractModuleName(path);
  }

  /**
   * 读取pyproject.toml文件
   */
  private async readPyProjectToml(path: string): Promise<PyProjectToml | null> {
    try {
      const content = await this.readFile(join(path, 'pyproject.toml'));
      if (!content) return null;

      // 简单的TOML解析（实际项目中应该使用专门的TOML解析库）
      const toml = await import('toml');
      return toml.parse(content) as PyProjectToml;
    } catch {
      return null;
    }
  }

  /**
   * 读取setup.py文件
   */
  private async readSetupPy(path: string): Promise<SetupPy | null> {
    try {
      const content = await this.readFile(join(path, 'setup.py'));
      if (!content) return null;

      // 简单的setup.py解析（实际项目中可能需要AST解析）
      const setupPy: SetupPy = {};

      // 使用正则表达式提取基本信息
      const nameMatch = content.match(/name\s*=\s*['"`]([^'"`]+)['"`]/);
      if (nameMatch) setupPy.name = nameMatch[1];

      const versionMatch = content.match(/version\s*=\s*['"`]([^'"`]+)['"`]/);
      if (versionMatch) setupPy.version = versionMatch[1];

      const descriptionMatch = content.match(/description\s*=\s*['"`]([^'"`]+)['"`]/);
      if (descriptionMatch) setupPy.description = descriptionMatch[1];

      const authorMatch = content.match(/author\s*=\s*['"`]([^'"`]+)['"`]/);
      if (authorMatch) setupPy.author = authorMatch[1];

      return setupPy;
    } catch {
      return null;
    }
  }

  /**
   * 读取requirements.txt文件
   */
  private async readRequirementsTxt(path: string): Promise<RequirementsTxt | null> {
    const requirementsFiles = [
      'requirements.txt',
      'requirements-dev.txt',
      'requirements.in'
    ];

    for (const reqFile of requirementsFiles) {
      const content = await this.readFile(join(path, reqFile));
      if (content) {
        const dependencies = content
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#') && !line.startsWith('-'))
          .filter(line => !line.startsWith('git+') && !line.startsWith('https://'));

        return { dependencies };
      }
    }

    return null;
  }

  /**
   * 提取项目元数据
   */
  private extractMetadata(
    moduleInfo: ModuleInfo,
    pyProject: PyProjectToml | null,
    setupPy: SetupPy | null
  ): void {
    // 从pyproject.toml提取元数据
    if (pyProject?.project) {
      const project = pyProject.project;
      moduleInfo.metadata.description = project.description || moduleInfo.metadata.description;

      if (project.authors && project.authors.length > 0) {
        moduleInfo.metadata.author = project.authors[0].name || moduleInfo.metadata.author;
      }

      if (typeof project.license === 'string') {
        moduleInfo.metadata.license = project.license;
      } else if (project.license?.text) {
        moduleInfo.metadata.license = project.license.text;
      }

      moduleInfo.metadata.keywords = project.keywords || [];
      moduleInfo.metadata.scripts = project.scripts || {};
    }

    // 从Poetry配置提取元数据
    if (pyProject?.tool?.poetry) {
      const poetry = pyProject.tool.poetry;
      moduleInfo.metadata.description = poetry.description || moduleInfo.metadata.description;

      if (poetry.authors && poetry.authors.length > 0) {
        moduleInfo.metadata.author = poetry.authors[0] || moduleInfo.metadata.author;
      }

      moduleInfo.metadata.license = poetry.license || moduleInfo.metadata.license;
      moduleInfo.metadata.keywords = poetry.keywords || [];
    }

    // 从setup.py提取元数据
    if (setupPy) {
      moduleInfo.metadata.description = setupPy.description || moduleInfo.metadata.description;
      moduleInfo.metadata.author = setupPy.author || moduleInfo.metadata.author;
      moduleInfo.metadata.license = setupPy.license || moduleInfo.metadata.license;
      moduleInfo.metadata.keywords = setupPy.keywords || [];
      moduleInfo.metadata.scripts = setupPy.scripts || {};
    }
  }

  /**
   * 提取依赖
   */
  private extractDependencies(
    moduleInfo: ModuleInfo,
    pyProject: PyProjectToml | null,
    setupPy: SetupPy | null,
    requirements: RequirementsTxt | null
  ): void {
    // 从pyproject.toml提取依赖
    if (pyProject?.project?.dependencies) {
      moduleInfo.dependencies = pyProject.project.dependencies.map(dep => ({
        name: this.parseDependencyName(dep),
        version: this.parseDependencyVersion(dep),
        type: 'production' as const
      }));
    }

    if (pyProject?.project?.['optional-dependencies']) {
      const optionalDeps = pyProject.project['optional-dependencies'];
      for (const deps of Object.values(optionalDeps)) {
        moduleInfo.devDependencies.push(...deps.map(dep => ({
          name: this.parseDependencyName(dep),
          version: this.parseDependencyVersion(dep),
          type: 'optional' as const
        })));
      }
    }

    // 从Poetry提取依赖
    if (pyProject?.tool?.poetry?.dependencies) {
      const poetryDeps = pyProject.tool.poetry.dependencies;
      moduleInfo.dependencies = Object.entries(poetryDeps).map(([name, version]) => ({
        name,
        version: typeof version === 'string' ? version : '*',
        type: 'production' as const
      }));
    }

    if (pyProject?.tool?.poetry?.['dev-dependencies']) {
      const devDeps = pyProject.tool.poetry['dev-dependencies'];
      moduleInfo.devDependencies.push(...Object.entries(devDeps).map(([name, version]) => ({
        name,
        version: typeof version === 'string' ? version : '*',
        type: 'development' as const
      })));
    }

    // 从setup.py提取依赖
    if (setupPy?.install_requires) {
      moduleInfo.dependencies.push(...setupPy.install_requires.map(dep => ({
        name: this.parseDependencyName(dep),
        version: this.parseDependencyVersion(dep),
        type: 'production' as const
      })));
    }

    if (setupPy?.extras_require) {
      for (const deps of Object.values(setupPy.extras_require)) {
        moduleInfo.devDependencies.push(...deps.map(dep => ({
          name: this.parseDependencyName(dep),
          version: this.parseDependencyVersion(dep),
          type: 'optional' as const
        })));
      }
    }

    // 从requirements.txt提取依赖
    if (requirements?.dependencies) {
      moduleInfo.dependencies.push(...requirements.dependencies.map(dep => ({
        name: this.parseDependencyName(dep),
        version: this.parseDependencyVersion(dep),
        type: 'production' as const
      })));
    }
  }

  /**
   * 解析依赖名称
   */
  private parseDependencyName(dependency: string): string {
    // 简单的依赖名称解析
    const match = dependency.match(/^([a-zA-Z0-9\-_.]+)/);
    return match ? match[1] : dependency;
  }

  /**
   * 解析依赖版本
   */
  private parseDependencyVersion(dependency: string): string {
    // 简单的版本解析
    const match = dependency.match(/([>=<!=~]+[0-9a-zA-Z\-_.]+)/);
    return match ? match[1] : '*';
  }

  /**
   * 查找入口文件
   */
  private async findEntryPoints(path: string): Promise<string[]> {
    const entryPatterns = [
      'src/__init__.py',
      'src/main.py',
      'src/app.py',
      '__init__.py',
      'main.py',
      'app.py',
      'run.py',
      'cli.py',
      'wsgi.py',
      'asgi.py'
    ];

    const entryPoints: string[] = [];

    for (const pattern of entryPatterns) {
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
      'README.rst',
      'README',
      'CHANGELOG.md',
      'LICENSE',
      'CONTRIBUTING.md',
      'src/**/*.py',
      'lib/**/*.py',
      'bin/**/*.py'
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
      'tests/**/*.py',
      'test/**/*.py',
      'src/**/test_*.py',
      'src/**/*_test.py',
      '**/test_*.py',
      '**/*_test.py',
      'conftest.py'
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
      'pyproject.toml',
      'setup.py',
      'setup.cfg',
      'requirements.txt',
      'requirements-dev.txt',
      'Pipfile',
      'poetry.lock',
      'tox.ini',
      'pytest.ini',
      'mypy.ini',
      '.flake8',
      '.pylintrc',
      'black.toml',
      'pyproject.toml',
      '.python-version'
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
      'README.rst',
      'README',
      'CHANGELOG.md',
      'LICENSE',
      'CONTRIBUTING.md',
      'docs/**/*',
      'doc/**/*',
      'documentation/**/*',
      'examples/**/*'
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