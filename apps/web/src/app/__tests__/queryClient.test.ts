// Tests queryClient: which failed reads are retried, a write without a connection goes out at once and fails in view,
// and no write asks for another mode.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MutationObserver, QueryClient, onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../shared/lib/api';
import { createQueryClient } from '../queryClient';

afterEach(() => onlineManager.setOnline(true));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('the site client', () => {
  it.each([
    ['a 401', new ApiRequestError(401, 'unauthorized', 'x'), 0, false],
    ['a 403', new ApiRequestError(403, 'forbidden', 'x'), 0, false],
    ['a 404', new ApiRequestError(404, 'not_found', 'x'), 0, false],
    ['a 499', new ApiRequestError(499, 'unknown', 'x'), 0, false],
    ['a 500, the first time', new ApiRequestError(500, 'unknown', 'x'), 0, true],
    ['a 500, the second time', new ApiRequestError(500, 'unknown', 'x'), 1, true],
    ['a 500, the third time', new ApiRequestError(500, 'unknown', 'x'), 2, false],
    ['no connection', new ApiRequestError(0, 'offline', 'x'), 1, true],
    ['a 400', new ApiRequestError(400, 'bad_request', 'x'), 0, false],
    ['another error', new Error('boom'), 0, true],
  ])('a read that failed with %s is retried: %s', (_case, error, attempts, retried) => {
    const retry = createQueryClient().getDefaultOptions().queries?.retry as (
      attempts: number,
      error: Error,
    ) => boolean;
    expect(retry(attempts, error)).toBe(retried);
  });

  it('sends a write at once and shows its failure when there is no connection', async () => {
    onlineManager.setOnline(false);
    const client = createQueryClient();
    const write = vi.fn().mockRejectedValue(new Error('offline'));
    const observer = new MutationObserver(client, { mutationFn: write });
    const done = observer.mutate(undefined).catch(() => undefined);
    await done;
    expect(write).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult()).toMatchObject({ status: 'error', isPaused: false });
  });

  it('leaves a write waiting without a connection under the default mode of the library', () => {
    onlineManager.setOnline(false);
    const write = vi.fn().mockResolvedValue(1);
    const observer = new MutationObserver(new QueryClient(), { mutationFn: write });
    void observer.mutate(undefined);
    expect(write).not.toHaveBeenCalled();
    expect(observer.getCurrentResult().isPaused).toBe(true);
  });

  it('is the only place that picks a network mode for the writes', () => {
    const own = join(import.meta.dirname, '../..');
    const picking = sourceFiles(own).filter((f) => readFileSync(f, 'utf8').includes('networkMode'));
    expect(picking.map((f) => f.slice(own.length + 1))).toEqual(['app/queryClient.ts']);
  });
});
