// The state of an article's page: the open image, the report and its thanks, the selection, the index (and its
// phone panel), the reading position and place, «Ponte a prueba», the last note, the tip and arriving at a section.
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useLocation } from 'react-router';
import type { Note, ReportCategory } from '@qv/schema';
import type { OpenImage } from '../../../shared/ui/ImageViewer';
import { useTitle } from '../../../shared/hooks/useTitle';
import type { NoteLocation } from '../../catalog/model/catalog';
import type { ReportLocation, ReportTarget } from '../../reports/api/repository';
import { useTip } from '../../tips/hooks/useTip';
import { rememberNote } from '../api/lastNote';
import { anchorOf } from '../model/anchor';
import { flashHeading } from '../model/flash';
import { PRACTICE_ANCHOR } from '../model/practice';
import { activeTitle } from '../model/toc';
import { useNoteViewStrings } from './strings/useNoteView.strings';
import { useActiveSection } from './useActiveSection';
import { useArticleSelection } from './useArticleSelection';
import { usePractice } from './usePractice';
import { useReadingPlace } from './useReadingPlace';

export interface Reporting {
  target: ReportTarget;
  category?: ReportCategory;
}

export function useNoteView(note: Note, location: NoteLocation | null, remember: boolean) {
  const contentRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<OpenImage | null>(null);
  const [reporting, setReporting] = useState<Reporting | null>(null);
  const [thanks, setThanks] = useState(false);
  useEffect(() => {
    if (!thanks) return;
    const id = setTimeout(() => setThanks(false), 3000);
    return () => clearTimeout(id);
  }, [thanks]);
  const selected = useArticleSelection(bodyRef, !reporting && !image);
  const [tocOpen, setTocOpen] = useState(false);
  const { active, progress } = useActiveSection(contentRef, true);
  const { hash, pathname } = useLocation();
  const targetOf = (place: ReportLocation): ReportTarget => ({
    kind: 'note',
    id: note.id,
    code: note.code ?? null,
    version: note.version ?? null,
    location: { path: pathname, title: note.title, ...place },
  });
  const practice = usePractice(note, location);
  const hasPractice = !!location && !!(practice.quiz ?? practice.deck);
  const toc = hasPractice
    ? [
        ...note.toc,
        { anchor: PRACTICE_ANCHOR, title: useNoteViewStrings.practiceTitle, level: 2 as const },
      ]
    : note.toc;

  useEffect(() => {
    if (remember) rememberNote(note.slug);
  }, [note.slug, remember]);
  const tip = useTip('tip-search', progress >= 0.95);

  useTitle(note.title);

  useEffect(() => {
    if (!hash) return;
    const id = anchorOf(hash);
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    flashHeading(el);
  }, [hash]);
  useReadingPlace(bodyRef);

  const current = activeTitle(toc, active);
  const tocBar = useTocBar(tocOpen, setTocOpen);

  return {
    content: contentRef,
    body: bodyRef,
    image,
    setImage,
    reporting,
    setReporting,
    setThanks,
    thanks,
    selected,
    tocOpen,
    setTocOpen,
    active,
    progress,
    targetOf,
    hasPractice,
    toc,
    tip,
    current,
    tocBar,
  };
}

/** The phone's index bar: a touch outside it or Escape closes its panel. */
function useTocBar(open: boolean, setOpen: Dispatch<SetStateAction<boolean>>) {
  const tocBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!tocBarRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);
  return tocBarRef;
}

export type NoteViewState = ReturnType<typeof useNoteView>;
