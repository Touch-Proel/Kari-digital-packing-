#!/usr/bin/env node
/**
 * =========================================================================
 * 🏪 KARI ARNETT POS - SHOP PRINT AGENT (NODE.JS HIGH-SPEED RELAY)
 * =========================================================================
 * 
 * ដំណើរការលើកុំព្យូទ័រ/ឡេបថបក្នុងហាង (Windows / Mac / Linux)
 * មិនបាច់ដំឡើង library បន្ថែមអ្វីទាំងអស់ (Zero Dependencies)!
 * 
 * របៀបប្រើ (How to run):
 *   node pos-agent.js
 * ឬដាក់ IP ម៉ាស៊ីនព្រីន (ឧទាហរណ៍ 192.168.0.200)៖
 *   node pos-agent.js 192.168.0.200
 */

const net = require('net');
const https = require('https');

const DEFAULT_PRINTER_IP = '192.168.0.200';
const DEFAULT_PRINTER_PORT = 9100;
const CHANNEL_ID = 'kari_pos_bfc84ed2';
const HB_TOPIC = `${CHANNEL_ID}_hb`;
const JOBS_TOPIC = `${CHANNEL_ID}_jobs`;
const AGENT_NAME = 'Store-PC';

const PRINTER_IP = process.argv[2] || process.env.PRINTER_IP || DEFAULT_PRINTER_IP;
const PRINTER_PORT = parseInt(process.env.PRINTER_PORT || DEFAULT_PRINTER_PORT, 10);

console.log('='.repeat(60));
console.log('🏪 KARI ARNETT POS - SHOP PRINT AGENT');
console.log('='.repeat(60));
console.log(`📡 ម៉ាស៊ីនព្រីន (Target Printer) : ${PRINTER_IP}:${PRINTER_PORT}`);
console.log(`🔗 Channel ID                   : ${CHANNEL_ID}`);
console.log('-'.repeat(60));

function printRawEscpos(buffer) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);

    socket.connect(PRINTER_PORT, PRINTER_IP, () => {
      console.log(`🖨️ [SOCKET CONNECTED] Sending ${buffer.length} bytes to ${PRINTER_IP}:${PRINTER_PORT}...`);
      socket.write(buffer, () => {
        setTimeout(() => {
          socket.end();
          console.log(`✂️ [SUCCESS] ព្រីនចេញ និងកាត់ក្រដាសស្វ័យប្រវត្តិរួចរាល់!\n`);
          resolve(true);
        }, 150);
      });
    });

    socket.on('timeout', () => {
      socket.destroy();
      console.error(`❌ [PRINTER TIMEOUT] Timeout connecting to ${PRINTER_IP}:${PRINTER_PORT}`);
      reject(new Error('Printer connection timeout'));
    });

    socket.on('error', (err) => {
      console.error(`❌ [PRINTER ERROR]: មិនអាចភ្ជាប់ទៅកាន់ ${PRINTER_IP}:${PRINTER_PORT} បានទេ ៖ ${err.message}`);
      reject(err);
    });
  });
}

