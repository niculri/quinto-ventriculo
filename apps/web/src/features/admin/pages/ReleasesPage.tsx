// «Administración» → «Publicaciones»: what the draft changes, its review list, publishing and undoing.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { paths } from '../../../shared/lib/paths';
import { ActionToast } from '../../../shared/ui/Toast';
import { AdminSectionTitle } from '../components/AdminSectionTitle';
import { LastRelease } from '../components/releases/LastRelease';
import { ReleaseBody } from '../components/releases/ReleaseBody';
import { ReleaseLog } from '../components/releases/ReleaseLog';
import { useFailedAnnouncement } from '../hooks/useAnnouncements';
import { releasesPageStrings } from './strings/ReleasesPage.strings';

export function ReleasesPage() {
  const failed = useFailedAnnouncement();
  const navigate = useNavigate();
  const [closed, setClosed] = useState<number | null>(null);
  return (
    <>
      <AdminSectionTitle title={releasesPageStrings.title} />
      <LastRelease />
      <ReleaseBody />
      <ReleaseLog />
      {failed && closed !== failed.releaseId ? (
        <ActionToast
          action={releasesPageStrings.failed.action}
          onAction={() => void navigate(paths.adminAnnouncements)}
          closeLabel={releasesPageStrings.failed.close}
          onClose={() => setClosed(failed.releaseId)}
        >
          {releasesPageStrings.failed.text}
        </ActionToast>
      ) : null}
    </>
  );
}
