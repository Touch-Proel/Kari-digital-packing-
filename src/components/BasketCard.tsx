import React, { useState, useMemo } from 'react';
import { Invoice, OrderItem, Product } from '../types';
import { playPureTone, playSuccessFanfare, playWarningBuzzer } from '../utils/audio';
import { convertKhmerNumeralsToGlobal } from '../utils/khmerNumerals';

interface BasketCardProps {
  key?: any;
  invoice: Invoice;
  currentMasterStage: number; // 1: Unpicked, 2: Staged, 3: Paid/QC
  myPackerName: string;
  checkedState: Record<string, boolean>;
  productMap?: Record<string, Product>;
  activeLiveId?: string;
  onToggleItemCheck: (invId: number, code: string) => void;
  onOpenQCModal: (inv: Invoice) => void;
  onOpenReceiptModal: (inv: Invoice) => void;
  onOpenVipModal?: (inv: Invoice) => void;
  onOpenKHQRModal?: (inv: Invoice) => void;
  onOpenZoomModal: (code: string, name: string, imageUrl?: string, price?: number, stockQty?: number) => void;
  onDataChanged: () => void;
  onOptimisticItemUpdate?: (invoiceId: number, code: string, targetQty: number) => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export function BasketCard({
  invoice,
  currentMasterStage,
  myPackerName,
  checkedState,
  productMap,
  activeLiveId,
  onToggleItemCheck,
  onOpenQCModal,
  onOpenReceiptModal,
  onOpenVipModal,
  onOpenKHQRModal,
  onOpenZoomModal,
  onDataChanged,
  onOptimisticItemUpdate,
  onShowToast
}: BasketCardProps) {
  const [isOpen, setIsOpen] = useState(true);

  // Stepper & Item Delete States
  const [deleteConfirmCode, setDeleteConfirmCode] = useState<string | null>(null);
  const [activeQuickQtyCode, setActiveQuickQtyCode] = useState<string | null>(null);

  // Direct Item Code & Details Editing State
  const [editingCodeItem, setEditingCodeItem] = useState<{
    oldCode: string;
    newCode: string;
    price: number;
    qty: number;
  } | null>(null);
  const [isSavingCode, setIsSavingCode] = useState(false);

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

  // Guard against illegal actions on baskets locked by other packers
  const checkLockGuard = (): boolean => {
    if (isLockedByOther) {
      playWarningBuzzer();
      onShowToast(
        `🔒 កន្ត្រកនេះត្រូវបានចាក់សោដោយ «${invoice.locked_by}»! ចុច «🔓 ដោះសោរច្រកជំនួស» ដើម្បីដណ្តើមច្រកជំនួស!`,
        'error'
      );
      return false;
    }
    return true;
  };

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

  const [isSendingVip, setIsSendingVip] = useState(false);

  // Toggle Manual Sent Status
  const handleToggleMsgSent = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch('/api/toggle_msg_sent_status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id
        })
      });
      const data = await res.json();
      if (data.success) {
        invoice.msg_status = data.msg_status;
        if (data.msg_status === 'SENT') {
          playSuccessFanfare();
          onShowToast('✅ បានសម្គាល់ថាបានឆាតផ្ញើរួចរាល់!', 'success');
        } else {
          onShowToast('🔄 បានប្តូរទៅស្ថានភាពមិនទាន់ឆាត');
        }
        onDataChanged();
      }
    } catch (err) {
      onShowToast('Error updating chat status', 'error');
    }
  };

  // Open Facebook Messenger or Page Inbox directly and copy VIP invoice text
  const openFacebookDirectChat = async (e: React.MouseEvent) => {
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
      if (data.vip_message && navigator.clipboard) {
        await navigator.clipboard.writeText(data.vip_message);
        onShowToast('📋 បាន Copy វិក្កយបត្ររួចរាល់! កំពុងបើក Messenger...', 'success');
      }
    } catch {}

    const cleanUid = String(invoice.facebook_user_id || '').trim();
    let chatUrl = '';
    if (cleanUid && !['FB_USER_ID_STREAM', 'MANUAL_USER_ID', 'NONE', 'None', 'undefined', 'null'].includes(cleanUid) && cleanUid.length > 4) {
      chatUrl = `https://m.me/${cleanUid}`;
    } else {
      chatUrl = `https://www.facebook.com/messages`;
    }
    window.open(chatUrl, '_blank', 'noopener,noreferrer');
  };

  // Notify VIP Messenger Invoice
  const handleNotifyVIP = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSendingVip) return;
    setIsSendingVip(true);
    playPureTone(900, 0.08);
    onShowToast(`✉️ កំពុងផ្ញើវិក្កយបត្រ VIP ទៅ ${invoice.facebook_name}...`);

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
      if (data.vip_message && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(data.vip_message);
        } catch {}
      }

      if (data.success) {
        invoice.msg_status = 'SENT';
        playSuccessFanfare();
        onShowToast(`✅ បានផ្ញើ VIP ទៅ ${invoice.facebook_name} ជោគជ័យ!`, 'success');
        onDataChanged();
      } else {
        invoice.msg_status = 'FAILED';
        playPureTone(320, 0.18, 'sawtooth');
        onShowToast(`❌ មិនអាចផ្ញើស្វ័យប្រវត្តិ (បាន Copy សាររួច) ➔ សូមចុច «ឆាតផ្ទាល់»!`, 'error');
        onDataChanged();
      }
    } catch (err: any) {
      invoice.msg_status = 'FAILED';
      onShowToast(`❌ ផ្ញើមិនបានជោគជ័យ៖ ${err?.message || err}`, 'error');
      onDataChanged();
    } finally {
      setIsSendingVip(false);
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
    if (!checkLockGuard()) return;
    const targetQty = it.quantity + delta;
    if (targetQty < 1) {
      setDeleteConfirmCode(it.product_code);
      setTimeout(() => {
        setDeleteConfirmCode(prev => (prev === it.product_code ? null : prev));
      }, 4000);
      return;
    }

    // Instant 0ms Optimistic UI Update & Sound (No lag)
    playPureTone(delta > 0 ? 880 : 660, 0.04);
    if (onOptimisticItemUpdate) {
      onOptimisticItemUpdate(invoice.invoice_id, it.product_code, targetQty);
    }

    try {
      const res = await fetch('/api/set_item_qty_direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          code: it.product_code,
          new_qty: targetQty,
          packer_name: myPackerName
        })
      });
      const data = await res.json();
      if (data.success) {
        onShowToast(`✅ [${it.product_code}] ចំនួន៖ ${targetQty}`);
        onDataChanged();
      } else {
        playWarningBuzzer();
        onShowToast(`⚠️ ${data.message || 'មិនអាចកែប្រែបានទេ'}`, 'error');
        onDataChanged(); // Revert from server
      }
    } catch (err) {
      onShowToast('⚠️ មានបញ្ហាបណ្តាញ WiFi!', 'error');
      onDataChanged();
    }
  };

  // Directly Set Qty to a Specific Number
  const handleDirectSetQty = async (code: string, newQty: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!checkLockGuard()) return;
    setActiveQuickQtyCode(null);
    if (newQty < 0) return;

    // Instant 0ms Optimistic UI Update & Sound (No lag)
    playPureTone(900, 0.04);
    if (onOptimisticItemUpdate) {
      onOptimisticItemUpdate(invoice.invoice_id, code, newQty);
    }

    try {
      const res = await fetch('/api/set_item_qty_direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          code: code,
          new_qty: newQty,
          packer_name: myPackerName
        })
      });
      const data = await res.json();
      if (data.success) {
        onShowToast(newQty === 0 ? `🗑️ បានលុបកូដ [${code}]` : `✅ [${code}] ចំនួន៖ ${newQty}`);
        onDataChanged();
      } else {
        playWarningBuzzer();
        onShowToast(`⚠️ ${data.message || 'មិនអាចកែបានទេ'}`, 'error');
        onDataChanged();
      }
    } catch (err) {
      onShowToast('⚠️ មានបញ្ហាបណ្តាញ!', 'error');
      onDataChanged();
    }
  };

  // Toggle Quick Qty Selector Popover
  const handleToggleQuickQty = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!checkLockGuard()) return;
    setActiveQuickQtyCode(prev => (prev === code ? null : code));
  };

  // Handle Delete Button Click (Double-click confirm pattern)
  const handleDeleteClick = (it: OrderItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!checkLockGuard()) return;
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
    if (!checkLockGuard()) return;
    setDeleteConfirmCode(null);
    playWarningBuzzer();

    // Instant 0ms Optimistic Delete from Basket UI
    if (onOptimisticItemUpdate) {
      onOptimisticItemUpdate(invoice.invoice_id, it.product_code, 0);
    }

    try {
      const res = await fetch('/api/set_item_qty_direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          code: it.product_code,
          new_qty: 0,
          packer_name: myPackerName
        })
      });
      const data = await res.json();
      if (data.success) {
        onShowToast(`🗑️ បានដកកូដ [${it.product_code}] ចេញពីកន្ត្រក #${invoice.basket_no}!`);
        onDataChanged();
      } else {
        onShowToast(`⚠️ ${data.message || 'មិនអាចលុបបានទេ'}`, 'error');
        onDataChanged();
      }
    } catch (e) {
      onShowToast('Error deleting item', 'error');
      onDataChanged();
    }
  };

  // Start Editing Item Code, Price, or Qty
  const handleStartEditCode = (item: OrderItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!checkLockGuard()) return;
    setEditingCodeItem({
      oldCode: item.product_code,
      newCode: item.product_code,
      price: item.price,
      qty: item.quantity
    });
  };

  // Save Item Code Changes
  const handleSaveItemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCodeItem) return;
    if (!checkLockGuard()) return;

    const targetCode = convertKhmerNumeralsToGlobal(editingCodeItem.newCode).trim().toUpperCase();
    if (!targetCode) {
      onShowToast('សូមបញ្ចូលកូដទំនិញ', 'error');
      return;
    }

    const stockProd = productMap ? productMap[targetCode] : undefined;
    const finalPrice = stockProd?.price ?? editingCodeItem.price;

    setIsSavingCode(true);
    try {
      const res = await fetch('/api/edit_basket_item_code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          old_code: editingCodeItem.oldCode,
          new_code: targetCode,
          new_qty: editingCodeItem.qty,
          new_price: finalPrice,
          packer_name: myPackerName
        })
      });
      const data = await res.json();
      if (data.success) {
        playSuccessFanfare();
        onShowToast(data.message || `✅ បានកែប្រែកូដ [${targetCode}] (តម្លៃ $${finalPrice.toFixed(2)}) រួចរាល់!`, 'success');
        setEditingCodeItem(null);
        onDataChanged();
      } else {
        playWarningBuzzer();
        onShowToast(`⚠️ ${data.message || 'មិនអាចកែប្រែកូដបានទេ'}`, 'error');
      }
    } catch (err) {
      onShowToast('⚠️ មានបញ្ហាបណ្តាញ WiFi!', 'error');
    } finally {
      setIsSavingCode(false);
    }
  };

  // Smart cut from comment
  const handleSmartCut = async (commentText: string, autoCode: string, autoQty: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!checkLockGuard()) return;
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
          comment_text: commentText,
          packer_name: myPackerName
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
    if (!checkLockGuard()) return;
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
          comment_text: manualCommentSource || undefined,
          packer_name: myPackerName
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
            <span className="text-xl sm:text-2xl font-black font-mono text-cyan-400 tracking-tight flex-shrink-0 bg-cyan-950/50 border border-cyan-500/40 px-2 py-0.5 rounded-xl shadow-inner">
              #{invoice.basket_no || invoice.invoice_id}
            </span>

            {/* Customer Avatar Circle */}
            <div className="w-10 h-10 rounded-full border-2 border-cyan-400/80 overflow-hidden bg-[#071324] flex-shrink-0 flex items-center justify-center shadow-lg relative ring-2 ring-cyan-500/20">
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
              <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-cyan-300 pointer-events-none select-none z-0">
                {invoice.facebook_name ? invoice.facebook_name.trim().charAt(0).toUpperCase() : '👤'}
              </span>
            </div>

            {/* Customer Name & Live Timestamp */}
            <div className="flex flex-col min-w-0">
              <span className="text-white font-black text-sm sm:text-base leading-tight truncate drop-shadow-sm">
                {invoice.facebook_name}
              </span>
              <span className="text-[11px] text-amber-400 font-semibold flex items-center gap-1 mt-0.5 whitespace-nowrap">
                <span>📹</span>
                <span>Live ៖ {formatLiveDate(invoice.created_at)}</span>
              </span>
            </div>
          </div>

          {/* Right: Status Pill & Collapse Indicator */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isPaid ? (
              <span className="bg-emerald-950/90 border border-emerald-400 text-emerald-300 text-xs font-black px-3 py-1 rounded-xl uppercase tracking-wider shadow-[0_0_12px_rgba(16,185,129,0.3)]">
                PAID
              </span>
            ) : isStaged ? (
              <span className="bg-amber-950/90 border border-amber-400 text-amber-300 text-xs font-black px-3 py-1 rounded-xl uppercase tracking-wider shadow-[0_0_12px_rgba(245,158,11,0.3)]">
                STAGED
              </span>
            ) : (
              <span className="bg-[#261703] border border-amber-500/90 text-amber-400 text-xs font-black px-3 py-1 rounded-xl uppercase tracking-wider shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                UNPAID
              </span>
            )}

            <button
              type="button"
              className="text-slate-400 hover:text-white text-xs transition-colors p-1 rounded-lg bg-slate-800/60"
              title={isOpen ? 'បង្រួម' : 'ពន្លាត'}
            >
              {isOpen ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {/* Sub Header Row: Location Zone buttons (Left) + Total Price (Right) */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {/* Location Zone Segmented Control */}
          <div
            className="flex items-center bg-[#040914] p-0.5 rounded-xl border border-slate-800/90 shadow-inner"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={e => handleSetZone('PP', e)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                invoice.location_zone === 'PP'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🏙️</span>
              <span>ភ្នំពេញ</span>
            </button>
            <button
              onClick={e => handleSetZone('PROVINCE', e)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                invoice.location_zone === 'PROVINCE'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🏕️</span>
              <span>ខេត្ត</span>
            </button>
          </div>

          {/* Right: KHQR Button + Total Price Badge */}
          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
            {onOpenKHQRModal && (
              <button
                type="button"
                onClick={() => onOpenKHQRModal(invoice)}
                className="bg-[#E11925] hover:bg-[#c91420] text-white px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1 shadow-[0_0_14px_rgba(225,25,37,0.5)] active:scale-95 transition-all cursor-pointer border border-red-400/40"
                title="ស្កេន Bakong KHQR"
              >
                <span className="bg-white text-[#E11925] text-[10px] font-black px-1 py-0.5 rounded shadow-sm">
                  KHQR
                </span>
                <span>ស្កែន</span>
              </button>
            )}
            <div className="bg-[#031526] border-2 border-cyan-400 text-cyan-300 px-3 py-1 rounded-xl font-mono font-black text-sm sm:text-base shadow-[0_0_14px_rgba(6,182,212,0.35)] flex items-center gap-1">
              <span>${invoice.total_amount.toFixed(2)}</span>
            </div>
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
            {invoice.msg_status === 'SENT' ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenVipModal) {
                    onOpenVipModal(invoice);
                  } else {
                    handleNotifyVIP(e);
                  }
                }}
                title="សារ VIP បានផ្ញើចូល Messenger ជោគជ័យ (ចុចដើម្បីមើល ឬផ្ញើឡើងវិញ)"
                className="text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 border transition-all shadow-sm active:scale-95 cursor-pointer bg-emerald-950/90 border-emerald-500/80 text-emerald-300 hover:bg-emerald-900/80"
              >
                <span className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] text-emerald-400">✓</span>
                <span>ឆាតជោគជ័យ</span>
              </button>
            ) : invoice.msg_status === 'FAILED' ? (
              <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={openFacebookDirectChat}
                  title="ចុចចូលទៅកាន់ Facebook Messenger / Page Inbox ផ្ទាល់ (Copy សាររួចរាល់)"
                  className="text-xs font-bold px-2.5 py-1.5 rounded-xl flex items-center gap-1 border transition-all shadow-sm active:scale-95 cursor-pointer bg-rose-950/90 border-rose-500/80 text-rose-200 hover:bg-rose-900/80 animate-pulse"
                >
                  <span className="text-rose-400 text-xs">❌</span>
                  <span>ផ្ញើបរាជ័យ (ឆាតផ្ទាល់)</span>
                </button>
                <button
                  type="button"
                  onClick={handleToggleMsgSent}
                  title="សម្គាល់ថាបានឆាតផ្ញើរួចរាល់"
                  className="text-xs font-bold px-2 py-1.5 rounded-xl flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 shadow-sm active:scale-95 cursor-pointer"
                >
                  <span>✓</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenVipModal) {
                    onOpenVipModal(invoice);
                  } else {
                    handleNotifyVIP(e);
                  }
                }}
                title="ចុចដើម្បីពិនិត្យ ឬផ្ញើសារ VIP"
                className="text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 border transition-all shadow-sm active:scale-95 cursor-pointer bg-[#0A1832] hover:bg-[#0E234A] border-purple-500/40 hover:border-purple-400 text-purple-200"
              >
                <span>✉️</span>
                <span>ឆាតប្រាប់ VIP</span>
              </button>
            )}
          </div>

          {/* Progress Row & Sleek Progress Bar */}
          <div className="flex flex-col gap-1.5 px-1 pt-0.5">
            <div className="flex items-center justify-between text-xs text-slate-300 font-bold">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">រៀបធ្លាក់ ៖</span>
                <span className="font-mono text-white font-black bg-slate-900 border border-slate-700/80 px-2 py-0.5 rounded-lg">
                  {packedCount} / {totalCount} មុខ
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`font-mono font-black text-xs px-2 py-0.5 rounded-lg ${
                  packPercent === 100
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/60'
                    : 'bg-cyan-950 text-cyan-300 border border-cyan-500/60'
                }`}>
                  {packPercent}%
                </span>
              </div>
            </div>
            {/* Visual Progress Bar Track */}
            <div className="w-full h-1.5 bg-slate-900/90 rounded-full overflow-hidden border border-slate-800/80">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  packPercent === 100
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                }`}
                style={{ width: `${packPercent}%` }}
              />
            </div>
          </div>

          {/* ITEM ROWS LIST */}
          <div className="flex flex-col gap-2.5">
            {invoice.items.map((item, idx) => {
              const isChecked = !!checkedState[`${invoice.invoice_id}_${item.product_code}`];
              const prod = productMap ? productMap[item.product_code.toUpperCase()] : undefined;
              // Session-Isolated Image:
              // 1. If this specific item has an image snapshot from this order, use it.
              // 2. If no image snapshot exists, ONLY fallback to productMap if this invoice is from the currently active live.
              //    Past live orders will NOT pull new live images even if codes match!
              const isEditingThisCode = editingCodeItem?.oldCode === item.product_code;
              const activeTypedCode = isEditingThisCode
                ? convertKhmerNumeralsToGlobal(editingCodeItem.newCode).trim().toUpperCase()
                : item.product_code.toUpperCase();
              const activeProd = productMap ? productMap[activeTypedCode] : prod;

              const isCurrentLiveOrder = !activeLiveId || invoice.live_id === activeLiveId;

              // Session-Isolated Image with real-time quick edit preview
              const displayImage = (item.image_file && item.image_file.trim() !== '' && !isEditingThisCode)
                ? item.image_file
                : (isCurrentLiveOrder && invoice.packing_stage === 'UNPICKED' ? activeProd?.image_file : undefined);

              const displayPrice = isEditingThisCode && typeof activeProd?.price === 'number'
                ? activeProd.price
                : item.price;

              const matchingComment = invoice.comments?.find(c => {
                const converted = convertKhmerNumeralsToGlobal(c || '');
                const codeRegex = new RegExp(`(^|\\D)${item.product_code}(\\D|$)`, 'i');
                return codeRegex.test(converted);
              });
              const rawNoteText = item.item_comment || matchingComment || (invoice.comments && invoice.comments[0]) || '';
              const noteText = convertKhmerNumeralsToGlobal(rawNoteText);

              return (
                <div key={idx} className="flex flex-col">
                  {/* Outer Item Card matching Capture.PNG */}
                  <div
                    onClick={() => {
                      if (!checkLockGuard()) return;
                      handleLockInvoice();
                      onToggleItemCheck(invoice.invoice_id, item.product_code);
                    }}
                    className={`p-3 rounded-2xl border-2 flex items-center gap-3 transition-all cursor-pointer select-none relative ${
                      isChecked
                        ? 'bg-[#041A14]/95 border-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.25)] ring-1 ring-emerald-500/30'
                        : 'bg-[#060E1E]/95 border-slate-800 hover:border-cyan-500/60 shadow-md'
                    }`}
                  >
                    {/* LEFT THUMBNAIL: Exactly 80x80 px */}
                    <div
                      className={`w-[80px] h-[80px] min-w-[80px] min-h-[80px] max-w-[80px] max-h-[80px] rounded-2xl overflow-hidden bg-slate-950 border-2 flex-shrink-0 relative group flex items-center justify-center cursor-pointer shadow-md transition-all ${
                        isChecked ? 'border-emerald-500/60' : 'border-slate-700/80 group-hover:border-cyan-400'
                      }`}
                      onClick={e => {
                        e.stopPropagation();
                        onOpenZoomModal(
                          activeTypedCode || item.product_code,
                          item.product_name,
                          displayImage,
                          displayPrice,
                          activeProd?.stock_qty
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
                          <span className="text-xl">📷</span>
                          <span className="text-[10px] font-black mt-0.5 text-cyan-400 bg-cyan-950/80 px-1.5 py-0.2 rounded border border-cyan-500/40">+រូប</span>
                        </div>
                      )}
                    </div>

                    {/* MIDDLE COLUMN: Code badge + Name, Note (directly below code), Price · Qty */}
                    <div className="flex-1 min-w-0 overflow-hidden flex flex-col justify-center">
                      {/* Row 1: [ Code ] and Name */}
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        {/* Interactive In-Place Quick Edit for Code */}
                        {isEditingThisCode ? (
                          <form
                            onSubmit={handleSaveItemCode}
                            onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1 bg-[#0B1E3D] border border-cyan-400/90 px-1.5 py-0.5 rounded-xl shadow-md flex-shrink-0 max-w-full"
                          >
                            <span className="text-[11px] font-bold text-cyan-300 select-none">កូដ</span>
                            <input
                              type="text"
                              value={editingCodeItem.newCode}
                              onChange={e => {
                                const val = convertKhmerNumeralsToGlobal(e.target.value).toUpperCase();
                                setEditingCodeItem({
                                  ...editingCodeItem,
                                  newCode: val
                                });
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Escape') setEditingCodeItem(null);
                              }}
                              className="w-12 sm:w-14 bg-slate-950 border border-cyan-500/80 rounded-lg px-1 py-0.5 text-xs font-mono font-black text-cyan-200 uppercase outline-none focus:ring-1 focus:ring-cyan-300 text-center"
                              autoFocus
                              placeholder="កូដ"
                            />
                            <button
                              type="submit"
                              disabled={isSavingCode}
                              className="w-5 h-5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-md text-[11px] font-black flex items-center justify-center active:scale-90 transition-all shadow cursor-pointer flex-shrink-0"
                              title="រក្សាទុក (Enter)"
                            >
                              {isSavingCode ? '⏳' : '✓'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCodeItem(null)}
                              className="w-5 h-5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-md text-[10px] font-bold flex items-center justify-center active:scale-90 transition-all cursor-pointer flex-shrink-0"
                              title="បោះបង់ (Esc)"
                            >
                              ✕
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            onClick={e => handleStartEditCode(item, e)}
                            className={`border px-2.5 py-1 rounded-xl text-xs sm:text-sm font-bold tracking-wider shadow-sm flex items-center gap-1.5 transition-all active:scale-95 group/code cursor-pointer flex-shrink-0 ${
                              isChecked
                                ? 'bg-emerald-950/90 border-emerald-500/70 text-emerald-300 hover:border-emerald-300'
                                : 'bg-[#0B1E3D] border-blue-400/80 text-blue-200 hover:border-cyan-400 hover:bg-[#0e274f]'
                            }`}
                            title="ចុចត្រង់នេះដើម្បីកែប្រែកូដទំនិញរហ័ស (តម្លៃ & រូបភាពនឹងទាញតាមស្តុកស្វ័យប្រវត្តិ)"
                          >
                            <span className="text-[11px] font-bold opacity-80">កូដ</span>
                            <span className="font-mono font-black text-sm text-cyan-300">[{item.product_code}]</span>
                            <span className="text-[10px] text-amber-400 opacity-70 group-hover/code:opacity-100 group-hover/code:scale-110 transition-all">✏️</span>
                          </button>
                        )}
                        {(() => {
                          const custom = (item.product_name || '')
                            .replace(new RegExp(`^ទំនិញកូដ\\s*\\[?${item.product_code}\\]?`, 'i'), '')
                            .replace(new RegExp(`^កូដ\\s*\\[?${item.product_code}\\]?`, 'i'), '')
                            .replace(new RegExp(`\\[?${item.product_code}\\]?`, 'i'), '')
                            .replace(/^ទំនិញ\s*/i, '')
                            .replace(/\s*ទំនិញ$/i, '')
                            .trim();
                          return custom && custom !== 'ទំនិញ' ? (
                            <span className={`font-bold text-xs sm:text-sm truncate min-w-0 flex-1 ${isChecked ? 'text-slate-300 line-through' : 'text-white'}`}>
                              {custom}
                            </span>
                          ) : null;
                        })()}
                      </div>

                      {/* Row 2: Note with Full Text Wrap & Converted Global Numbers (Directly below Code) */}
                      {noteText && (
                        <div className="text-amber-200 text-xs font-medium mt-1.5 break-words whitespace-normal bg-amber-950/50 px-2.5 py-1 rounded-lg border border-amber-500/40 leading-relaxed shadow-sm">
                          <span className="text-amber-400 font-bold mr-1">↳ Note:</span>
                          <span className="text-amber-100 font-medium">"{noteText}"</span>
                        </div>
                      )}

                      {/* Row 3: Price & High-Visibility Quantity Pill (Pushed below Note) */}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-amber-400 font-mono font-black text-sm sm:text-base tracking-wide drop-shadow-sm flex items-center gap-1">
                          <span>${displayPrice.toFixed(2)}</span>
                          {isEditingThisCode && activeProd && (
                            <span className="text-[10px] font-sans font-bold text-emerald-400 bg-emerald-950/80 px-1 py-0.2 rounded border border-emerald-500/40">
                              (ស្តុក)
                            </span>
                          )}
                        </span>
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-black font-mono flex items-center gap-1 border ${
                          isChecked
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                            : 'bg-amber-950/90 text-amber-300 border-amber-500/70 shadow-sm'
                        }`}>
                          <span>ចំនួន ៖</span>
                          <span className="text-sm font-black">{item.quantity}</span>
                        </span>
                      </div>
                    </div>

                    {/* RIGHT COLUMN: Tactile Picking Checkbox Button (Top) + Qty Edit & Delete (Bottom) */}
                    <div
                      className="flex flex-col items-end justify-between self-stretch gap-2 flex-shrink-0 z-10"
                      onClick={e => e.stopPropagation()}
                    >
                      {/* Big Tactile Picking Button */}
                      <button
                        type="button"
                        onClick={() => {
                          if (!checkLockGuard()) return;
                          handleLockInvoice();
                          onToggleItemCheck(invoice.invoice_id, item.product_code);
                        }}
                        className={`w-14 h-12 rounded-2xl border-2 flex flex-col items-center justify-center transition-all cursor-pointer shadow-md active:scale-95 ${
                          isChecked
                            ? 'bg-emerald-500 border-emerald-300 text-slate-950 shadow-[0_0_18px_rgba(16,185,129,0.6)] font-black'
                            : 'bg-[#09152B] border-slate-600/90 hover:border-cyan-400 text-slate-300 hover:text-cyan-300'
                        }`}
                        title={isChecked ? 'បានច្រកហើយ (ចុចដើម្បីដោះ)' : 'ចុចដើម្បីសម្គាល់ថាបានច្រក'}
                      >
                        {isChecked ? (
                          <div className="flex flex-col items-center leading-tight">
                            <span className="text-lg leading-none font-black">✓</span>
                            <span className="text-[9px] font-black uppercase tracking-tight">រួច</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center leading-tight">
                            <span className="text-sm opacity-60 leading-none">○</span>
                            <span className="text-[10px] font-black text-cyan-300 tracking-tight mt-0.5">រើស</span>
                          </div>
                        )}
                      </button>

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
              const displayUnm = convertKhmerNumeralsToGlobal(unm);
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
                      setManualCommentSource(displayUnm);
                      setManualCodeInput(detected?.code || displayUnm.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8));
                      setManualQtyInput(detected?.qty || 1);
                    }}
                    title="ចុចដើម្បីកែប្រែកូដ ឬចំនួនដោយដៃ"
                  >
                    <span className="bg-amber-950/90 text-amber-400 border border-amber-500/70 px-2 py-0.5 rounded-lg text-xs font-mono font-black tracking-wider flex-shrink-0 select-none">
                      [ N/A ]
                    </span>
                    <span className="text-amber-200 font-bold text-xs sm:text-sm font-mono truncate select-all">
                      "{displayUnm}"
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
                    {invoice.comments.map((comm, idx) => {
                      const convertedComm = convertKhmerNumeralsToGlobal(comm);
                      return (
                        <div key={idx} className="flex items-start gap-2 text-xs py-1.5 border-b border-slate-800/40 last:border-0">
                          <span className="text-cyan-400 font-mono text-[10px] font-bold select-none pt-0.5 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
                            #{idx + 1}
                          </span>
                          <div className="flex-1 flex flex-col">
                            <span className="text-slate-100 font-medium select-all break-words leading-relaxed">
                              "{convertedComm}"
                            </span>
                            {convertedComm !== comm && (
                              <span className="text-[10px] text-slate-500 font-mono italic">
                                ដើម ៖ "{comm}"
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* BOTTOM ACTION BUTTONS ROW */}
          {currentMasterStage === 1 ? (
            isPaid ? (
              <div className="flex flex-col gap-2.5 mt-1" onClick={e => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    if (!checkLockGuard()) return;
                    onOpenQCModal(invoice);
                  }}
                  className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(16,185,129,0.4)] active:scale-[0.98] transition-all cursor-pointer border border-emerald-300/60"
                >
                  <span className="text-base">🚀</span>
                  <span>ភ្ញៀវបង់រួចហើយ ➔ ផ្ទៀងរូប & បិទស្កុតចេញដឹកភ្លាម</span>
                </button>
                <div className="grid grid-cols-2 gap-2.5">
                  {/* VIP Button */}
                  {invoice.msg_status === 'SENT' ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenVipModal) onOpenVipModal(invoice);
                        else handleNotifyVIP(e);
                      }}
                      disabled={isSendingVip}
                      className="py-2.5 px-3 rounded-2xl bg-gradient-to-r from-emerald-800/90 via-teal-800/90 to-emerald-900/90 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2.5 shadow-md border border-emerald-500/50 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <span className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-sm flex-shrink-0">
                        {isSendingVip ? '⏳' : '✅'}
                      </span>
                      <div className="flex flex-col items-start min-w-0 text-left leading-tight">
                        <span className="font-black text-white text-xs sm:text-[13px] truncate">ឆាតជោគជ័យ</span>
                        <span className="text-[10px] text-emerald-300/90 font-medium">ចុចមើល/ផ្ញើឡើងវិញ</span>
                      </div>
                    </button>
                  ) : invoice.msg_status === 'FAILED' ? (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <button
                        type="button"
                        onClick={openFacebookDirectChat}
                        className="flex-1 py-2.5 px-2.5 rounded-2xl bg-gradient-to-r from-rose-900/90 via-rose-800/90 to-cyan-900/90 hover:from-rose-800 hover:to-cyan-800 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md border border-rose-500/60 active:scale-[0.98] transition-all cursor-pointer min-w-0"
                        title="ផ្ញើស្វ័យប្រវត្តិមិនបានជោគជ័យ ➔ ចុចដើម្បីបើក Messenger និង Paste សារ (Copy រួចរាល់)"
                      >
                        <span className="w-7 h-7 rounded-xl bg-rose-500/20 border border-rose-400/50 flex items-center justify-center text-sm flex-shrink-0 animate-pulse">
                          💬
                        </span>
                        <div className="flex flex-col items-start min-w-0 text-left leading-tight truncate">
                          <span className="font-black text-rose-100 text-xs truncate">ឆាតផ្ទាល់ (Copy រួច)</span>
                          <span className="text-[9px] text-rose-300 font-medium truncate">❌ បរាជ័យ · បើក Messenger</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={handleToggleMsgSent}
                        className="h-full py-2.5 px-2.5 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-emerald-400 border border-slate-600/80 font-bold text-xs flex items-center justify-center active:scale-95 transition-all cursor-pointer shadow-sm flex-shrink-0"
                        title="សម្គាល់ថាបានឆាតផ្ញើរួចរាល់"
                      >
                        <span className="text-sm font-black">✓</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenVipModal) onOpenVipModal(invoice);
                        else handleNotifyVIP(e);
                      }}
                      disabled={isSendingVip}
                      className="py-2.5 px-3 rounded-2xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] hover:from-[#7C3AED] hover:via-[#8B5CF6] hover:to-[#A855F7] text-white font-bold text-xs sm:text-sm flex items-center gap-2.5 shadow-[0_4px_16px_rgba(124,58,237,0.35)] border border-purple-400/50 hover:border-purple-300/80 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <span className="w-8 h-8 rounded-xl bg-white/15 border border-white/20 backdrop-blur-sm flex items-center justify-center text-sm flex-shrink-0 shadow-inner">
                        {isSendingVip ? '⏳' : '✉️'}
                      </span>
                      <div className="flex flex-col items-start min-w-0 text-left leading-tight">
                        <span className="font-black text-white text-xs sm:text-[13px] truncate">
                          {isSendingVip ? 'កំពុងផ្ញើ...' : 'ផ្ញើវិក្កយបត្រ VIP'}
                        </span>
                        <span className="text-[10px] text-purple-200/90 font-medium">Messenger · ABA</span>
                      </div>
                    </button>
                  )}

                  {/* Print Button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!checkLockGuard()) return;
                      onOpenReceiptModal(invoice);
                    }}
                    className="py-2.5 px-3 rounded-2xl bg-gradient-to-r from-[#1D4ED8] via-[#2563EB] to-[#0284C7] hover:from-[#2563EB] hover:via-[#3B82F6] hover:to-[#0EA5E9] text-white font-bold text-xs sm:text-sm flex items-center gap-2.5 shadow-[0_4px_16px_rgba(37,99,235,0.35)] border border-sky-400/50 hover:border-sky-300/80 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <span className="w-8 h-8 rounded-xl bg-white/15 border border-white/20 backdrop-blur-sm flex items-center justify-center text-sm flex-shrink-0 shadow-inner">
                      🖨️
                    </span>
                    <div className="flex flex-col items-start min-w-0 text-left leading-tight">
                      <span className="font-black text-white text-xs sm:text-[13px] truncate">ព្រីនបិទលើថង់</span>
                      <span className="text-[10px] text-sky-200/90 font-medium">Thermal (58/80mm)</span>
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              /* Two buttons in Unpaid: VIP Invoice & Thermal Print */
              <div className="grid grid-cols-2 gap-2.5 mt-1" onClick={e => e.stopPropagation()}>
                {invoice.msg_status === 'SENT' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenVipModal) onOpenVipModal(invoice);
                      else handleNotifyVIP(e);
                    }}
                    disabled={isSendingVip}
                    className="py-2.5 px-3 rounded-2xl bg-gradient-to-r from-emerald-800/90 via-teal-800/90 to-emerald-900/90 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2.5 shadow-md border border-emerald-500/50 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <span className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-sm flex-shrink-0">
                      {isSendingVip ? '⏳' : '✅'}
                    </span>
                    <div className="flex flex-col items-start min-w-0 text-left leading-tight">
                      <span className="font-black text-white text-xs sm:text-[13px] truncate">ឆាតជោគជ័យ</span>
                      <span className="text-[10px] text-emerald-300/90 font-medium">ចុចមើល/ផ្ញើឡើងវិញ</span>
                    </div>
                  </button>
                ) : invoice.msg_status === 'FAILED' ? (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button
                      type="button"
                      onClick={openFacebookDirectChat}
                      className="flex-1 py-2.5 px-2.5 rounded-2xl bg-gradient-to-r from-rose-900/90 via-rose-800/90 to-cyan-900/90 hover:from-rose-800 hover:to-cyan-800 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md border border-rose-500/60 active:scale-[0.98] transition-all cursor-pointer min-w-0"
                      title="ផ្ញើស្វ័យប្រវត្តិមិនបានជោគជ័យ ➔ ចុចដើម្បីបើក Messenger និង Paste សារ (Copy រួចរាល់)"
                    >
                      <span className="w-7 h-7 rounded-xl bg-rose-500/20 border border-rose-400/50 flex items-center justify-center text-sm flex-shrink-0 animate-pulse">
                        💬
                      </span>
                      <div className="flex flex-col items-start min-w-0 text-left leading-tight truncate">
                        <span className="font-black text-rose-100 text-xs truncate">ឆាតផ្ទាល់ (Copy រួច)</span>
                        <span className="text-[9px] text-rose-300 font-medium truncate">❌ បរាជ័យ · បើក Messenger</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleMsgSent}
                      className="h-full py-2.5 px-2.5 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-emerald-400 border border-slate-600/80 font-bold text-xs flex items-center justify-center active:scale-95 transition-all cursor-pointer shadow-sm flex-shrink-0"
                      title="សម្គាល់ថាបានឆាតផ្ញើរួចរាល់"
                    >
                      <span className="text-sm font-black">✓</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenVipModal) onOpenVipModal(invoice);
                      else handleNotifyVIP(e);
                    }}
                    disabled={isSendingVip}
                    className="py-2.5 px-3 rounded-2xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] hover:from-[#7C3AED] hover:via-[#8B5CF6] hover:to-[#A855F7] text-white font-bold text-xs sm:text-sm flex items-center gap-2.5 shadow-[0_4px_16px_rgba(124,58,237,0.35)] border border-purple-400/50 hover:border-purple-300/80 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <span className="w-8 h-8 rounded-xl bg-white/15 border border-white/20 backdrop-blur-sm flex items-center justify-center text-sm flex-shrink-0 shadow-inner">
                      {isSendingVip ? '⏳' : '✉️'}
                    </span>
                    <div className="flex flex-col items-start min-w-0 text-left leading-tight">
                      <span className="font-black text-white text-xs sm:text-[13px] truncate">
                        {isSendingVip ? 'កំពុងផ្ញើ...' : 'ផ្ញើវិក្កយបត្រ VIP'}
                      </span>
                      <span className="text-[10px] text-purple-200/90 font-medium">Messenger · ABA</span>
                    </div>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!checkLockGuard()) return;
                    onOpenReceiptModal(invoice);
                  }}
                  className="py-2.5 px-3 rounded-2xl bg-gradient-to-r from-[#1D4ED8] via-[#2563EB] to-[#0284C7] hover:from-[#2563EB] hover:via-[#3B82F6] hover:to-[#0EA5E9] text-white font-bold text-xs sm:text-sm flex items-center gap-2.5 shadow-[0_4px_16px_rgba(37,99,235,0.35)] border border-sky-400/50 hover:border-sky-300/80 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <span className="w-8 h-8 rounded-xl bg-white/15 border border-white/20 backdrop-blur-sm flex items-center justify-center text-sm flex-shrink-0 shadow-inner">
                    🖨️
                  </span>
                  <div className="flex flex-col items-start min-w-0 text-left leading-tight">
                    <span className="font-black text-white text-xs sm:text-[13px] truncate">ព្រីនបិទលើថង់</span>
                    <span className="text-[10px] text-sky-200/90 font-medium">Thermal (58/80mm)</span>
                  </div>
                </button>
              </div>
            )
          ) : currentMasterStage === 2 ? (
            <div className="flex flex-col gap-2.5 mt-1" onClick={e => e.stopPropagation()}>
              <div className="grid grid-cols-2 gap-2.5">
                {invoice.msg_status === 'SENT' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenVipModal) onOpenVipModal(invoice);
                      else handleNotifyVIP(e);
                    }}
                    disabled={isSendingVip}
                    className="py-2.5 px-3 rounded-2xl bg-gradient-to-r from-emerald-800/90 via-teal-800/90 to-emerald-900/90 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2.5 shadow-md border border-emerald-500/50 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <span className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-sm flex-shrink-0">
                      {isSendingVip ? '⏳' : '✅'}
                    </span>
                    <div className="flex flex-col items-start min-w-0 text-left leading-tight">
                      <span className="font-black text-white text-xs sm:text-[13px] truncate">ឆាតជោគជ័យ</span>
                      <span className="text-[10px] text-emerald-300/90 font-medium">ចុចមើល/ផ្ញើឡើងវិញ</span>
                    </div>
                  </button>
                ) : invoice.msg_status === 'FAILED' ? (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button
                      type="button"
                      onClick={openFacebookDirectChat}
                      className="flex-1 py-2.5 px-2.5 rounded-2xl bg-gradient-to-r from-rose-900/90 via-rose-800/90 to-cyan-900/90 hover:from-rose-800 hover:to-cyan-800 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md border border-rose-500/60 active:scale-[0.98] transition-all cursor-pointer min-w-0"
                      title="ផ្ញើស្វ័យប្រវត្តិមិនបានជោគជ័យ ➔ ចុចដើម្បីបើក Messenger និង Paste សារ (Copy រួចរាល់)"
                    >
                      <span className="w-7 h-7 rounded-xl bg-rose-500/20 border border-rose-400/50 flex items-center justify-center text-sm flex-shrink-0 animate-pulse">
                        💬
                      </span>
                      <div className="flex flex-col items-start min-w-0 text-left leading-tight truncate">
                        <span className="font-black text-rose-100 text-xs truncate">ឆាតផ្ទាល់ (Copy រួច)</span>
                        <span className="text-[9px] text-rose-300 font-medium truncate">❌ បរាជ័យ · បើក Messenger</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleMsgSent}
                      className="h-full py-2.5 px-2.5 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-emerald-400 border border-slate-600/80 font-bold text-xs flex items-center justify-center active:scale-95 transition-all cursor-pointer shadow-sm flex-shrink-0"
                      title="សម្គាល់ថាបានឆាតផ្ញើរួចរាល់"
                    >
                      <span className="text-sm font-black">✓</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenVipModal) onOpenVipModal(invoice);
                      else handleNotifyVIP(e);
                    }}
                    disabled={isSendingVip}
                    className="py-2.5 px-3 rounded-2xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] hover:from-[#7C3AED] hover:via-[#8B5CF6] hover:to-[#A855F7] text-white font-bold text-xs sm:text-sm flex items-center gap-2.5 shadow-[0_4px_16px_rgba(124,58,237,0.35)] border border-purple-400/50 hover:border-purple-300/80 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <span className="w-8 h-8 rounded-xl bg-white/15 border border-white/20 backdrop-blur-sm flex items-center justify-center text-sm flex-shrink-0 shadow-inner">
                      {isSendingVip ? '⏳' : '✉️'}
                    </span>
                    <div className="flex flex-col items-start min-w-0 text-left leading-tight">
                      <span className="font-black text-white text-xs sm:text-[13px] truncate">
                        {isSendingVip ? 'កំពុងផ្ញើ...' : 'ផ្ញើវិក្កយបត្រ VIP'}
                      </span>
                      <span className="text-[10px] text-purple-200/90 font-medium">Messenger · ABA</span>
                    </div>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!checkLockGuard()) return;
                    onOpenReceiptModal(invoice);
                  }}
                  className="py-2.5 px-3 rounded-2xl bg-[#09152B] hover:bg-[#0E2042] border border-cyan-500/60 hover:border-cyan-400 text-cyan-200 font-bold text-xs sm:text-sm flex items-center gap-2.5 shadow-md active:scale-[0.98] transition-all cursor-pointer"
                >
                  <span className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-sm flex-shrink-0">
                    🖨️
                  </span>
                  <div className="flex flex-col items-start min-w-0 text-left leading-tight">
                    <span className="font-black text-white text-xs sm:text-[13px] truncate">ព្រីនឡើងវិញ</span>
                    <span className="text-[10px] text-cyan-300/80 font-medium">Thermal Label</span>
                  </div>
                </button>
              </div>
              <div className="bg-[#1A1204] border border-amber-600/50 p-2.5 rounded-xl text-xs text-amber-200 text-center font-bold flex items-center justify-center gap-1.5 shadow-sm">
                <span>📦</span>
                <span>ថង់នៅលើធ្នើស្រាប់ ‧ រង់ចាំភ្ញៀវវេរលុយ ABA</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 mt-1" onClick={e => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  if (!checkLockGuard()) return;
                  onOpenQCModal(invoice);
                }}
                className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[0_4px_22px_rgba(16,185,129,0.45)] active:scale-[0.98] transition-all cursor-pointer border border-emerald-300/60"
              >
                <span className="text-base">🔍</span>
                <span>ផ្ទៀងរូប Telegram & បិទស្កុតចេញដឹក</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!checkLockGuard()) return;
                  onOpenReceiptModal(invoice);
                }}
                className="py-3 px-3.5 rounded-2xl bg-[#09152B] border border-cyan-500/60 hover:bg-[#0E2042] text-cyan-300 font-bold text-xs sm:text-sm flex items-center justify-center gap-1 shadow-md active:scale-[0.98] transition-all cursor-pointer"
                title="ព្រីនវិក្កយបត្រ"
              >
                <span className="text-base">🖨️</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
