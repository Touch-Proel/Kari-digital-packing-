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
  const [showLogs, setShowLogs] = useState(true);
  const [customCommentId, setCustomCommentId] = useState('');
  const [isLinkingCid, setIsLinkingCid] = useState(false);
  const [isAutoResolving, setIsAutoResolving] = useState(false);

  // Auto-resolve comment ID from backend if missing
  const handleAutoResolveCommentId = async () => {
    if (!invoice) return;
    setIsAutoResolving(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.invoice_id}/auto_resolve_comment`);
      const data = await res.json();
      if (data.success && data.comment_id) {
        setCustomCommentId(data.comment_id);
        invoice.last_comment_id = data.comment_id;
        if (!invoice.comment_ids) invoice.comment_ids = [];
        if (!invoice.comment_ids.includes(data.comment_id)) {
          invoice.comment_ids.unshift(data.comment_id);
        }
        onShowToast(`🎯 រកឃើញ និងភ្ជាប់ Comment ID #${data.comment_id.split('_').pop()} រួចរាល់!`, 'success');
        onDataChanged();
      } else {
        onShowToast('ℹ️ មិនទាន់រកឃើញ Comment ក្នុង Live ទេ សូមបិទភ្ជាប់ Comment ID ដោយដៃ', 'error');
      }
    } catch {
      onShowToast('⚠️ បរាជ័យក្នុងការស្វែងរក Comment ID', 'error');
    } finally {
      setIsAutoResolving(false);
    }
  };

  // Background auto-resolve on open if missing comment ID
  useEffect(() => {
    if (isOpen && invoice) {
      const cid = (invoice.last_comment_id || (invoice.comment_ids && invoice.comment_ids[0]) || '').trim();
      if (!cid) {
        fetch(`/api/invoices/${invoice.invoice_id}/auto_resolve_comment`)
          .then(r => r.json())
          .then(d => {
            if (d.success && d.comment_id) {
              setCustomCommentId(d.comment_id);
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
      setShowLogs(true);
      const initialCid = invoice.last_comment_id || (invoice.comment_ids && invoice.comment_ids[0]) || '';
      setCustomCommentId(initialCid);
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
      const targetCid = (customCommentId.trim() || invoice.last_comment_id || (invoice.comment_ids && invoice.comment_ids[0]) || '').trim();
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
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <span>✅</span>
                    <span>
                      {invoice.msg_delivery_method === 'PRIVATE_REPLY'
                        ? 'វិធីទី ១ (Private Reply)'
                        : 'វិធីទី ២ (Direct Inbox)'}
                    </span>
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
          {/* Multi-Method Delivery Pipeline Indicator */}
          {(() => {
            const effectiveCid = (customCommentId.trim() || invoice.last_comment_id || (invoice.comment_ids && invoice.comment_ids[0]) || '').trim();
            const hasCommentId = Boolean(effectiveCid);
            const displayCid = effectiveCid ? String(effectiveCid).split('_').pop() : '';

            return (
              <div className="bg-[#071120] border border-cyan-900/60 rounded-2xl p-3 shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-2">
                  <div className="flex items-center gap-1.5 text-cyan-300">
                    <span>🛡️</span>
                    <span>ប្រព័ន្ធផ្ញើសារ ២ ដំណាក់កាល (Private Reply & Inbox)</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">Meta Graph API</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className={`p-2.5 rounded-xl border flex flex-col items-center text-center gap-0.5 transition-all ${
                    invoice.msg_delivery_method === 'PRIVATE_REPLY'
                      ? 'bg-emerald-950/80 border-emerald-400 text-emerald-200 ring-1 ring-emerald-500'
                      : hasCommentId
                      ? 'bg-cyan-950/50 border-cyan-500 text-cyan-200 ring-1 ring-cyan-500/50'
                      : 'bg-slate-900/60 border-slate-800 text-slate-500'
                  }`}>
                    <div className="flex items-center gap-1">
                      <span className="font-black text-[10px] text-cyan-400">វិធីទី ១ (អាទិភាពចម្បង)</span>
                      {hasCommentId && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                    </div>
                    <span className="font-bold text-white text-[11px]">Private Reply</span>
                    <span className="text-[9px] text-amber-300 font-medium">តាមខមិន (រួចផុត ២៤ ម៉ោង)</span>
                    <span className="text-[8px] text-slate-300 mt-0.5 font-mono truncate max-w-full">
                      {hasCommentId ? `✅ ខមិន #${displayCid}` : '⚠️ គ្មានខមិន (កន្ត្រកបង្កើតផ្ទាល់)'}
                    </span>
                  </div>
                  <div className={`p-2.5 rounded-xl border flex flex-col items-center text-center gap-0.5 transition-all ${
                    invoice.msg_delivery_method === 'SEND_API' && !hasCommentId
                      ? 'bg-emerald-950/80 border-emerald-400 text-emerald-200 ring-1 ring-emerald-500'
                      : 'bg-slate-900/70 border-slate-800 text-slate-400'
                  }`}>
                    <span className="font-black text-[10px] text-slate-400">វិធីទី ២ (បម្រុង Fallback)</span>
                    <span className="font-bold text-white text-[11px]">Direct Inbox</span>
                    <span className="text-[9px] text-slate-400">ផ្ញើចូល Messenger (ក្នុង ២៤ ម៉ោង)</span>
                    <span className="text-[8px] text-slate-400 mt-0.5 font-mono">
                      {invoice.facebook_user_id && !invoice.facebook_user_id.startsWith('FB_USER') ? `PSID: ...${invoice.facebook_user_id.slice(-6)}` : 'ប្រើ Tag ឬផ្ញើផ្ទាល់'}
                    </span>
                  </div>
                </div>

                {/* Inline Comment ID connector if missing */}
                {!hasCommentId ? (
                  <div className="mt-2.5 p-2 bg-slate-900/90 border border-amber-600/30 rounded-xl text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-amber-300 font-medium">
                      <span className="flex items-center gap-1">
                        <span>🔗</span>
                        <span>ភ្ជាប់ Comment ID ដើម្បីបើក Private Reply ៖</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleAutoResolveCommentId}
                        disabled={isAutoResolving}
                        className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 rounded-lg text-[10px] font-bold cursor-pointer transition-colors flex items-center gap-1"
                      >
                        {isAutoResolving ? '⏳ កំពុងស្វែងរក...' : '🔍 ស្វែងរកខមិនពី Live'}
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder="Paste Link ខមិន ឬ Comment ID..."
                        value={customCommentId}
                        onChange={(e) => {
                          let val = e.target.value.trim();
                          const commentMatch = val.match(/comment_id=([0-9_]+)/i) || val.match(/reply_comment_id=([0-9_]+)/i) || val.match(/comments\/([0-9_]+)/i);
                          if (commentMatch && commentMatch[1]) {
                            val = commentMatch[1];
                          }
                          setCustomCommentId(val);
                        }}
                        className="flex-1 bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-lg px-2.5 py-1 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none"
                      />
                      {customCommentId.trim() && (
                        <button
                          type="button"
                          onClick={async () => {
                            setIsLinkingCid(true);
                            try {
                              const res = await fetch('/api/link_comment_to_invoice', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  invoice_id: invoice.invoice_id,
                                  comment_id: customCommentId.trim()
                                })
                              });
                              const data = await res.json();
                              if (data.success) {
                                invoice.last_comment_id = customCommentId.trim();
                                if (!invoice.comment_ids) invoice.comment_ids = [];
                                if (!invoice.comment_ids.includes(customCommentId.trim())) invoice.comment_ids.unshift(customCommentId.trim());
                                onShowToast('✅ បានភ្ជាប់ Comment ID ជោគជ័យ!');
                                onDataChanged();
                              }
                            } catch {}
                            setIsLinkingCid(false);
                          }}
                          disabled={isLinkingCid}
                          className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                        >
                          {isLinkingCid ? '...' : 'ភ្ជាប់'}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 px-1">
                    <span className="flex items-center gap-1 font-mono text-emerald-300">
                      <span>🔗 Comment ID:</span>
                      <span>{displayCid}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setCustomCommentId('')}
                      className="text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                    >
                      កែប្រែ / ផ្លាស់ប្តូរ
                    </button>
                  </div>
                )}

                {/* Delivery Status Logs if available */}
                {deliveryLogs.length > 0 && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-800">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 mb-1.5">
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

          {/* Safe Mode Tip - Clean text without external links/images */}
          <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-xl p-2.5 text-[11px] text-emerald-200 flex items-start gap-2">
            <span>🛡️</span>
            <div>
              <strong>វិក្កយបត្រទម្រង់អត្ថបទសុទ្ធ (Text Only) ៖</strong> គ្មាន Link ឬរូបភាព QR ឡើយ ដើម្បីធានាសុវត្ថិភាពខ្ពស់ 100% និងចៀសវាងការលោត Alert "Be aware of scams" ពី Facebook Messenger។
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
            <span>{isSending ? 'កំពុងបញ្ជូនសារវិក្កយបត្រ...' : 'ផ្ញើវិក្កយបត្រ VIP ស្វ័យប្រវត្តិ (1-Tap)'}</span>
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
