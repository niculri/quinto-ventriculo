// The tabs of a test with several sections: each with its questions; the arrows move between them, around the ends.
import type { RefObject } from 'react';
import type { QuizSectionSummary } from '@qv/schema';
import { sectionTabsStrings as s } from './strings/SectionTabs.strings';
import { startFormStrings } from './strings/StartForm.strings';
import { Html } from './Html';

export function SectionTabs({
  sections,
  active,
  tabsRef,
  onTab,
}: {
  sections: QuizSectionSummary[];
  active: number;
  tabsRef: RefObject<(HTMLButtonElement | null)[]>;
  onTab: (sectionId: string) => void;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={s.cover.tabs}>
      {sections.map((section, i) => (
        <button
          key={section.id}
          ref={(el) => {
            tabsRef.current[i] = el;
          }}
          type="button"
          role="tab"
          className="tab"
          aria-selected={i === active}
          tabIndex={i === active ? 0 : -1}
          onClick={() => onTab(section.id)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const j =
              (active + (e.key === 'ArrowRight' ? 1 : sections.length - 1)) % sections.length;
            onTab(sections[j]!.id);
          }}
        >
          <Html className="tn" html={section.name} />{' '}
          <span className="tc">{startFormStrings.questions(section.questionCount)}</span>
        </button>
      ))}
    </div>
  );
}
