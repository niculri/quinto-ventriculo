// What the study screen shows without a card: nothing before the session looks for its first one, then the end
// screen of its mode.
import type { ReactNode } from 'react';
import type { CourseDeckNode } from '../../catalog/model/tree';
import type { CongratsInfo } from '@qv/study';
import { Congrats } from './Congrats';
import { DoneToday } from './DoneToday';

export function StudyEnd({
  info,
  hasSeen,
  full,
  node,
  deckPath,
  summary,
}: {
  info: CongratsInfo | null;
  hasSeen: (assessmentId: string) => boolean;
  full: boolean;
  node: CourseDeckNode;
  deckPath: string;
  summary: ReactNode;
}) {
  return !info ? (
    // Before the session looks for its first card: neither the end screen nor its summary, which would be gone in the
    // next frame.
    <div className="flex-1" />
  ) : full ? (
    <Congrats info={info} deckPath={deckPath} summary={summary} />
  ) : (
    <DoneToday info={info} node={node} deckPath={deckPath} hasSeen={hasSeen} summary={summary} />
  );
}
