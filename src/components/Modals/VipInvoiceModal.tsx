import React, { useState, useEffect } from 'react';
import { Invoice } from '../../types';
import { playPureTone, playSuccessFanfare } from '../../utils/audio';
import { openMetaInboxDirect } from '../../utils/metaInbox';

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
  const [deliveryLogs, setDeliveryLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  // Background auto-resolve on open if missing comment ID
  useEffect(() => {
    if (isOpen && invoice) {
      const cid = (invoice.last_comment_id || (invoice.comment_ids && invoice.comment_ids[0]) || '').trim();
      if (!cid) {
        fetch(`/api/invoices/${invoice.invoice_id}/auto_resolve_comment`)
          .then(r => r.json())
          .then(d => {
            if (d.success && d.comment_id) {
              invoice.last_comment_id = d.comment_id;
              if (!invoice.comment_ids) invoice.comment_ids = [];
              if (!invoice.comment_ids.includes(d.comment_id)) invoice.comment_ids.unshift(d.comment_id);
              onDataChanged();
            }
          })
          .catch(() => {});
      }
    }
  }, [isOpen, invoice]);

  // Generate initial message
  useEffect(() => {
    if (invoice) {
      setDeliveryLogs([]);
      setShowLogs(false);
      const customerName = invoice.facebook_name || 'អតិថិជន VIP';
      const phone = invoice.phone_number && invoice.phone_number !== 'គ្មានលេខ' ? invoice.phone_number : 'មិនទាន់មាន';
      const address = invoice.address && !invoice.address.includes('មិនទាន់មាន') ? invoice.address : 'មិនទាន់មាន';

      const itemsList = (invoice.items || []).map(it => {
        const custom = (it.product_name || '')
          .replace(new RegExp(`^ទំនិញកូដ\\s*\\[?${it.product_code}\\]?`, 'i'), '')
          .replace(new RegExp(`^កូដ\\s*\\[?${it.product_code}\\]?`, 'i'), '')
          .replace(new RegExp(`\\[?${it.product_code}\\]?`, 'i'), '')
          .replace(/^ទំនិញ\s*/i, '')
          .replace(/\s*ទំនិញ$/i, '')
          .trim();
        const hasCustom = custom && custom !== 'ទំនិញ';
        const label = hasCustom ? `[${it.product_code}] ${custom}` : `[${it.product_code}]`;
        return `• ${label} x${it.quantity} = $${(it.price * it.quantity).toFixed(2)}`;
      }).join('\n');

      const totalQty = invoice.items.reduce((s, it) => s + it.quantity, 0);
      const subtotal = invoice.items.reduce((s, it) => s + (it.price * it.quantity), 0);
      const shippingFee = invoice.shipping_fee !== undefined ? invoice.shipping_fee : 2.0;
      const exactTotal = Number((subtotal + shippingFee).toFixed(2));
      const totalKhr = Math.round(exactTotal * 4100).toLocaleString('en-US');
      const phoneText = phone !== 'មិនទាន់មាន' ? ` (${phone})` : '';

      const defaultText =
        `🛍️ វិក្កយបត្រកន្ត្រក #${invoice.basket_no || invoice.invoice_id} (${customerName})\n` +
        `📍 ទីតាំង ៖ ${address}${phoneText}\n\n` +
        `📋 បញ្ជីទំនិញ ៖\n` +
        `${itemsList || '• ទំនិញទូទៅ'}\n` +
        `------------------------\n` +
        `📦 សរុប ${totalQty} ឈុត ៖ $${subtotal.toFixed(2)}${shippingFee === 0 ? ' (ហ្វ្រីដឹក)' : ` + ដឹក $${shippingFee.toFixed(2)}`} = $${exactTotal.toFixed(2)}\n` +
        `💰 ទឹកប្រាក់ត្រូវបង់ ៖ $${exactTotal.toFixed(2)} (${totalKhr}៛)\n\n` +
        `🙏 វេររួចសូមផ្ញើ Slip មកកាន់ប្រអប់ឆាតនេះចា៎ 🥰`;

      setCustomMsg(defaultText);
      setIsEditingCustom(false);
    }
  }, [invoice]);

  if (!isOpen || !invoice) return null;

  const handleSendVIP = async () => {
    setIsSending(true);
    playPureTone(900, 0.08);
    onShowToast(`✉️ កំពុងផ្ញើវិក្កយបត្រ VIP ទៅកាន់ ${invoice.facebook_name}...`);

    try {
      const targetCid = (invoice.last_comment_id || (invoice.comment_ids && invoice.comment_ids[0]) || '').trim();
      const res = await fetch('/api/send_vip_invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          facebook_name: invoice.facebook_name,
          custom_message: customMsg,
          total_amount: invoice.total_amount,
          comment_id: targetCid,
          comment_ids: targetCid ? [targetCid, ...(invoice.comment_ids || [])] : (invoice.comment_ids || [])
        })
      });

      const data = await res.json();
      // Always copy message to clipboard for user convenience
      if (navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(data.vip_message || customMsg);
        } catch {}
      }

      if (Array.isArray(data.attempt_logs)) {
        setDeliveryLogs(data.attempt_logs);
        setShowLogs(true);
      } else if (Array.isArray(data.attemptLogs)) {
        setDeliveryLogs(data.attemptLogs);
        setShowLogs(true);
      }

      if (data.success) {
        invoice.msg_status = 'SENT';
        if (data.msg_delivery_method) {
          invoice.msg_delivery_method = data.msg_delivery_method;
        }
        playSuccessFanfare();
        const successTitle = data.method_title ? `[${data.method_title}] ` : '';
        onShowToast(`✅ ${successTitle}${data.message || 'បានផ្ញើវិក្កយបត្រ VIP ជោគជ័យ!'}`, 'success');
        onDataChanged();
        setTimeout(() => onClose(), 800);
      } else {
        invoice.msg_status = 'FAILED';
        invoice.msg_delivery_method = 'MANUAL_COPIED';
        onShowToast(`ℹ️ ${data.error || 'បាន Copy សារវិក្កយបត្ររួចរាល់ ➔ សូមចុចឆាតផ្ទាល់'}`, 'error');
        onDataChanged();
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
    openMetaInboxDirect(invoice?.facebook_user_id);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[99999] flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-[#0c1222] border border-slate-700/60 rounded-3xl w-full max-w-lg flex flex-col max-h-[92vh] shadow-2xl overflow-hidden ring-1 ring-white/5">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-[#090e1a]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-lg shadow-inner">
              ✉️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-white font-bold text-sm sm:text-base tracking-tight">
                  ផ្ញើវិក្កយបត្រ VIP
                </h3>
                {invoice.msg_status === 'SENT' ? (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <span>✅</span>
                    <span>
                      {invoice.msg_delivery_method === 'PRIVATE_REPLY'
                        ? 'Private Reply'
                        : 'Direct Inbox'}
                    </span>
                  </span>
                ) : invoice.msg_status === 'FAILED' ? (
                  <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded-full font-bold animate-pulse">
                    ❌ ផ្ញើបរាជ័យ
                  </span>
                ) : (
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded-full font-bold">
                    ⚡ ស្វ័យប្រវត្ត
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 font-medium mt-0.5">
                កន្ត្រក <span className="text-cyan-400 font-mono font-bold">#{invoice.basket_no || invoice.invoice_id}</span> ‧ <span className="text-slate-200 font-semibold">{invoice.facebook_name}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Message Preview Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5 bg-[#0a0f1d]">
          {/* Elegant Delivery Method Pill & Customer Info */}
          {(() => {
            const effectiveCid = (invoice.last_comment_id || (invoice.comment_ids && invoice.comment_ids[0]) || '').trim();
            const hasCommentId = Boolean(effectiveCid);
            const displayCid = effectiveCid ? String(effectiveCid).split('_').pop() : '';

            return (
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                    <span className="text-xs font-semibold text-slate-200">
                      {hasCommentId ? 'វិធីទី ១ ៖ Private Reply (តាមខមិន)' : 'វិធីទី ២ ៖ Direct Inbox (Messenger)'}
                    </span>
                  </div>
                  <span className="text-[10.5px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 font-semibold font-mono">
                    {hasCommentId ? `Comment #${displayCid}` : 'Meta Messenger'}
                  </span>
                </div>

                {/* Delivery Status Logs if available */}
                {deliveryLogs.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-800">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 mb-1">
                      <span className="flex items-center gap-1 text-cyan-300">
                        <span>📋</span>
                        <span>កំណត់ហេតុដំណើរការ (Delivery Logs) ៖</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowLogs(!showLogs)}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                      >
                        {showLogs ? 'បង្រួម' : 'ពង្រីក'}
                      </button>
                    </div>
                    {showLogs && (
                      <div className="space-y-1 font-sans">
                        {deliveryLogs.map((log, idx) => (
                          <div
                            key={idx}
                            className={`px-2 py-1.5 rounded-lg text-[10.5px] leading-relaxed border ${
                              log.startsWith('✅')
                                ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-200'
                                : log.startsWith('⚠️')
                                ? 'bg-amber-950/40 border-amber-700/60 text-amber-200'
                                : log.startsWith('ℹ️')
                                ? 'bg-blue-950/40 border-blue-800/60 text-blue-200'
                                : 'bg-slate-900/60 border-slate-700 text-slate-300'
                            }`}
                          >
                            {log}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          {invoice.msg_status === 'FAILED' && (
            <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl p-3 text-xs text-rose-200 flex items-start gap-2.5 shadow-sm">
              <span className="text-base">⚠️</span>
              <div className="flex-1 leading-relaxed">
                <div className="font-bold text-rose-100">ការផ្ញើស្វ័យប្រវត្តិកន្លងមកមិនទាន់បានជោគជ័យ ៖</div>
                <div className="text-[11px] text-rose-300/90 mt-0.5">
                  Facebook Meta API អាចបដិសេធដោយសារហួសពេល ២៤ ម៉ោង។ លោកអ្នកអាចចុចប៊ូតុង <strong>«💬 បើក Messenger»</strong> ខាងក្រោម ដើម្បី Paste អត្ថបទវិក្កយបត្រនេះជូនភ្ញៀវដោយផ្ទាល់!
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <span>💬</span>
              <span>ខ្លឹមសារវិក្កយបត្រ (Invoice Content)</span>
            </label>
            <button
              type="button"
              onClick={() => setIsEditingCustom(!isEditingCustom)}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer transition-colors"
            >
              {isEditingCustom ? '🔒 រក្សាទុកការកែ' : '✏️ កែសម្រួលអត្ថបទ'}
            </button>
          </div>

          {isEditingCustom ? (
            <textarea
              value={customMsg}
              onChange={(e) => setCustomMsg(e.target.value)}
              rows={12}
              className="w-full bg-[#070b14] border border-indigo-500/60 rounded-2xl p-3.5 text-xs text-white font-mono leading-relaxed outline-none focus:ring-2 focus:ring-indigo-400/40 resize-none shadow-inner"
            />
          ) : (
            <div className="w-full bg-[#070b14] border border-slate-800/80 rounded-2xl p-3.5 text-xs text-slate-200 font-sans leading-relaxed whitespace-pre-wrap select-text max-h-[320px] overflow-y-auto shadow-inner">
              {customMsg}
            </div>
          )}

          {/* Safe Mode Tip - Clean text without external links/images */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-2.5 text-[11px] text-slate-400 flex items-start gap-2">
            <span className="text-slate-300">🛡️</span>
            <div>
              <strong className="text-slate-300 font-medium">វិក្កយបត្រទម្រង់អត្ថបទសុទ្ធ (Text Only) ៖</strong> គ្មាន Link ឬរូបភាព QR ឡើយ ដើម្បីធានាសុវត្ថិភាព 100% និងចៀសវាងការ Alert ពី Facebook Messenger។
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-[#090e1a] flex flex-col gap-2.5">
          {/* Main Primary Send Button */}
          <button
            onClick={handleSendVIP}
            disabled={isSending}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-98 cursor-pointer disabled:opacity-50 transition-all border border-indigo-400/30"
          >
            <span className="text-base">🚀</span>
            <span>{isSending ? 'កំពុងបញ្ជូនសារវិក្កយបត្រ...' : 'ផ្ញើវិក្កយបត្រ VIP ស្វ័យប្រវត្តិ (1-Tap)'}</span>
          </button>

          {/* Secondary Buttons: Copy only & Open Messenger */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleCopyOnly}
              className="py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center justify-center gap-1.5 border border-slate-700/80 active:scale-95 transition-all cursor-pointer"
            >
              <span>📋</span>
              <span>ចម្លងអត្ថបទ (Copy)</span>
            </button>

            <button
              onClick={openMessengerDirect}
              className="py-2.5 px-3 rounded-xl bg-[#0084FF]/15 hover:bg-[#0084FF]/25 text-[#40B0FF] font-medium text-xs flex items-center justify-center gap-1.5 border border-[#0084FF]/40 active:scale-95 transition-all cursor-pointer"
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
