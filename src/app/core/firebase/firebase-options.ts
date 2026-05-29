import { FirebaseOptions } from 'firebase/app';

const requiredKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_APP_ID',
] as const;

export function getFirebaseOptions(env: Record<string, string | undefined>): FirebaseOptions {
  const missing = requiredKeys.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing Firebase environment values: ${missing.join(', ')}`);
  }

  return {
    apiKey: env['VITE_FIREBASE_API_KEY'],
    authDomain: env['VITE_FIREBASE_AUTH_DOMAIN'],
    projectId: env['VITE_FIREBASE_PROJECT_ID'],
    storageBucket: env['VITE_FIREBASE_STORAGE_BUCKET'],
    appId: env['VITE_FIREBASE_APP_ID'],
    messagingSenderId: env['VITE_FIREBASE_MESSAGING_SENDER_ID'],
  };
}
