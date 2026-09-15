/**
 * ESC/POS 80mm Thermal Printer Generator & Web Bluetooth POS Engine
 * Formats canvas/bitmap into ESC/POS binary with auto-cut commands for direct POS and RawBT.
 * 
 * Standard 80mm thermal receipt printer:
 * - Total paper roll: 80mm
 * - Printable width: 72mm (576 dots at 203 DPI)
 * - 576 dots = 72 bytes per horizontal row
 */

export interface EscPosPrintOptions {
  feedLines?: number;
  cutPaper?: boolean;
}

/**
 * Converts an HTML Canvas element into an ESC/POS byte array (GS v 0 raster image)
 * with paper feed and auto-cut commands.
 */
export function canvasToEscPos(
  sourceCanvas: HTMLCanvasElement,
  options: EscPosPrintOptions = { feedLines: 5, cutPaper: true }
): Uint8Array {
  // Defensive check: Standard 80mm thermal receipt printers require strictly 576 dots (72 bytes) printable width.
  // If the input canvas width is not 576, resize it to 576px wide to prevent sending invalid raster dimensions to printer.
  let canvas = sourceCanvas;
  if (sourceCanvas.width !== 576) {
    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = 576;
    const targetHeight = Math.max(1, Math.round((sourceCanvas.height / sourceCanvas.width) * 576));
    scaledCanvas.height = targetHeight;
    const sCtx = scaledCanvas.getContext('2d');
    if (sCtx) {
      sCtx.imageSmoothingEnabled = true;
      sCtx.imageSmoothingQuality = 'high';
      sCtx.fillStyle = '#ffffff';
      sCtx.fillRect(0, 0, 576, targetHeight);
      sCtx.drawImage(sourceCanvas, 0, 0, 576, targetHeight);
      canvas = scaledCanvas;
    }
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');

  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // 80mm printable width is 576 dots (72 bytes)
  const widthBytes = Math.ceil(width / 8);
  const buffer: number[] = [];

  // 1. Initialize printer: ESC @ (0x1B, 0x40)
  buffer.push(0x1B, 0x40);

  // 2. Center alignment: ESC a 1 (0x1B, 0x61, 0x01)
  buffer.push(0x1B, 0x61, 0x01);

  // 3. Set line spacing to 0: ESC 3 0 (0x1B, 0x33, 0x00)
  buffer.push(0x1B, 0x33, 0x00);

  // 4. Chunk raster image into 128-dot vertical slices (Prevents buffer overflow on XP-80C / Xprinter / POS-80)
  const sliceHeight = 128;
  for (let startY = 0; startY < height; startY += sliceHeight) {
    const currentSliceHeight = Math.min(sliceHeight, height - startY);
    const xL = widthBytes & 0xFF;
    const xH = (widthBytes >> 8) & 0xFF;
    const yL = currentSliceHeight & 0xFF;
    const yH = (currentSliceHeight >> 8) & 0xFF;

    // GS v 0 0 xL xH yL yH
    buffer.push(0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH);

    // Convert slice RGBA to 1-bit monochrome bitmap
    for (let y = startY; y < startY + currentSliceHeight; y++) {
      for (let b = 0; b < widthBytes; b++) {
        let byteVal = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = b * 8 + bit;
          if (x < width) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const bl = data[idx + 2];
            const a = data[idx + 3];

            // Fast integer luminance calculation (avoids floating point overhead on mobile)
            const lum = r * 299 + g * 587 + bl * 114;
            if (a > 120 && lum < 138000) {
              byteVal |= (1 << (7 - bit));
            }
          }
        }
        buffer.push(byteVal);
      }
    }
  }

  // 5. Reset line spacing: ESC 2 (0x1B, 0x32)
  buffer.push(0x1B, 0x32);

  // 6. Feed lines so the receipt passes the printhead and reaches cutter knife
  const feed = options.feedLines ?? 5;
  if (feed > 0) {
    buffer.push(0x1B, 0x64, feed); // ESC d n (feed n lines)
  }

  // 7. Trigger paper cut
  if (options.cutPaper !== false) {
    // GS V 65 0 (0x1D, 0x56, 0x41, 0x10) -> Feed 16 vertical units and cut
    buffer.push(0x1D, 0x56, 0x41, 0x10);
  }

  return new Uint8Array(buffer);
}

