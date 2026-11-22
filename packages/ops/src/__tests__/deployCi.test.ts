// Tests which CI run decides for a commit.
import { describe, expect, it } from 'vitest';
import { ciVerdict } from '../deployCi';
import type { CiRun } from '../deployCi';

const SHA = 'd27b0b30eacc61eaf26b507f0768d35b15a28a4d';
const OTHER = '8f7c631f22c3ad4d6f036cc79b9248a81e94f1a0';

const run = (over: Partial<CiRun> = {}): CiRun => ({
  databaseId: 1,
  status: 'completed',
  conclusion: 'success',
  event: 'push',
  createdAt: '2026-11-08T01:49:23Z',
  url: 'https://github.com/niculri/quinto-ventriculo/actions/runs/1',
  headSha: SHA,
  headBranch: 'main',
  ...over,
});

describe('ciVerdict', () => {
  it('the most recent run on main decides; pull requests do not count', () => {
    expect(
      ciVerdict(
        [
          run({ createdAt: '2026-11-08T01:00:00Z' }),
          run({ createdAt: '2026-11-09T05:30:00Z', event: 'schedule', conclusion: 'failure' }),
        ],
        SHA,
      ).kind,
    ).toBe('failed');
    expect(
      ciVerdict(
        [
          run({ createdAt: '2026-11-08T01:00:00Z' }),
          run({ createdAt: '2026-11-09T00:00:00Z', event: 'pull_request', conclusion: 'failure' }),
        ],
        SHA,
      ).kind,
    ).toBe('success');
    expect(ciVerdict([run({ event: 'pull_request' })], SHA).kind).toBe('missing');
  });

  it('only runs of that commit on main count', () => {
    expect(ciVerdict([run({ headSha: OTHER })], SHA).kind).toBe('missing');
    expect(ciVerdict([run({ headBranch: 'main-copy' })], SHA).kind).toBe('missing');
    expect(
      ciVerdict(
        [
          run({ createdAt: '2026-11-08T01:00:00Z', conclusion: 'failure' }),
          run({ createdAt: '2026-11-09T01:00:00Z', headSha: OTHER }),
        ],
        SHA,
      ).kind,
    ).toBe('failed');
  });
});
