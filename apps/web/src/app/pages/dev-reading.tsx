import { NoteView } from '../../features/notes/NotePage';
import { sampleNote } from '../../features/notes/sample/sample';
import { useReadingFonts } from '../../lib/readingFonts';

/** Development only: a made-up article with every block the converter makes, to look at and for the e2e tests. */
export default function DevReadingPage() {
  const fonts = useReadingFonts();
  if (!fonts) return null;
  // Not a note of the catalog: «Seguir» on the home page keeps the last real one.
  return <NoteView note={sampleNote} location={null} remember={false} />;
}
