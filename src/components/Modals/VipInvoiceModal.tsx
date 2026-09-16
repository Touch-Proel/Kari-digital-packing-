import React, { useState, useEffect } from 'react';
import { Invoice } from '../../types';
import { playPureTone, playSuccessFanfare } from '../../utils/audio';
import { getKHQRConfig, generateBakongKHQRString, generateKHQRDataUrl } from '../../utils/khqr';

interface VipInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
  onDataChanged: () => void;
}

export function VipInvoiceModal({
  isOpen,
  onClose,
  invoice,
  onShowToast,
  onDataChanged
}: VipInvoiceModalProps) {
  const [isSending, setIsSending] = useState(false);
  const [customMsg, setCustomMsg] = useState('');
  const [isEditingCustom, setIsEditingCustom] = useState(false);
  const [khqrDataUrl, setKhqrDataUrl] = useState<string>('');

  // Generate initial message & KHQR preview
  useEffect(() => {
    if (invoice) {
      const khqrCfg = getKHQRConfig();
      const customerName = invoice.facebook_name || 'អតិថិជន VIP';
      const phone = invoice.phone_number && invoice.phone_number !== 'គ្មានលេខ' ? invoice.phone_number : 'មិនទាន់មាន';
      const address = invoice.address && !invoice.address.includes('មិនទាន់មាន') ? invoice.address : 'មិនទាន់មាន';

      const itemsList = invoice.items.map(it => {
        const custom = (it.product_name || '')
          .replace(new RegExp(`^ទំនិញកូដ\\s*\\[?${it.product_code}\\]?`, 'i'), '')
          .replace(new RegExp(`^កូដ\\s*\\[?${it.product_code}\\]?`, 'i'), '')
          .replace(new RegExp(`\\[?${it.product_code}\\]?`, 'i'), '')
          .replace(/^ទំនិញ\s*/i, '')
          .replace(/\s*ទំនិញ$/i, '')
          .trim();
        const hasCustom = custom && custom !== 'ទំនិញ';
        const label = hasCustom ? `កូដ [${it.product_code}] ${custom}` : `កូដ [${it.product_code}]`;
        return `  🔹 ${label} x${it.quantity} = $${(it.price * it.quantity).toFixed(2)}`;
      }).join('\n');

      const totalQty = invoice.items.reduce((s, it) => s + it.quantity, 0);
      const subtotal = invoice.items.reduce((s, it) => s + (it.price * it.quantity), 0);
      const shippingFee = invoice.shipping_fee !== undefined ? invoice.shipping_fee : 2.0;
      const exactTotal = Number((subtotal + shippingFee).toFixed(2));
      const totalKhr = Math.round(exactTotal * 4100).toLocaleString('en-US');

      const defaultText =
        `🎉 ជម្រាបសួរចា៎បង ${customerName}! អីវ៉ាន់កន្ត្រក #${invoice.basket_no || invoice.invoice_id} ត្រូវបានរៀបចំច្រករួចរាល់ហើយចា៎ 🛍️\n\n` +
        `🧾 វិក្កយបត្រកុម្ម៉ង់ទំនិញ (VIP INVOICE)\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `👤 អតិថិជន ៖ ${customerName}\n` +
        `📞 ទូរស័ព្ទ  ៖ ${phone}\n` +
        `📍 ទីតាំង   ៖ ${address}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📋 បញ្ជីទំនិញកាត់បាន ៖\n` +
        `${itemsList || '  🔹 ទំនិញទូទៅ'}\n` +
        `----------------------------------\n` +
        `📦 ចំនួនសរុប ៖ ${totalQty} ឈុត\n` +
        `💵 តម្លៃទំនិញ ៖ $${subtotal.toFixed(2)}\n` +
        `🚚 សេវាដឹកជញ្ជូន ៖ ${shippingFee === 0 ? 'FREE ហ្វ្រីដឹក' : `+$${shippingFee.toFixed(2)}`}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `💰 សរុបត្រូវទូទាត់ ៖ $${exactTotal.toFixed(2)} / ${totalKhr} រៀល\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🏦 គណនីវេរប្រាក់ (ABA / KHQR) ៖\n` +
        `💳 ធនាគារ      ៖ ${khqrCfg.bankName}\n` +
        `🔢 លេខគណនី ABA ៖ ${khqrCfg.accountNumber}\n` +
        `👤 ឈ្មោះម្ចាស់កុង ៖ ${khqrCfg.accountName}\n` +
        `🏪 ឈ្មោះហាង     ៖ ${khqrCfg.merchantName}\n` +
        `🔗 Bakong ID    ៖ ${khqrCfg.bakongAccountId}\n\n` +
        `🙏 សូមបងជួយវេរប្រាក់ និងផ្ញើ Slip មកកាន់ប្រអប់ឆាតនេះ ដើម្បីខាងប្អូនបញ្ចេញកញ្ចប់អីវ៉ាន់ជូន Delivery ដឹកជូនភ្លាមៗចា៎ 🥰`;

      setCustomMsg(defaultText);
      setIsEditingCustom(false);

      // Generate QR preview
      const qrStr = generateBakongKHQRString({
        amount: exactTotal,
        currency: 'USD',
        billNumber: invoice.basket_no || invoice.invoice_id,
        storeLabel: khqrCfg.merchantName || 'Kari Arnett',
        config: khqrCfg
      });
      generateKHQRDataUrl(qrStr, { width: 220, margin: 1 })
        .then(url => setKhqrDataUrl(url))
        .catch(() => {});
    }
  }, [invoice]);

  if (!isOpen || !invoice) return null;

  const handleSendVIP = async () => {
    setIsSending(true);
    playPureTone(900, 0.08);
    onShowToast(`✉️ កំពុងផ្ញើវិក្កយបត្រ VIP ទៅកាន់ ${invoice.facebook_name}...`);

    try {
      const res = await fetch('/api/send_vip_invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          facebook_name: invoice.facebook_name,
          custom_message: customMsg,
          total_amount: invoice.total_amount
        })
      });

      const data = await res.json();
      // Always copy message to clipboard for user convenience
      if (navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(data.vip_message || customMsg);
        } catch {}
      }

      if (data.success) {
        invoice.msg_status = 'SENT';
        playSuccessFanfare();
        onShowToast(`✅ បានផ្ញើវិក្កយបត្រ VIP & Copy ចូល Clipboard រួចរាល់!`, 'success');
        onDataChanged();
        setTimeout(() => onClose(), 600);
      } else {
        onShowToast(`ℹ️ ${data.error || 'បាន Copy សារវិក្កយបត្ររួចរាល់ ➔ សូមចុចឆាតផ្ទាល់'}`, 'error');
      }
    } catch (err: any) {
      onShowToast(`❌ បរាជ័យក្នុងការផ្ញើវិក្កយបត្រ VIP៖ ${err?.message || err}`, 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyOnly = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(customMsg);
      playSuccessFanfare();
      onShowToast('📋 បានចម្លងអត្ថបទវិក្កយបត្រ VIP រួចរាល់!', 'success');
    }
  };

  const openMessengerDirect = () => {
    if (invoice.facebook_user_id && !['FB_USER_ID_STREAM', 'MANUAL_USER_ID', 'NONE'].includes(invoice.facebook_user_id)) {
      window.open(`https://www.facebook.com/messages/t/${invoice.facebook_user_id}`, '_blank');
    } else {
      window.open('https://www.facebook.com/messages', '_blank');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-[#0B1426] border border-purple-500/60 rounded-3xl w-full max-w-lg flex flex-col max-h-[92vh] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-purple-900/60 bg-[#080D1B]">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">✉️</span>
            <div>
              <h3 className="text-white font-black text-sm sm:text-base flex items-center gap-2">
                <span>ផ្ញើវិក្កយបត្រ VIP (Messenger / ABA)</span>
                {invoice.msg_status === 'SENT' ? (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold">
                    ✅ ឆាតជោគជ័យ
                  </span>
                ) : invoice.msg_status === 'FAILED' ? (
                  <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded-full font-bold animate-pulse">
                    ❌ ផ្ញើបរាជ័យ
                  </span>
                ) : (
                  <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded-full font-bold">
                    ⏳ រង់ចាំផ្ញើ
                  </span>
                )}
              </h3>
              <div className="text-xs text-purple-300 font-mono">
                កន្ត្រក #{invoice.basket_no || invoice.invoice_id} ‧ {invoice.facebook_name}
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

        {/* Message Preview Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-slate-950/70">
          {invoice.msg_status === 'FAILED' && (
            <div className="bg-rose-950/60 border border-rose-600/70 rounded-2xl p-3 text-xs text-rose-200 flex items-start gap-2.5 shadow-md">
              <span className="text-lg">⚠️</span>
              <div className="flex-1">
                <div className="font-bold text-rose-100">ការផ្ញើស្វ័យប្រវត្តិកន្លងមកមិនបានជោគជ័យ ៖</div>
                <div className="text-[11px] text-rose-300/90 mt-0.5">
                  Facebook Meta API អាចបដិសេធដោយសារហួសពេល ២៤ ម៉ោង ឬគ្មាន Chat ID។ សូមចុចប៊ូតុង <strong>«💬 បើក Messenger»</strong> ខាងក្រោម ដើម្បី Paste អត្ថបទវិក្កយបត្រនេះជូនភ្ញៀវដោយផ្ទាល់!
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <span>💬</span>
              <span>ខ្លឹមសារសារ VIP (Auto-Generated Invoice)</span>
            </label>
            <button
              type="button"
              onClick={() => setIsEditingCustom(!isEditingCustom)}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-bold underline cursor-pointer"
            >
              {isEditingCustom ? '🔒 ចាក់សោការកែ' : '✏️ កែសម្រួលអត្ថបទ'}
            </button>
          </div>

          {isEditingCustom ? (
            <textarea
              value={customMsg}
              onChange={(e) => setCustomMsg(e.target.value)}
              rows={12}
              className="w-full bg-[#050B16] border border-purple-500/80 rounded-2xl p-3.5 text-xs text-white font-mono leading-relaxed outline-none focus:ring-2 focus:ring-purple-400 resize-none"
            />
          ) : (
            <div className="w-full bg-[#070F1E] border border-purple-900/60 rounded-2xl p-3.5 text-xs text-slate-200 font-sans leading-relaxed whitespace-pre-wrap select-text max-h-[340px] overflow-y-auto shadow-inner">
              {customMsg}
            </div>
          )}

          {/* KHQR Card in Vip Modal */}
          {khqrDataUrl && (
            <div className="bg-[#0D182E] border border-red-500/50 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-md">
              <div className="flex items-center gap-2.5">
                <img
                  src={khqrDataUrl}
                  alt="KHQR"
                  className="w-14 h-14 object-contain bg-white rounded-lg p-0.5 border border-red-400 shadow-sm"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="bg-[#E11925] text-white text-[9px] font-black px-1 rounded">KHQR</span>
                    <span className="text-white text-xs font-bold">ABA: 000474559</span>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    Proel Toch ‧ Kari Arnett
                  </div>
                  <div className="text-[11px] text-emerald-400 font-mono font-bold">
                    ${Number((invoice.items.reduce((s, it) => s + it.price * it.quantity, 0) + (invoice.shipping_fee !== undefined ? invoice.shipping_fee : 2)).toFixed(2))}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = khqrDataUrl;
                  a.download = `KHQR_Basket_${invoice.basket_no || invoice.invoice_id}.png`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  onShowToast('📥 បានទាញយក QR code សម្រាប់ផ្ញើ!');
                }}
                className="px-2.5 py-1.5 rounded-xl bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-500/60 text-xs font-bold flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
              >
                <span>📥</span>
                <span>ទាញយក QR</span>
              </button>
            </div>
          )}

          {/* Tips */}
          <div className="bg-purple-950/40 border border-purple-800/40 rounded-xl p-2.5 text-[11px] text-purple-200 flex items-start gap-2">
            <span>💡</span>
            <div>
              ចុច <strong>«🚀 ផ្ញើ & Copy វិក្កយបត្រ VIP»</strong> នោះប្រព័ន្ធនឹងបញ្ជូនសារទៅ Facebook Page Inbox / Comment Reply និង Copy អត្ថបទចូល Clipboard ភ្លាមៗដើម្បីងាយស្រួលបិទភ្ជាប់ (Paste) ក្នុង Messenger ឬ Telegram!
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-purple-900/60 bg-[#080D1B] flex flex-col gap-2.5">
          {/* Main Primary Send Button */}
          <button
            onClick={handleSendVIP}
            disabled={isSending}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-[0_4px_22px_rgba(147,51,234,0.45)] active:scale-98 cursor-pointer disabled:opacity-50 transition-all border border-purple-400/40"
          >
            <span className="text-lg">🚀</span>
            <span>{isSending ? 'កំពុងបញ្ជូនសារ...' : 'ផ្ញើ & Copy វិក្កយបត្រ VIP (1-Tap)'}</span>
          </button>

          {/* Secondary Buttons: Copy only & Open Messenger */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleCopyOnly}
              className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-700 active:scale-95 transition-all cursor-pointer"
            >
              <span>📋</span>
              <span>ចម្លងអត្ថបទ (Copy)</span>
            </button>

            <button
              onClick={openMessengerDirect}
              className="py-2.5 px-3 rounded-xl bg-[#0084FF]/20 hover:bg-[#0084FF]/30 text-[#40B0FF] font-bold text-xs flex items-center justify-center gap-1.5 border border-[#0084FF]/50 active:scale-95 transition-all cursor-pointer"
            >
              <span>💬</span>
              <span>បើក Messenger</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
