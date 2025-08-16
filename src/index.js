// @ts-check

import { bootApp } from './app/boot-app';

if (typeof window !== 'undefined' && typeof window?.alert === 'function'
  && typeof document !== 'undefined' && typeof document?.createElement === 'function') {
  bootApp();
}
