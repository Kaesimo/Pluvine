# Sounds

The app plays the user's own recordings — nothing here is downloaded or
generated. This folder holds the **originals** (untouched source of truth);
`npm run sounds:sync` encodes each into `public/sounds/` at 192k MP3, which
is what the app and every build serve.

Files are excluded from git (they are 0.3–1.7 GB each — far beyond GitHub's
100 MB limit). To run the app with sound, drop the recordings here with
these labels:

| file here            | mixer layer                  | plays as        |
| -------------------- | ---------------------------- | --------------- |
| `Light rain.mp3`     | `rain-light-loop`            | Light rain      |
| `Window rain.mp3`    | `rain-window-patter`         | Window rain     |
| `forest rain.mp3`    | `rain-forest-loop`           | Forest rain     |
| `car rain.mp3`       | `rain-car-glass`             | Car rain        |
| `Steady rain.mp3`    | `rain-ambient-gentle`        | Steady rain     |
| `Heavy rain.mp3`     | `rain-heavy-loop`            | Heavy rain      |
| `wind.mp3`           | `wind-blowing-ambience`      | Wind            |
| `AC hum.mp3`         | `mechanical-air-conditioner` | AC hum          |

Then:

```bash
npm run sounds:sync   # encodes originals -> public/sounds/ (192k MP3)
npm run dev
```

Without these files the app still runs: every layer falls back to its
built-in procedural voice and the mixer reports the missing recording.

The two thunder one-shots (`public/sounds/capaholiczsfx-*.mp3`) are tracked
in git and need nothing from this folder.
