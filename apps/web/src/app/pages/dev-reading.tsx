// Development-only route: a made-up article with every block the converter makes, for looking at and the e2e tests.
import { NoteView } from '../../features/notes/components/NoteView';
import { sampleNote } from '../../features/notes/sample/sample';
import { useReadingFonts } from '../../shared/lib/readingFonts';

export default function DevReadingPage() {
  const fonts = useReadingFonts();
  if (!fonts) return null;
  // Not a note of the catalog: «Seguir» on the home page keeps the last real one.
  return <NoteView note={sampleNote} location={null} remember={false} />;
}
