// The account menu of the top bar: theme, options, administration, help and signing out.
import * as Menu from '@radix-ui/react-dropdown-menu';
import { paths } from '../../../shared/lib/paths';
import { CircleHelp, LogOut, Settings, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { useIsAdmin } from '../../admin';
import { useSession, useUser } from '../../session/context';
import { ThemePicker } from '../../../shared/ui/ThemePicker';
import { MenuRoot } from '../../../shared/ui/MenuRoot';
import { isAnswerScreen } from '../../../shared/ui/answerScreen';
import { SwitchTrack } from '../../../shared/ui/Switch';
import { firstName } from '../../../shared/lib/firstName';
import { initials } from '../../../shared/lib/initials';
import { useAdminMode } from '../../adminMode/adminMode';
import { userMenuStrings } from './strings/UserMenu.strings';
import { sectionBranchesStrings } from './strings/SectionBranches.strings';
import { siteFooterStrings } from './strings/SiteFooter.strings';

function Avatar({
  name,
  email,
  avatar,
}: {
  name: string | null;
  email: string;
  avatar: string | null;
}) {
  return avatar ? (
    <img
      src={avatar}
      alt=""
      referrerPolicy="no-referrer"
      className="size-8 rounded-full object-cover"
    />
  ) : (
    // The initials drawn by CSS: they are a picture of the person, and the name already says who it is.
    <span
      aria-hidden="true"
      data-initials={initials(name, email)}
      className="flex size-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white before:content-[attr(data-initials)] dark:text-[#0a1316]"
    />
  );
}

export function UserMenu() {
  const user = useUser();
  const { signOut } = useSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isAdmin = useIsAdmin();
  const mode = useAdminMode();
  const showMode = mode.available && (isAdmin.data === true || mode.active);
  const first = firstName(user.name);
  const item =
    'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-surface-2';

  return (
    <MenuRoot closeOnly={isAnswerScreen(pathname)}>
      <Menu.Trigger
        aria-label={first ? userMenuStrings.accountOf(first) : userMenuStrings.account}
        className="flex items-center gap-2.5 rounded-full py-0.5 pr-0.5 pl-3 text-sm font-medium text-ink ring-offset-2 ring-offset-bg transition hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-brand max-sm:pl-0.5"
      >
        {first ? (
          <span className="hidden max-w-[12rem] truncate sm:block">
            {userMenuStrings.hello(first)}
          </span>
        ) : null}
        <Avatar name={user.name} email={user.email} avatar={user.avatar} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-soft"
        >
          <div className="px-2.5 pt-1.5 pb-2.5">
            <p className="truncate text-sm font-semibold text-ink">
              {user.name ?? userMenuStrings.account}
            </p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <div className="px-2.5 pb-2">
            <ThemePicker />
          </div>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Item className={item} onSelect={() => void navigate(paths.settings)}>
            <Settings className="size-4 text-muted" aria-hidden="true" />{' '}
            {sectionBranchesStrings.settings}
          </Menu.Item>
          {isAdmin.data === true ? (
            <Menu.Item className={item} onSelect={() => void navigate(paths.admin)}>
              <ShieldCheck className="size-4 text-muted" aria-hidden="true" />{' '}
              {sectionBranchesStrings.admin}
            </Menu.Item>
          ) : null}
          {showMode ? (
            <Menu.CheckboxItem
              checked={mode.active}
              onCheckedChange={mode.set}
              className={`${item} justify-between gap-3`}
            >
              <span className="min-w-0">
                <span className="block">{userMenuStrings.mode.label}</span>
                <span className="block text-xs text-muted">
                  {mode.active ? userMenuStrings.mode.on : userMenuStrings.mode.off}
                </span>
              </span>
              <SwitchTrack checked={mode.active} />
            </Menu.CheckboxItem>
          ) : null}
          <Menu.Item className={item} onSelect={() => void navigate(paths.help)}>
            <CircleHelp className="size-4 text-muted" aria-hidden="true" /> {siteFooterStrings.help}
          </Menu.Item>
          <Menu.Item
            className={item}
            onSelect={() => void signOut().then(() => navigate(paths.landing()))}
          >
            <LogOut className="size-4 text-muted" aria-hidden="true" /> {userMenuStrings.signOut}
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </MenuRoot>
  );
}
