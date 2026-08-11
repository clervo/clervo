#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createClervoMcpServer } from './server.js';

const argv = process.argv.slice(2);
const profileIndex = argv.indexOf('--profile');
const inlineProfile = argv.find((value) => value.startsWith('--profile='))?.slice('--profile='.length);
const profile = inlineProfile ?? (profileIndex >= 0 ? argv[profileIndex + 1] : undefined);
const autoPay = argv.includes('--auto-pay') || process.env.CLERVO_AUTO_PAY === 'true';
const server = createClervoMcpServer({ ...(profile === undefined ? {} : { profile }), autoPay });
const transport = new StdioServerTransport();

try {
  await server.connect(transport);
} catch (error) {
  process.stderr.write(`clervo-mcp failed: ${error instanceof Error ? error.message : 'unknown_error'}\n`);
  process.exitCode = 1;
}
