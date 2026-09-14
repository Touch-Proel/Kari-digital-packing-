import React, { useState, useMemo } from 'react';
import { Invoice, OrderItem, Product } from '../types';
import { playPureTone, playSuccessFanfare, playWarningBuzzer } from '../utils/audio';

interface BasketCardProps {
  key?: any;
  invoice: Invoice;
  currentMasterStage: number; // 1: Unpicked, 2: Staged, 3: Paid/QC
  myPackerName: string;
  checkedState: Record<string, boolean>;
  productMap?: Record<string, Product>;
  onToggleItemCheck: (invId: number, code: string) => void;
  onOpenQCModal: (inv: Invoice) => void;
  onOpenReceiptModal: (inv: Invoice) => void;
  onOpenZoomModal: (code: string, name: string, imageUrl?: string, price?: number, stockQty?: number) => void;
  onDataChanged: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export function BasketCard({
  invoice,
  currentMasterStage,
  myPackerName,
  checkedState,
  productMap,
  onToggleItemCheck,
  onOpenQCModal,
  onOpenReceiptModal,
  onOpenZoomModal,
  onDataChanged,
  onShowToast
}: BasketCardProps) {
  const [isOpen, setIsOpen] = useState(true);

  // Stepper & Item Delete States
  const [deleteConfirmCode, setDeleteConfirmCode] = useState<string | null>(null);
  const [activeQuickQtyCode, setActiveQuickQtyCode] = useState<string | null>(null);

  // Manual Add Item States
  const [isAddingManualCode, setIsAddingManualCode] = useState(false);
  const [manualCodeInput, setManualCodeInput] = useState('');
  const [manualQtyInput, setManualQtyInput] = useState(1);
  const [manualCommentSource, setManualCommentSource] = useState('');

  // Contact Inline Editing
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressInput, setAddressInput] = useState('');
  const [showAllComments, setShowAllComments] = useState(false);

  const totalCount = invoice.items.length;
  const packedCount = invoice.items.filter(
    item => !!checkedState[`${invoice.invoice_id}_${item.product_code}`]
  ).length;
  const packPercent = totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0;

  const isPaid = invoice.status === 'Paid';
  const isStaged = invoice.packing_stage === 'STAGED';