/**
 * Converts a Uint8Array into a base64 encoded string safely in chunks.
 */
export function uint8ToBase64(u8: Uint8Array): string {
  let binary = '';
  const len = u8.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = u8.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

// =========================================================================
// ⚡ DIRECT WEB BLUETOOTH THERMAL POS PRINTING (NO RAWBT, 1-TAP PRINT & CUT)
// =========================================================================

// Common Bluetooth Thermal Printer Service UUIDs
const BLUETOOTH_PRINT_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard ESC/POS
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent UART
  '0000e781-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb'
];

interface BluetoothState {
  device: any | null;
  server: any | null;
  characteristic: any | null;
  deviceName: string;
}

const btState: BluetoothState = {
  device: null,
  server: null,
  characteristic: null,
  deviceName: ''
};

/**
 * Check if Web Bluetooth is supported on this browser (Chrome / Edge on Android / PC)
 */
export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/**
 * Get the currently connected or remembered Bluetooth printer name
 */
export function getSavedBluetoothPrinterName(): string {
  if (btState.deviceName) return btState.deviceName;
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('pos_bt_printer_name') || '';
  }
  return '';
}

/**
 * Check if currently connected to Bluetooth printer
 */
export function isBluetoothPrinterConnected(): boolean {
  return !!(btState.server && btState.server.connected && btState.characteristic);
}

/**
 * Request user to pick and connect to Bluetooth Thermal Printer
 */
export async function connectBluetoothPrinter(): Promise<{ success: boolean; deviceName: string; error?: string }> {
  if (!isBluetoothSupported()) {
    return {
      success: false,
      deviceName: '',
      error: 'កម្មវិធីរុករកនេះមិនគាំទ្រ Web Bluetooth ទេ។ សូមប្រើ Google Chrome ឬ Edge លើ Android ឬ PC!'
    };
  }

  try {
    const nav = navigator as any;
    const device = await nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLUETOOTH_PRINT_SERVICES
    });

    if (!device) {
      return { success: false, deviceName: '', error: 'មិនបានជ្រើសរើសម៉ាស៊ីនព្រីនឡើយ!' };
    }

    const deviceName = device.name || 'Bluetooth Thermal Printer';
    btState.device = device;
    btState.deviceName = deviceName;

    device.addEventListener('gattserverdisconnected', () => {
      console.log('Bluetooth printer disconnected');
      btState.server = null;
      btState.characteristic = null;
    });

    const server = await device.gatt.connect();
    btState.server = server;

    // Search for writable characteristic
    let foundChar: any = null;
    for (const sUuid of BLUETOOTH_PRINT_SERVICES) {
      try {
        const service = await server.getPrimaryService(sUuid);
        const chars = await service.getCharacteristics();
        for (const c of chars) {
          if (c.properties.write || c.properties.writeWithoutResponse) {
            foundChar = c;
            break;
          }
        }
        if (foundChar) break;
      } catch {
        // continue search
      }
    }

    // Fallback: search all primary services if specific service not found
    if (!foundChar) {
      try {
        const allServices = await server.getPrimaryServices();
        for (const s of allServices) {
          const chars = await s.getCharacteristics();
          for (const c of chars) {
            if (c.properties.write || c.properties.writeWithoutResponse) {
              foundChar = c;
              break;
            }
          }
          if (foundChar) break;
        }
      } catch {
        // ignore
      }
    }

    if (!foundChar) {
      return {
        success: false,
        deviceName,
        error: `បានភ្ជាប់ ${deviceName} ប៉ុន្តែរកមិនឃើញ Characteristic សម្រាប់បញ្ជាព្រីនឡើយ!`
      };
    }

    btState.characteristic = foundChar;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pos_bt_printer_name', deviceName);
    }

    return { success: true, deviceName };
  } catch (err: any) {
    console.error('Bluetooth connect error:', err);
    return {
      success: false,
      deviceName: '',
      error: err?.message || 'ការភ្ជាប់ Bluetooth បានបរាជ័យ'
    };
  }
}

