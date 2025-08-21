// @ts-check

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   vendor: string,
 *   size: string,
 *   slashCommand: string,
 *   description: string,
 *   downloads?: number,
 *   pipeline_tag?: string
 *   requiresAuth?: boolean
 * }} ModelInfo
 */

/**
 * Cache for fetched models to avoid repeated API calls
 */
let modelCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Size thresholds for mobile capability (in billions of parameters)
 */
const MOBILE_SIZE_THRESHOLD = 15; // Models under 15B are considered mobile-capable

/**
 * Fetch models from Hugging Face Hub with transformers.js compatibility
 * @returns {Promise<ModelInfo[]>}
 */
export async function fetchBrowserModels() {
  // Check cache first
  const now = Date.now();
  if (modelCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return modelCache;
  }

  try {
    console.log('Fetching transformers.js compatible models from Hugging Face Hub...');
    
    // Fetch models with transformers.js library tag, sorted by downloads
    const response = await fetch(
      // full=true returns cardData/private/gated so we can detect auth reliably
      'https://huggingface.co/api/models?library=transformers.js&sort=downloads&direction=-1&limit=100&full=true'
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const rawModels = await response.json();
    console.log(`Found ${rawModels.length} transformers.js models`);
    
    // Filter and process models
    const processedModels = rawModels
      .filter(isModelChatCapable)
      .map(processModelData)
      .filter(Boolean) // Remove any null results
      .slice(0, 20); // Limit to top 20 models
    
    console.log(`Filtered to ${processedModels.length} mobile-capable models`);
    
    // Cache the results
    modelCache = processedModels;
    cacheTimestamp = now;
    
    return processedModels;
  } catch (error) {
    console.error('Failed to fetch models from Hugging Face Hub:', error);
    
    // Return fallback models if API fails
    return getFallbackModels();
  }
}

/**
 * Check if a model is suitable for mobile/browser use
 * @param {any} model - Raw model data from HF API
 * @returns {boolean}
 */
function isModelChatCapable(model) {
  // Skip if no model ID
  if (!model.id) return false;
  
  // Estimate model size from various indicators
  const sizeEstimate = estimateModelSize(model);
  
  // Skip models that are too large
  if (sizeEstimate > MOBILE_SIZE_THRESHOLD) {
    return false;
  }
  
  // Only allow chat/generative pipelines
  const allowedPipelines = ['text-generation', 'text2text-generation'];
  const hasAllowedPipeline = model.pipeline_tag && allowedPipelines.includes(model.pipeline_tag);
  
  // Skip certain model types that are less suitable for general text generation
  const excludePatterns = [
    /whisper/i,
    /vision/i,
    /image/i,
    /audio/i,
    /translation/i,
    /classification/i,
    /embedding/i,
    /bert/i,
    /mpnet/i,
    /electra/i,
    /roberta/i,
    /minilm/i,
    /sentence-transformers/i
  ];
  
  const isExcluded = excludePatterns.some(pattern => pattern.test(model.id));
  
  return hasAllowedPipeline && !isExcluded;
}

/**
 * Estimate model size in billions of parameters from various indicators
 * @param {any} model - Raw model data from HF API
 * @returns {number}
 */
function estimateModelSize(model) {
  const modelId = model.id.toLowerCase();
  
  // Extract size from model name patterns
  const sizePatterns = [
    /(\d+\.?\d*)b\b/i,    // "7b", "3.8b", etc.
    /(\d+)m\b/i,          // "125m" -> convert to billions
    /(\d+)k\b/i           // "125k" -> very small
  ];
  
  for (const pattern of sizePatterns) {
    const match = modelId.match(pattern);
    if (match) {
      const size = parseFloat(match[1]);
      if (pattern.source.includes('m\\b')) {
        return size / 1000; // Convert millions to billions
      } else if (pattern.source.includes('k\\b')) {
        return size / 1000000; // Convert thousands to billions
      } else {
        return size; // Already in billions
      }
    }
  }
  
  // If no size found in name, make conservative estimates based on model family
  if (modelId.includes('gpt2') || modelId.includes('distil')) return 0.2;
  if (modelId.includes('phi-1') || modelId.includes('phi1')) return 1.3;
  if (modelId.includes('phi-3') || modelId.includes('phi3')) return 3.8;
  if (modelId.includes('mistral')) return 7;
  if (modelId.includes('qwen') && modelId.includes('3b')) return 3;
  if (modelId.includes('qwen') && modelId.includes('7b')) return 7;
  if (modelId.includes('llama') && modelId.includes('7b')) return 7;
  if (modelId.includes('llama') && modelId.includes('13b')) return 13;
  
  // Default conservative estimate for unknown models
  return 5;
}

/**
 * Process raw model data into our ModelInfo format
 * @param {any} model - Raw model data from HF API
 * @returns {ModelInfo | null}
 */
function processModelData(model) {
  try {
    const size = estimateModelSize(model);
    const vendor = extractVendor(model.id);
    const name = extractModelName(model.id);
    const slashCommand = generateSlashCommand(model.id);
    const requiresAuth = Boolean(model.gated || model.private || (model.cardData && (model.cardData.gated || model.cardData.private)));
    
    return {
      id: model.id,
      name,
      vendor,
      size: formatSize(size),
      slashCommand,
      description: `${formatSize(size)} parameter model from ${vendor}`,
      downloads: model.downloads || 0,
      pipeline_tag: model.pipeline_tag,
      requiresAuth
    };
  } catch (error) {
    console.warn(`Failed to process model ${model.id}:`, error);
    return null;
  }
}

/**
 * Extract vendor/organization from model ID
 * @param {string} modelId
 * @returns {string}
 */
function extractVendor(modelId) {
  const parts = modelId.split('/');
  if (parts.length > 1) {
    const org = parts[0];
    // Map known organizations to friendly names
    const orgMap = {
      'microsoft': 'Microsoft',
      'mistralai': 'Mistral AI',
      'Qwen': 'Alibaba',
      'google': 'Google',
      'openai-community': 'OpenAI',
      'Xenova': 'Xenova',
      'meta-llama': 'Meta',
      'onnx-community': 'ONNX Community'
    };
    return orgMap[org] || org;
  }
  return 'Unknown';
}

/**
 * Extract clean model name from full ID
 * @param {string} modelId
 * @returns {string}
 */
function extractModelName(modelId) {
  const parts = modelId.split('/');
  const name = parts[parts.length - 1];
  
  // Clean up common patterns
  return name
    .replace(/-ONNX$/, '')
    .replace(/-onnx$/, '')
    .replace(/-instruct$/, '')
    .replace(/-chat$/, '')
    .replace(/^Xenova-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase()); // Title case
}

/**
 * Generate a slash command from model ID
 * @param {string} modelId
 * @returns {string}
 */
function generateSlashCommand(modelId) {
  const name = (modelId.split('/').pop() || modelId).toLowerCase();
  
  // Create short, memorable commands
  if (name.includes('phi-3') || name.includes('phi3')) return 'phi3';
  if (name.includes('phi-1') || name.includes('phi1')) return 'phi1';
  if (name.includes('mistral')) return 'mistral';
  if (name.includes('qwen') && name.includes('3b')) return 'qwen3b';
  if (name.includes('qwen') && name.includes('7b')) return 'qwen7b';
  if (name.includes('qwen')) return 'qwen';
  if (name.includes('gpt2')) return 'gpt2';
  if (name.includes('distilgpt2')) return 'distilgpt2';
  if (name.includes('llama')) return 'llama';
  if (name.includes('gemma')) return 'gemma';
  if (name.includes('flan')) return 'flant5';
  
  // Generate from first few characters of model name
  const clean = name.replace(/[^a-z0-9]/g, '');
  return clean.substring(0, 8);
}

/**
 * Format size number for display
 * @param {number} size
 * @returns {string}
 */
function formatSize(size) {
  if (size < 1) {
    return `${Math.round(size * 1000)}M`;
  } else {
    return `${size.toFixed(1)}B`;
  }
}

/**
 * Get fallback models if API fetch fails
 * @returns {ModelInfo[]}
 */
function getFallbackModels() {
  return [
    {
      id: 'microsoft/Phi-3-mini-4k-instruct',
      name: 'Phi-3 Mini',
      vendor: 'Microsoft',
      size: '3.8B',
      slashCommand: 'phi3',
  description: 'Exceptional performance-to-size ratio, strong in reasoning and math',
  requiresAuth: false
    },
    {
      id: 'mistralai/Mistral-7B-v0.1',
      name: 'Mistral 7B',
      vendor: 'Mistral AI', 
      size: '7.3B',
      slashCommand: 'mistral',
  description: 'Highly efficient, outperforms larger models with innovative architecture',
  requiresAuth: false
    },
    {
      id: 'Xenova/distilgpt2',
      name: 'DistilGPT-2',
      vendor: 'Xenova',
      size: '82M',
      slashCommand: 'distilgpt2',
  description: 'Extremely fast and lightweight for quick prototyping',
  requiresAuth: false
    },
    {
      id: 'openai-community/gpt2',
      name: 'GPT-2',
      vendor: 'OpenAI',
      size: '124M',
      slashCommand: 'gpt2',
  description: 'Foundational model for reliable lightweight text generation',
  requiresAuth: false
    }
  ];
}

/**
 * Get model info by slash command
 * @param {string} command - The slash command (e.g., 'phi3')
 * @param {ModelInfo[]} [models] - Optional pre-fetched models list
 * @returns {Promise<ModelInfo | undefined>}
 */
export async function getModelByCommand(command, models) {
  const modelList = models || await fetchBrowserModels();
  return modelList.find(model => model.slashCommand === command);
}

/**
 * Get model info by ID
 * @param {string} id - The model ID
 * @param {ModelInfo[]} [models] - Optional pre-fetched models list  
 * @returns {Promise<ModelInfo | undefined>}
 */
export async function getModelById(id, models) {
  const modelList = models || await fetchBrowserModels();
  return modelList.find(model => model.id === id);
}

/**
 * Get all available slash commands
 * @param {ModelInfo[]} [models] - Optional pre-fetched models list
 * @returns {Promise<string[]>}
 */
export async function getAllSlashCommands(models) {
  const modelList = models || await fetchBrowserModels();
  return modelList.map(model => model.slashCommand);
}