  // Format live session date
  const formatLiveDate = (dateStr?: string) => {
    if (!dateStr) return 'ថ្ងៃ 13/09 (09:58)';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'ថ្ងៃ 13/09 (09:58)';
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      return `ថ្ងៃ ${day}/${month} (${hours}:${mins})`;
    } catch {
      return 'ថ្ងៃ 13/09 (09:58)';
    }
  };

  // Border and glow accent based on status
  const cardBorderClass = isPaid
    ? 'border-l-[4px] border-l-emerald-400 border-t border-r border-b border-emerald-950/60 shadow-[0_0_18px_rgba(16,185,129,0.15)]'
    : isStaged
    ? 'border-l-[4px] border-l-amber-400 border-t border-r border-b border-amber-950/60 shadow-[0_0_18px_rgba(245,158,11,0.15)]'
    : 'border-l-[4px] border-l-cyan-400 border-t border-r border-b border-cyan-950/60 shadow-[0_0_18px_rgba(6,182,212,0.15)]';

  const isLockedByOther =
    invoice.is_locked &&
    invoice.locked_by &&
    invoice.locked_by.trim().toLowerCase() !== myPackerName.trim().toLowerCase();

  // Parse quick code from unmatched comment
  const parseQuickComment = (text: string): { code: string; qty: number } | null => {
    if (!text) return null;
    let s = text.trim();
    const kmMap: Record<string, string> = {
      '០': '0', '១': '1', '២': '2', '៣': '3', '៤': '4',
      '៥': '5', '៦': '6', '៧': '7', '៨': '8', '៩': '9'
    };
    for (const [k, v] of Object.entries(kmMap)) {
      s = s.split(k).join(v);
    }
    s = s.replace(/ពីរ/g, '2').replace(/បី/g, '3').replace(/បួន/g, '4').replace(/មួយ/g, '1');

    const m = s.match(/([A-Za-z0-9]{1,5})\s*[*xX=:_\-\/,.\+«»~]\s*(\d{1,2})/);
    if (m) return { code: m[1].toUpperCase(), qty: parseInt(m[2], 10) || 1 };

    const mSpace = s.match(/\b([A-Za-z0-9]{1,5})\s+(\d{1,2})\b/);
    if (mSpace && !['KG', 'KILO'].includes(mSpace[2].toUpperCase())) {
      return { code: mSpace[1].toUpperCase(), qty: parseInt(mSpace[2], 10) || 1 };
    }

    const mSingle = s.match(/\b([A-Za-z0-9]{1,5})\b/);
    if (mSingle && mSingle[1].length <= 4 && !/^(hi|ok|yes|no)$/i.test(mSingle[1])) {
      return { code: mSingle[1].toUpperCase(), qty: 1 };
    }

    return null;
  };

  // Comments that SYSTEM could not auto-allocate OR haven't been cut into basket yet
  const unallocatedComments = useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();

    // 1. Explicit unmatched comments
    for (const c of invoice.unmatched_comments || []) {
      const trimmed = (c || '').trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        list.push(trimmed);
      }
    }

    // 2. Comments from customer during live stream that are not already assigned as note for an item
    const allocatedNotes = new Set(
      invoice.items
        .map(it => (it.item_comment || '').trim())
        .filter(Boolean)
    );

    for (const c of invoice.comments || []) {
      const trimmed = (c || '').trim();
      if (!trimmed || seen.has(trimmed)) continue;

      // If this comment was already assigned to an item note in basket, skip
      if (allocatedNotes.has(trimmed)) continue;

      seen.add(trimmed);
      list.push(trimmed);
    }

    return list;
  }, [invoice.unmatched_comments, invoice.comments, invoice.items]);

  // Change zone: PP vs PROVINCE
  const handleSetZone = async (newZone: 'PP' | 'PROVINCE', e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch('/api/update_invoice_zone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoice.invoice_id, zone: newZone })
      });
      if (res.ok) {
        onDataChanged();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Save Phone
  const handleSavePhone = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      await fetch('/api/update_customer_contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          facebook_name: invoice.facebook_name,
          phone: phoneInput.trim()
        })
      });
      setEditingPhone(false);
      onDataChanged();
      onShowToast('✅ បានកែប្រែលេខទូរស័ព្ទ');
    } catch (err) {
      onShowToast('Error updating phone', 'error');
    }
  };

  // Save Address
  const handleSaveAddress = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      await fetch('/api/update_customer_contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          facebook_name: invoice.facebook_name,
          address: addressInput.trim()
        })
      });
      setEditingAddress(false);
      onDataChanged();
      onShowToast('✅ បានកែប្រែអាសយដ្ឋាន');
    } catch (err) {
      onShowToast('Error updating address', 'error');
    }
  };

  // Notify VIP Messenger Invoice
  const handleNotifyVIP = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch('/api/send_vip_invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          facebook_name: invoice.facebook_name,
          total_amount: invoice.total_amount
        })
      });
      const data = await res.json();
      if (data.success) {
        playSuccessFanfare();
        onShowToast(`✉️ បានផ្ញើវិក្កយបត្រ VIP ទៅ ${invoice.facebook_name}`);
        onDataChanged();
      } else {
        onShowToast('VIP Message simulation completed');
      }
    } catch (err) {
      onShowToast('Error notifying VIP', 'error');
    }
  };

  // Lock Invoice for Packing
  const handleLockInvoice = async () => {
    if (invoice.is_locked && invoice.locked_by === myPackerName) return;
    try {
      await fetch('/api/lock_invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          packer_name: myPackerName
        })
      });
      onDataChanged();
    } catch (err) {
      console.error(err);
    }
  };

  // Release Lock
  const handleReleaseLock = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch('/api/unlock_invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoice.invoice_id })
      });
      onDataChanged();
      onShowToast('🔓 បានដោះសោរកន្ត្រកវិញ');
    } catch (err) {
      console.error(err);
    }
  };

  // Force Takeover Lock
  const handleForceTakeover = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch('/api/lock_invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          packer_name: myPackerName,
          force: true
        })
      });
      onDataChanged();
      onShowToast(`🔓 បានដណ្តើមច្រកកន្ត្រក #${invoice.basket_no} ដោយជោគជ័យ!`);
    } catch (err) {
      console.error(err);
    }
  };

  // Stepper: Adjust Qty by Delta (+1 or -1)
  const handleStepQty = async (it: OrderItem, delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const targetQty = it.quantity + delta;
    if (targetQty < 1) {
      setDeleteConfirmCode(it.product_code);
      setTimeout(() => {
        setDeleteConfirmCode(prev => (prev === it.product_code ? null : prev));
      }, 4000);
      return;
    }

    try {
      const res = await fetch('/api/set_item_qty_direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          code: it.product_code,
          new_qty: targetQty
        })
      });
      const data = await res.json();
      if (data.success) {
        playPureTone(delta > 0 ? 880 : 660, 0.04);
        onShowToast(`✅ [${it.product_code}] ចំនួន៖ ${targetQty}`);
        onDataChanged();
      } else {
        playWarningBuzzer();
        onShowToast(`⚠️ ${data.message || 'មិនអាចកែប្រែបានទេ'}`, 'error');
      }
    } catch (err) {
      onShowToast('⚠️ មានបញ្ហាបណ្តាញ WiFi!', 'error');
    }
  };

  // Directly Set Qty to a Specific Number
  const handleDirectSetQty = async (code: string, newQty: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveQuickQtyCode(null);
    if (newQty < 0) return;

    try {
      const res = await fetch('/api/set_item_qty_direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          code: code,
          new_qty: newQty
        })
      });
      const data = await res.json();
      if (data.success) {
        playPureTone(900, 0.04);
        onShowToast(newQty === 0 ? `🗑️ បានលុបកូដ [${code}]` : `✅ [${code}] ចំនួន៖ ${newQty}`);
        onDataChanged();
      } else {
        playWarningBuzzer();
        onShowToast(`⚠️ ${data.message || 'មិនអាចកែបានទេ'}`, 'error');
      }
    } catch (err) {
      onShowToast('⚠️ មានបញ្ហាបណ្តាញ!', 'error');
    }
  };

  // Toggle Quick Qty Selector Popover
  const handleToggleQuickQty = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveQuickQtyCode(prev => (prev === code ? null : code));
  };

  // Handle Delete Button Click (Double-click confirm pattern)
  const handleDeleteClick = (it: OrderItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleteConfirmCode === it.product_code) {
      handleExecuteDelete(it, e);
    } else {
      setDeleteConfirmCode(it.product_code);
      setTimeout(() => {
        setDeleteConfirmCode(prev => (prev === it.product_code ? null : prev));
      }, 4000);
    }
  };

  // Execute Complete Item Deletion
  const handleExecuteDelete = async (it: OrderItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmCode(null);
    playWarningBuzzer();

    try {
      const res = await fetch('/api/set_item_qty_direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          code: it.product_code,
          new_qty: 0
        })
      });
      const data = await res.json();
      if (data.success) {
        onShowToast(`🗑️ បានដកកូដ [${it.product_code}] ចេញពីកន្ត្រក #${invoice.basket_no}!`);
        onDataChanged();
      } else {
        onShowToast(`⚠️ ${data.message || 'មិនអាចលុបបានទេ'}`, 'error');
      }
    } catch (e) {
      onShowToast('Error deleting item', 'error');
    }
  };

  // Smart cut from comment
  const handleSmartCut = async (commentText: string, autoCode: string, autoQty: number, e: React.MouseEvent) => {
    e.stopPropagation();
    let finalCode = autoCode;
    let finalQty = autoQty;

    if (!finalCode) {
      setIsAddingManualCode(true);
      setManualCodeInput('');
      setManualQtyInput(1);
      return;
    }

    try {
      const res = await fetch('/api/add_item_to_invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          code: finalCode,
          quantity: finalQty,
          comment_text: commentText
        })
      });
      const data = await res.json();
      if (!data.success) {
        playWarningBuzzer();
        onShowToast(`❌ មិនអាចកាត់បានទេ៖ ${data.message}`, 'error');
      } else {
        playSuccessFanfare();
        onShowToast(`⚡ កាត់ [${finalCode} x${finalQty}] ចូលកន្ត្រក #${invoice.basket_no} រួចរាល់!`);
        onDataChanged();
      }
    } catch (e) {
      playWarningBuzzer();
      onShowToast('⚠️ ដាច់សេវា WiFi!', 'error');
    }
  };

  // Execute Manual Add Item
  const executeManualAddCode = async () => {
    const cleanCode = manualCodeInput.trim().toUpperCase();
    if (!cleanCode) {
      onShowToast('សូមបញ្ចូលកូដទំនិញ', 'error');
      return;
    }

    try {
      const res = await fetch('/api/add_item_to_invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          code: cleanCode,
          quantity: manualQtyInput || 1,
          comment_text: manualCommentSource || undefined
        })
      });
      const data = await res.json();
      if (!data.success) {
        playWarningBuzzer();
        onShowToast(`❌ មិនអាចកាត់បានទេ៖ ${data.message}`, 'error');
      } else {
        playSuccessFanfare();
        onShowToast(`✅ បានថែម [${cleanCode} x${manualQtyInput}] ចូលកន្ត្រក #${invoice.basket_no || invoice.invoice_id}!`);
        setIsAddingManualCode(false);
        setManualCodeInput('');
        setManualQtyInput(1);
        setManualCommentSource('');
        onDataChanged();
      }
    } catch (e) {
      onShowToast('Error adding item', 'error');
    }
  };

  const handleDismissComment = async (commentText: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch('/api/dismiss_unmatched_comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          comment_text: commentText
        })
      });
      const data = await res.json();
      if (data.success) {
        onShowToast('✅ បានសម្អាតចេញពីបញ្ជី N/A (រក្សាទុកក្នុងប្រវត្តិ)');
        onDataChanged();
      }
    } catch {
      onShowToast('Error dismissing comment', 'error');
    }
  };

  return (
    <div
      className={`bg-[#060D1D] rounded-3xl transition-all duration-200 ${cardBorderClass} ${
        isLockedByOther ? 'opacity-85' : 'hover:border-cyan-500/60'
      }`}
    >
      {/* BASKET HEADER */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="p-3.5 sm:p-4 cursor-pointer select-none flex flex-col gap-2.5"
      >
        {/* Top Header Row: #BasketNo, Avatar, Customer Name, Live Tag, UNPAID badge, Collapse triangle */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Basket Number */}
            <span className="text-xl sm:text-2xl font-black font-mono text-cyan-400 tracking-tight flex-shrink-0">
              #{invoice.basket_no || invoice.invoice_id}
            </span>

            {/* Customer Avatar Circle */}
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-cyan-400 overflow-hidden bg-[#071324] flex-shrink-0 flex items-center justify-center shadow-md relative">
              {invoice.picture_url || invoice.facebook_user_id ? (
                <img
                  src={
                    invoice.picture_url ||
                    `/api/fb/avatar/${invoice.facebook_user_id}?name=${encodeURIComponent(invoice.facebook_name || '')}`
                  }
                  alt={invoice.facebook_name}
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                  className="w-full h-full object-cover relative z-10"
                />
              ) : null}
              <span className="absolute inset-0 flex items-center justify-center text-xs sm:text-sm font-black text-cyan-300 pointer-events-none select-none z-0">
                {invoice.facebook_name ? invoice.facebook_name.trim().charAt(0).toUpperCase() : '👤'}
              </span>
            </div>

            {/* Customer Name & Live Timestamp */}
            <div className="flex flex-col min-w-0">
              <span className="text-white font-bold text-sm sm:text-base leading-tight truncate">
                {invoice.facebook_name}
              </span>
              <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1 mt-0.5 whitespace-nowrap">
                <span>📹</span>
                <span>វត្ត Live ៖ {formatLiveDate(invoice.created_at)}</span>
              </span>
            </div>
          </div>

          {/* Right: Status Pill & Collapse Indicator */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isPaid ? (
              <span className="bg-[#042416] border border-emerald-500 text-emerald-400 text-xs font-black px-3 py-1 rounded-lg uppercase tracking-wider shadow-sm">
                PAID
              </span>
            ) : isStaged ? (
              <span className="bg-[#241704] border border-amber-500 text-amber-400 text-xs font-black px-3 py-1 rounded-lg uppercase tracking-wider shadow-sm">
                STAGED
              </span>
            ) : (
              <span className="bg-[#261703] border border-amber-600/80 text-amber-400 text-xs font-black px-3 py-1 rounded-lg uppercase tracking-wider shadow-sm">
                UNPAID
              </span>
            )}

            <button
              type="button"
              className="text-slate-400 hover:text-white text-xs transition-colors p-0.5"
              title={isOpen ? 'បង្រួម' : 'ពន្លាត'}
            >
              {isOpen ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {/* Sub Header Row: Location Zone buttons (Left) + Total Price (Right) */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          {/* Location Zone Buttons */}
          <div
            className="flex items-center gap-1 bg-[#040914] p-1 rounded-xl border border-slate-800"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={e => handleSetZone('PP', e)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                invoice.location_zone === 'PP'
                  ? 'bg-emerald-900/80 border border-emerald-500/60 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🏙️ ភ្នំពេញ
            </button>
            <button
              onClick={e => handleSetZone('PROVINCE', e)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                invoice.location_zone === 'PROVINCE'
                  ? 'bg-amber-900/80 border border-amber-500/60 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🏕️ ខេត្ត
            </button>
          </div>

          {/* Total Price Badge */}
          <div className="bg-[#031526] border-[1.5px] border-cyan-400 text-cyan-300 px-3.5 py-1 rounded-xl font-mono font-black text-sm sm:text-base shadow-[0_0_12px_rgba(6,182,212,0.3)]">
            ${invoice.total_amount.toFixed(2)}
          </div>
        </div>

        {/* Lock Banner if active */}
        {invoice.is_locked && (
          <div
            className={`p-2 rounded-xl text-xs font-bold flex justify-between items-center ${
              isLockedByOther
                ? 'bg-rose-950/80 border border-rose-600 text-rose-200'
                : 'bg-emerald-950/80 border border-emerald-600 text-emerald-200'
            }`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5">
              <span>🔒</span>
              <span>
                {isLockedByOther
                  ? `កំពុងច្រកដោយ៖ ${invoice.locked_by}`
                  : 'អ្នកកំពុងច្រកកន្ត្រកនេះ'}
              </span>
            </div>
            {isLockedByOther ? (
              <button
                onClick={handleForceTakeover}
                className="bg-rose-600 hover:bg-rose-500 text-white px-2.5 py-0.5 rounded-lg text-[10px] font-black active:scale-95"
              >
                🔓 ដោះសោរច្រកជំនួស
              </button>
            ) : (
              <button
                onClick={handleReleaseLock}
                className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-2.5 py-0.5 rounded-lg text-[10px] font-bold active:scale-95"
              >
                ✕ ឈប់ច្រក
              </button>
            )}
          </div>
        )}
      </div>

      {/* BASKET BODY DOCK */}
      {isOpen && (
        <div className="p-3 sm:p-4 pt-1 flex flex-col gap-3">
          {/* Quick Action Contact Pills Row: Phone, Address, VIP chat */}
          <div className="flex flex-wrap items-center gap-2" onClick={e => e.stopPropagation()}>
            {/* Phone Pill or Editor */}
            {editingPhone ? (
              <form onSubmit={handleSavePhone} className="flex items-center gap-1 bg-slate-900 border border-cyan-400 p-1 rounded-xl shadow-lg">
                <input
                  type="text"
                  placeholder="លេខទូរស័ព្ទ..."
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                  className="bg-slate-950 text-white text-xs px-2.5 py-1 rounded-lg outline-none font-mono w-32"
                  autoFocus
                />
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-2.5 py-1 rounded-lg font-black">
                  ✓
                </button>
                <button type="button" onClick={() => setEditingPhone(false)} className="text-slate-400 hover:text-white text-xs px-1.5">
                  ✕
                </button>
              </form>
            ) : (
              <button
                onClick={() => {
                  setPhoneInput(invoice.phone_number !== 'គ្មានលេខ' ? invoice.phone_number : '');
                  setEditingPhone(true);
                }}
                className="bg-[#0A1426] hover:bg-[#0F1E38] border border-slate-700/80 text-slate-300 text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm"
              >
                <span className="text-red-400">📞</span>
                <span>{invoice.phone_number && invoice.phone_number !== 'គ្មានលេខ' ? invoice.phone_number : '+ បន្ថែមលេខ'}</span>
                <span className="text-amber-400 text-[11px]">✏️</span>
              </button>
            )}

            {/* Address Pill or Editor */}
            {editingAddress ? (
              <form onSubmit={handleSaveAddress} className="flex items-center gap-1 bg-slate-900 border border-cyan-400 p-1 rounded-xl shadow-lg">
                <input
                  type="text"
                  placeholder="ទីតាំង / អាសយដ្ឋាន..."
                  value={addressInput}
                  onChange={e => setAddressInput(e.target.value)}
                  className="bg-slate-950 text-white text-xs px-2.5 py-1 rounded-lg outline-none w-44"
                  autoFocus
                />
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-2.5 py-1 rounded-lg font-black">
                  ✓
                </button>
                <button type="button" onClick={() => setEditingAddress(false)} className="text-slate-400 hover:text-white text-xs px-1.5">
                  ✕
                </button>
              </form>
            ) : (
              <button
                onClick={() => {
                  setAddressInput(!invoice.address.includes('មិនទាន់មាន') ? invoice.address : '');
                  setEditingAddress(true);
                }}
                className="bg-[#0A1426] hover:bg-[#0F1E38] border border-slate-700/80 text-slate-300 text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm truncate max-w-[210px]"
              >
                <span className="text-red-400">📍</span>
                <span className="truncate">{invoice.address && !invoice.address.includes('មិនទាន់មាន') ? invoice.address : '+ បន្ថែមទីតាំង'}</span>
                <span className="text-amber-400 text-[11px]">✏️</span>
              </button>
            )}

            {/* VIP Messenger notification status */}
            <button
              onClick={handleNotifyVIP}
              className={`text-xs font-bold px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 border transition-all shadow-sm ${
                invoice.msg_status === 'SENT'
                  ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                  : 'bg-[#081B34] hover:bg-[#0D274C] border-cyan-500/50 text-cyan-200'
              }`}
            >
              <span>{invoice.msg_status === 'SENT' ? '✅' : '✉️'}</span>
              <span>{invoice.msg_status === 'SENT' ? 'ឆាតរួច' : 'ឆាតប្រាប់ VIP'}</span>
            </button>
          </div>

          {/* Progress Row matching Capture.PNG */}
          <div className="flex items-center justify-between text-xs text-slate-300 font-bold px-1 pt-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">រៀបធ្លាក់ ៖</span>
              <span className="font-mono text-white font-black">{packedCount} / {totalCount} មុខ</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-cyan-400 font-black">{packPercent}%</span>
            </div>
          </div>

          {/* ITEM ROWS LIST */}
          <div className="flex flex-col gap-2.5">
            {invoice.items.map((item, idx) => {
              const isChecked = !!checkedState[`${invoice.invoice_id}_${item.product_code}`];
              const prod = productMap ? productMap[item.product_code.toUpperCase()] : undefined;
              const displayImage = prod?.image_file;
              const noteText = item.item_comment || (invoice.comments && invoice.comments[0]) || '';

              return (
                <div key={idx} className="flex flex-col">
                  {/* Outer Item Card matching Capture.PNG */}
                  <div
                    onClick={() => {
                      handleLockInvoice();
                      onToggleItemCheck(invoice.invoice_id, item.product_code);
                    }}
                    className={`p-2.5 sm:p-3 rounded-2xl border flex items-center gap-3 transition-all cursor-pointer select-none relative ${
                      isChecked
                        ? 'bg-[#051720]/90 border-emerald-500/70 shadow-[0_0_14px_rgba(16,185,129,0.18)]'
                        : 'bg-[#060E1E]/90 border-cyan-900/60 hover:border-cyan-500/50'
                    }`}
                  >
                    {/* LEFT THUMBNAIL: Exactly 80x80 px */}
                    <div
                      className="w-[80px] h-[80px] min-w-[80px] min-h-[80px] max-w-[80px] max-h-[80px] rounded-xl overflow-hidden bg-slate-950 border border-slate-700/80 flex-shrink-0 relative group flex items-center justify-center cursor-pointer shadow-md"
                      onClick={e => {
                        e.stopPropagation();
                        onOpenZoomModal(
                          item.product_code,
                          item.product_name,
                          displayImage,
                          item.price,
                          prod?.stock_qty
                        );
                      }}
                      title="ចុចដើម្បីមើលរូបធំ ឬថតរូបទំនិញនេះ (80x80)"
                    >
                      {displayImage ? (
                        <img
                          src={displayImage}
                          alt={item.product_code}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-500">
                          <span className="text-base">📷</span>
                          <span className="text-[10px] font-bold mt-0.5 text-cyan-400">+រូប</span>
                        </div>
                      )}
                    </div>

                    {/* MIDDLE COLUMN: Code badge + Name, Price · Qty, Note */}
                    <div className="flex-1 overflow-hidden flex flex-col justify-center min-w-0">
                      {/* Row 1: [ Code ] and Name */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="bg-[#0C1E40] border border-blue-500/70 text-blue-300 px-2 py-0.5 rounded-md text-xs sm:text-sm font-bold tracking-wider shadow-sm flex items-center gap-1">
                          <span className="text-blue-400 font-semibold text-xs">កូដ</span>
                          <span className="font-mono font-black">[{item.product_code}]</span>
                        </span>
                        {(() => {
                          const custom = (item.product_name || '')
                            .replace(new RegExp(`^ទំនិញកូដ\\s*\\[?${item.product_code}\\]?`, 'i'), '')
                            .replace(new RegExp(`^កូដ\\s*\\[?${item.product_code}\\]?`, 'i'), '')
                            .replace(new RegExp(`\\[?${item.product_code}\\]?`, 'i'), '')
                            .replace(/^ទំនិញ\s*/i, '')
                            .replace(/\s*ទំនិញ$/i, '')
                            .trim();
                          return custom && custom !== 'ទំនិញ' ? (
                            <span className="text-white font-bold text-sm sm:text-base truncate">
                              {custom}
                            </span>
                          ) : null;
                        })()}
                      </div>

                      {/* Row 2: Price · Qty */}
                      <div className="text-amber-400 font-mono font-black text-sm sm:text-base mt-1 tracking-wide">
                        ${item.price.toFixed(2)} · ចំនួន {item.quantity}
                      </div>

                      {/* Row 3: Note */}
                      {noteText && (
                        <div className="text-amber-300/90 text-xs font-medium mt-1 truncate">
                          ↳ Note: "{noteText}"
                        </div>
                      )}
                    </div>

                    {/* RIGHT COLUMN: Square Checkbox (Top) + Qty Edit & Delete (Bottom) */}
                    <div
                      className="flex flex-col items-end justify-between self-stretch gap-1.5 flex-shrink-0"
                      onClick={e => e.stopPropagation()}
                    >
                      {/* Big Squircle Checkbox Box */}
                      <div
                        onClick={() => {
                          handleLockInvoice();
                          onToggleItemCheck(invoice.invoice_id, item.product_code);
                        }}
                        className={`w-12 h-12 rounded-2xl border-2 flex items-center justify-center text-xl font-black transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-emerald-950/80 border-emerald-400 text-emerald-300 shadow-[0_0_14px_rgba(52,211,153,0.45)]'
                            : 'bg-[#061226]/90 border-slate-700/80 text-transparent hover:border-cyan-400'
                        }`}
                        title={isChecked ? 'បានច្រកហើយ' : 'ចុចដើម្បីសម្គាល់ថាបានច្រក'}
                      >
                        ✓
                      </div>

                      {/* Sub-actions Row: Qty Pill with Edit + Delete Button */}
                      <div className="flex items-center gap-1.5">
                        {/* Qty Pill with Pencil: e.g. x1 ✏️ */}
                        <button
                          type="button"
                          onClick={e => handleToggleQuickQty(item.product_code, e)}
                          className="bg-[#061226] border border-slate-700 hover:border-cyan-400 text-cyan-300 font-mono font-bold text-xs px-2 py-0.5 rounded-lg flex items-center gap-1 transition-all active:scale-95 shadow-sm"
                          title="ចុចដើម្បីកែប្រែចំនួន"
                        >
                          <span>x{item.quantity}</span>
                          <span className="text-amber-400 text-[10px]">✏️</span>
                        </button>

                        {/* Delete Button with 2-click confirm */}
                        {deleteConfirmCode === item.product_code ? (
                          <button
                            type="button"
                            onClick={e => handleExecuteDelete(item, e)}
                            className="bg-rose-600 hover:bg-rose-500 text-white px-2 py-0.5 rounded-lg text-[10px] font-black animate-pulse shadow active:scale-95"
                            title="ចុចម្តងទៀតដើម្បីលុបមុខនេះចោល"
                          >
                            លុប?
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={e => handleDeleteClick(item, e)}
                            className="w-6 h-6 rounded-lg bg-rose-950/40 hover:bg-rose-900 border border-rose-800/70 text-rose-400 hover:text-rose-200 flex items-center justify-center text-xs font-bold transition-all active:scale-95"
                            title="ដកមុខនេះចេញពីកន្ត្រក"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Inline Quick Numbers Selector Popover */}
                  {activeQuickQtyCode === item.product_code && (
                    <div
                      className="mt-1.5 p-2.5 bg-[#08152D] border border-cyan-500/70 rounded-2xl flex flex-wrap items-center gap-2 shadow-xl animate-fadeIn"
                      onClick={e => e.stopPropagation()}
                    >
                      {/* Stepper buttons */}
                      <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={e => handleStepQty(item, -1, e)}
                          className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white font-black text-sm flex items-center justify-center"
                        >
                          −
                        </button>
                        <span className="px-2 font-mono font-black text-cyan-300 text-xs">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={e => handleStepQty(item, 1, e)}
                          className="w-6 h-6 rounded bg-sky-900 hover:bg-sky-800 text-sky-200 font-black text-sm flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>

                      <span className="text-[11px] text-slate-300 font-bold">
                        ជ្រើសចំនួន [{item.product_code}] ៖
                      </span>
                      {[1, 2, 3, 4, 5, 6, 8, 10, 12, 20].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={e => handleDirectSetQty(item.product_code, n, e)}
                          className={`px-2 py-1 rounded-lg font-mono font-black text-xs transition-all active:scale-95 ${
                            item.quantity === n
                              ? 'bg-cyan-400 text-black shadow-md'
                              : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                          }`}
                        >
                          {n}
                        </button>
                      ))}

                      <div className="flex items-center gap-1 ml-auto">
                        <input
                          type="number"
                          min="1"
                          placeholder="ចំនួនផ្សេង"
                          className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-center text-white font-mono"
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const val = parseInt((e.target as HTMLInputElement).value, 10);
                              if (val > 0) handleDirectSetQty(item.product_code, val, e as any);
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setActiveQuickQtyCode(null)}
                          className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded-lg bg-slate-800"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Unmatched / Unallocated Comments List (Capture.PNG match) */}
            {unallocatedComments.map((unm, cIdx) => {
              const detected = parseQuickComment(unm);
              return (
                <div
                  key={cIdx}
                  className="bg-gradient-to-r from-amber-950/30 via-[#181108]/70 to-slate-950/90 border-[1.5px] border-dashed border-amber-500/80 hover:border-amber-400 p-2.5 sm:p-3 rounded-2xl flex items-center justify-between gap-2.5 shadow-[0_0_15px_rgba(245,158,11,0.08)] transition-all"
                  onClick={e => e.stopPropagation()}
                >
                  <div
                    className="flex items-center gap-2 overflow-hidden flex-1 min-w-0 cursor-pointer"
                    onClick={() => {
                      setIsAddingManualCode(true);
                      setManualCommentSource(unm);
                      setManualCodeInput(detected?.code || unm.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8));
                      setManualQtyInput(detected?.qty || 1);
                    }}
                    title="ចុចដើម្បីកែប្រែកូដ ឬចំនួនដោយដៃ"
                  >
                    <span className="bg-amber-950/90 text-amber-400 border border-amber-500/70 px-2 py-0.5 rounded-lg text-xs font-mono font-black tracking-wider flex-shrink-0 select-none">
                      [ N/A ]
                    </span>
                    <span className="text-amber-200 font-bold text-xs sm:text-sm font-mono truncate select-all">
                      "{unm}"
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={e => handleSmartCut(unm, detected?.code || '', detected?.qty || 1, e)}
                      className="bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-1 shadow-[0_0_12px_rgba(245,158,11,0.35)] hover:shadow-[0_0_16px_rgba(245,158,11,0.5)] active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                      title={detected ? `កាត់ [${detected.code} x${detected.qty}] ចូលកន្ត្រក` : 'វាយកូដកាត់ចូលកន្ត្រក'}
                    >
                      <span className="text-xs sm:text-sm font-black">➕</span>
                      <span>កាត់ចូល</span>
                    </button>
                    <button
                      type="button"
                      onClick={e => handleDismissComment(unm, e)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-all"
                      title="បិទមិនបង្ហាញក្នុងបញ្ជី N/A (នៅតែរក្សាទុកក្នុងប្រវត្តិខមិន)"
                    >
                      <span className="text-xs">✕</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Manual Add Code Section */}
            {isAddingManualCode ? (
              <div
                className="bg-[#08152D] border border-cyan-500/70 p-3 rounded-2xl flex flex-col gap-2.5 shadow-xl animate-fadeIn"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between text-xs font-bold text-cyan-300">
                  <span className="truncate max-w-[80%]">
                    {manualCommentSource
                      ? `➕ កាត់ខមិន៖ "${manualCommentSource}"`
                      : `➕ បញ្ចូលកូដទំនិញចូលកន្ត្រក #${invoice.basket_no || invoice.invoice_id}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingManualCode(false);
                      setManualCommentSource('');
                    }}
                    className="text-slate-400 hover:text-white text-xs px-2"
                  >
                    ✕ បោះបង់
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="កូដទំនិញ (ឧ. 7)"
                    value={manualCodeInput}
                    onChange={e => setManualCodeInput(e.target.value.toUpperCase())}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold focus:border-cyan-400 outline-none uppercase"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') executeManualAddCode();
                    }}
                  />
                  <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5">
                    <span className="text-[10px] text-slate-400">Qty:</span>
                    <input
                      type="number"
                      min="1"
                      value={manualQtyInput}
                      onChange={e => setManualQtyInput(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-10 bg-transparent text-xs text-white font-mono font-bold text-center outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={executeManualAddCode}
                    className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-black text-xs px-3.5 py-2 rounded-xl active:scale-95 shadow transition-all whitespace-nowrap"
                  >
                    ➕ កាត់ចូល
                  </button>
                </div>
              </div>
            ) : (
              /* Button matching Capture.PNG: + ថែមកូដទំនិញថ្មីដោយដៃចូលកន្ត្រក #... */
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setIsAddingManualCode(true);
                  setManualCodeInput('');
                  setManualQtyInput(1);
                }}
                className="w-full py-2.5 px-4 rounded-2xl border border-dashed border-cyan-800/80 bg-[#061226]/60 hover:bg-[#091B38] text-cyan-300 text-xs sm:text-sm font-bold text-center flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 shadow-sm"
              >
                <span>+</span>
                <span>ថែមកូដទំនិញថ្មីដោយដៃចូលកន្ត្រក #{invoice.basket_no || invoice.invoice_id}</span>
              </button>
            )}

            {/* FULL CUSTOMER COMMENTS HISTORY ACCORDION - 100% Comments Retained */}
            {invoice.comments && invoice.comments.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-1" onClick={e => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setShowAllComments(prev => !prev)}
                  className="w-full flex items-center justify-between text-xs text-slate-300 hover:text-cyan-300 font-bold bg-[#040C1A] px-3.5 py-2 rounded-2xl border border-slate-800/80 hover:border-cyan-500/40 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">💬</span>
                    <span>ប្រវត្តិខមិនទាំងអស់របស់ភ្ញៀវ ({invoice.comments.length})</span>
                  </div>
                  <span className="text-[11px] text-cyan-400 font-mono">
                    {showAllComments ? '▲ បង្រួម' : '▼ មើលទាំងអស់'}
                  </span>
                </button>
                {showAllComments && (
                  <div className="bg-[#030914] border border-slate-800 rounded-2xl p-3 flex flex-col gap-2 max-h-56 overflow-y-auto shadow-inner">
                    <div className="text-[11px] text-slate-400 font-medium pb-1 border-b border-slate-800/60 flex items-center justify-between">
                      <span>ខមិនសួរ & កូដទាំងអស់ក្នុង Live នេះ ៖</span>
                      <span className="text-[10px] text-emerald-400 font-mono">✓ មិនបាត់សូម្បីតែ១</span>
                    </div>
                    {invoice.comments.map((comm, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs py-1.5 border-b border-slate-800/40 last:border-0">
                        <span className="text-cyan-400 font-mono text-[10px] font-bold select-none pt-0.5 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
                          #{idx + 1}
                        </span>
                        <span className="text-slate-100 font-medium select-all break-words flex-1 leading-relaxed">
                          "{comm}"
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* BOTTOM ACTION BUTTONS ROW */}
          {currentMasterStage === 1 ? (
            isPaid ? (
              <div className="flex flex-col gap-2 mt-1" onClick={e => e.stopPropagation()}>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onOpenQCModal(invoice);
                  }}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-black font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[0_4px_18px_rgba(16,185,129,0.4)] active:scale-98 transition-all"
                >
                  🚀 ភ្ញៀវបង់រួចហើយ ➔ ផ្ទៀងរូប & បិទស្កុតចេញដឹកភ្លាម
                </button>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={handleNotifyVIP}
                    className="py-3 px-4 rounded-2xl bg-gradient-to-r from-[#8B24D6] via-[#7024D6] to-[#5B21B6] hover:from-[#9D36E8] hover:to-[#6D28D9] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-purple-950/50 active:scale-98 transition-all"
                  >
                    <span>✉️</span>
                    <span>ផ្ញើវិក្កយបត្រ VIP</span>
                  </button>
                  <button
                    onClick={() => onOpenReceiptModal(invoice)}
                    className="py-3 px-4 rounded-2xl bg-gradient-to-r from-[#2563EB] via-[#1D4ED8] to-[#0284C7] hover:from-[#3B82F6] hover:to-[#0EA5E9] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-950/50 active:scale-98 transition-all"
                  >
                    <span>🖨️</span>
                    <span>ព្រីនបិទលើថង់</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Two buttons matching Capture.PNG: ✉️ ផ្ញើវិក្កយបត្រ VIP and 🖨️ ព្រីនបិទលើថង់ */
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 mt-1" onClick={e => e.stopPropagation()}>
                <button
                  onClick={handleNotifyVIP}
                  className="py-3 px-4 rounded-2xl bg-gradient-to-r from-[#8B24D6] via-[#7024D6] to-[#5B21B6] hover:from-[#9D36E8] hover:to-[#6D28D9] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-purple-950/50 active:scale-98 transition-all"
                >
                  <span>✉️</span>
                  <span>ផ្ញើវិក្កយបត្រ VIP</span>
                </button>
                <button
                  onClick={() => onOpenReceiptModal(invoice)}
                  className="py-3 px-4 rounded-2xl bg-gradient-to-r from-[#2563EB] via-[#1D4ED8] to-[#0284C7] hover:from-[#3B82F6] hover:to-[#0EA5E9] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-950/50 active:scale-98 transition-all"
                >
                  <span>🖨️</span>
                  <span>ព្រីនបិទលើថង់</span>
                </button>
              </div>
            )
          ) : currentMasterStage === 2 ? (
            <div className="flex flex-col gap-2 mt-1" onClick={e => e.stopPropagation()}>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={handleNotifyVIP}
                  className="py-3 px-4 rounded-2xl bg-gradient-to-r from-[#8B24D6] via-[#7024D6] to-[#5B21B6] hover:from-[#9D36E8] hover:to-[#6D28D9] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-purple-950/50 active:scale-98 transition-all"
                >
                  <span>✉️</span>
                  <span>ផ្ញើវិក្កយបត្រ VIP</span>
                </button>
                <button
                  onClick={() => onOpenReceiptModal(invoice)}
                  className="py-3 px-4 rounded-2xl bg-[#0F1D38] border border-cyan-500/70 hover:bg-[#14264A] text-cyan-300 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow active:scale-98 transition-all"
                >
                  <span>🖨️</span>
                  <span>ព្រីនវិក្កយបត្រឡើងវិញ</span>
                </button>
              </div>
              <div className="bg-amber-950/40 border border-amber-700/50 p-2 rounded-xl text-xs text-amber-200 text-center font-bold">
                📦 ថង់នៅលើធ្នើស្រាប់ ‧ រង់ចាំភ្ញៀវវេរលុយ ABA
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 mt-1" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => onOpenQCModal(invoice)}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-black font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[0_4px_22px_rgba(16,185,129,0.45)] active:scale-98 transition-all"
              >
                <span>🔍</span>
                <span>ផ្ទៀងរូប Telegram & បិទស្កុតចេញដឹក</span>
              </button>
              <button
                onClick={() => onOpenReceiptModal(invoice)}
                className="py-3 px-4 rounded-2xl bg-[#0F1D38] border border-cyan-500/70 hover:bg-[#14264A] text-cyan-300 font-bold text-xs sm:text-sm flex items-center justify-center gap-1 shadow active:scale-98 transition-all"
                title="ព្រីនវិក្កយបត្រ"
              >
                <span>🖨️</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
