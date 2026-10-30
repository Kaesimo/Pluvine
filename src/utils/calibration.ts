/**
 * Pluvine — per-recording level calibration.
 *
 * The ten recordings were captured in different places with different gain
 * staging, so the same fader value produced wildly different loudness: wind at
 * 0.35 was roughly 20 dB louder than light rain at 0.85. That is why presets
 * felt like "too much sound in one place" — the loud layers (wind, AC hum,
 * heavy rain) buried the gentle ones no matter what the mix looked like.
 *
 * These trims are measured, not guessed. `ffmpeg -af astats` over the first
 * five minutes of every runtime recording (public/sounds/*.opus) gave:
 *
 *   layer                     RMS dBFS   trim
 *   light rain                  -35.73   1.585
 *   window rain                 -36.15   1.585
 *   forest rain                 -33.57   1.585
 *   car rain                    -27.24   0.916
 *   steady rain                 -41.41   1.585
 *   heavy rain                  -22.86   0.553
 *   wind                        -17.29   0.291
 *   distant thunder             -22.78   0.549
 *   heavy thunder               -21.05   0.449
 *   AC hum                      -14.76   0.218
 *
 * Target: about -28 dBFS RMS at fader 1.0, so a fader means the same thing on
 * every channel. Boosts are capped at +4 dB (quiet recordings have high crest
 * factors; lifting them further would just make the limiter pump) and cuts at
 * -18 dB. The trim sits in front of the user fader, so the fader itself keeps
 * its plain 0..1 meaning and the stored presets stay readable.
 *
 * If a recording is ever replaced, re-measure it and update this table;
 * sounds/README.md explains the command. A missing entry means trim 1.
 */

export const LAYER_TRIM: Record<string, number> = {
  'rain-light-loop': 1.585,
  'rain-window-patter': 1.585,
  'rain-forest-loop': 1.585,
  'rain-car-glass': 0.916,
  'rain-ambient-gentle': 1.585,
  'rain-heavy-loop': 0.553,
  'wind-blowing-ambience': 0.291,
  'thunder-distant-rumble': 0.549,
  'thunder-big-rumble': 0.449,
  'mechanical-air-conditioner': 0.218,
};
