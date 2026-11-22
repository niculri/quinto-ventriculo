// Where to go after signing in: only an internal route of the site.
import { paths } from '../../../shared/lib/paths';

// Internal routes only (no open redirects); the browser strips tabs and newlines, so «/\t/x.site» would be «//x.site».
export function safeDestination(destination: string | null | undefined): string {
  if (
    !destination ||
    !destination.startsWith('/') ||
    destination.startsWith('//') ||
    destination.includes('\\') ||
    Array.from(destination).some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)
  ) {
    return paths.home;
  }
  return destination;
}
