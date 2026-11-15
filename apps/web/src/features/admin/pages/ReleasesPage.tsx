// «Administración» → «Publicaciones»: the draft's preview, what it changes, its review list, publishing and undoing.
import { AdminSectionTitle } from '../components/AdminSectionTitle';
import { LastRelease } from '../components/releases/LastRelease';
import { PreviewCard } from '../components/releases/PreviewCard';
import { ReleaseBody } from '../components/releases/ReleaseBody';
import { ReleaseLog } from '../components/releases/ReleaseLog';
import { releasesStrings } from '../releases.strings';

export function ReleasesPage() {
  return (
    <>
      <AdminSectionTitle title={releasesStrings.title} />
      <PreviewCard />
      <LastRelease />
      <ReleaseBody />
      <ReleaseLog />
    </>
  );
}
