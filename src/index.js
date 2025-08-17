// @ts-check
/// <reference lib="webworker" />

if (typeof window !== 'undefined' && typeof window?.alert === 'function'
  && typeof document !== 'undefined' && typeof document?.createElement === 'function') {
  import('./app/boot-app.js').then(({ bootApp }) => {
    bootApp();
  });
} else if (typeof WorkerGlobalScope === 'function' && self instanceof WorkerGlobalScope) {
  import('./worker/boot-worker.js').then(({ bootWorker }) => {
    bootWorker();
  });
}
