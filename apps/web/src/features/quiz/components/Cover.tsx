// A test section's cover: tabs, the round saved halfway, «Comenzar» with the groups to practice, the mode and the list.
import { isResumable } from '@qv/quiz';
import type { Preferences, Round } from '@qv/quiz';
import type { QuizDetail, QuizSectionSummary } from '@qv/schema';
import { useDraftOnly } from '../../catalog/hooks/useDraftOnly';
import { useDiscardArm, useTabFocus } from '../hooks/useCoverState';
import { chosenCount } from '../model/cover';
import { DraftOnlyNotice } from '../../../shared/ui/DraftOnlyNotice';
import { quizStrings as s } from '../strings';
import { Html } from './Html';
import { ModeSwitches } from './ModeSwitches';
import { ResumeBanner } from './ResumeBanner';
import { SectionTabs } from './SectionTabs';
import { StartForm } from './StartForm';
import { TopicListing } from './TopicListing';

const TITLE = 'font-serif text-3xl font-semibold tracking-tight';

function CoverTitle({ quiz, heading }: { quiz: QuizDetail; heading: string | null }) {
  const total = quiz.sections.reduce((t, section) => t + section.questionCount, 0);
  return (
    <>
      {quiz.kicker ? <Html as="p" className="kicker" html={quiz.kicker} /> : null}
      {heading ? (
        <h1 id="quiz-title" className={TITLE}>
          {heading}
        </h1>
      ) : quiz.heading ? (
        <Html as="h1" id="quiz-title" html={quiz.heading} className={TITLE} />
      ) : (
        <h1 id="quiz-title" className={TITLE}>
          {quiz.title}
        </h1>
      )}
      <p className="mt-1 text-[var(--muted)]">
        {s.cover.subtitle}
        {s.questions(total)}
      </p>
    </>
  );
}

export function Cover({
  quiz,
  section,
  round,
  preferences,
  onChoose,
  onStart,
  onResume,
  onDiscard,
  onTab,
  focusTab = false,
  heading = null,
}: {
  quiz: QuizDetail;
  section: QuizSectionSummary;
  round: Round | null;
  preferences: Preferences;
  onChoose: (p: Preferences) => void;
  onStart: (p: Preferences) => void;
  onResume: () => void;
  onDiscard: () => void;
  onTab: (sectionId: string) => void;
  focusTab?: boolean;
  heading?: string | null;
}) {
  // What only the draft has is looked at, not answered.
  const draftOnly = useDraftOnly(['quiz', quiz.id]);
  const sections = quiz.sections;
  const active = sections.findIndex((x) => x.id === section.id);
  const chosen = chosenCount(section, preferences);
  const { armed, setArmed } = useDiscardArm();
  const tabRefs = useTabFocus(focusTab, active);

  return (
    <section className="wrap wide portada" aria-labelledby="quiz-title">
      <CoverTitle quiz={quiz} heading={heading} />
      {sections.length > 1 ? (
        <SectionTabs sections={sections} active={active} tabRefs={tabRefs} onTab={onTab} />
      ) : null}
      {section.description ? (
        <Html as="p" className="mt-4 text-sm text-[var(--muted)]" html={section.description} />
      ) : null}
      {isResumable(round) ? (
        <ResumeBanner
          round={round}
          armed={armed}
          setArmed={setArmed}
          onResume={onResume}
          onDiscard={onDiscard}
        />
      ) : null}

      {draftOnly ? (
        <div className="mt-6">
          <DraftOnlyNotice kind="quiz" />
        </div>
      ) : (
        <>
          <StartForm
            section={section}
            preferences={preferences}
            chosen={chosen}
            onChoose={onChoose}
            onStart={onStart}
          />

          <ModeSwitches
            preferences={preferences}
            hasChoices={section.hasChoices}
            onChoose={onChoose}
          />
        </>
      )}

      {section.notice ? <Html as="p" className="aviso" html={section.notice} /> : null}
      {section.listing?.items.length ? <TopicListing listing={section.listing} /> : null}
    </section>
  );
}
