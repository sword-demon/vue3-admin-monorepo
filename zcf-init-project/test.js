#!/usr/bin/env node

/**
 * 简化测试脚本
 */

import { ZcfInitProject } from './dist/index.js';

async function test() {
  try {
    console.log('🧪 开始测试 ZCF 项目初始化工具...');

    const initProject = new ZcfInitProject();

    // 测试扫描vue3-admin-monorepo项目
    const result = await initProject.scanOnly('../vue3-admin-monorepo', {
      verbose: true,
      maxFiles: 1000,
      maxDepth: 3
    });

    console.log('✅ 测试成功！');
    console.log('扫描结果:', JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();