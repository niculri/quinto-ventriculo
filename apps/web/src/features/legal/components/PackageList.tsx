// The list of third-party packages of /licenses, each with its version, license and whether the web or the server
// uses it.
import { useThirdParty } from '../hooks/useThirdParty';
import { legalStrings } from '../strings';

const s = legalStrings.packages;

export function PackageList() {
  const packages = useThirdParty();
  if (packages === 'loading') return <p className="text-muted">{s.loading}</p>;
  if (packages === 'error') return <p className="text-muted">{s.failed}</p>;
  return (
    <ul className="!list-none !pl-0 text-sm" aria-label={s.label}>
      {packages.map((p) => (
        <li
          key={`${p.name}@${p.version}`}
          className="flex flex-wrap justify-between gap-x-4 border-b border-border py-1.5"
        >
          <span>
            {p.repository ? (
              <a href={p.repository} className="hover:underline">
                {p.name}
              </a>
            ) : (
              p.name
            )}{' '}
            <span className="text-muted">{p.version}</span>
          </span>
          <span className="text-muted">
            {p.license}
            {' ·'} {p.usedBy.map((u) => (u === 'web' ? s.web : s.server)).join(s.and)}
          </span>
        </li>
      ))}
    </ul>
  );
}
