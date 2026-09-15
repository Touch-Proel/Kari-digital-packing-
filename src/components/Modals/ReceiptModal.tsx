import React, { useRef, useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { Invoice } from '../../types';
import { playPureTone, playSuccessFanfare } from '../../utils/audio';
import {
  canvasToEscPos,
  uint8ToBase64,
  isBluetoothSupported,
  isBluetoothPrinterConnected,
  getSavedBluetoothPrinterName,
  connectBluetoothPrinter,
  printToBluetoothPrinter,
  disconnectBluetoothPrinter,
  printViaRawBT
} from '../../utils/escpos';
import { renderInvoiceTo576Canvas } from '../../utils/receiptCanvas';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  myPackerName: string;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
  onStagePackSuccess?: () => void;
}

type PrintMode = 'bluetooth' | 'rawbt' | 'browser' | 'agent' | 'lan';

export function ReceiptModal({
  isOpen,
  onClose,
  invoice,
  myPackerName,
  onShowToast,
  onStagePackSuccess
}: ReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const offscreenRenderRef = useRef<HTMLDivElement>(null);

  // Preferred print mode
  const [printMode, setPrintMode] = useState<PrintMode>(() => {
    const saved = localStorage.getItem('pos_print_mode');
    if (saved === 'bluetooth' || saved === 'agent' || saved === 'browser' || saved === 'lan') {
      return saved as PrintMode;
    }
    return isBluetoothSupported() ? 'bluetooth' : 'agent';
  });

  // Bluetooth State
  const [btDeviceName, setBtDeviceName] = useState<string>(() => getSavedBluetoothPrinterName());
  const [isBtConnected, setIsBtConnected] = useState<boolean>(() => isBluetoothPrinterConnected());
  const [isBtConnecting, setIsBtConnecting] = useState(false);
  const [isPrintingBt, setIsPrintingBt] = useState(false);
  const [btProgress, setBtProgress] = useState(0);

  // Shop Print Agent State
  const [isAgentOnline, setIsAgentOnline] = useState<boolean>(false);
  const [agentTarget, setAgentTarget] = useState<string>('192.168.0.200:9100');
  const [agentName, setAgentName] = useState<string>('');
  const [localAgentUrl, setLocalAgentUrl] = useState<string>(() => {
    return localStorage.getItem('pos_local_agent_url') || 'http://192.168.0.7:8088';
  });
  const [isCheckingAgent, setIsCheckingAgent] = useState<boolean>(false);
  const [isSendingToAgent, setIsSendingToAgent] = useState<boolean>(false);
  const [showAgentSetup, setShowAgentSetup] = useState<boolean>(false);

  // LAN / Wi-Fi State
  const [lanPrinterIp, setLanPrinterIp] = useState<string>(() => {
    return localStorage.getItem('pos_lan_printer_ip') || '192.168.0.200';
  });
  const [lanPrinterPort, setLanPrinterPort] = useState<number>(() => {
    return parseInt(localStorage.getItem('pos_lan_printer_port') || '9100', 10);
  });
  const [isPrintingLan, setIsPrintingLan] = useState(false);
  const [showLanConfig, setShowLanConfig] = useState(false);
  const [isTestingLan, setIsTestingLan] = useState(false);

  // Cloud deployment detection (Cloud Run cannot reach private 192.168.x.x LAN IPs)
  const isCloudDeployment = typeof window !== 'undefined' && 
    !['localhost', '127.0.0.1'].includes(window.location.hostname) && 
    !window.location.hostname.startsWith('192.168.');

  // Refresh status on open
  const checkAgentStatus = async () => {
    setIsCheckingAgent(true);
    try {
      let detectedOnline = false;
      let detectedTarget = '';
      let detectedName = '';

      // 1. Primary: Direct check with App Server API
      try {
        const res = await fetch('/api/print_agent/status');
        const data = await res.json();
        if (data.success && data.online) {
          detectedOnline = true;
          if (data.agent) {
            detectedTarget = data.agent.printer_target || '192.168.0.200:9100';
            detectedName = data.agent.agent_name || 'Store PC';
          }
        }
      } catch {}

      // 2. Secondary: Direct cloud relay check (ntfy.sh)
      if (!detectedOnline) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);
          const ntfyRes = await fetch('https://ntfy.sh/kari_pos_bfc84ed2_hb/json?poll=1', {
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (ntfyRes.ok) {
            const text = await ntfyRes.text();
            const lines = text.split('\n');
            const nowSec = Math.floor(Date.now() / 1000);
            for (let i = lines.length - 1; i >= 0; i--) {
              const l = lines[i].trim();
              if (!l) continue;
              try {
                const msg = JSON.parse(l);
                if (msg.event === 'message' && msg.message) {
                  const hb = typeof msg.message === 'string' && msg.message.startsWith('{')
                    ? JSON.parse(msg.message)
                    : null;
                  
                  const hbTime = (hb && hb.timestamp) || 0;
                  const serverTime = msg.time || 0;
                  const isFresh = (hbTime > 0 && Math.abs(nowSec - hbTime) < 300) ||
                                  (serverTime > 0 && Math.abs(nowSec - serverTime) < 300);

                  if (hb && hb.status === 'online' && isFresh) {
                    detectedOnline = true;
                    detectedTarget = hb.printer_target || '192.168.0.200:9100';
                    detectedName = hb.agent_name || 'Store PC';
                    if (hb.local_url) {
                      setLocalAgentUrl(hb.local_url);
                      localStorage.setItem('pos_local_agent_url', hb.local_url);
                    }
                    break;
                  }
                }
              } catch {}
            }
          }
        } catch {}
      }

      // 2. Direct probe of local Wi-Fi agent if URL is known
      const currentLocalUrl = localAgentUrl || localStorage.getItem('pos_local_agent_url');
      if (currentLocalUrl && !detectedOnline) {
        try {
          const locRes = await fetch(currentLocalUrl, {
            signal: AbortSignal.timeout(1000)
          });
          if (locRes.ok) {
            const locData = await locRes.json();
            if (locData.status === 'online') {
              detectedOnline = true;
              detectedTarget = locData.printer || detectedTarget;
              detectedName = `${locData.agent_name || 'Store PC'} (Wi-Fi ផ្ទាល់)`;
            }
          }
        } catch {
          // not directly reachable on this network
        }
      }

      // 3. Server API status check (fallback)
      if (!detectedOnline) {
        try {
          const res = await fetch('/api/print_agent/status');
          const data = await res.json();
          if (data.success && data.online) {
            detectedOnline = true;
            if (data.agent) {
              detectedTarget = data.agent.printer_target || '192.168.0.200:9100';
              detectedName = data.agent.agent_name || 'Store PC';
            }
          }
        } catch {
          // ignore server check error
        }
      }

      if (detectedOnline) {
        setIsAgentOnline(true);
        if (detectedTarget) setAgentTarget(detectedTarget);
        if (detectedName) setAgentName(detectedName);
      } else {
        setIsAgentOnline(false);
      }
    } catch {
      setIsAgentOnline(false);
    } finally {
      setIsCheckingAgent(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setIsBtConnected(isBluetoothPrinterConnected());
      setBtDeviceName(getSavedBluetoothPrinterName());
      checkAgentStatus();

      // Poll agent heartbeat every 6 seconds while modal is open
      const pollTimer = setInterval(() => {
        checkAgentStatus();
      }, 6000);

      return () => clearInterval(pollTimer);
    }
  }, [isOpen]);

  if (!isOpen || !invoice) return null;

  const subtotal = invoice.items.reduce((s, it) => s + (it.price * it.quantity), 0);
  const totalQty = invoice.items.reduce((s, it) => s + it.quantity, 0);
  const shippingFee = invoice.shipping_fee && invoice.shipping_fee > 0 
    ? invoice.shipping_fee 
    : 2.0;
  // Total is strictly (Subtotal + Shipping)
  const exactTotal = Number((subtotal + shippingFee).toFixed(2));
  const rielTotal = Math.round(exactTotal * 4100);
  const formattedRiel = rielTotal.toLocaleString('en-US');

  const now = new Date();
  const dateStr = now.toLocaleDateString('km-KH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  // Handle Stage Pack workflow transition (UNPICKED -> STAGED / រង់ចាំលុយ)
  const triggerStagePack = async (source = 'RawBT') => {
    if (invoice.packing_stage === 'UNPICKED' || !invoice.packing_stage) {
      invoice.packing_stage = 'STAGED'; // Instant optimistic update
      try {
        await fetch('/api/stage_pack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoice_id: invoice.invoice_id,
            packer_name: myPackerName || source
          }),
          keepalive: true
        });
        if (onStagePackSuccess) onStagePackSuccess();
      } catch (e) {
        console.error('Error staging pack:', e);
      }
    }
  };

  const handleSelectMode = (mode: PrintMode) => {
    setPrintMode(mode);
    localStorage.setItem('pos_print_mode', mode);
    playPureTone(850, 0.05);
  };

  // 1. Direct Web Bluetooth Print (1-Tap, Auto-Cut, No RawBT)
  const handleBluetoothDirectPrint = async () => {
    const targetEl = offscreenRenderRef.current || receiptRef.current;
    if (!targetEl) return;

    playPureTone(1200, 0.08);
    setIsPrintingBt(true);
    setBtProgress(10);
    onShowToast(`⚡ កំពុង Render វិក្កយបត្រ 80mm...`);

    // Instant optimistic stage
    await triggerStagePack('POS Bluetooth');

    try {
      let canvas: HTMLCanvasElement;
      try {
        canvas = renderInvoiceTo576Canvas(invoice, { rielRate: 4100 });
      } catch {
        canvas = await html2canvas(targetEl, {
          width: 576,
          scale: 1,
          backgroundColor: '#ffffff',
          logging: false,
          imageTimeout: 200
        });
      }

      setBtProgress(35);
      const escPosBytes = canvasToEscPos(canvas, { feedLines: 5, cutPaper: true });

      setBtProgress(50);
      onShowToast(`⚡ កំពុងបញ្ជូនទៅម៉ាស៊ីនព្រីន Bluetooth...`);

      const res = await printToBluetoothPrinter(escPosBytes, (pct) => {
        setBtProgress(50 + Math.round(pct * 0.5));
      });

      if (res.success) {
        setBtProgress(100);
        setIsBtConnected(true);
        setBtDeviceName(getSavedBluetoothPrinterName());
        playSuccessFanfare();
        onShowToast(`✅ បានព្រីន & កាត់ក្រដាសជោគជ័យ! កន្ត្រក #${invoice.basket_no || invoice.invoice_id} រត់ចូល «រង់ចាំលុយ»!`, 'success');
        setTimeout(() => onClose(), 500);
      } else {
        onShowToast(`❌ ព្រីនមិនបាន៖ ${res.error}`, 'error');
      }
    } catch (err: any) {
      console.error('Bluetooth print error:', err);
      onShowToast(`❌ បរាជ័យ៖ ${err?.message || err}`, 'error');
    } finally {
      setIsPrintingBt(false);
      setBtProgress(0);
    }
  };

  // Connect Bluetooth Printer
  const handleConnectBluetooth = async () => {
    setIsBtConnecting(true);
    playPureTone(900, 0.08);
    onShowToast(`🔗 សូមជ្រើសរើសម៉ាស៊ីនព្រីន Bluetooth របស់អ្នក (Xprinter, POS-80...)`);
    try {
      const res = await connectBluetoothPrinter();
      if (res.success) {
        setIsBtConnected(true);
        setBtDeviceName(res.deviceName);
        playSuccessFanfare();
        onShowToast(`🟢 បានភ្ជាប់ម៉ាស៊ីនព្រីន ${res.deviceName} ជោគជ័យ!`, 'success');
      } else {
        onShowToast(`❌ ${res.error}`, 'error');
      }
    } catch (err: any) {
      onShowToast(`❌ ${err?.message || 'បរាជ័យ'}`, 'error');
    } finally {
      setIsBtConnecting(false);
    }
  };

  const handleDisconnectBluetooth = () => {
    disconnectBluetoothPrinter();
    setIsBtConnected(false);
    setBtDeviceName('');
    onShowToast('⚪ បានផ្តាច់ម៉ាស៊ីនព្រីន Bluetooth');
  };

  // 2. Direct Wi-Fi / LAN Network Print (IP: 9100)
  const handleLanDirectPrint = async () => {
    const targetEl = offscreenRenderRef.current || receiptRef.current;
    if (!targetEl) return;

    if (!lanPrinterIp.trim()) {
      onShowToast('សូមបញ្ចូល IP ម៉ាស៊ីនព្រីនជាមុនសិន!', 'error');
      setShowLanConfig(true);
      return;
    }

    playPureTone(1200, 0.08);
    setIsPrintingLan(true);
    onShowToast(`🌐 កំពុង Render & បញ្ជូនទៅម៉ាស៊ីន Wi-Fi ${lanPrinterIp}...`);

    await triggerStagePack('POS Wi-Fi/LAN');

    try {
      let canvas: HTMLCanvasElement;
      try {
        canvas = renderInvoiceTo576Canvas(invoice, { rielRate: 4100 });
      } catch {
        canvas = await html2canvas(targetEl, {
          width: 576,
          scale: 1,
          backgroundColor: '#ffffff',
          logging: false,
          imageTimeout: 200
        });
      }

      const escPosBytes = canvasToEscPos(canvas, { feedLines: 5, cutPaper: true });
      const b64 = uint8ToBase64(escPosBytes);

      const resp = await fetch('/api/print_lan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          printer_ip: lanPrinterIp.trim(),
          printer_port: lanPrinterPort || 9100,
          escpos_base64: b64,
          packer_name: myPackerName
        })
      });

      const data = await resp.json();
      if (data.success) {
        playSuccessFanfare();
        onShowToast(`✅ បានព្រីន & កាត់ក្រដាសតាម Wi-Fi ជោគជ័យ! កន្ត្រក #${invoice.basket_no || invoice.invoice_id} រត់ចូល «រង់ចាំលុយ»!`, 'success');
        setTimeout(() => onClose(), 500);
      } else {
        if (data.isCloudPrivateIp) {
          onShowToast(`💡 មិនអាចព្រីនតាម Cloud ទៅ IP ក្នុងហាង ${lanPrinterIp} បានទេ។ សូមប្តូរទៅ «⚡ Bluetooth POS» ឬ «🖨️ AirPrint»!`, 'error');
          handleSelectMode('bluetooth');
        } else {
          onShowToast(`❌ ម៉ាស៊ីន Wi-Fi៖ ${data.error}`, 'error');
        }
      }
    } catch (err: any) {
      console.warn('LAN print error:', err);
      onShowToast(`❌ មិនអាចភ្ជាប់ម៉ាស៊ីន Wi-Fi ${lanPrinterIp} បានទេ។ សូមប្រើ «⚡ Bluetooth POS»!`, 'error');
    } finally {
      setIsPrintingLan(false);
    }
  };

  const handleTestLan = async () => {
    if (!lanPrinterIp.trim()) {
      onShowToast('សូមបញ្ចូល IP ម៉ាស៊ីនព្រីន!', 'error');
      return;
    }
    setIsTestingLan(true);
    onShowToast(`📡 កំពុងតេស្តម៉ាស៊ីន ${lanPrinterIp}:${lanPrinterPort}...`);
    try {
      const res = await fetch('/api/test_lan_printer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printer_ip: lanPrinterIp.trim(),
          printer_port: lanPrinterPort || 9100
        })
      });
      const data = await res.json();
      if (data.success) {
        playSuccessFanfare();
        onShowToast(`🟢 ${data.message}`, 'success');
      } else {
        if (data.isCloudPrivateIp) {
          onShowToast(`💡 Server Online មិនអាចភ្ជាប់ IP ក្នុងហាង ${lanPrinterIp} បានឡើយ។ សូមប្រើ «⚡ Bluetooth POS» ឬ «🖨️ AirPrint»!`, 'error');
        } else {
          onShowToast(`❌ ${data.error}`, 'error');
        }
      }
    } catch (err: any) {
      onShowToast(`❌ មិនអាចភ្ជាប់ទៅកាន់ ${lanPrinterIp} បានទេ`, 'error');
    } finally {
      setIsTestingLan(false);
    }
  };

  // Handle Direct Print Action (AirPrint / System)
  const handlePrint = async () => {
    playPureTone(1000, 0.08);
    onShowToast(`🖨️ កំពុងព្រីន & បញ្ជូនកន្ត្រក #${invoice.basket_no || invoice.invoice_id} ចូល «រង់ចាំលុយ»...`);
    await triggerStagePack('DirectPrint');

    // Trigger Print Dialog
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // Handle Shop Print Agent ESC/POS Thermal Print (Direct Relay to Store Printer + Auto Cut!)
  const handleShopAgentPrint = async () => {
    if (!invoice) return;

    setIsSendingToAgent(true);
    playPureTone(1200, 0.1);
    onShowToast(`⚡ កំពុងរៀបចំ & បញ្ជូនទៅ Shop Print Agent...`);

    try {
      // Direct 2D Canvas rendering (0.002s instant - zero html2canvas DOM lag & zero CORS image delay!)
      let canvas: HTMLCanvasElement;
      try {
        canvas = renderInvoiceTo576Canvas(invoice, { rielRate: 4100 });
      } catch (e) {
        // Fallback to html2canvas if direct rendering fails
        const targetEl = offscreenRenderRef.current || receiptRef.current;
        if (!targetEl) return;
        canvas = await html2canvas(targetEl, {
          width: 576,
          scale: 1,
          backgroundColor: '#ffffff',
          logging: false,
          imageTimeout: 200
        });
      }

      // Generate ESC/POS raster bitmap with paper feed and auto-cut commands
      const escPosBytes = canvasToEscPos(canvas, { feedLines: 5, cutPaper: true });
      const base64EscPos = uint8ToBase64(escPosBytes);

      // 1. First: Try DIRECT Local Wi-Fi Print (Zero Cloud, Zero Limit, Instant 0.05s)
      let printedDirect = false;
      const targetLocalUrl = localAgentUrl || localStorage.getItem('pos_local_agent_url');
      if (targetLocalUrl) {
        try {
          const directRes = await fetch(targetLocalUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              basket_no: invoice.basket_no || invoice.invoice_id,
              customer_name: invoice.facebook_name || '',
              escpos_base64: base64EscPos
            }),
            signal: AbortSignal.timeout(350)
          });
          if (directRes.ok) {
            printedDirect = true;
          }
        } catch {
          // not on same Wi-Fi
        }
      }

      // If printed directly via Local Wi-Fi Agent, stop here to avoid duplicate printing!
      if (printedDirect) {
        await triggerStagePack('ShopAgent');
        playSuccessFanfare();
        onShowToast(`✅ បានព្រីនតាម Shop Agent Wi-Fi ជោគជ័យ! កន្ត្រក #${invoice.basket_no || invoice.invoice_id} រត់ចូល «រង់ចាំលុយ»!`, 'success');
        setTimeout(() => onClose(), 800);
        setIsSendingToAgent(false);
        return;
      }

      // 2. Push to server endpoint (The server endpoint dispatches to long-poll listeners & cloud relay)
      const res = await fetch('/api/print_agent/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          basket_no: invoice.basket_no || invoice.invoice_id,
          customer_name: invoice.facebook_name || '',
          escpos_base64: base64EscPos,
          packer_name: myPackerName || 'Shop Agent Web'
        })
      });

      const data = await res.json();
      if (data.success || isAgentOnline || printedDirect) {
        await triggerStagePack('ShopAgent');
        playSuccessFanfare();
        const modeLabel = printedDirect ? 'Wi-Fi ផ្ទាល់ (0.05s)' : 'Shop Agent';
        onShowToast(`✅ បានបញ្ជូនទៅ ${modeLabel} (${agentTarget})! ម៉ាស៊ីនកំពុងព្រីន & កាត់ក្រដាស! កន្ត្រក #${invoice.basket_no || invoice.invoice_id} រត់ចូល «រង់ចាំលុយ»!`, 'success');
        setTimeout(() => onClose(), 800);
      } else {
        onShowToast(`❌ បរាជ័យ៖ ${data.error}`, 'error');
      }
    } catch (err: any) {
      console.error('Shop Agent Print error:', err);
      onShowToast(`❌ បរាជ័យក្នុងការបញ្ជូនទៅ Agent៖ ${err?.message || err}`, 'error');
    } finally {
      setIsSendingToAgent(false);
    }
  };

  // Direct 1-Tap RawBT Print Service on Android (Works 100% on Vercel / Cloud)
  const handleRawBTPrint = async () => {
    if (!invoice) return;
    const targetEl = offscreenRenderRef.current || receiptRef.current;
    if (!targetEl) return;

    playPureTone(1000, 0.08);
    onShowToast('📱 កំពុង Render & បើក RawBT Print Service...');

    try {
      const canvas = await html2canvas(targetEl, {
        width: 576,
        scale: 1,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false
      });

      const escPosBytes = canvasToEscPos(canvas, { feedLines: 4, cutPaper: true });
      const base64 = uint8ToBase64(escPosBytes);

      printViaRawBT(base64);

      await triggerStagePack('RawBT');
      playSuccessFanfare();
      onShowToast(`✅ បានបញ្ជូនទៅ RawBT លើទូរស័ព្ទដៃ! កន្ត្រក #${invoice.basket_no || invoice.invoice_id} រត់ចូល «រង់ចាំលុយ»!`, 'success');
      setTimeout(() => onClose(), 800);
    } catch (err: any) {
      console.error('RawBT print error:', err);
      onShowToast(`❌ បរាជ័យក្នុងការព្រីន RawBT៖ ${err?.message || err}`, 'error');
    }
  };

  // Copy receipt text to clipboard (formatted exactly like python main_window.py / print_manager.py)
  const handleCopyText = () => {
    let text = `================================\n`;
    text += `      KARI ARNETT BOUTIQUE      \n`;
    text += `    PREMIUM LIVE FULFILLMENT    \n`;
    text += `================================\n`;
    text += `វិក្កយបត្រ : #${invoice.basket_no || invoice.invoice_id}\n`;
    text += `កាលបរិច្ឆេទ : ${dateStr} ${timeStr}\n`;
    text += `--------------------------------\n`;
    text += `អតិថិជន : ${invoice.facebook_name}\n`;
    if (phoneText) text += `ទូរស័ព្ទ  : ${phoneText}\n`;
    if (addressText) text += `ទីតាំង   : ${addressText}\n`;
    text += `តំបន់   : ${locationBadge}\n`;
    text += `--------------------------------\n`;
    text += `បញ្ជីទំនិញ (PACKING LIST):\n`;
    text += `--------------------------------\n`;
    invoice.items.forEach(it => {
      const custom = (it.product_name || '')
        .replace(new RegExp(`^ទំនិញកូដ\\s*\\[?${it.product_code}\\]?`, 'i'), '')
        .replace(new RegExp(`^កូដ\\s*\\[?${it.product_code}\\]?`, 'i'), '')
        .replace(new RegExp(`\\[?${it.product_code}\\]?`, 'i'), '')
        .replace(/^ទំនិញ\s*/i, '')
        .replace(/\s*ទំនិញ$/i, '')
        .trim();
      const namePart = custom && custom !== 'ទំនិញ' ? ` ${custom}` : '';
      text += `[ ]  [${it.product_code}]${namePart} .... x${it.quantity}  $${(it.price * it.quantity).toFixed(2)}\n`;
      if (it.item_comment) {
        text += `     ↳ Note: "${it.item_comment}"\n`;
      }
    });
    text += `--------------------------------\n`;
    text += `ចំនួនសរុប  : ${totalQty} ឈុត\n`;
    text += `តម្លៃទំនិញ : $${subtotal.toFixed(2)}\n`;
    text += `សេវាដឹក    : ${shippingFee === 0 ? 'FREE SHIPPING' : '+$' + shippingFee.toFixed(2)}\n`;
    text += `================================\n`;
    text += `TOTAL USD : $${exactTotal.toFixed(2)}\n`;
    text += `TOTAL KHR : ${formattedRiel} R\n`;
    text += `================================\n`;
    text += `  អរគុណចំពោះការគាំទ្រ KARI ARNETT!  \n`;
    text += `    ទំនិញទិញហើយមិនអាចប្តូរវិញបានទេ    \n`;

    navigator.clipboard.writeText(text);
    playSuccessFanfare();
    onShowToast('📋 បានចម្លងអត្ថបទវិក្កយបត្រ (KARI ARNETT Format) រួចរាល់!');
  };

  const phoneText = invoice.phone_number && invoice.phone_number !== 'គ្មានលេខ' ? invoice.phone_number : '';
  const addressText = invoice.address && !invoice.address.includes('មិនទាន់មាន') ? invoice.address : '';
  const locationBadge = invoice.location_label || (invoice.location_zone === 'PP' ? 'ភ្នំពេញ' : 'តាមខេត្ត');
  const avatarUrl = invoice.picture_url || (invoice.facebook_user_id && !['FB_USER_ID_STREAM', 'MANUAL_USER_ID', 'NONE'].includes(invoice.facebook_user_id)
    ? `https://graph.facebook.com/v21.0/${invoice.facebook_user_id}/picture?type=square&width=120&height=120`
    : null);

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-[#0B1426] border border-cyan-500/60 rounded-3xl w-full max-w-lg flex flex-col max-h-[94vh] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-[#070D1B]">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🖨️</span>
            <div>
              <h3 className="text-white font-black text-sm">វិក្កយបត្រ / ស្លាកបិទលើថង់ (Thermal 80mm)</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-cyan-400 font-mono font-bold">
                  កន្ត្រក #{invoice.basket_no || invoice.invoice_id} ‧ {invoice.facebook_name}
                </span>
                {invoice.packing_stage === 'STAGED' ? (
                  <span className="text-[10px] bg-amber-500/25 text-amber-300 border border-amber-500/50 px-2 py-0.5 rounded-full font-bold">
                    ⏳ រង់ចាំលុយ
                  </span>
                ) : (
                  <span className="text-[10px] bg-sky-500/25 text-sky-300 border border-sky-500/50 px-2 py-0.5 rounded-full font-bold">
                    🛒 មិនទាន់រើស
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-black text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Instructions Banner */}
        <div className="bg-[#0f1d38] border-b border-cyan-900/60 px-4 py-2 text-xs flex items-center justify-between text-cyan-200">
          <div className="flex items-center gap-1.5 font-bold">
            <span>✂️</span>
            <span>ពេញទទឹង 80mm & បញ្ជាកាត់ក្រដាស Auto-Cut</span>
          </div>
          <span className="text-[11px] bg-cyan-950 px-2 py-0.5 rounded border border-cyan-700 text-cyan-300 font-mono font-bold">
            576 Dots ESC/POS
          </span>
        </div>

        {/* Scrollable Receipt Preview */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center bg-slate-950/70">
          {/* Main Visual Receipt (Used for display and window.print) */}
          <div
            id="printable-receipt-area"
            ref={receiptRef}
            className="w-full max-w-[430px] bg-white text-black p-4 rounded-xl shadow-2xl flex flex-col gap-2 select-text border-2 border-black my-auto"
            style={{
              fontFamily: "'Battambang', 'Kantumruy Pro', 'Khmer OS Siemreap', system-ui, -apple-system, sans-serif",
              lineHeight: 1.35,
              color: '#000000',
              WebkitFontSmoothing: 'antialiased',
              textRendering: 'geometricPrecision'
            }}
          >
            {/* 1. Store Header */}
            <div className="text-center border-b-2 border-black pb-2">
              <div className="text-2xl font-extrabold tracking-wider text-black uppercase font-mono">
                KARI ARNETT BOUTIQUE
              </div>
              <div className="text-xs font-bold text-black tracking-wide uppercase mt-0.5">
                PREMIUM LIVE FULFILLMENT
              </div>
            </div>

            {/* 2. Invoice No + Date */}
            <div className="border-b-2 border-black pb-2 pt-1 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-extrabold text-black">វិក្កយបត្រ ៖</span>
                  <span className="text-4xl font-black font-mono tracking-tight text-black leading-none">
                    #{invoice.basket_no || invoice.invoice_id}
                  </span>
                </div>
                <span className="text-sm font-bold text-black border-2 border-black px-2 py-0.5 rounded bg-white">
                  {locationBadge}
                </span>
              </div>
              <div className="text-sm font-bold text-black flex items-center gap-2">
                <span>កាលបរិច្ឆេទ ៖</span>
                <span className="font-mono">{dateStr} {timeStr}</span>
              </div>
            </div>

            {/* 3. Customer Info */}
            <div className="border-b-2 border-black pb-2 pt-1 text-black flex items-start justify-between gap-2">
              <div className="flex-1 flex flex-col gap-1 text-base font-bold">
                <div className="flex items-baseline gap-1.5">
                  <span>អតិថិជន ៖</span>
                  <strong className="font-black text-black text-2xl break-words">{invoice.facebook_name}</strong>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span>ទូរស័ព្ទ  ៖</span>
                  <strong className="font-black font-mono text-black text-xl">{phoneText || '[គ្មានលេខ]'}</strong>
                </div>
                {addressText ? (
                  <div className="break-words">
                    <span>ទីតាំង   ៖</span>
                    <strong className="font-bold text-black text-base ml-1">{addressText}</strong>
                  </div>
                ) : null}
                <div>
                  <span>តំបន់   ៖</span>
                  <strong className="font-bold text-black text-base ml-1">{locationBadge}</strong>
                </div>
              </div>

              {/* Avatar */}
              {avatarUrl ? (
                <div className="w-16 h-16 rounded-full border-2 border-black overflow-hidden flex-shrink-0 bg-slate-100 flex items-center justify-center shadow-sm">
                  <img
                    src={avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    crossOrigin="anonymous"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full border-2 border-black flex items-center justify-center text-lg flex-shrink-0 bg-slate-50">
                  👤
                </div>
              )}
            </div>

            {/* 4. Packing List Items */}
            <div className="border-b-2 border-black pb-2 pt-1">
              <div className="font-black text-base text-black pb-1 mb-1.5 uppercase tracking-wide">
                📋 បញ្ជីទំនិញ (PACKING LIST) ៖
              </div>

              <div className="flex flex-col gap-3">
                {invoice.items.map((it, idx) => {
                  const custom = (it.product_name || '')
                    .replace(new RegExp(`^ទំនិញកូដ\\s*\\[?${it.product_code}\\]?`, 'i'), '')
                    .replace(new RegExp(`^កូដ\\s*\\[?${it.product_code}\\]?`, 'i'), '')
                    .replace(new RegExp(`\\[?${it.product_code}\\]?`, 'i'), '')
                    .replace(/^ទំនិញ\s*/i, '')
                    .replace(/\s*ទំនិញ$/i, '')
                    .trim();
                  const hasCustom = custom && custom !== 'ទំនិញ';

                  return (
                    <div key={idx} className="flex flex-col text-base leading-snug">
                      <div className="flex justify-between items-center font-bold text-black">
                        <div className="flex items-center gap-1.5 break-words">
                          <span className="font-mono text-sm font-black border-2 border-black px-1 rounded bg-white select-none">[ ]</span>
                          <span className="font-mono font-black text-2xl text-black">កូដ [ {it.product_code} ]</span>
                          {hasCustom ? <span className="font-bold text-black text-sm ml-1">{custom}</span> : null}
                        </div>
                        <div className="flex items-center gap-3 font-mono font-black text-xl text-black">
                          <span className="min-w-[36px] text-right">x{it.quantity}</span>
                          <span className="min-w-[75px] text-right">${(it.price * it.quantity).toFixed(2)}</span>
                        </div>
                      </div>
                      {it.item_comment && (
                        <div className="text-sm text-black font-bold pl-7 pt-0.5">
                          ↳ Note: "{it.item_comment}"
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 5. Totals Breakdown */}
            <div className="border-b-2 border-black pb-2 pt-1 flex flex-col gap-1 text-sm font-bold text-black">
              <div className="flex justify-between">
                <span>ចំនួនសរុប ៖</span>
                <strong className="font-black text-base">{totalQty} ឈុត</strong>
              </div>
              <div className="flex justify-between">
                <span>តម្លៃទំនិញ ៖</span>
                <strong className="font-black font-mono text-base">${subtotal.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between">
                <span>សេវាដឹក ៖</span>
                <strong className="font-black font-mono text-base">{shippingFee === 0 ? 'FREE' : `+$${shippingFee.toFixed(2)}`}</strong>
              </div>
            </div>

            {/* 6. Grand Total */}
            <div className="border-b-2 border-black pb-2 pt-1 text-center">
              <div className="text-3xl font-black font-mono text-black py-1">
                TOTAL: ${exactTotal.toFixed(2)} / {formattedRiel} R
              </div>
            </div>

            {/* 7. Footer Policy */}
            <div className="text-center font-bold text-xs text-black pt-1 leading-snug">
              <div className="font-black">អរគុណចំពោះការគាំទ្រ KARI ARNETT!</div>
              <div className="text-[11px]">ទំនិញទិញហើយមិនអាចប្តូរវិញបានទេ</div>
            </div>

            {/* Cut Line */}
            <div className="text-center text-[10px] text-gray-500 font-mono tracking-widest pt-1 border-t border-dotted border-gray-400">
              - - - - - - - - [ កាត់ត្រង់នេះ ✂️ ] - - - - - - - -
            </div>
          </div>

          {/* Offscreen Dedicated 576px Element (Used for 1:1 Pixel-Perfect 80mm ESC/POS Bitmap) */}
          <div
            ref={offscreenRenderRef}
            style={{
              position: 'fixed',
              left: '-9999px',
              top: '0',
              width: '576px',
              backgroundColor: '#ffffff',
              color: '#000000',
              padding: '16px 16px 24px 16px',
              boxSizing: 'border-box',
              fontFamily: "'Battambang', 'Kantumruy Pro', 'Khmer OS Siemreap', system-ui, sans-serif",
              lineHeight: 1.35,
              WebkitFontSmoothing: 'antialiased',
              textRendering: 'geometricPrecision'
            }}
          >
            {/* Header: Store Identity */}
            <div style={{ textAlign: 'center', borderBottom: '3px solid #000000', paddingBottom: '12px', marginBottom: '12px' }}>
              <div style={{ fontSize: '36px', fontWeight: 900, fontFamily: 'monospace', color: '#000000', textTransform: 'uppercase', letterSpacing: '1px', lineHeight: 1.1 }}>
                KARI ARNETT BOUTIQUE
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#000000', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '6px' }}>
                PREMIUM LIVE FULFILLMENT
              </div>
            </div>

            {/* Basket No + Zone + Date/Time */}
            <div style={{ borderBottom: '3px solid #000000', paddingBottom: '12px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                  <span style={{ fontSize: '26px', fontWeight: 800 }}>វិក្កយបត្រ ៖</span>
                  <span style={{ fontSize: '48px', fontWeight: 900, fontFamily: 'monospace', color: '#000000', lineHeight: 1 }}>
                    #{invoice.basket_no || invoice.invoice_id}
                  </span>
                </div>
                <span style={{ fontSize: '24px', fontWeight: 800, border: '3px solid #000000', padding: '4px 12px', borderRadius: '6px', color: '#000000' }}>
                  {locationBadge}
                </span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '8px', color: '#000000', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>កាលបរិច្ឆេទ ៖</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 800 }}>{dateStr} {timeStr}</span>
              </div>
            </div>

            {/* Customer Row */}
            <div style={{ borderBottom: '3px solid #000000', paddingBottom: '12px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '26px', fontWeight: 800, color: '#000000' }}>
                <div>
                  <span>អតិថិជន ៖ </span>
                  <strong style={{ fontSize: '35px', fontWeight: 900 }}>{invoice.facebook_name}</strong>
                </div>
                <div>
                  <span>ទូរស័ព្ទ  ៖ </span>
                  <strong style={{ fontSize: '32px', fontWeight: 900, fontFamily: 'monospace' }}>{phoneText || '[គ្មានលេខ]'}</strong>
                </div>
                {addressText ? (
                  <div>
                    <span>ទីតាំង   ៖ </span>
                    <strong style={{ fontSize: '25px', fontWeight: 800 }}>{addressText}</strong>
                  </div>
                ) : null}
                <div>
                  <span>តំបន់   ៖ </span>
                  <strong style={{ fontSize: '25px', fontWeight: 800 }}>{locationBadge}</strong>
                </div>
              </div>

              {avatarUrl ? (
                <div style={{ width: '84px', height: '84px', borderRadius: '50%', border: '3px solid #000000', overflow: 'hidden', flexShrink: 0, marginLeft: '12px' }}>
                  <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} crossOrigin="anonymous" />
                </div>
              ) : null}
            </div>

            {/* Table Header / Title */}
            <div style={{ borderBottom: '3px solid #000000', paddingBottom: '12px', marginBottom: '12px' }}>
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#000000', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>
                📋 បញ្ជីទំនិញ (PACKING LIST) ៖
              </div>

              {/* Items List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {invoice.items.map((it, idx) => {
                  const custom = (it.product_name || '')
                    .replace(new RegExp(`^ទំនិញកូដ\\s*\\[?${it.product_code}\\]?`, 'i'), '')
                    .replace(new RegExp(`^កូដ\\s*\\[?${it.product_code}\\]?`, 'i'), '')
                    .replace(new RegExp(`\\[?${it.product_code}\\]?`, 'i'), '')
                    .replace(/^ទំនិញ\s*/i, '')
                    .replace(/\s*ទំនិញ$/i, '')
                    .trim();
                  const hasCustom = custom && custom !== 'ទំនិញ';

                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', color: '#000000' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '28px', fontWeight: 900, fontFamily: 'monospace', border: '3px solid #000', padding: '0 6px', borderRadius: '4px' }}>[ ]</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '40px' }}>កូដ [ {it.product_code} ]</span>
                          {hasCustom ? <span style={{ marginLeft: '6px', fontSize: '24px', fontWeight: 800 }}>{custom}</span> : null}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '34px', minWidth: '55px', textAlign: 'right' }}>
                            x{it.quantity}
                          </span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '34px', minWidth: '110px', textAlign: 'right' }}>
                            ${(it.price * it.quantity).toFixed(2)}
                          </span>
                        </div>
                      </div>
                      {it.item_comment && (
                        <div style={{ fontSize: '24px', fontWeight: 800, paddingLeft: '48px', paddingTop: '4px', color: '#000000' }}>
                          ↳ Note: "{it.item_comment}"
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Totals Section */}
            <div style={{ borderBottom: '3px solid #000000', paddingBottom: '12px', marginBottom: '12px', fontSize: '25px', fontWeight: 800, color: '#000000', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>ចំនួនសរុប ៖</span>
                <strong style={{ fontSize: '28px', fontWeight: 900 }}>{totalQty} ឈុត</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>តម្លៃទំនិញ ៖</span>
                <strong style={{ fontSize: '28px', fontWeight: 900, fontFamily: 'monospace' }}>${subtotal.toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>សេវាដឹក ៖</span>
                <strong style={{ fontSize: '28px', fontWeight: 900, fontFamily: 'monospace' }}>{shippingFee === 0 ? 'FREE' : `+$${shippingFee.toFixed(2)}`}</strong>
              </div>
            </div>

            {/* Grand Total Bar */}
            <div style={{ borderBottom: '3px solid #000000', paddingBottom: '14px', marginBottom: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '50px', fontWeight: 900, fontFamily: 'monospace', color: '#000000', lineHeight: 1.1 }}>
                TOTAL: ${exactTotal.toFixed(2)} / {formattedRiel} R
              </div>
            </div>

            {/* Footer */}
            <div style={{ textAlign: 'center', fontSize: '24px', fontWeight: 900, color: '#000000', lineHeight: 1.4 }}>
              <div>អរគុណចំពោះការគាំទ្រ KARI ARNETT!</div>
              <div style={{ fontSize: '20px', fontWeight: 800 }}>ទំនិញទិញហើយមិនអាចប្តូរវិញបានទេ</div>
            </div>

            {/* Cut Line */}
            <div style={{ textAlign: 'center', fontSize: '18px', fontWeight: 800, marginTop: '12px', borderTop: '2px dashed #000000', paddingTop: '8px' }}>
              - - - - - - - - - - [ កាត់ត្រង់នេះ ✂️ ] - - - - - - - - - -
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* 🚀 SMART DIRECT POS PRINTING CONTROLS FOR MOBILE PHONES       */}
        {/* ------------------------------------------------------------- */}
        <div className="p-3 bg-[#070D1B] border-t border-slate-800 flex flex-col gap-2.5">
          
          {/* Print Mode Selector Tabs */}
          <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => handleSelectMode('bluetooth')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-black flex items-center justify-center gap-1 transition-all cursor-pointer ${
                printMode === 'bluetooth'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="ព្រីនតាម Bluetooth ផ្ទាល់ (1-Tap & Auto-Cut)"
            >
              <span>⚡</span>
              <span>Bluetooth POS</span>
              {isBtConnected && (
                <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse"></span>
              )}
            </button>

            <button
              onClick={() => handleSelectMode('rawbt')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-black flex items-center justify-center gap-1 transition-all cursor-pointer ${
                printMode === 'rawbt'
                  ? 'bg-gradient-to-r from-teal-600 to-cyan-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="RawBT Print Service (1-Tap លើ Android សម្រាប់ USB, Bluetooth ឬ Wi-Fi)"
            >
              <span>📱</span>
              <span>RawBT POS</span>
            </button>

            <button
              onClick={() => handleSelectMode('agent')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-black flex items-center justify-center gap-1 transition-all cursor-pointer ${
                printMode === 'agent'
                  ? 'bg-gradient-to-r from-amber-600 to-orange-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Shop Print Agent (កូនកម្មវិធីព្រីនក្នុងហាង - មិនបាច់ប្រើ IP លើទូរស័ព្ទ)"
            >
              <span>🏪</span>
              <span>Shop Agent</span>
              {isAgentOnline && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Agent Online"></span>
              )}
            </button>

            <button
              onClick={() => handleSelectMode('browser')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-black flex items-center justify-center gap-1 transition-all cursor-pointer ${
                printMode === 'browser'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="ព្រីនតាមប្រព័ន្ធ (AirPrint លើ iPhone ឬ Android Service)"
            >
              <span>🖨️</span>
              <span>AirPrint</span>
            </button>
          </div>

          {/* Configuration / Status Row based on Selected Mode */}
          {printMode === 'rawbt' && (
            <div className="flex items-center justify-between bg-teal-950/40 border border-teal-500/40 px-3 py-2 rounded-xl text-xs">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 font-bold text-teal-200">
                  <span>📱 RawBT Driver Service (Android)</span>
                </div>
                <div className="text-[10px] text-slate-300">
                  គាំទ្រគ្រប់ម៉ាស៊ីនព្រីន <strong>XP-80C, POS-80</strong> តាម <strong>USB OTG, Bluetooth, Wi-Fi</strong>
                </div>
              </div>
              <a
                href="https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter"
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded font-bold text-[10px] no-underline whitespace-nowrap shadow cursor-pointer"
              >
                ទាញយក App
              </a>
            </div>
          )}

          {printMode === 'bluetooth' && (
            <div className="flex items-center justify-between bg-emerald-950/40 border border-emerald-500/40 px-3 py-1.5 rounded-xl text-xs">
              <div className="flex items-center gap-2 truncate">
                <span className={`w-2.5 h-2.5 rounded-full ${isBtConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                <span className="font-bold text-emerald-200 truncate">
                  {isBtConnected ? `ម៉ាស៊ីន ៖ ${btDeviceName || 'Connected'}` : (btDeviceName ? `បានចាំ ៖ ${btDeviceName}` : 'មិនទាន់ភ្ជាប់ម៉ាស៊ីន Bluetooth')}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={handleConnectBluetooth}
                  disabled={isBtConnecting}
                  className="bg-emerald-500 hover:bg-emerald-400 text-black px-2.5 py-1 rounded-lg font-black text-[11px] shadow active:scale-95 transition-all cursor-pointer"
                >
                  {isBtConnecting ? 'កំពុងស្វែងរក...' : (isBtConnected ? 'ប្តូរម៉ាស៊ីន' : '🔗 ភ្ជាប់ម៉ាស៊ីន')}
                </button>
                {isBtConnected && (
                  <button
                    onClick={handleDisconnectBluetooth}
                    className="text-slate-400 hover:text-rose-400 px-1.5 text-xs cursor-pointer"
                    title="ផ្តាច់ការភ្ជាប់"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}

          {printMode === 'agent' && (
            <div className="flex flex-col gap-2 bg-amber-950/30 border border-amber-500/40 p-2.5 rounded-xl text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 truncate">
                  <span className={`w-2.5 h-2.5 rounded-full ${isAgentOnline ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-rose-500'}`}></span>
                  <span className="font-bold text-amber-200 truncate">
                    {isAgentOnline
                      ? `Print Agent ៖ Online (${agentTarget || '192.168.0.200:9100'})`
                      : 'Print Agent ក្នុងហាង ៖ Offline (មិនទាន់បើក)'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={checkAgentStatus}
                    disabled={isCheckingAgent}
                    className="text-[11px] text-amber-400 hover:text-amber-200 underline cursor-pointer"
                  >
                    {isCheckingAgent ? 'កំពុងឆែក...' : '🔄 ឆែកឡើងវិញ'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAgentSetup(!showAgentSetup)}
                    className="text-[11px] text-amber-400 hover:text-amber-200 underline cursor-pointer"
                  >
                    {showAgentSetup ? 'បិទការណែនាំ' : '📖 របៀបដំឡើង'}
                  </button>
                </div>
              </div>

              {/* Local Wi-Fi Direct Input (Instant 0.05s, Zero Rate Limit) */}
              <div className="flex items-center gap-1.5 pt-1.5 border-t border-amber-900/40">
                <span className="text-[10px] text-amber-300/80 whitespace-nowrap font-medium">🏠 Wi-Fi ផ្ទាល់ ៖</span>
                <input
                  type="text"
                  value={localAgentUrl}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLocalAgentUrl(val);
                    localStorage.setItem('pos_local_agent_url', val);
                  }}
                  placeholder="http://192.168.0.7:8088"
                  className="flex-1 bg-black/50 border border-amber-600/40 rounded px-2 py-0.5 text-[11px] font-mono text-amber-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!localAgentUrl) return;
                    onShowToast('⚡ កំពុងតេស្តភ្ជាប់ Wi-Fi ផ្ទាល់ទៅកាន់ PC...');
                    try {
                      const res = await fetch(localAgentUrl, { signal: AbortSignal.timeout(1500) });
                      if (res.ok) {
                        const d = await res.json();
                        playSuccessFanfare();
                        setIsAgentOnline(true);
                        setAgentTarget(d.printer || 'Online');
                        onShowToast(`🟢 ភ្ជាប់ Wi-Fi ផ្ទាល់ទៅ PC ជោគជ័យ (${d.printer})!`, 'success');
                      } else {
                        onShowToast('❌ មិនអាចភ្ជាប់បានទេ។ សូមពិនិត្យមើលថាតើទូរស័ព្ទបានភ្ជាប់ Wi-Fi ហាងហើយឬនៅ?', 'error');
                      }
                    } catch {
                      onShowToast('❌ មិនអាចភ្ជាប់បានទេ។ សូមពិនិត្យ Wi-Fi និង IP លើកុំព្យូទ័រ!', 'error');
                    }
                  }}
                  className="px-2 py-0.5 bg-amber-600/80 hover:bg-amber-500 text-white rounded text-[10px] font-bold cursor-pointer transition shadow"
                >
                  តេស្ត
                </button>
              </div>

              {/* Quick instructions / Download pos_agent.py or pos-agent.js */}
              {showAgentSetup && (
                <div className="pt-2 border-t border-amber-900/60 flex flex-col gap-2 text-[11px] text-slate-300 leading-relaxed">
                  <div className="text-amber-300 font-bold">
                    💡 របៀបប្រើ Shop Print Agent ជាមួយ Python (Zero-Install) ៖
                  </div>
                  <div>
                    ១. បើកកុំព្យូទ័រក្នុងហាងដែលភ្ជាប់ Wi-Fi ឬខ្សែជាមួយម៉ាស៊ីនព្រីន
                  </div>
                  <div>
                    ២. ទាញយក <strong className="text-emerald-400">pos_agent.py</strong> ដាក់លើ Desktop រួចបើក Command Prompt (CMD) វាយ ៖
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="bg-black/60 p-2 rounded-lg font-mono text-[11px] text-emerald-300 select-all border border-slate-700 flex items-center justify-between">
                      <span>python pos_agent.py usb</span>
                      <span className="text-[9px] text-slate-400 font-sans font-bold uppercase bg-amber-950/70 text-amber-300 border border-amber-600/40 px-1.5 py-0.5 rounded">🔌 ខ្សែ USB</span>
                    </div>
                    <div className="bg-black/60 p-2 rounded-lg font-mono text-[11px] text-cyan-300 select-all border border-slate-700 flex items-center justify-between">
                      <span>python pos_agent.py 192.168.0.200</span>
                      <span className="text-[9px] text-slate-400 font-sans font-bold uppercase bg-blue-950/70 text-blue-300 border border-blue-600/40 px-1.5 py-0.5 rounded">📡 ខ្សែ Network</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <a
                      href="/api/print_agent/download_bat"
                      download="START_PRINT_AGENT.bat"
                      className="px-2.5 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black rounded-lg font-black text-[11px] no-underline inline-flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95 transition-all"
                      title="ទាញយកដើម្បីចុច Double Click បើកភ្លាមលើ Windows (1-Click)"
                    >
                      <span>⚡ START_PRINT_AGENT.bat (1-Click បើកលើ Windows)</span>
                    </a>
                    <a
                      href="/api/print_agent/download_python"
                      download="pos_agent.py"
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold text-[10px] no-underline inline-flex items-center gap-1 cursor-pointer border border-slate-700"
                    >
                      <span>🐍 pos_agent.py</span>
                    </a>
                  </div>
                  <div className="p-2 bg-amber-900/30 border border-amber-500/30 rounded text-[10px] text-amber-200">
                    ⚠️ <strong>ចំណាំ ៖</strong> ពេលបើក <code className="text-amber-300 font-mono font-bold">START_PRINT_AGENT.bat</code> ឬ <code className="text-emerald-300 font-mono font-bold">pos_agent.py</code> សូម<strong>ទុកផ្ទាំងខ្មៅចោល</strong> កុំចុច X បិទវា (បើបិទវា វានឹងក្លាយជា Offline)!
                  </div>
                </div>
              )}
            </div>
          )}

          {printMode === 'lan' && (
            <div className="flex flex-col gap-2 bg-blue-950/40 border border-blue-500/40 p-2 rounded-xl text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-blue-200 font-bold">
                  <span>📡 ម៉ាស៊ីនព្រីន Wi-Fi ៖</span>
                  <span className="font-mono bg-black/40 px-2 py-0.5 rounded text-cyan-300 font-black">
                    {lanPrinterIp}:{lanPrinterPort}
                  </span>
                </div>
                <button
                  onClick={() => setShowLanConfig(!showLanConfig)}
                  className="text-[11px] text-cyan-400 hover:text-cyan-200 underline cursor-pointer"
                >
                  {showLanConfig ? 'បិទការកំណត់' : '⚙️ កែប្រែ IP'}
                </button>
              </div>

              {showLanConfig && (
                <div className="flex items-center gap-2 pt-1 border-t border-blue-900/60">
                  <input
                    type="text"
                    placeholder="IP (ឧ. 192.168.0.200)"
                    value={lanPrinterIp}
                    onChange={(e) => {
                      setLanPrinterIp(e.target.value);
                      localStorage.setItem('pos_lan_printer_ip', e.target.value);
                    }}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-mono"
                  />
                  <input
                    type="number"
                    placeholder="Port"
                    value={lanPrinterPort}
                    onChange={(e) => {
                      const p = parseInt(e.target.value, 10) || 9100;
                      setLanPrinterPort(p);
                      localStorage.setItem('pos_lan_printer_port', String(p));
                    }}
                    className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono text-center"
                  />
                  <button
                    onClick={handleTestLan}
                    disabled={isTestingLan}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-2.5 py-1 rounded-lg text-xs active:scale-95 transition-all cursor-pointer"
                  >
                    {isTestingLan ? '...' : 'តេស្ត'}
                  </button>
                </div>
              )}

              {isCloudDeployment && (
                <div className="p-2.5 bg-amber-950/40 border border-amber-500/30 rounded-lg text-[11px] text-amber-200 flex flex-col gap-1.5 leading-relaxed">
                  <div className="font-bold flex items-center gap-1 text-amber-300">
                    <span>💡 ចំណាំ Cloud POS ៖</span>
                  </div>
                  <div>
                    ដោយសារប្រព័ន្ធដំណើរការលើ Cloud Online, Server មិនអាចឆ្លងកាត់ Firewall ទៅកាន់ IP ក្នុងផ្ទះ/ហាង <span className="font-mono text-cyan-300">({lanPrinterIp})</span> បានឡើយ។
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleSelectMode('bluetooth')}
                      className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-[10px] cursor-pointer active:scale-95 transition-all"
                    >
                      ⚡ ប្តូរទៅ Bluetooth POS (1-Tap & Auto-Cut)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectMode('agent')}
                      className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded font-bold text-[10px] cursor-pointer active:scale-95 transition-all"
                    >
                      🏪 ប្តូរទៅ Shop Print Agent
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MAIN BIG ACTION BUTTON (1-TAP POS PRINT) */}
          {printMode === 'rawbt' && (
            <button
              onClick={handleRawBTPrint}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-teal-600 via-cyan-500 to-teal-600 text-white font-black text-sm flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(20,184,166,0.45)] active:scale-98 text-center cursor-pointer transition-all border border-teal-400/50"
            >
              <span className="text-lg">📱</span>
              <span>ព្រីនផ្ទាល់ RawBT POS (1-Tap & Auto-Cut)</span>
            </button>
          )}

          {printMode === 'bluetooth' && (
            <button
              onClick={handleBluetoothDirectPrint}
              disabled={isPrintingBt}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-500 to-green-600 text-white font-black text-sm flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(16,185,129,0.45)] active:scale-98 text-center cursor-pointer disabled:opacity-60 transition-all border border-emerald-400/50"
            >
              <span className="text-lg">⚡</span>
              <span>
                {isPrintingBt
                  ? `កំពុងព្រីន & បញ្ជាកាត់ក្រដាស (${btProgress}%)...`
                  : 'ព្រីនផ្ទាល់ POS (Bluetooth 1-Tap & Auto-Cut)'}
              </span>
            </button>
          )}

          {printMode === 'agent' && (
            <button
              onClick={handleShopAgentPrint}
              disabled={isSendingToAgent}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-600 via-orange-500 to-amber-600 text-white font-black text-sm flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(245,158,11,0.45)] active:scale-98 text-center cursor-pointer disabled:opacity-60 transition-all border border-amber-400/50"
            >
              <span className="text-lg">🏪</span>
              <span>
                {isSendingToAgent
                  ? 'កំពុងបញ្ជូនទៅកាន់ Shop Print Agent...'
                  : (isAgentOnline
                      ? 'ព្រីនតាម Shop Agent (XP-80C Auto-Cut)'
                      : 'ព្រីនតាម Shop Agent (បញ្ជូនទៅ PC XP-80C)')}
              </span>
            </button>
          )}

          {printMode === 'browser' && (
            <button
              onClick={handlePrint}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-sky-600 text-white font-black text-sm flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(99,102,241,0.45)] active:scale-98 text-center cursor-pointer transition-all border border-indigo-400/50"
            >
              <span className="text-lg">🖨️</span>
              <span>ព្រីនតាមប្រព័ន្ធ (AirPrint / 80mm Print Dialog)</span>
            </button>
          )}

          {printMode === 'lan' && (
            <button
              onClick={handleLanDirectPrint}
              disabled={isPrintingLan}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(6,182,212,0.45)] active:scale-98 text-center cursor-pointer disabled:opacity-60 transition-all border border-sky-400/50"
            >
              <span className="text-lg">🌐</span>
              <span>
                {isPrintingLan
                  ? 'កំពុងបញ្ជូនទៅម៉ាស៊ីន Wi-Fi...'
                  : 'ព្រីនផ្ទាល់ Wi-Fi / LAN (Auto-Cut)'}
              </span>
            </button>
          )}

          {/* Secondary Quick Action Row: Copy Text & Standalone Print Tab */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyText}
              className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 border border-slate-700 cursor-pointer"
            >
              <span>📋</span>
              <span>ចម្លងអត្ថបទ</span>
            </button>

            <a
              href={`/api/print_slip/${invoice.invoice_id}?autoprint=true`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                playPureTone(1000, 0.08);
                onShowToast(`🖨️ កំពុងបើកផ្ទាំងព្រីន & បញ្ជូនកន្ត្រក #${invoice.basket_no || invoice.invoice_id} ចូល «រង់ចាំលុយ»...`);
                triggerStagePack('PrintTab');
                setTimeout(() => onClose(), 500);
              }}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs flex items-center justify-center gap-1 border border-slate-700 active:scale-95 no-underline cursor-pointer"
              title="បើកផ្ទាំងព្រីនដាច់ដោយឡែក (Print Tab)"
            >
              <span>🔗</span>
              <span>Print Tab</span>
            </a>
          </div>

          {/* Helpful Mobile POS Tip */}
          <div className="text-[11px] text-slate-400 leading-snug bg-slate-900/90 p-2 rounded-xl border border-slate-800/90 flex items-start gap-1.5">
            <span className="text-amber-300">💡</span>
            <div>
              <strong>វិធីព្រីនផ្ទាល់ដោយមិនប្រើ IP លើទូរស័ព្ទ ៖</strong> ប្រើ <strong>⚡ Bluetooth POS</strong> (ភ្ជាប់ទូរស័ព្ទផ្ទាល់ 1-Tap មិនបាច់ដំឡើង App) ឬ <strong>🏪 Shop Agent</strong> (កុំព្យូទ័រក្នុងហាងទទួលបញ្ជាពីទូរស័ព្ទ ហើយព្រីនកាត់ក្រដាសស្វ័យប្រវត្តិ)!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
