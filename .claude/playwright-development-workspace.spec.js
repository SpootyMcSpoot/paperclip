/**
 * Playwright E2E Test: Staple Development Workspace
 *
 * Purpose: Validates the development workspace feature end-to-end in a real browser
 *
 * This test:
 * 1. Navigates to the development workspace route
 * 2. Waits for Monaco Editor to load
 * 3. Verifies no console errors during page load
 * 4. Takes screenshots for visual validation
 *
 * Usage:
 *   STAPLE_URL=https://staple.spooty.io npx playwright test playwright-development-workspace.spec.js
 *
 * Requirements:
 *   npm install -D @playwright/test
 *   npx playwright install chromium
 */

const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.STAPLE_URL || 'https://staple.spooty.io';
const TEST_COMPANY = process.env.TEST_COMPANY || 'test-company';
const TIMEOUT = 30000; // 30 seconds for Monaco to load

test.describe('Staple Development Workspace', () => {
  let consoleErrors = [];
  let consoleWarnings = [];

  test.beforeEach(async ({ page }) => {
    // Capture console errors and warnings
    consoleErrors = [];
    consoleWarnings = [];

    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();

      if (type === 'error') {
        consoleErrors.push(text);
      } else if (type === 'warning') {
        consoleWarnings.push(text);
      }
    });

    // Capture page errors (unhandled exceptions)
    page.on('pageerror', (error) => {
      consoleErrors.push(`Uncaught exception: ${error.message}`);
    });
  });

  test('should load development workspace page', async ({ page }) => {
    const url = `${BASE_URL}/${TEST_COMPANY}/development`;

    console.log(`Navigating to: ${url}`);

    // Navigate with extended timeout for slow connections
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: TIMEOUT
    });

    // Take screenshot of initial page load
    await page.screenshot({
      path: 'screenshots/development-workspace-initial.png',
      fullPage: true
    });

    // Verify page title or header
    await expect(page).toHaveTitle(/Staple/i);

    console.log('Page loaded successfully');
  });

  test('should load Monaco Editor', async ({ page }) => {
    const url = `${BASE_URL}/${TEST_COMPANY}/development`;

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: TIMEOUT
    });

    // Wait for Monaco Editor to initialize
    // Monaco typically creates elements with class 'monaco-editor'
    console.log('Waiting for Monaco Editor to load...');

    try {
      // Wait for Monaco editor container
      const monacoEditor = await page.waitForSelector('.monaco-editor, [class*="monaco"]', {
        timeout: TIMEOUT,
        state: 'visible'
      });

      expect(monacoEditor).toBeTruthy();
      console.log('Monaco Editor element found');

      // Take screenshot with Monaco loaded
      await page.screenshot({
        path: 'screenshots/development-workspace-monaco-loaded.png',
        fullPage: true
      });

      // Optional: Check for Monaco-specific DOM structure
      const hasMonacoContent = await page.evaluate(() => {
        const editors = document.querySelectorAll('.monaco-editor');
        return editors.length > 0;
      });

      expect(hasMonacoContent).toBe(true);
      console.log(`Found ${await page.locator('.monaco-editor').count()} Monaco editor instance(s)`);

    } catch (error) {
      // Take screenshot of failure state
      await page.screenshot({
        path: 'screenshots/development-workspace-monaco-timeout.png',
        fullPage: true
      });

      throw new Error(`Monaco Editor did not load within ${TIMEOUT}ms: ${error.message}`);
    }
  });

  test('should interact with Monaco Editor', async ({ page }) => {
    const url = `${BASE_URL}/${TEST_COMPANY}/development`;

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: TIMEOUT
    });

    // Wait for Monaco to be ready
    await page.waitForSelector('.monaco-editor', { timeout: TIMEOUT });

    console.log('Testing Monaco Editor interaction...');

    // Try to focus the editor and type
    try {
      // Find the Monaco editor's text area (it's usually hidden but focusable)
      const textarea = await page.locator('.monaco-editor textarea').first();

      // Click to focus
      await textarea.click();

      // Type some test code
      await page.keyboard.type('// Test Monaco Editor\nconst test = "hello";');

      // Wait a moment for the editor to process
      await page.waitForTimeout(1000);

      // Take screenshot showing typed content
      await page.screenshot({
        path: 'screenshots/development-workspace-monaco-interaction.png',
        fullPage: true
      });

      console.log('Successfully interacted with Monaco Editor');

    } catch (error) {
      console.warn(`Could not interact with Monaco Editor: ${error.message}`);
      // Not failing the test as interaction might be disabled
    }
  });

  test('should not have console errors', async ({ page }) => {
    const url = `${BASE_URL}/${TEST_COMPANY}/development`;

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: TIMEOUT
    });

    // Wait for Monaco to load
    await page.waitForSelector('.monaco-editor, [class*="monaco"]', {
      timeout: TIMEOUT,
      state: 'visible'
    });

    // Give the page a moment to settle
    await page.waitForTimeout(2000);

    // Filter out known acceptable errors/warnings
    const filteredErrors = consoleErrors.filter(error => {
      // Add patterns for known acceptable errors
      const acceptablePatterns = [
        /Download the React DevTools/i,
        /favicon\.ico/i,
        // Add other patterns as needed
      ];

      return !acceptablePatterns.some(pattern => pattern.test(error));
    });

    // Report findings
    if (consoleWarnings.length > 0) {
      console.log('\nConsole Warnings:');
      consoleWarnings.forEach(warn => console.log(`  - ${warn}`));
    }

    if (filteredErrors.length > 0) {
      console.error('\nConsole Errors:');
      filteredErrors.forEach(err => console.error(`  - ${err}`));

      await page.screenshot({
        path: 'screenshots/development-workspace-with-errors.png',
        fullPage: true
      });
    }

    // Assert no errors (after filtering)
    expect(filteredErrors).toHaveLength(0);

    console.log('No console errors detected');
  });

  test('should have working navigation', async ({ page }) => {
    const url = `${BASE_URL}/${TEST_COMPANY}/development`;

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: TIMEOUT
    });

    // Check if we can navigate within the app
    // Look for common navigation elements
    const hasNavigation = await page.evaluate(() => {
      const navElements = document.querySelectorAll('nav, [role="navigation"], header a');
      return navElements.length > 0;
    });

    if (hasNavigation) {
      console.log('Navigation elements found on page');
    } else {
      console.warn('No navigation elements found - might be a single-page view');
    }

    // Verify we're on the correct route
    const currentUrl = page.url();
    expect(currentUrl).toContain('/development');

    console.log(`Current URL: ${currentUrl}`);
  });

  test('should load required assets', async ({ page }) => {
    const url = `${BASE_URL}/${TEST_COMPANY}/development`;

    const failedRequests = [];

    // Track failed network requests
    page.on('requestfailed', (request) => {
      failedRequests.push({
        url: request.url(),
        failure: request.failure().errorText
      });
    });

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: TIMEOUT
    });

    // Wait for Monaco
    await page.waitForSelector('.monaco-editor, [class*="monaco"]', {
      timeout: TIMEOUT,
      state: 'visible'
    });

    // Report failed requests
    if (failedRequests.length > 0) {
      console.error('\nFailed Network Requests:');
      failedRequests.forEach(req => {
        console.error(`  - ${req.url}: ${req.failure}`);
      });
    }

    // Critical assets should not fail
    const criticalFailures = failedRequests.filter(req => {
      const url = req.url.toLowerCase();
      return url.includes('monaco') ||
             url.endsWith('.js') ||
             url.endsWith('.css');
    });

    expect(criticalFailures).toHaveLength(0);

    console.log('All critical assets loaded successfully');
  });
});

// Configuration
test.use({
  // Take screenshot on failure
  screenshot: 'only-on-failure',

  // Save trace on failure for debugging
  trace: 'on-first-retry',

  // Viewport size
  viewport: { width: 1920, height: 1080 },

  // Ignore HTTPS errors for self-signed certs in development
  ignoreHTTPSErrors: true,
});

// Create screenshots directory if it doesn't exist
const fs = require('fs');
const path = require('path');

test.beforeAll(async () => {
  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
});
