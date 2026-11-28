// The frame of «Opciones»: the menu of its sections by group (tabs on top on the phone) and the open section.
import type { ReactNode } from 'react';
import { paths } from '../../../shared/lib/paths';
import { Breadcrumbs } from '../../../shared/ui/Breadcrumbs';
import { SectionMenu } from '../../../shared/ui/SectionMenu';
import { useSettingsGroups } from '../hooks/useSettingsGroups';
import { page } from '../../../shared/ui/styles';
import { settingsLayoutStrings as s } from './strings/SettingsLayout.strings';

/** On wide screens the site's menu (features/nav/components/AppNav.tsx) has the sections, so this one goes away. */
export function SettingsLayout({ children }: { children: ReactNode }) {
  const groups = useSettingsGroups();
  return (
    <div className={page}>
      <Breadcrumbs items={[{ label: s.home, to: paths.home }, { label: s.title }]} />
      <h1 className="font-serif text-3xl font-semibold tracking-tight">{s.title}</h1>
      <div className="mt-6 flex flex-col gap-6 md:flex-row md:gap-10">
        <SectionMenu label={s.sections} groups={groups} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
