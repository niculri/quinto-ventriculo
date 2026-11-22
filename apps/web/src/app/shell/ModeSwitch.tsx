// The switch of the top bar between the admin mode and the student mode, only for an administrator.
import { useEffect, useState } from 'react';
import { useIsAdmin } from '../../features/admin';
import { Switch } from '../../shared/ui/Switch';
import { Reserved } from '../../shared/ui/Reserved';
import {
  hasStoredAdminMode,
  storeAdminMode,
  useAdminMode,
} from '../../features/adminMode/adminMode';
import { appStrings } from '../strings';

const s = appStrings.mode;

/**
 * Where it goes is taken from the first paint if this browser has seen it before (the mode is remembered), so the
 * search box beside it does not move when the answer of «is it an administrator» arrives.
 */
export function ModeSwitch() {
  const isAdmin = useIsAdmin();
  const mode = useAdminMode();
  const [expected] = useState(hasStoredAdminMode);
  const admin = isAdmin.data === true || mode.active;
  useEffect(() => {
    if (mode.available && isAdmin.data === true && !hasStoredAdminMode()) {
      storeAdminMode(mode.active);
    }
  }, [mode.available, isAdmin.data, mode.active]);

  if (!mode.available || (!admin && !(expected && isAdmin.isPending))) return null;
  return (
    <label
      className={`flex flex-none items-center gap-2 text-sm ${admin ? '' : 'invisible'}`}
      title={mode.active ? s.adminHelp : s.studentHelp}
    >
      <Reserved longest={s.student} className="font-medium max-md:hidden">
        <span className={mode.active ? 'text-[#9a4a12] dark:text-accent' : 'text-muted'}>
          {mode.active ? s.admin : s.student}
        </span>
      </Reserved>
      <Switch label={s.label} checked={mode.active} onChange={mode.set} />
    </label>
  );
}
