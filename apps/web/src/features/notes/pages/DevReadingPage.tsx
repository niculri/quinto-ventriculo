// Development-only route: a made-up article with every block the converter makes, for looking at and the e2e tests.
import { NoteView } from '../components/NoteView';
import { sampleNote } from '../sample/sample';
import { useReadingFonts } from '../../../shared/lib/useReadingFonts';

export function DevReadingPage() {
  const fonts = useReadingFonts('article');
  if (!fonts) return null;
  // Not a note of the catalog: «Seguir» on the home page keeps the last real one.
  return <NoteView note={sampleNote} location={null} remember={false} />;
}
