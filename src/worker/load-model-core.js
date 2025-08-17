// @ts-check

import { pipeline } from '@huggingface/transformers';

/**
 * @param {{
 *  modelName: string,
 *  device: import('@huggingface/transformers').DeviceType,
 *  onProgress?: import('@huggingface/transformers').ProgressCallback
 * }} _
 */
export async function loadModelCore({
  modelName,
  device,
  onProgress
}) {
  // Create a text-generation pipeline. Depending on the model this may
  // perform downloads of model weights; the library should report progress
  // via its own callbacks if available.
  const pipe = await pipeline(
    'text-generation',
    modelName,
    {
      device,
      progress_callback: (progress) => {
        if (onProgress) onProgress(progress);
      }
    });

  return pipe;
}