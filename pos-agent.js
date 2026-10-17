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

const http = require('http');

const DEFAULT_SERVER_URL = process.env.SERVER_URL || 'https://ais-dev-i2xt5egdzckwi5de3soc6f-470363457077.asia-southeast1.run.app';
const SERVER_URL = process.argv[3] || process.env.SERVER_URL || DEFAULT_SERVER_URL;

function printRawEscpos(buffer) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setNoDelay(true);
    socket.setTimeout(4000);

    socket.connect(PRINTER_PORT, PRINTER_IP, () => {
      console.log(`🖨️ [SOCKET CONNECTED] Sending ${buffer.length} bytes to ${PRINTER_IP}:${PRINTER_PORT}...`);
      socket.write(buffer, () => {
        setTimeout(() => {
          socket.end();
          console.log(`✂️ [SUCCESS] ព្រីនចេញ និងកាត់ក្រដាសស្វ័យប្រវត្តិរួចរាល់!\n`);
          resolve(true);
        }, 50);
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

function isDuplicateJob(title, buffer, ttlSeconds = 180) {
  const now = Date.now();
  const keys = [];

  if (title) {
    const match = title.match(/#(\w+)/);
    if (match) keys.push(`basket_${match[1]}`);
    else keys.push(`title_${title.trim()}`);
  }
  if (buffer && buffer.length > 0) {
    keys.push(`hash_${crypto.createHash('md5').update(buffer).digest('hex')}`);
  }

  if (keys.length === 0) return false;

  // Cleanup old keys older than 10 minutes
  for (const [k, time] of recentPrintJobs.entries()) {
    if (now - time > 600000) recentPrintJobs.delete(k);
  }

  for (const k of keys) {
    if (recentPrintJobs.has(k)) {
      if (now - recentPrintJobs.get(k) < ttlSeconds * 1000) {
        // Refresh timestamp to block ongoing retries/echoes from passing through
        recentPrintJobs.set(k, now);
        return true;
      }
    }
  }

  for (const k of keys) {
    recentPrintJobs.set(k, now);
  }
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
      if (isDuplicateJob(title, rawBuffer, 180)) {
        console.log(`⏩ [DUPLICATE BLOCKED] ${title} ត្រូវបានបដិសេធ (ព្រីនរួចរាល់ក្នុងរយៈពេល ៣នាទីមុន)`);
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

function pollAppServer() {
  const urlObj = new URL(`${SERVER_URL}/api/print_agent/poll`);
  const client = urlObj.protocol === 'https:' ? https : http;

  const req = client.get(urlObj.href, {
    headers: { 'User-Agent': 'Node-POS-Agent/1.0' }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        if (res.statusCode === 200) {
          const parsed = JSON.parse(data);
          const jobs = parsed.jobs || [];
          for (const job of jobs) {
            if (job && job.escpos_base64) {
              const buffer = Buffer.from(job.escpos_base64, 'base64');
              const basketTitle = `Basket #${job.basket_no || job.invoice_id}`;
              if (!isDuplicateJob(basketTitle, buffer, 180)) {
                console.log(`\n⚡ [DIRECT APP JOB] ${basketTitle} - ${job.customer_name || ''}`);
                printRawEscpos(buffer).then(() => {
                  // Send ack
                  try {
                    const ackReq = client.request(`${SERVER_URL}/api/print_agent/ack`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' }
                    });
                    ackReq.write(JSON.stringify({ job_id: job.id, status: 'PRINTED' }));
                    ackReq.end();
                  } catch {}
                }).catch(() => {});
              }
            }
          }
        }
      } catch {}
      setTimeout(pollAppServer, 500);
    });
    res.on('error', () => {
      setTimeout(pollAppServer, 2000);
    });
  });

  req.on('error', () => {
    setTimeout(pollAppServer, 2500);
  });
}

console.log(`🚀 [SERVER SYNC] App Server ៖ ${SERVER_URL}`);
console.log('🚀 កំពុងតភ្ជាប់ទៅកាន់ Cloud Relay & App Server...');
sendHeartbeat();
setInterval(sendHeartbeat, 15000);
listenForJobs();
pollAppServer();
console.log('🟢 [ONLINE] Print Agent បានភ្ជាប់ជោគជ័យ! រង់ចាំទទួលការបញ្ជាព្រីនពីទូរស័ព្ទដៃ...\n');
