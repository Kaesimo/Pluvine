/**
 * Save-mix dialog: name only. Saving under an existing custom name updates
 * that mix instead of creating a duplicate (handled by the caller).
 */

import { useEffect, useRef, useState } from 'react';

interface Props {
  onSave: (name: string) => void;
  onClose: () => void;
}

export function SaveMixDialog({ onSave, onClose }: Props) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="pl-pop w-full max-w-[340px] p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pl-save-title"
      >
        <h2 id="pl-save-title" className="text-[14px] font-semibold tracking-tight">
          Save this mix
        </h2>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (trimmed) onSave(trimmed);
          }}
        >
          <label
            htmlFor="pl-save-name"
            className="mt-4 block text-[11.5px] font-medium text-dim"
          >
            Name
          </label>
          <input
            id="pl-save-name"
            ref={inputRef}
            className="pl-input mt-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Night window"
            maxLength={40}
            autoComplete="off"
          />
          <p className="mt-2 text-[11px] leading-snug text-faint">
            Using an existing name updates that mix.
          </p>

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="pl-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="pl-btn pl-btn-solid">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
