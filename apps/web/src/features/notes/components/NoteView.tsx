// An article with everything around it: header, index, body, «Ponte a prueba», report line, tip, neighbors, the
// image viewer and the report popup. The dev reading page shows it without the catalog.
import type { Note } from '@qv/schema';
import { page } from '../../../shared/ui/styles';
import { Rail } from '../../../shared/ui/rail';
import { ImageViewer } from '../../../shared/ui/ImageViewer';
import { StatusToast } from '../../../shared/ui/Toast';
import { sharedStrings } from '../../../shared/strings';
import type { NoteLocation } from '../../catalog/model/catalog';
import { PageCrumbs } from '../../catalog/components/AdminMarks';
import { ReportDialog } from '../../reports/components/ReportDialog';
import { useNoteView } from '../hooks/useNoteView';
import type { NoteViewState } from '../hooks/useNoteView';
import { noteCrumbs } from '../model/noteCrumbs';
import { noteStrings } from '../strings';
import { NoteContent } from './NoteContent';
import { NoteHeader } from './NoteHeader';
import { Toc } from './Toc';
import { TocBar } from './TocBar';
import { Practice } from './Practice';
import { ReportLine, SearchTip } from './ArticleEnd';
import { Neighbors } from './Neighbors';
import { SelectionReportBar } from './SelectionReportBar';

export function NoteView({
  note,
  location,
  remember = true,
}: {
  note: Note;
  location: NoteLocation | null;
  remember?: boolean;
}) {
  const {
    content,
    body,
    tocBar,
    toc,
    active,
    progress,
    current,
    tocOpen,
    setTocOpen,
    setImage,
    hasPractice,
    tip,
    ...popups
  } = useNoteView(note, location, remember);
  const { setReporting, targetOf } = popups;
  return (
    <div className={page}>
      <PageCrumbs thing={['note', note.id]} items={noteCrumbs(location, note.title)} />
      <article className="w-full min-w-0">
        <NoteHeader note={note} />

        {toc.length ? (
          <TocBar
            bar={tocBar}
            toc={toc}
            active={active}
            progress={progress}
            current={current}
            open={tocOpen}
            setOpen={setTocOpen}
          />
        ) : null}

        <div ref={content}>
          <NoteContent ref={body} html={note.html} onOpenImage={setImage} />
          {location && hasPractice ? <Practice note={note} location={location} /> : null}
        </div>

        <ReportLine onReport={() => setReporting({ target: targetOf({}) })} />
        <SearchTip tip={tip} />
        {location ? <Neighbors location={location} /> : null}
      </article>

      <Rail>
        <Toc toc={toc} active={active} progress={progress} />
      </Rail>
      <NotePopups {...popups} setImage={setImage} />
    </div>
  );
}

type PopupsProps = Pick<
  NoteViewState,
  | 'image'
  | 'setImage'
  | 'reporting'
  | 'setReporting'
  | 'selected'
  | 'thanks'
  | 'setThanks'
  | 'targetOf'
>;

function NotePopups({
  image,
  setImage,
  reporting,
  setReporting,
  selected,
  thanks,
  setThanks,
  targetOf,
}: PopupsProps) {
  return (
    <>
      <ImageViewer
        image={image}
        onClose={() => setImage(null)}
        onReport={(img) => {
          setImage(null);
          setReporting({
            target: targetOf({
              ...(img.section ? { section: img.section } : {}),
              ...(img.sectionTitle ? { sectionTitle: img.sectionTitle } : {}),
              figure: (img.caption || img.alt || noteStrings.imageWithoutCaption).slice(0, 300),
            }),
            category: 'image',
          });
        }}
      />
      {selected && !reporting ? (
        <SelectionReportBar onReport={() => setReporting({ target: targetOf(selected) })} />
      ) : null}
      {thanks && !selected ? <StatusToast>{sharedStrings.reportThanks}</StatusToast> : null}
      <ReportDialog
        target={reporting?.target ?? null}
        {...(reporting?.category ? { category: reporting.category } : {})}
        onClose={() => setReporting(null)}
        onSent={() => {
          setReporting(null);
          document.getSelection()?.removeAllRanges();
          setThanks(true);
        }}
      />
    </>
  );
}