/**
 * Sends ESC/POS byte array directly to the connected Bluetooth thermal printer
 * in chunks with small delay to avoid buffer overflow.
 */
export async function printToBluetoothPrinter(
  escPosBytes: Uint8Array,
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; error?: string }> {
  // If not connected, attempt auto-reconnect if device exists, otherwise prompt connect
  if (!isBluetoothPrinterConnected()) {
    if (btState.device && btState.device.gatt) {
      try {
        const server = await btState.device.gatt.connect();
        btState.server = server;
        for (const sUuid of BLUETOOTH_PRINT_SERVICES) {
          try {
            const service = await server.getPrimaryService(sUuid);
            const chars = await service.getCharacteristics();
            for (const c of chars) {
              if (c.properties.write || c.properties.writeWithoutResponse) {
                btState.characteristic = c;
                break;
              }
            }
            if (btState.characteristic) break;
          } catch {
            // continue
          }
        }
      } catch {
        // reconnect failed, proceed to prompt
      }
    }
  }

  if (!isBluetoothPrinterConnected()) {
    const conn = await connectBluetoothPrinter();
    if (!conn.success) {
      return { success: false, error: conn.error || 'សូមភ្ជាប់ម៉ាស៊ីនព្រីន Bluetooth ជាមុនសិន!' };
    }
  }

  const char = btState.characteristic;
  if (!char) {
    return { success: false, error: 'រកមិនឃើញសេវាព្រីនលើម៉ាស៊ីន Bluetooth នេះទេ!' };
  }

  try {
    const totalBytes = escPosBytes.length;
    // Chunk size 512 bytes for reliable Bluetooth BLE/SPP transfer
    const CHUNK_SIZE = 512;
    const delayMs = 18;

    for (let offset = 0; offset < totalBytes; offset += CHUNK_SIZE) {
      const chunk = escPosBytes.subarray(offset, Math.min(offset + CHUNK_SIZE, totalBytes));
      if (char.writeValueWithoutResponse) {
        await char.writeValueWithoutResponse(chunk);
      } else {
        await char.writeValue(chunk);
      }

      if (onProgress) {
        onProgress(Math.min(100, Math.round(((offset + chunk.length) / totalBytes) * 100)));
      }

      // Small pause between chunks
      await new Promise(res => setTimeout(res, delayMs));
    }

    return { success: true };
  } catch (err: any) {
    console.error('Bluetooth write error:', err);
    return { success: false, error: err?.message || 'ការផ្ញើទិន្នន័យព្រីន Bluetooth បានបរាជ័យ' };
  }
}

/**
 * Disconnect current Bluetooth printer
 */
export function disconnectBluetoothPrinter(): void {
  try {
    if (btState.device && btState.device.gatt && btState.device.gatt.connected) {
      btState.device.gatt.disconnect();
    }
  } catch {
    // ignore
  }
  btState.server = null;
  btState.characteristic = null;
  btState.device = null;
  btState.deviceName = '';
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('pos_bt_printer_name');
  }
}

/**
 * Triggers RawBT Print Service on Android directly from browser via rawbt: intent
 * Connects directly to USB (OTG), Bluetooth, or Wi-Fi printers on Android.
 */
export function printViaRawBT(base64EscPos: string): void {
  const url = `rawbt:base64,${base64EscPos}`;
  window.location.href = url;
}

