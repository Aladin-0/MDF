import { test as setup, expect } from '@playwright/test';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

setup('reset database and login', async ({ page, baseURL }) => {
  console.log('🔄 Running global setup: Resetting Test Database...');
  
  // 1. Reset Database using backend command
  try {
    const backendDir = path.resolve(__dirname, '../../../backend');
    const { execFileSync } = require('child_process');
    const pythonCmd = '../backend/venv/bin/python';
    const testDbUrl = process.env.DATABASE_URL_TEST || 'postgres://mediflow:mediflow@localhost:5432/mediflow_test';
    
    // Safety Guard: Fail completely if trying to connect to the prod DB
    if (testDbUrl.endsWith('/mediflow')) {
      throw new Error('CRITICAL: Playwright tests are configured to run against the production database ("mediflow"). Aborting to prevent data wipe.');
    }

    execFileSync(pythonCmd, ['manage.py', 'migrate'], {
      cwd: backendDir,
      env: { 
        ...process.env, 
        DJANGO_SETTINGS_MODULE: 'mediflow.settings.dev', 
        DATABASE_URL: testDbUrl,
        REDIS_URL: 'memory://'
      },
      stdio: 'inherit',
    });

    execFileSync(pythonCmd, ['manage.py', 'reset_test_db_state'], {
      cwd: backendDir,
      env: { 
        ...process.env, 
        DJANGO_SETTINGS_MODULE: 'mediflow.settings.dev', 
        DATABASE_URL: testDbUrl,
        REDIS_URL: 'memory://'
      },
      stdio: 'inherit',
    });
    console.log('✅ Database reset and seeded successfully.');
  } catch (error) {
    console.error('❌ Failed to reset database:', error);
    throw error;
  }

  // 2. Perform authentication and save storage state
  console.log('🔐 Authenticating admin user...');
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  await page.goto(baseURL + '/login');
  try {
    await page.fill('input[name="phone"]', '9876543210', { timeout: 5000 });
    await page.fill('input[name="password"]', 'password123', { timeout: 5000 });
    await page.click('button[type="submit"]', { timeout: 5000 });
  } catch (e) {
    console.error("Login form interaction failed. Taking screenshot of login page...");
    await page.screenshot({ path: 'login_fail.png' });
    throw e;
  }

  // Wait for navigation to dashboard
  try {
    await page.waitForURL('**/dashboard', { timeout: 5000 });
  } catch (e) {
    console.error("Navigation failed. Taking screenshot of login page...");
    await page.screenshot({ path: 'login_fail.png' });
    throw e;
  }

  // Ensure auth directory exists
  const authDir = path.join(__dirname, '.auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Save state
  await page.context().storageState({ path: path.join(authDir, 'admin.json') });
  console.log('✅ Auth state saved to tests/e2e/.auth/admin.json');
});
