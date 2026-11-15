// The switch that shows the whole site with the draft, as the students will see it.
import { Switch } from '../../../../shared/ui/Switch';
import { card } from '../../../../shared/ui/styles';
import { usePreview } from '../../../preview/preview';
import { releasesStrings } from '../../releases.strings';

const s = releasesStrings.preview;

export function PreviewCard() {
  const preview = usePreview();
  return (
    <section aria-labelledby="preview" className={`${card} mt-6 flex items-start gap-4 p-4 sm:p-5`}>
      <div className="min-w-0 flex-1">
        <h3 id="preview" className="font-semibold">
          {s.title}
        </h3>
        <p className="mt-1 text-sm text-muted">{s.help}</p>
      </div>
      <Switch
        label={s.toggle}
        checked={preview.active}
        disabled={!preview.available}
        onChange={(on) => (on ? preview.enter() : preview.exit())}
      />
    </section>
  );
}
