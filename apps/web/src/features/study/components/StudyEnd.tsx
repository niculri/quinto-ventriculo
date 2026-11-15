// What the study screen shows without a card: nothing before the session looks for its first one, then the end
// screen of its mode.
import type { ReactNode } from 'react';
import type { CourseDeckNode } from '../../catalog/model/tree';
import type { StudySession } from '../api/StudySession';
import { Congrats } from './Congrats';
import { DoneToday } from './DoneToday';

export function StudyEnd({
  session,
  done,
  full,
  node,
  deckPath,
  summary,
}: {
  session: StudySession;
  done: boolean;
  full: boolean;
  node: CourseDeckNode;
  deckPath: string;
  summary: ReactNode;
}) {
  return !done ? (
    // Before the session looks for its first card: neither the end screen nor its summary, which would be gone in the
    // next frame.
    <div className="flex-1" />
  ) : full ? (
    <Congrats info={session.congrats()} deckPath={deckPath} summary={summary} />
  ) : (
    <DoneToday
      info={session.congrats()}
      node={node}
      deckPath={deckPath}
      hasSeen={(id) => session.hasSeen(id)}
      summary={summary}
    />
  );
}
