import * as Menu from '@radix-ui/react-dropdown-menu';
import { paths } from '../app/paths';
import { CircleHelp, LogOut, Settings, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { useIsAdmin } from '../features/admin/queries';
import { useSession, useUser } from '../features/session/context';
import { ThemePicker } from './ThemePicker';
import { MenuRoot } from './MenuRoot';
import { isAnswerScreen } from './answerScreen';

export function initials(name: string | null, email: string): string {
  const base = name?.trim() || email.split('@')[0] || '?';
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  return (
    ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase() ||
    '?'
  );
}

export function Avatar({
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
  const item =
    'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-surface-2';

  return (
    <MenuRoot closeOnly={isAnswerScreen(pathname)}>
      <Menu.Trigger
        aria-label={user.name ? `${user.name}, tu cuenta` : 'Tu cuenta'}
        className="flex items-center gap-2.5 rounded-full py-0.5 pr-0.5 pl-3 text-sm font-medium text-ink ring-offset-2 ring-offset-bg transition hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-brand max-sm:pl-0.5"
      >
        {/* The name to the left of the photo; on the phone only the photo fits. */}
        {user.name ? (
          <span className="hidden max-w-[14rem] truncate sm:block">{user.name}</span>
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
            <p className="truncate text-sm font-semibold text-ink">{user.name ?? 'Tu cuenta'}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <div className="px-2.5 pb-2">
            <ThemePicker />
          </div>
          <Menu.Separator className="my-1 h-px bg-border" />
          {/* «Opciones»: its page has the menu of its sections. */}
          <Menu.Item className={item} onSelect={() => navigate(paths.settings)}>
            <Settings className="size-4 text-muted" aria-hidden="true" /> Opciones
          </Menu.Item>
          {/* Step 2.10: its own page, only for an administrator (the menu opens after the answer is known). */}
          {isAdmin.data === true ? (
            <Menu.Item className={item} onSelect={() => navigate(paths.admin)}>
              <ShieldCheck className="size-4 text-muted" aria-hidden="true" /> Administración
            </Menu.Item>
          ) : null}
          <Menu.Item className={item} onSelect={() => navigate(paths.help)}>
            <CircleHelp className="size-4 text-muted" aria-hidden="true" /> Ayuda
          </Menu.Item>
          <Menu.Item
            className={item}
            onSelect={() => void signOut().then(() => navigate(paths.landing()))}
          >
            <LogOut className="size-4 text-muted" aria-hidden="true" /> Cerrar sesión
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </MenuRoot>
  );
}
