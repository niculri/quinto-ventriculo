// The courses turned off in «Sitio»: the edit in progress, whether it differs from what is saved, and saving it.
import { useState } from 'react';
import type { SiteSettingsView } from '@qv/schema/http';
import { useSetSiteSettings } from './useSiteSettings';

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

export function useCourseSwitches(settings: SiteSettingsView) {
  const save = useSetSiteSettings();
  const [edited, setEdited] = useState<readonly string[] | null>(null);
  const kept = settings.hiddenCourses;
  const hidden = edited ?? kept;
  const dirty = edited !== null && !sameIds(edited, kept);
  return {
    hidden,
    dirty,
    saved: save.isSuccess && !dirty,
    saving: save.isPending,
    failed: save.isError,
    set: (id: string, on: boolean) => {
      save.reset();
      setEdited((current) => {
        const rest = (current ?? kept).filter((x) => x !== id);
        return on ? rest : [...rest, id];
      });
    },
    save: () => save.mutate({ hiddenCourses: [...hidden] }, { onSuccess: () => setEdited(null) }),
  };
}
