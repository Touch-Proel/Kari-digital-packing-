import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Invoice } from '../../types';
import { playPureTone, playSuccessFanfare } from '../../utils/audio';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  myPackerName: string;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
  onStagePackSuccess?: () => void;
}

export function ReceiptModal({
  isOpen,
  onClose,
  invoice,
  myPackerName,
  onShowToast,
  onStagePackSuccess
}: ReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isRenderingRawBt, setIsRenderingRawBt] = useState(false);

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

  // Handle Direct Print Action
  const handlePrint = async () => {
    playPureTone(1000, 0.08);
    onShowToast(`🖨️ កំពុងព្រីន & បញ្ជូនកន្ត្រក #${invoice.basket_no || invoice.invoice_id} ចូល «រង់ចាំលុយ»...`);
    await triggerStagePack('DirectPrint');

    // Trigger Print Dialog
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // Handle RawBT Graphic Bitmap Print (100% crisp Khmer font, pure black bold)
  const handleRawBtImagePrint = async () => {
    if (!receiptRef.current) return;
    setIsRenderingRawBt(true);
    playPureTone(1200, 0.1);
    onShowToast(`⚡ កំពុង Render រូបភាពសម្រាប់ RawBT...`);

    // Trigger stage pack immediately
    await triggerStagePack('RawBT');

    try {
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false
      });
      const base64Data = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
      const rawbtUrl = `rawbt:data:image/png;base64,${base64Data}`;
      
      onShowToast(`⚡ បានបញ្ជូនទៅ RawBT (Graphic Black) & កន្ត្រក #${invoice.basket_no || invoice.invoice_id} រត់ចូល «រង់ចាំលុយ»!`);
      window.location.href = rawbtUrl;
      setTimeout(() => onClose(), 600);
    } catch (err) {
      console.error('RawBT Canvas error:', err);
      window.print();
    } finally {
      setIsRenderingRawBt(false);
    }
  };

  // Copy receipt text to clipboard
  const handleCopyText = () => {
    let text = `🧾 វិក្កយបត្រកញ្ចប់ #${invoice.basket_no || invoice.invoice_id}\n`;
    text += `👤 ភ្ញៀវ ៖ ${invoice.facebook_name}\n`;
    if (invoice.phone_number && invoice.phone_number !== 'គ្មានលេខ') {
      text += `📞 លេខ ៖ ${invoice.phone_number}\n`;
    }
    if (invoice.address && !invoice.address.includes('មិនទាន់មាន')) {
      text += `📍 ទីតាំង ៖ ${invoice.address} (${invoice.location_label || invoice.location_zone})\n`;
    }
    text += `------------------------\n`;
    invoice.items.forEach(it => {
      const custom = (it.product_name || '')
        .replace(new RegExp(`^ទំនិញកូដ\\s*\\[?${it.product_code}\\]?`, 'i'), '')
        .replace(new RegExp(`^កូដ\\s*\\[?${it.product_code}\\]?`, 'i'), '')
        .replace(new RegExp(`\\[?${it.product_code}\\]?`, 'i'), '')
        .replace(/^ទំនិញ\s*/i, '')
        .replace(/\s*ទំនិញ$/i, '')
        .trim();
      const namePart = custom && custom !== 'ទំនិញ' ? ` ${custom}` : '';
      text += `• កូដ [${it.product_code}]${namePart} x${it.quantity} = $${(it.price * it.quantity).toFixed(2)}\n`;
    });
    text += `------------------------\n`;
    text += `📦 សរុបទំនិញ (${totalQty} មុខ) ៖ $${subtotal.toFixed(2)}\n`;
    text += `🚚 ថ្លៃដឹក ៖ $${shippingFee.toFixed(2)}\n`;
    text += `💵 សរុបត្រូវទូទាត់ ៖ $${exactTotal.toFixed(2)} (${formattedRiel} ៛)\n`;
    text += `🚚 ស្ថានភាព ៖ ${invoice.status === 'Paid' ? 'បង់រួច (PAID)' : 'មិនទាន់បង់ (UNPAID)'}\n`;
    text += `🙏 អរគុណសម្រាប់ការគាំទ្រ!`;

    navigator.clipboard.writeText(text);
    playSuccessFanfare();
    onShowToast('📋 បានចម្លងអត្ថបទវិក្កយបត្ររួចរាល់!');
  };

  const phoneText = invoice.phone_number && invoice.phone_number !== 'គ្មានលេខ' ? invoice.phone_number : '';
  const addressText = invoice.address && !invoice.address.includes('មិនទាន់មាន') ? invoice.address : '';
  const locationBadge = invoice.location_label || (invoice.location_zone === 'PP' ? 'ភ្នំពេញ' : 'តាមខេត្ត');

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-[#0B1426] border border-cyan-500/60 rounded-3xl w-full max-w-md flex flex-col max-h-[92vh] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-[#070D1B]">
          <div className="flex items-center gap-2">
            <span className="text-xl">🖨️</span>
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
            className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-black text-sm"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Receipt Preview (Thermal 80mm Style) */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center bg-slate-950/70">
          {/* Tag indicator for 80x80 Thermal */}
          <div className="mb-2 text-[11px] font-mono text-cyan-300 font-bold bg-slate-900/90 px-3 py-1 rounded-full border border-cyan-500/30 flex items-center gap-1.5 shadow-sm">
            <span>⚡</span>
            <span>ក្រដាស Thermal 80mm (ក្បាល/កន្ទុយខ្លី ខ្មៅដិត Bold)</span>
          </div>

          <div
            id="printable-receipt-area"
            ref={receiptRef}
            className="w-full max-w-[340px] bg-white text-black p-3.5 rounded-xl shadow-2xl text-[12.5px] flex flex-col gap-2 select-text border-2 border-black my-auto"
            style={{
              fontFamily: "'Kantumruy Pro', 'Battambang', 'Siemreap', -apple-system, BlinkMacSystemFont, sans-serif",
              lineHeight: 1.35,
              color: '#000000'
            }}
          >
            {/* Ultra-Compact Header: Basket No + Zone + Date/Time in 1 Line */}
            <div className="flex justify-between items-center border-b-2 border-black pb-1.5">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black font-mono tracking-tight text-black leading-none">
                  #{invoice.basket_no || invoice.invoice_id}
                </span>
                <span className="text-xs font-black text-black border-2 border-black px-2 py-0.5 rounded bg-white leading-tight">
                  {locationBadge}
                </span>
              </div>
              <div className="text-[10.5px] font-black text-black text-right leading-tight">
                <div>{dateStr}</div>
                <div>{timeStr}</div>
              </div>
            </div>

            {/* Customer Box: Compact 1-2 Lines, Pure Black Bold */}
            <div className="border-b-2 border-dashed border-black pb-1.5 font-bold text-black text-[12.5px] leading-tight">
              <div className="flex justify-between items-baseline">
                <span>👤 <strong className="font-black text-black text-[13px]">{invoice.facebook_name}</strong></span>
                {phoneText ? <span>📞 <strong className="font-black font-mono text-black">{phoneText}</strong></span> : null}
              </div>
              {addressText ? (
                <div className="mt-1 text-black font-bold break-words">
                  📍 {addressText}
                </div>
              ) : null}
            </div>

            {/* Itemized Table: Compact, Bold, Pure Black */}
            <div>
              <div className="flex justify-between font-black text-[11.5px] text-black border-b-2 border-black pb-1 mb-1">
                <span className="w-1/2">មុខទំនិញ</span>
                <span className="w-1/6 text-center">ចំនួន</span>
                <span className="w-1/6 text-right">តម្លៃ</span>
                <span className="w-1/6 text-right">សរុប</span>
              </div>

              <div className="flex flex-col gap-1">
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
                    <div key={idx} className="flex flex-col text-xs leading-snug">
                      <div className="flex justify-between items-baseline font-bold text-black">
                        <span className="w-1/2 break-words text-black">
                          <span className="font-mono font-black text-black">[{it.product_code}]</span>
                          {hasCustom ? <span className="font-bold text-black ml-1">{custom}</span> : null}
                        </span>
                        <span className="w-1/6 text-center font-black font-mono text-sm text-black">x{it.quantity}</span>
                        <span className="w-1/6 text-right font-mono font-bold text-black">${it.price.toFixed(2)}</span>
                        <span className="w-1/6 text-right font-black font-mono text-black">${(it.price * it.quantity).toFixed(2)}</span>
                      </div>
                      {it.item_comment && (
                        <div className="text-[10px] text-black font-bold pl-2 pt-0.5 truncate">
                          ↳ "{it.item_comment}"
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Compact Totals Calculation */}
            <div className="border-t-2 border-dashed border-black pt-1.5 flex flex-col gap-1 text-xs">
              <div className="flex justify-between font-bold text-black">
                <span>ទំនិញ ({totalQty} មុខ): <strong>${subtotal.toFixed(2)}</strong></span>
                <span>ថ្លៃដឹក: <strong>${shippingFee.toFixed(2)}</strong></span>
              </div>

              {/* Grand Total - Pure Black Bordered Box */}
              <div className="border-2 border-black p-1.5 rounded bg-white flex justify-between items-center mt-0.5">
                <div className="flex items-baseline gap-1">
                  <span className="font-black text-xs text-black">សរុប ៖</span>
                  <span className="text-xl font-black font-mono text-black leading-none">${exactTotal.toFixed(2)}</span>
                  <span className="text-[11px] font-black text-black ml-1">({formattedRiel}៛)</span>
                </div>
                <span className="text-xs font-black border-2 border-black px-2 py-0.5 rounded bg-white text-black">
                  {invoice.status === 'Paid' ? '✅ PAID' : '⏳ UNPAID'}
                </span>
              </div>
            </div>

            {/* 1-Line Compact Footer (Zero Wasted Space) */}
            <div className="text-center font-black text-[11px] text-black pt-1">
              🙏 អរគុណសម្រាប់ការគាំទ្រ! (#{invoice.basket_no || invoice.invoice_id})
            </div>
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div className="p-3 bg-[#070D1B] border-t border-slate-800 flex flex-col gap-2">
          {/* Main Action Row: Open Print Tab + RawBT Graphic */}
          <div className="flex items-center gap-2">
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
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-[0_4px_16px_rgba(6,182,212,0.4)] active:scale-95 text-center no-underline cursor-pointer"
            >
              <span className="text-sm">🖨️</span>
              <span>ចុចព្រីន (បើកផ្ទាំង Print)</span>
            </a>

            <button
              onClick={handleRawBtImagePrint}
              disabled={isRenderingRawBt}
              className="py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-black text-xs flex items-center justify-center gap-1 shadow-[0_4px_16px_rgba(16,185,129,0.4)] active:scale-95 text-center whitespace-nowrap cursor-pointer disabled:opacity-50"
              title="ព្រីនត្រង់ទៅ RawBT ជារូបភាពខ្មៅដិត 100% មិនបែកអក្សរ"
            >
              <span>⚡</span>
              <span>{isRenderingRawBt ? 'កំពុង Render...' : 'RawBT (រូបភាពច្បាស់)'}</span>
            </button>
          </div>

          {/* Secondary Action Row: Copy Text & Native Fallback */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyText}
              className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 border border-slate-700"
            >
              <span>📋</span>
              <span>ចម្លងអត្ថបទ</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 font-bold text-xs flex items-center justify-center gap-1 border border-slate-700 active:scale-95"
              title="សាកល្បងព្រីនផ្ទាល់ក្នុងផ្ទាំងនេះ"
            >
              <span>🖨️</span>
              <span>ព្រីនផ្ទាល់</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
