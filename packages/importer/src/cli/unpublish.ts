#!/usr/bin/env -S npx tsx
// `npm run unpublish`: the command; what it does is in runUnpublish.
import { runUnpublish } from './runUnpublish';

runUnpublish().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
