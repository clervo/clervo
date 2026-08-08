#!/usr/bin/env node
try {
  await import('./b12-slice4-qa-fast.mjs');
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
