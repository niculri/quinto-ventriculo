// The bell of the top bar: a dot while something is unread (no number, so the bar keeps its width), and a menu with
// the latest announcements and «Ver todas». Opening it keeps them as seen.
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Bell } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatDate } from '../../../shared/lib/dates';
import { paths } from '../../../shared/lib/paths';
import { MenuRoot } from '../../../shared/ui/MenuRoot';
import { useNews } from '../hooks/useNews';
import { isUnread } from '../model/news';
import { newsBellStrings as s } from './strings/NewsBell.strings';

const SHOWN = 5;

export function NewsBell() {
  const news = useNews();
  // What was unread when it opened stays marked while it is open, though it is already kept as seen.
  const [openedWith, setOpenedWith] = useState<string | null>(null);
  const item =
    'block cursor-pointer rounded-md px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-surface-2';
  return (
    <MenuRoot
      onOpenChange={(open) => {
        if (!open) return;
        setOpenedWith(news.seenUntil);
        news.markSeen();
      }}
    >
      <Menu.Trigger
        aria-label={news.unread.length ? s.openUnread : s.open}
        className="relative flex size-9 flex-none items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
      >
        <Bell className="size-5" aria-hidden="true" />
        <span
          aria-hidden="true"
          data-testid="news-dot"
          className={`absolute top-1.5 right-1.5 size-2.5 rounded-full bg-accent ring-2 ring-chrome ${news.unread.length ? '' : 'hidden'}`}
        />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={8}
          collisionPadding={8}
          className="z-50 w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-surface p-1.5 shadow-soft"
        >
          <Menu.Label className="px-2.5 pt-1.5 pb-2 text-sm font-semibold text-ink">
            {s.title}
          </Menu.Label>
          <BellItems news={news} openedWith={openedWith} item={item} />
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Item asChild className={`${item} font-medium text-brand`}>
            <Link to={paths.news}>{s.all}</Link>
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </MenuRoot>
  );
}

function BellItems({
  news,
  openedWith,
  item,
}: {
  news: ReturnType<typeof useNews>;
  openedWith: string | null;
  item: string;
}) {
  if (news.feed.isError) return <p className="px-2.5 py-2 text-sm text-muted">{s.failed}</p>;
  if (!news.announcements) return <p className="px-2.5 py-2 text-sm text-muted">{s.loading}</p>;
  if (!news.announcements.length) {
    return <p className="px-2.5 py-2 text-sm text-muted">{s.upToDate}</p>;
  }
  return news.announcements.slice(0, SHOWN).map((a) => (
    <Menu.Item key={a.id} asChild className={item}>
      <Link to={paths.news}>
        <span className="line-clamp-2 font-medium">{a.title}</span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          {formatDate(a.publishedAt)}
          {isUnread(a, openedWith) ? (
            <span className="rounded-full bg-accent/15 px-1.5 font-medium text-accent">
              {s.isNew}
            </span>
          ) : null}
        </span>
      </Link>
    </Menu.Item>
  ));
}
