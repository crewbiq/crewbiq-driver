import fs from 'node:fs/promises';

import { test as base, expect } from '@playwright/test';

import { redactValue } from '../support/redact.mjs';

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const consoleEntries = [];
    const networkEntries = [];

    page.on('console', message => {
      consoleEntries.push({
        type: message.type(),
        text: message.text(),
      });
    });
    page.on('request', request => {
      networkEntries.push({
        event: 'request',
        method: request.method(),
        url: request.url(),
      });
    });
    page.on('response', response => {
      networkEntries.push({
        event: 'response',
        status: response.status(),
        url: response.url(),
      });
    });

    try {
      await use(page);
    } finally {
      const consolePath = testInfo.outputPath('console.json');
      const networkPath = testInfo.outputPath('network.json');
      await fs.writeFile(consolePath, JSON.stringify(redactValue(consoleEntries), null, 2), 'utf8');
      await fs.writeFile(networkPath, JSON.stringify(redactValue(networkEntries), null, 2), 'utf8');
      await testInfo.attach('console-log', {
        path: consolePath,
        contentType: 'application/json',
      });
      await testInfo.attach('network-log', {
        path: networkPath,
        contentType: 'application/json',
      });
    }
  },
});

export { expect };
