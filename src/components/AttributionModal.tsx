import React from 'react';
import { X, ExternalLink, ShieldCheck } from 'lucide-react';

interface AttributionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ATTRIBUTIONS = [
  {
    name: 'Rain against the window',
    artist: 'cori',
    license: 'Public Domain (CC0 equivalent)',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Rain_against_the_window.ogg',
    description: 'Authentic audio of rain droplets pattering against a window pane.',
    commercial: 'Permitted',
  },
  {
    name: 'Rain on a veranda and thunder',
    artist: 'ezwa',
    license: 'Public Domain (CC0 equivalent)',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Rain_on_a_veranda_and_t.ogg',
    description: 'Natural recording of rainfall drumming on a veranda and roof canopy.',
    commercial: 'Permitted',
  },
  {
    name: 'Heavy Rain in Summer',
    artist: 'Fiver, der Hellseher',
    license: 'Creative Commons Attribution-ShareAlike 3.0 (CC BY-SA 3.0)',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Heavy_Rain_in_Summer.ogg',
    description: 'Torrential summer precipitation and open-air downpour.',
    commercial: 'Permitted with attribution & share-alike',
  },
  {
    name: 'Sound of light rainfall',
    artist: 'Mijesty',
    license: 'Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0)',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Sound_of_light_rainfall.ogg',
    description: 'Delicate, soft rain mist and calming droplet textures.',
    commercial: 'Permitted with attribution & share-alike',
  },
  {
    name: 'Sound of rain',
    artist: 'Effib',
    license: 'Creative Commons Attribution-ShareAlike 3.0 (CC BY-SA 3.0)',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Sound_of_rain.ogg',
    description: 'Continuous steady rainfall engineered for masking.',
    commercial: 'Permitted with attribution & share-alike',
  },
  {
    name: 'Rain and thunder',
    artist: 'Caesar',
    license: 'Public Domain',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Rain_and_thunder.ogg',
    description: 'Authentic nocturnal rainstorm with distant rolling thunder.',
    commercial: 'Permitted',
  },
  {
    name: 'Thunder',
    artist: 'Bidgee',
    license: 'Creative Commons Attribution 3.0 (CC BY 3.0)',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Thunder.ogg',
    description: 'Deep distant thunder strike recorded in Darwin, Australia.',
    commercial: 'Permitted with attribution',
  },
  {
    name: 'Wind (#0595)',
    artist: 'BigSoundBank.com',
    license: 'Creative Commons 0 (Public Domain)',
    sourceUrl: 'https://bigsoundbank.com/detail-0595-wind.html',
    description: 'Natural ambient wind breeze rustling through atmosphere.',
    commercial: 'Permitted without conditions',
  },
];

export const AttributionModal: React.FC<AttributionModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h2 className="text-base font-semibold text-slate-100">
              Audio Recording Licenses & Attribution
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
          Rainfocus uses real, licensed nature field recordings rather than artificial synthetic noise. All assets are legally verified under Creative Commons and Public Domain licenses.
        </p>

        {/* List of Attributions */}
        <div className="space-y-3">
          {ATTRIBUTIONS.map((item) => (
            <div key={item.name} className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-semibold text-slate-200">{item.name}</span>
                <span className="text-[11px] font-mono text-emerald-400/90">{item.license}</span>
              </div>
              <p className="text-slate-400 text-[11px] mb-2">{item.description}</p>
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-900">
                <span>Creator: <strong className="text-slate-300 font-medium">{item.artist}</strong></span>
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <span>Source</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 pt-4 border-t border-slate-800 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
