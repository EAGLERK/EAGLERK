/**
 * Switches for parts of the app that are built but hidden.
 *
 * Investing (the Investments tab, net worth, "where should new money go", and the Plan tab's advice on where to
 * invest) is off for now. Nothing is deleted: saved holdings stay in the user's data and the code is intact.
 * To bring it back, build or run with VITE_FEATURE_INVESTING=1.
 */
export const features = {
  investing: import.meta.env.VITE_FEATURE_INVESTING === '1',
  /** The voice assistant is on. Build or run with VITE_FEATURE_VOICE=0 to take the microphone out of the header and the tour. */
  voice: import.meta.env.VITE_FEATURE_VOICE !== '0',
  /** Mitra may ask an AI model to read sentences its own rules do not know. Needs the `assistant` Edge Function deployed and VITE_VOICE_AI=1. */
  voiceAI: import.meta.env.VITE_VOICE_AI === '1',
} as const;
