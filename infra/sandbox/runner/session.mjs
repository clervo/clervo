#!/usr/bin/env node
process.on('SIGTERM', () => process.exit(0)); process.on('SIGINT', () => process.exit(0));
setInterval(() => {}, 2 ** 30);
