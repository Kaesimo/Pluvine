/**
 * Preset band: starting configurations as plain text buttons in one row.
 * The selected preset carries a hairline underline; saving a modified mix is
 * offered only when the live mix actually differs from the selected preset.
 */

import type { Preset } from '../types/soundscape';
import { IconClose } from './icons';

interface Props {
  presets: Preset[];
  activePresetId: string | null;
  edited: boolean;
  onSelect: (presetId: string) => void;
  onDelete: (presetId: string) => void;
  onSaveRequest: () => void;
}

export function PresetBar({
  presets,
  activePresetId,
  edited,
  onSelect,
  onDelete,
  onSaveRequest,
}: Props) {
  return (
    <section className="pl-band flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-3 sm:px-5" aria-label="Presets">
      {presets.map((preset) => (
        <span key={preset.id} className="flex items-center gap-0.5">
          <button
            type="button"
            className="pl-preset"
            aria-pressed={!edited && activePresetId === preset.id}
            onClick={() => onSelect(preset.id)}
          >
            {preset.name}
          </button>
          {preset.isCustom && (
            <button
              type="button"
              className="pl-x"
              aria-label={`Delete preset ${preset.name}`}
              title="Delete this saved mix"
              onClick={() => onDelete(preset.id)}
            >
              <IconClose size={10} />
            </button>
          )}
        </span>
      ))}

      {edited && (
        <button type="button" className="pl-btn pl-btn-quiet ml-auto" onClick={onSaveRequest}>
          Save mix…
        </button>
      )}
    </section>
  );
}
