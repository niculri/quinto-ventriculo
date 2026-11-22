// How the API reads the draft's release summary and publishes or reverts it.
import type {
  PublishResult,
  ReleaseChecks,
  ReleaseLog,
  ReleaseMark,
  RevertResult,
} from '@qv/schema';
import type { JsonBody } from './content';

export interface ReleaseRepository {
  summaryJson(): Promise<JsonBody>;
  browseIndexesJson(): Promise<JsonBody>;
  itemsJson(
    assessment: string,
    kind: 'card' | 'article' | 'question',
    after: string | null,
  ): Promise<JsonBody>;
  textsJson(after: string | null): Promise<JsonBody>;
  media(after: string | null, limit: number): Promise<{ keys: string[]; next: string | null }>;
  setMark(
    fingerprint: string,
    mark: 'phone' | 'answers' | 'announcement',
    checked: boolean,
    by: string,
  ): Promise<ReleaseMark[] | 'stale'>;
  publish(input: PublishInput): Promise<{ ok: true; result: PublishResult } | Refused>;
  revert(id: number, by: string): Promise<{ ok: true; result: RevertResult } | Refused>;
  log(): Promise<ReleaseLog>;
}

/** A type, not an interface: it goes as the `jsonb` argument of publish_release(). */
export type PublishInput = {
  fingerprint: string;
  title: string;
  schemaVersion: number;
  checks: ReleaseChecks;
  marks: ('announcement' | 'phone' | 'answers')[];
  by: string;
};

export type Refused = { ok: false; reason: string; detail: string | null };
