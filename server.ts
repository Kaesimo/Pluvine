import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Modality } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Initialize GoogleGenAI server-side with telemetry User-Agent
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Lyria Soundscape Generation Endpoint
app.post('/api/soundscapes/lyria-generate', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(200).json({
        success: false,
        available: false,
        message: 'API key not configured for generative music layer.',
      });
    }

    const soundscapePrompt = prompt || 
      'Deep calming ambient nocturnal pad with warm analog synth tones, gentle rain acoustics, meditative 432Hz harmonic resonance.';

    // Attempt generation with lyria-3-clip-preview
    const responseStream = await ai.models.generateContentStream({
      model: 'lyria-3-clip-preview',
      contents: soundscapePrompt,
      config: {
        responseModalities: [Modality.AUDIO],
      },
    });

    let audioBase64 = '';
    let mimeType = 'audio/wav';

    for await (const chunk of responseStream) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) continue;
      for (const part of parts) {
        if (part.inlineData?.data) {
          if (!audioBase64 && part.inlineData.mimeType) {
            mimeType = part.inlineData.mimeType;
          }
          audioBase64 += part.inlineData.data;
        }
      }
    }

    if (!audioBase64) {
      return res.status(200).json({
        success: false,
        available: false,
        message: 'No audio returned from generative stream.',
      });
    }

    return res.json({
      success: true,
      available: true,
      audioBase64,
      mimeType,
    });
  } catch (error: any) {
    console.warn('Lyria music generation note:', error?.message || error);
    // Graceful response without raw errors or stack traces
    return res.status(200).json({
      success: false,
      available: false,
      message: 'Generative musical texture unavailable. Procedural harmonic layer active.',
    });
  }
});

// AI Soundscape Architect: Creates personalized soundscape recipes & sleep advice
app.post('/api/soundscapes/ai-designer', async (req, res) => {
  try {
    const { userNeed, mode } = req.body;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `You are an expert acoustic sleep and neuro-acoustic focus engineer.
The user wants a customized soundscape for: "${userNeed || 'deep sleep with rain and thunder'}"
Mode: "${mode || 'sleep'}" (sleep, deep_focus, power_nap, relaxation).

Return a valid JSON object matching this structure:
{
  "title": "Short evocative title (e.g. Midnight Hearth & Highland Storm)",
  "description": "2 sentences describing why this acoustic profile calms the nervous system and aids drift-off.",
  "mixer": {
    "rainVolume": number 0.0 to 1.0,
    "rainType": "soft" | "medium" | "heavy" | "window",
    "thunderVolume": number 0.0 to 1.0,
    "thunderFrequency": "rare" | "occasional" | "frequent",
    "windVolume": number 0.0 to 1.0,
    "fireVolume": number 0.0 to 1.0,
    "binauralVolume": number 0.0 to 1.0,
    "binauralBand": "delta" | "theta" | "alpha" | "off",
    "ambientDroneVolume": number 0.0 to 1.0
  },
  "timer": {
    "recommendedMinutes": number (e.g. 45, 60, 90, 480),
    "fadeDurationMinutes": number (e.g. 5, 10, 15, 30),
    "fadeRationale": "Brief explanation of how the fade-out curve prevents sleep disruption."
  },
  "suggestedLyriaPrompt": "Optimized prompt for Lyria 3 to generate accompanying harmonic ambient pads (e.g. 'Warm atmospheric sleep pad in C minor with gentle acoustic textures and distant storm drone')",
  "bedtimeMantra": "A brief calming 1-sentence thought to release daytime stress as eyes close."
}
IMPORTANT: Output pure JSON only without extra conversational text.`,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ success: true, recipe: parsed });
  } catch (error: any) {
    console.error('AI designer error:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to design soundscape.',
    });
  }
});

// Bedtime Sleep Meditation TTS Whisper
app.post('/api/soundscapes/bedtime-story-tts', async (req, res) => {
  try {
    const { theme = 'sleep' } = req.body;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: theme === 'focus' 
                ? 'Take a deep, centering breath. Let external distractions melt away into the rhythm of the rain. Your mind is calm, clear, and effortlessly focused.'
                : 'Allow your shoulders to drop and release all tension from your day. Listen to the steady fall of the rain and distant, comforting rumble of thunder. You are safe, warm, and ready to drift gently into deep, restorative sleep.',
              speechMetadata: {
                style: 'Gentle, soothing, whispered bedtime meditation guide with warm, slow cadence',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      return res.status(500).json({ error: 'Failed to generate voice audio' });
    }

    return res.json({
      success: true,
      audioBase64: base64Audio,
      mimeType: 'audio/wav',
    });
  } catch (error: any) {
    console.error('TTS error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to generate TTS' });
  }
});

// Vite middleware in dev or static files in production
if (process.env.NODE_ENV !== 'production') {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`Nocturne server running on http://localhost:${port}`);
});
