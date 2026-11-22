#!/usr/bin/env -S npx tsx
// `npm run import`: the command; what it does is in runImport.
import { runImport } from './runImport';

runImport().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
