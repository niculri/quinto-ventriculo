// What the study screen says about the connection: that it went and what is answered is kept, and that it is back
// (each for a while), and for as long as it lasts, that too much waits to take anything else.
import { useState } from 'react';
import { useTransient } from './useTransient';
import { connectionMessageStrings as s } from './strings/useConnectionMessage.strings';

export function useConnectionMessage(unsaved: number, held: boolean): string | null {
  const offline = unsaved > 0;
  const [was, setWas] = useState(false);
  const [news, setNews] = useTransient<'lost' | 'back' | null>(null);
  if (offline !== was) {
    setWas(offline);
    setNews(offline ? 'lost' : 'back');
  }
  if (held) return s.held(unsaved);
  if (news === 'lost') return s.lost;
  return news === 'back' ? s.back : null;
}