function sendHeartbeat() {
  const payload = JSON.stringify({
    agent_name: AGENT_NAME,
    printer_target: `${PRINTER_IP}:${PRINTER_PORT}`,
    timestamp: Math.floor(Date.now() / 1000),
    status: 'online'
  });

  const req = https.request(`https://ntfy.sh/${HB_TOPIC}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Title': 'heartbeat',
      'Tags': 'heartpulse',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  }, (res) => {
    if (res.statusCode === 200) {
      // heartbeats ok
    } else if (res.statusCode === 429) {
      console.log('⏳ [429 RATE LIMIT] ntfy.sh busy. Pausing heartbeat...');
    }
  });
  req.on('error', () => {});
  req.write(payload);
  req.end();
}

function downloadAttachmentWithRetry(url, maxRetries = 5) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    let backoff = 2000;

    function tryDownload() {
      attempt++;
      const req = https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*'
        }
      }, (res) => {
        if (res.statusCode === 429) {
          if (attempt <= maxRetries) {
            const retryAfter = res.headers['retry-after'];
            const waitMs = retryAfter && !isNaN(retryAfter) ? parseInt(retryAfter, 10) * 1000 : backoff;
            console.log(`⏳ [429 RATE LIMIT] ntfy.sh busy (attempt ${attempt}/${maxRetries}). Waiting ${waitMs / 1000}s...`);
            setTimeout(tryDownload, waitMs);
            backoff = Math.min(backoff * 2, 16000);
            return;
          }
          return reject(new Error('HTTP 429 Too Many Requests'));
        }
        if (res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', (err) => {
          if (attempt <= maxRetries) setTimeout(tryDownload, 1500);
          else reject(err);
        });
      });
      req.on('error', (err) => {
        if (attempt <= maxRetries) setTimeout(tryDownload, 1500);
        else reject(err);
      });
    }

    tryDownload();
  });
}

const crypto = require('crypto');
const recentPrintJobs = new Map();

function isDuplicateJob(title, buffer, ttlSeconds = 15) {
  const now = Date.now();
  let key = title;
  if (title.includes('#')) {
    const match = title.match(/#(\w+)/);
    if (match) key = `basket_${match[1]}`;
  } else if (buffer && buffer.length > 0) {
    key = `hash_${crypto.createHash('md5').update(buffer).digest('hex')}`;
  }

  // Cleanup old keys
  for (const [k, time] of recentPrintJobs.entries()) {
    if (now - time > 60000) recentPrintJobs.delete(k);
  }

  if (recentPrintJobs.has(key)) {
    if (now - recentPrintJobs.get(key) < ttlSeconds * 1000) {
      return true;
    }
  }

  recentPrintJobs.set(key, now);
  return false;
}

async function handleMessage(eventData) {
  try {
    const title = eventData.title || 'Print Job';
    console.log(`\n📥 [NEW JOB RECEIVED] ${title}`);

    let rawBuffer = null;

    if (eventData.attachment && eventData.attachment.url) {
      console.log(`⬇️ Downloading print data from ${eventData.attachment.url}...`);
      const downloaded = await downloadAttachmentWithRetry(eventData.attachment.url);
      if (downloaded) {
        try {
          const parsed = JSON.parse(downloaded.toString('utf-8'));
          if (parsed && parsed.escpos_base64) {
            rawBuffer = Buffer.from(parsed.escpos_base64, 'base64');
          } else {
            rawBuffer = downloaded;
          }
        } catch {
          rawBuffer = downloaded;
        }
      }
    } else if (eventData.message) {
      try {
        const parsed = JSON.parse(eventData.message);
        if (parsed.escpos_base64) {
          rawBuffer = Buffer.from(parsed.escpos_base64, 'base64');
        }
      } catch (e) {
        try {
          rawBuffer = Buffer.from(eventData.message, 'base64');
        } catch {
          rawBuffer = Buffer.from(eventData.message, 'utf-8');
        }
      }
    }

    if (rawBuffer && rawBuffer.length > 0) {
      if (isDuplicateJob(title, rawBuffer, 15)) {
        console.log(`⏩ [DUPLICATE BLOCKED] ${title} ត្រូវបានបដិសេធ (ព្រីនរួចរាល់ក្នុងរយៈពេល ១៥វិនាទីមុន)`);
        return;
      }
      await printRawEscpos(rawBuffer);
    }
  } catch (err) {
    console.error('❌ Error handling print job:', err.message);
  }
}

function listenForJobs() {
  const req = https.get(`https://ntfy.sh/${JOBS_TOPIC}/json`, {
    headers: { 'User-Agent': 'ShopAgent/1.0' }
  }, (res) => {
    let buffer = '';
    res.on('data', (chunk) => {
      buffer += chunk.toString('utf-8');
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep partial line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const eventData = JSON.parse(line);
          if (eventData.event === 'message') {
            handleMessage(eventData);
          }
        } catch (e) {
          // ignore
        }
      }
    });

    res.on('end', () => {
      setTimeout(listenForJobs, 2000);
    });

    res.on('error', (err) => {
      setTimeout(listenForJobs, 2000);
    });
  });

  req.on('error', (err) => {
    setTimeout(listenForJobs, 2000);
  });
}

console.log('🚀 កំពុងតភ្ជាប់ទៅកាន់ Cloud Relay...');
sendHeartbeat();
setInterval(sendHeartbeat, 15000);
listenForJobs();
console.log('🟢 [ONLINE] Print Agent បានភ្ជាប់ជោគជ័យ! រង់ចាំទទួលការបញ្ជាព្រីនពីទូរស័ព្ទដៃ...\n');
