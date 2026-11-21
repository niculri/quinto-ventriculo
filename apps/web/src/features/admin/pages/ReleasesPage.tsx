// «Administración» → «Publicaciones»: what the draft changes, its review list, publishing and undoing.
import { AdminSectionTitle } from '../components/AdminSectionTitle';
import { LastRelease } from '../components/releases/LastRelease';
import { ReleaseBody } from '../components/releases/ReleaseBody';
import { ReleaseLog } from '../components/releases/ReleaseLog';
import { releasesStrings } from '../releases.strings';

export function ReleasesPage() {
  return (
    <>
      <AdminSectionTitle title={releasesStrings.title} />
      <LastRelease />
      <ReleaseBody />
      <ReleaseLog />
    </>
  );
}
