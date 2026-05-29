import { InjectionToken } from '@angular/core';
import type { Analytics } from 'firebase/analytics';
import { FirebaseApp, FirebaseOptions, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import {
  Firestore,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { FirebaseStorage, getStorage } from 'firebase/storage';

import { firebaseConfig, firebaseProjectId } from './firebase.config';

export interface FirebaseBackend {
  readonly app: FirebaseApp;
  readonly auth: Auth;
  readonly firestore: Firestore;
  readonly storage: FirebaseStorage;
  readonly analytics: Promise<Analytics | null>;
  readonly projectId: string;
}

async function initializeAnalytics(app: FirebaseApp): Promise<Analytics | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const { getAnalytics, isSupported } = await import('firebase/analytics');
    return (await isSupported()) ? getAnalytics(app) : null;
  } catch {
    return null;
  }
}

export function createFirebaseBackend(options: FirebaseOptions = firebaseConfig): FirebaseBackend {
  const app = getApps().find((candidate) => candidate.options.projectId === options.projectId) ?? initializeApp(options);
  const firestore = initializeOfflineFirestore(app);

  return {
    app,
    auth: getAuth(app),
    firestore,
    storage: getStorage(app),
    analytics: initializeAnalytics(app),
    projectId: options.projectId ?? firebaseProjectId,
  };
}

function initializeOfflineFirestore(app: FirebaseApp): Firestore {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    return getFirestore(app);
  }
}

export const firebaseBackend = createFirebaseBackend();

export const FIREBASE_BACKEND = new InjectionToken<FirebaseBackend>('Firebase backend', {
  providedIn: 'root',
  factory: () => firebaseBackend,
});
