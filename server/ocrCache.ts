import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface CachedSlipData {
  customer_name: string;
  paid_amount: number;
  currency: 'USD' | 'KHR';
  phone_number?: string;
  bank_name?: string;
  trans_ref?: string;
  trans_date?: string;
  basket_no?: number | string;
  remarks?: string;
  fraud_suspected?: boolean;
  fraud_reasons?: string[];
  is_bank_slip?: boolean;
  cached_at: string;
}

const OCR_CACHE_PATH = path.join(process.cwd(), 'server', 'ocr_cache.json');
const ocrMemoryCache = new Map<string, CachedSlipData>();

let isDirty = false;
let saveTimer: NodeJS.Timeout | null = null;

export function initOcrCache() {
  try {
    if (fs.existsSync(OCR_CACHE_PATH)) {
      const raw = fs.readFileSync(OCR_CACHE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        for (const [key, val] of Object.entries(parsed)) {
          if (val && typeof val === 'object') {
            ocrMemoryCache.set(key, val as CachedSlipData);
          }
        }
        console.log(`[OCR Cache] Loaded ${ocrMemoryCache.size} cached slip OCR results from disk.`);
      }
    }
  } catch (err) {
    console.error('[OCR Cache] Failed to load ocr_cache.json:', err);
  }
}

export function computeImageHash(buffer: Buffer): string {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

export function getCachedOcr(keyOrHash: string): CachedSlipData | null {
  if (!keyOrHash) return null;
  const hit = ocrMemoryCache.get(keyOrHash);
  if (hit) {
    console.log(`[OCR Cache HIT] Reused cached slip OCR for key/hash: ${keyOrHash.substring(0, 32)} (0 AI Tokens Spent)`);
    return hit;
  }
  return null;
}

export function setCachedOcr(keyOrHash: string, data: Omit<CachedSlipData, 'cached_at'>, secondaryKeys: string[] = []) {
  if (!keyOrHash) return;
  const entry: CachedSlipData = {
    ...data,
    cached_at: new Date().toISOString()
  };

  ocrMemoryCache.set(keyOrHash, entry);
  for (const k of secondaryKeys) {
    if (k) {
      ocrMemoryCache.set(k, entry);
    }
  }

  isDirty = true;
  scheduleCacheDiskSave();
}

function scheduleCacheDiskSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveOcrCacheToDisk();
  }, 1000);
}

export function saveOcrCacheToDisk(forceSync = false) {
  if (!isDirty && !forceSync) return;
  try {
    const obj: Record<string, CachedSlipData> = {};
    for (const [k, v] of ocrMemoryCache.entries()) {
      obj[k] = v;
    }
    const jsonStr = JSON.stringify(obj, null, 2);
    if (forceSync) {
      fs.writeFileSync(OCR_CACHE_PATH, jsonStr, 'utf8');
    } else {
      fs.promises.writeFile(OCR_CACHE_PATH, jsonStr, 'utf8').catch(err => {
        console.error('[OCR Cache] Error saving to disk:', err);
      });
    }
    isDirty = false;
  } catch (err) {
    console.error('[OCR Cache] Failed to write ocr_cache.json:', err);
  }
}

// Initialize on module load
initOcrCache();
