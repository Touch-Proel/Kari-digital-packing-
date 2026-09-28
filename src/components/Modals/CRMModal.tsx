import React, { useState, useEffect, useMemo, useTransition } from 'react';
import { CustomerCRMRecord } from '../../types';

interface CRMModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
  onCustomerUpdated?: () => void;
  initialCustomerQuery?: string;
  initialTab?: FilterTab;
}

type FilterTab = 'ALL' | 'SAFE_24H' | 'HAS_COMMENT' | 'VIP' | 'INACTIVE' | 'PP' | 'PROVINCE' | 'BLACKLIST';
type TemplateType = 'PRIVATE_REPLY' | 'LIVE_INVITE' | 'VIP_PROMO' | 'NEW_ARRIVAL' | 'BULK_DISCOUNT' | 'CARE';

const PRESET_TAGS = [
  '👕 Size S/M',
  '👕 Size L/XL',
  '👕 Oversize',
  '⚡ វេរលុយលឿន',
  '👑 ម៉ូយ VIP',
  '🎁 ចូលចិត្តកាដូថែម',
  '⭐ ម៉ូយចាស់ទិញច្រើន',
  '🚚 វីរៈប៊ុនថាំ',
  '🚚 កាពីតូល',
  '🚚 J&T Express',
  '🏙️ ភ្នំពេញ',
  '🏕️ ខេត្ត'
];

export function CRMModal({
  isOpen,
  onClose,
  onShowToast,
  onCustomerUpdated,
  initialCustomerQuery,
  initialTab
}: CRMModalProps) {
  const [customers, setCustomers] = useState<CustomerCRMRecord[]>([]);
  const [stats, setStats] = useState({
    total_customers: 0,
    safe_24h_count: 0,
    vip_count: 0,
    inactive_count: 0,
    pp_count: 0,
    province_count: 0,
    total_revenue: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialCustomerQuery || '');
  const [activeTab, setActiveTab] = useState<FilterTab>(initialTab || 'ALL');
  const [activeTemplate, setActiveTemplate] = useState<TemplateType>('PRIVATE_REPLY');
  const [broadcastFilter, setBroadcastFilter] = useState<'ALL' | 'UNSENT' | 'SENT'>('ALL');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedNameId, setCopiedNameId] = useState<number | null>(null);
  const [sendingPrivateReplyId, setSendingPrivateReplyId] = useState<number | null>(null);
  const [selectedCommentMap, setSelectedCommentMap] = useState<Record<number, string>>({});

  // Edit Customer State
  const [editingCust, setEditingCust] = useState<CustomerCRMRecord | null>(null);
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editZone, setEditZone] = useState<'PP' | 'PROVINCE'>('PROVINCE');
  const [editZoneLocked, setEditZoneLocked] = useState(false);
  const [editIsVip, setEditIsVip] = useState(false);
  const [editIsBlacklist, setEditIsBlacklist] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [, startTransition] = useTransition();

  const fetchCRMData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/crm/customers');
      const data = await res.json();
      if (data.success) {
        setCustomers(data.customers || []);
        if (data.stats) setStats(data.stats);
      }
    } catch {
      onShowToast('⚠️ មិនអាចទាញទិន្នន័យ CRM បាន!', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (initialCustomerQuery !== undefined) {
        setSearchQuery(initialCustomerQuery);
      }
      if (initialTab) {
        setActiveTab(initialTab);
      }
      fetchCRMData();
    }
  }, [isOpen, initialCustomerQuery, initialTab]);

  // Format remarket relative time
  const formatRemarketTime = (dateStr?: string) => {
    if (!dateStr) return null;
    const d = new Date(dateStr).getTime();
    if (isNaN(d)) return null;
    const diffSec = Math.floor((Date.now() - d) / 1000);
    if (diffSec < 60) return 'ទើបផ្ញើ';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} នាទីមុន`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} ម៉ោងមុន`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay} ថ្ងៃមុន`;
  };

  // Generate Personalized Remarketing Message for T-Shirt Store (អាវយឺត)
  const getRemarketingMessage = (customerName: string, type: TemplateType): string => {
    const cleanName = customerName || 'អូន';
    switch (type) {
      case 'PRIVATE_REPLY':
        return `ជម្រាបសួរអូន ${cleanName} ចាស! ចែឃើញអូនបានខមិនកាត់អាវយឺតក្នុង Live យប់មិញ ម៉ូតដែលអូនចាប់អារម្មណ៍ឥឡូវចូលស្តុកគ្រប់ Size (S, M, L, XL, Oversize) ណាអូន! បើអូនចង់បានអាចតបឆាតនេះបានចាស 🥰✨👕`;
      case 'LIVE_INVITE':
        return `ជម្រាបសួរអូន ${cleanName} ចាស! យប់នេះផេកយើងខ្ញុំមាន Live ម៉ូតអាវយឺតថ្មីៗ (T-Shirt Collection) ទើបមកដល់ស្អាតៗខ្លាំង សាច់ក្រណាត់កប្បាសត្រជាក់ស្រួលពាក់ និងមានប្រូម៉ូសិនពិសេសសម្រាប់ម៉ូយចាស់ផងដែរ។ កុំភ្លេចចូលទស្សនានៅម៉ោង 8:00 យប់នេះណាអូន! 🥰✨👕`;
      case 'VIP_PROMO':
        return `ជម្រាបសួរអូន ${cleanName} ចាស! ក្នុងនាមជាម៉ូយ VIP របស់ផេកយើងខ្ញុំ ហាងសូមជូនកាដូ Free សេវាដឹកជញ្ជូន សម្រាប់ការកាត់អាវយឺតក្នុង Live យប់នេះណាអូន! 💖🎁👕`;
      case 'NEW_ARRIVAL':
        return `ជម្រាបសួរអូន ${cleanName}! ម៉ូតអាវយឺតថ្មីៗដែលអូនធ្លាប់ស្រឡាញ់ (Size S, M, L, XL, Oversize) ឥឡូវចូលស្តុកគ្រប់ពណ៌គ្រប់ Size ហើយណាអូន។ បើអូនចាប់អារម្មណ៍អាចឆាតមកចែបានចាស! 👕🛍️`;
      case 'BULK_DISCOUNT':
        return `ជម្រាបសួរអូន ${cleanName}! ហាងយើងខ្ញុំមានប្រូម៉ូសិនពិសេសសម្រាប់ម៉ូយចាស់ ៖ ទិញអាវយឺតចាប់ពី 3 អាវឡើងទៅ ថែមជូនកាដូពិសេស + Free សេវាដឹកជញ្ជូនណាអូន! 🥰🎁✨`;
      case 'CARE':
      default:
        return `ជម្រាបសួរអូន ${cleanName} ចាស! ខានឃើញអូនចូលទិញអាវយឺតក្នុង Live យូរហើយ សុខសប្បាយជាទេអូន? ហាងយើងខ្ញុំនឹកម៉ូយចាស់ណាស់! បើអូនចង់បានអាវយឺតម៉ូតថ្មីៗ អាចឆាតប្រាប់ចែបានណាអូន! 🌸💖👕`;
    }
  };

  // Copy Remarketing Message & Mark as Remarketed
  const handleCopyMessage = async (cust: CustomerCRMRecord) => {
    const msg = getRemarketingMessage(cust.facebook_name, activeTemplate);
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(msg);
      } else {
        const ta = document.createElement('textarea');
        ta.value = msg;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedId(cust.customer_id);
      setTimeout(() => setCopiedId(null), 2500);

      // Optimistically record remarket timestamp in state
      const nowIso = new Date().toISOString();
      setCustomers(prev =>
        prev.map(c => c.customer_id === cust.customer_id ? { ...c, last_remarketed_at: nowIso } : c)
      );

      onShowToast(`✅ បានចម្លងសារសម្រាប់ ${cust.facebook_name} រួចរាល់! អាច Paste ក្នុងឆាតបានភ្លាម`, 'success');

      // Log remarket event to backend
      fetch(`/api/crm/customers/${cust.customer_id}/log_remarket`, { method: 'POST' }).catch(() => {});
    } catch {
      onShowToast('❌ មិនអាច Copy សារបាន', 'error');
    }
  };

  // 1. Open Direct Chat (< 24h window) & Copy Message
  const handleOpenDirectChat = async (cust: CustomerCRMRecord) => {
    await handleCopyMessage(cust);

    if (cust.facebook_user_id && cust.facebook_user_id !== 'FB_USER_ID_STREAM') {
      try {
        const res = await fetch(`/api/fb/inbox_link/${cust.facebook_user_id}`);
        const data = await res.json();
        if (data.success && data.url) {
          window.open(data.url, '_blank');
          return;
        }
      } catch {}
      window.open(`https://m.me/${cust.facebook_user_id}`, '_blank');
    } else {
      window.open(`https://business.facebook.com/latest/inbox/all?search_query=${encodeURIComponent(cust.facebook_name)}`, '_blank');
    }
  };

  // 2. Expired > 24h window: Copy Customer Name & Open Meta Business Suite Inbox Search
  const handleCopyNameAndOpenMetaSuite = async (cust: CustomerCRMRecord) => {
    const cleanName = cust.facebook_name || '';
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(cleanName);
      } else {
        const ta = document.createElement('textarea');
        ta.value = cleanName;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }

      setCopiedNameId(cust.customer_id);
      setTimeout(() => setCopiedNameId(null), 3500);

      // Optimistically record remarket timestamp in state
      const nowIso = new Date().toISOString();
      setCustomers(prev =>
        prev.map(c => c.customer_id === cust.customer_id ? { ...c, last_remarketed_at: nowIso } : c)
      );

      onShowToast(`📋 បានចម្លងឈ្មោះ "${cleanName}" រួចរាល់! កំពុងបើក Meta Business Suite ដើម្បី Paste Search ក្នុង Inbox...`, 'success');

      // Log remarket event to backend
      fetch(`/api/crm/customers/${cust.customer_id}/log_remarket`, { method: 'POST' }).catch(() => {});

      // Open Meta Business Suite Search directly
      try {
        const res = await fetch(`/api/fb/inbox_link/${cust.facebook_user_id || '0'}?name=${encodeURIComponent(cleanName)}&search=1`);
        const data = await res.json();
        if (data.success && data.url) {
          window.open(data.url, '_blank');
          return;
        }
      } catch {}

      window.open(`https://business.facebook.com/latest/inbox/all?search_query=${encodeURIComponent(cleanName)}`, '_blank');
    } catch {
      onShowToast('❌ មិនអាច Copy ឈ្មោះបាន', 'error');
    }
  };

  // 3. Send Meta Official Private Reply using Comment ID from Live
  const handleSendPrivateReply = async (cust: CustomerCRMRecord, overrideCommentId?: string) => {
    const targetCid = overrideCommentId || selectedCommentMap[cust.customer_id] || cust.last_comment_id || (cust.comment_ids && cust.comment_ids[0]);
    if (!targetCid) {
      onShowToast('⚠️ មិនមាន Comment ID សម្រាប់អតិថិជននេះទេ!', 'error');
      return;
    }

    setSendingPrivateReplyId(cust.customer_id);
    const msgText = getRemarketingMessage(cust.facebook_name, activeTemplate === 'PRIVATE_REPLY' ? 'PRIVATE_REPLY' : activeTemplate);

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(msgText).catch(() => {});
      }

      const res = await fetch(`/api/crm/customers/${cust.customer_id}/send_private_reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment_id: targetCid,
          message: msgText,
          templateType: activeTemplate
        })
      });
      const data = await res.json();

      const nowIso = new Date().toISOString();
      setCustomers(prev =>
        prev.map(c => c.customer_id === cust.customer_id ? { ...c, last_remarketed_at: nowIso } : c)
      );

      if (data.success) {
        onShowToast(`🎉 បានផ្ញើ Private Reply តាមខមិន #${targetCid} របស់ ${cust.facebook_name} ដោយជោគជ័យ!`, 'success');
      } else {
        onShowToast(`📋 ${data.detail || data.error || 'បានចម្លងសារ Private Reply រួចរាល់! អាច Paste ក្នុងឆាតបាន'}`, 'success');
      }
    } catch {
      onShowToast('⚠️ មិនអាចតភ្ជាប់ API — បានចម្លងសារ Private Reply រួចរាល់!', 'success');
    } finally {
      setSendingPrivateReplyId(null);
    }
  };

  // Backward compatible dispatcher for general Chat button
  const handleOpenChat = (cust: CustomerCRMRecord) => {
    if (cust.eligibility.status === 'SAFE_24H') {
      handleOpenDirectChat(cust);
    } else {
      handleCopyNameAndOpenMetaSuite(cust);
    }
  };

  // Open Edit Customer Modal
  const handleOpenEdit = (cust: CustomerCRMRecord) => {
    setEditingCust(cust);
    setEditPhone(cust.phone_number || '');
    setEditAddress(cust.address || '');
    setEditZone(cust.location_zone === 'PP' ? 'PP' : 'PROVINCE');
    setEditZoneLocked(Boolean(cust.is_zone_locked));
    setEditIsVip(Boolean(cust.is_vip));
    setEditIsBlacklist(Boolean(cust.is_blacklist));
    setEditNotes(cust.notes || '');
    setEditTags(cust.tags || []);
  };

  // Toggle Tag in Edit
  const handleToggleTag = (tag: string) => {
    setEditTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // Save Customer Changes
  const handleSaveCustomer = async () => {
    if (!editingCust) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/crm/customers/${editingCust.customer_id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: editPhone,
          address: editAddress,
          location_zone: editZone,
          is_zone_locked: editZoneLocked,
          is_vip: editIsVip,
          is_blacklist: editIsBlacklist,
          notes: editNotes,
          tags: editTags
        })
      });
      const data = await res.json();
      if (data.success && data.customer) {
        setCustomers(prev =>
          prev.map(c => c.customer_id === editingCust.customer_id ? data.customer : c)
        );
        onShowToast(`✅ បានកែប្រែព័ត៌មាន ${editingCust.facebook_name} ជោគជ័យ!`, 'success');
        setEditingCust(null);
        if (onCustomerUpdated) onCustomerUpdated();
      } else {
        onShowToast('❌ មិនអាចរក្សាទុកបាន', 'error');
      }
    } catch {
      onShowToast('⚠️ កំហុសបណ្តាញ Network', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    let result = [...customers];

    // Filter by tab
    if (activeTab === 'SAFE_24H') {
      result = result.filter(c => c.eligibility.status === 'SAFE_24H');
    } else if (activeTab === 'HAS_COMMENT') {
      result = result.filter(c => Boolean(c.last_comment_id || (c.comment_ids && c.comment_ids.length > 0)));
    } else if (activeTab === 'VIP') {
      result = result.filter(c => c.vip_tier === 'DIAMOND' || c.vip_tier === 'GOLD' || c.is_vip);
    } else if (activeTab === 'INACTIVE') {
      result = result.filter(c => c.days_since_last_order !== undefined && c.days_since_last_order > 14);
    } else if (activeTab === 'PP') {
      result = result.filter(c => c.location_zone === 'PP');
    } else if (activeTab === 'PROVINCE') {
      result = result.filter(c => c.location_zone !== 'PP');
    } else if (activeTab === 'BLACKLIST') {
      result = result.filter(c => c.is_blacklist);
    }

    // Filter by broadcast status (all / unsent / sent)
    if (broadcastFilter === 'UNSENT') {
      result = result.filter(c => !c.last_remarketed_at);
    } else if (broadcastFilter === 'SENT') {
      result = result.filter(c => Boolean(c.last_remarketed_at));
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(c =>
        c.facebook_name.toLowerCase().includes(q) ||
        (c.phone_number && c.phone_number.includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q)) ||
        (c.notes && c.notes.toLowerCase().includes(q)) ||
        (c.tags && c.tags.some(t => t.toLowerCase().includes(q)))
      );
    }

    return result;
  }, [customers, activeTab, broadcastFilter, searchQuery]);

  // Statistics for currently filtered subset
  const safeCount = useMemo(() => customers.filter(c => c.eligibility.status === 'SAFE_24H').length, [customers]);
  const safeSentCount = useMemo(() => customers.filter(c => c.eligibility.status === 'SAFE_24H' && c.last_remarketed_at).length, [customers]);
  const hasCommentCount = useMemo(() => customers.filter(c => Boolean(c.last_comment_id || (c.comment_ids && c.comment_ids.length > 0))).length, [customers]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100000] bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] sm:max-w-2xl bg-[#070D1B] border border-cyan-500/40 rounded-3xl shadow-[0_15px_50px_rgba(0,0,0,0.8)] flex flex-col max-h-[92vh] overflow-hidden text-slate-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-800 bg-gradient-to-r from-[#0B1E3D] via-[#0E2A54] to-[#0A1830] flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-2xl bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-lg shadow-sm flex-shrink-0">
              👥
            </span>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black text-white truncate">
                  គ្រប់គ្រងអតិថិជន & Remarketing
                </h2>
                <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full">
                  CRM អាវយឺត
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-300 truncate">
                តាមដានម៉ូយ VIP · សិទ្ធិឆាត 24h · ផ្ញើសារ Manual Broadcast តាមលំដាប់
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer flex-shrink-0"
            title="បិទ"
          >
            ✕
          </button>
        </div>

        {/* Top Metric Cards */}
        <div className="grid grid-cols-5 gap-1 sm:gap-1.5 p-2 bg-[#040813] border-b border-slate-800/80 flex-shrink-0 text-center">
          <div className="p-1 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col items-center">
            <span className="text-[9.5px] text-slate-400 font-bold">ម៉ូយសរុប</span>
            <span className="text-sm font-black text-cyan-300 font-mono">{stats.total_customers}</span>
          </div>
          <div className="p-1 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex flex-col items-center">
            <span className="text-[9.5px] text-emerald-400 font-bold truncate">🟢 ឆាត (24h)</span>
            <span className="text-sm font-black text-emerald-300 font-mono">{stats.safe_24h_count}</span>
          </div>
          <div className="p-1 rounded-xl bg-teal-950/40 border border-teal-500/40 flex flex-col items-center">
            <span className="text-[9.5px] text-teal-300 font-bold truncate">💬 មានខមិន</span>
            <span className="text-sm font-black text-teal-300 font-mono">{hasCommentCount}</span>
          </div>
          <div className="p-1 rounded-xl bg-amber-950/40 border border-amber-500/40 flex flex-col items-center">
            <span className="text-[9.5px] text-amber-400 font-bold truncate">👑 ម៉ូយ VIP</span>
            <span className="text-sm font-black text-amber-300 font-mono">{stats.vip_count}</span>
          </div>
          <div className="p-1 rounded-xl bg-purple-950/40 border border-purple-500/40 flex flex-col items-center">
            <span className="text-[9.5px] text-purple-300 font-bold truncate">💤 បាត់មុខ</span>
            <span className="text-sm font-black text-purple-200 font-mono">{stats.inactive_count}</span>
          </div>
        </div>

        {/* Template Selector Bar for T-shirt Shop */}
        <div className="p-2.5 bg-[#050C1B] border-b border-slate-800/80 flex flex-col gap-1.5 flex-shrink-0">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
            <span className="flex items-center gap-1">
              <span>👕</span>
              <span>គំរូសារ Remarketing (អាវយឺត) ៖</span>
            </span>
            <span className="text-[10px] text-cyan-400 font-normal">ចុច [📋 Copy] វានឹងដាក់ឈ្មោះភ្ញៀវស្វ័យប្រវត្តិ</span>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-xs">
            <button
              type="button"
              onClick={() => setActiveTemplate('PRIVATE_REPLY')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                activeTemplate === 'PRIVATE_REPLY'
                  ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-sm border border-teal-400/50'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <span>💬</span>
              <span>Private Reply (តាមខមិន)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTemplate('LIVE_INVITE')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                activeTemplate === 'LIVE_INVITE'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-sm border border-cyan-400/50'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <span>📢</span>
              <span>អញ្ជើញមើល Live</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTemplate('VIP_PROMO')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                activeTemplate === 'VIP_PROMO'
                  ? 'bg-gradient-to-r from-amber-600 to-yellow-600 text-white shadow-sm border border-amber-400/50'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <span>🎁</span>
              <span>VIP Free Ship</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTemplate('NEW_ARRIVAL')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                activeTemplate === 'NEW_ARRIVAL'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-sm border border-purple-400/50'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <span>👕</span>
              <span>អាវយឺតម៉ូតថ្មី</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTemplate('BULK_DISCOUNT')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                activeTemplate === 'BULK_DISCOUNT'
                  ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-sm border border-teal-400/50'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <span>⚡</span>
              <span>ទិញច្រើនចុះច្រើន</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTemplate('CARE')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                activeTemplate === 'CARE'
                  ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-sm border border-rose-400/50'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <span>💖</span>
              <span>សួរសុខទុក្ខ</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-2.5 bg-[#060D1E] border-b border-slate-800 flex flex-col gap-2 flex-shrink-0">
          {/* Search Box */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              type="text"
              placeholder="ស្វែងរកឈ្មោះ, លេខទូរស័ព្ទ, អាសយដ្ឋាន, សម្គាល់, Size..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#030712] border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar text-xs">
            <button
              type="button"
              onClick={() => startTransition(() => setActiveTab('ALL'))}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] whitespace-nowrap cursor-pointer transition-all ${
                activeTab === 'ALL'
                  ? 'bg-cyan-500 text-slate-950 font-black shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              ទាំងអស់ ({customers.length})
            </button>

            <button
              type="button"
              onClick={() => startTransition(() => setActiveTab('SAFE_24H'))}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] whitespace-nowrap cursor-pointer transition-all flex items-center gap-1 ${
                activeTab === 'SAFE_24H'
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                  : 'bg-emerald-950/40 text-emerald-300 hover:bg-emerald-950/60 border border-emerald-500/30'
              }`}
            >
              <span>🟢 អាចឆាតបាន (&lt;24h)</span>
              <span className="font-mono">({stats.safe_24h_count})</span>
            </button>

            <button
              type="button"
              onClick={() => startTransition(() => setActiveTab('HAS_COMMENT'))}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] whitespace-nowrap cursor-pointer transition-all flex items-center gap-1 ${
                activeTab === 'HAS_COMMENT'
                  ? 'bg-teal-500 text-slate-950 font-black shadow-md'
                  : 'bg-teal-950/40 text-teal-300 hover:bg-teal-950/60 border border-teal-500/30'
              }`}
            >
              <span>💬 មាន Comment Live</span>
              <span className="font-mono">({hasCommentCount})</span>
            </button>

            <button
              type="button"
              onClick={() => startTransition(() => setActiveTab('VIP'))}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] whitespace-nowrap cursor-pointer transition-all flex items-center gap-1 ${
                activeTab === 'VIP'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'bg-amber-950/40 text-amber-300 hover:bg-amber-950/60 border border-amber-500/30'
              }`}
            >
              <span>👑 VIP</span>
              <span className="font-mono">({stats.vip_count})</span>
            </button>

            <button
              type="button"
              onClick={() => startTransition(() => setActiveTab('INACTIVE'))}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] whitespace-nowrap cursor-pointer transition-all flex items-center gap-1 ${
                activeTab === 'INACTIVE'
                  ? 'bg-purple-500 text-slate-950 font-black shadow-md'
                  : 'bg-purple-950/40 text-purple-300 hover:bg-purple-950/60 border border-purple-500/30'
              }`}
            >
              <span>💤 បាត់មុខ</span>
              <span className="font-mono">({stats.inactive_count})</span>
            </button>

            <button
              type="button"
              onClick={() => startTransition(() => setActiveTab('PP'))}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] whitespace-nowrap cursor-pointer transition-all ${
                activeTab === 'PP'
                  ? 'bg-cyan-500 text-slate-950 font-black shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              🏙️ ភ្នំពេញ
            </button>

            <button
              type="button"
              onClick={() => startTransition(() => setActiveTab('PROVINCE'))}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] whitespace-nowrap cursor-pointer transition-all ${
                activeTab === 'PROVINCE'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              🏕️ ខេត្ត
            </button>

            <button
              type="button"
              onClick={() => startTransition(() => setActiveTab('BLACKLIST'))}
              className={`px-2 py-1 rounded-lg font-bold text-[11px] whitespace-nowrap cursor-pointer transition-all ${
                activeTab === 'BLACKLIST'
                  ? 'bg-rose-500 text-white font-black shadow-md'
                  : 'bg-rose-950/40 text-rose-300 hover:bg-rose-950/60 border border-rose-500/30'
              }`}
            >
              ⚠️ Blacklist
            </button>
          </div>

          {/* Sub-Row: Broadcast Status Filter & Queue Helper */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-bold">ស្ថានភាពផ្ញើសារ ៖</span>
              <div className="flex items-center bg-[#030712] rounded-lg p-0.5 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setBroadcastFilter('ALL')}
                  className={`px-2 py-0.5 rounded-md font-bold text-[10px] cursor-pointer transition-all ${
                    broadcastFilter === 'ALL'
                      ? 'bg-slate-700 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ទាំងអស់
                </button>
                <button
                  type="button"
                  onClick={() => setBroadcastFilter('UNSENT')}
                  className={`px-2 py-0.5 rounded-md font-bold text-[10px] cursor-pointer transition-all flex items-center gap-1 ${
                    broadcastFilter === 'UNSENT'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-amber-400/80 hover:text-amber-300'
                  }`}
                >
                  <span>⏳ មិនទាន់ផ្ញើ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBroadcastFilter('SENT')}
                  className={`px-2 py-0.5 rounded-md font-bold text-[10px] cursor-pointer transition-all flex items-center gap-1 ${
                    broadcastFilter === 'SENT'
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-emerald-400/80 hover:text-emerald-300'
                  }`}
                >
                  <span>✅ បានផ្ញើរួច</span>
                </button>
              </div>
            </div>

            {/* Quick Helper for Staff */}
            {activeTab === 'SAFE_24H' && safeCount > 0 && (
              <span className="text-[10.5px] text-emerald-400 font-mono font-bold">
                វឌ្ឍនភាព ៖ {safeSentCount}/{safeCount} នាក់ ({Math.round((safeSentCount / safeCount) * 100)}%)
              </span>
            )}
          </div>
        </div>

        {/* Customer List Container */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 flex flex-col gap-2.5">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400">
              <span className="text-2xl animate-spin">⏳</span>
              <span className="text-xs font-bold">កំពុងទាញទិន្នន័យ CRM...</span>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400">
              <span className="text-3xl">👥</span>
              <span className="text-xs font-bold">រកមិនឃើញអតិថិជនត្រូវនឹងលក្ខខណ្ឌឡើយ</span>
            </div>
          ) : (
            filteredCustomers.map(cust => {
              const isEligible = cust.eligibility.status === 'SAFE_24H';
              const isRecent = cust.eligibility.status === 'RECENT_7D';

              return (
                <div
                  key={cust.customer_id}
                  className={`bg-[#050C1B] rounded-2xl p-3 border transition-all flex flex-col gap-2 shadow-sm ${
                    cust.is_blacklist
                      ? 'border-rose-600/60 bg-rose-950/15'
                      : cust.vip_tier === 'DIAMOND'
                      ? 'border-purple-500/50 bg-gradient-to-r from-purple-950/20 to-slate-900/60'
                      : cust.vip_tier === 'GOLD'
                      ? 'border-amber-500/50 bg-gradient-to-r from-amber-950/20 to-slate-900/60'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Customer Top Bar: Name, Tiers, Eligibility Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        {cust.picture_url ? (
                          <img
                            src={cust.picture_url}
                            alt={cust.facebook_name}
                            className="w-10 h-10 rounded-full object-cover border border-cyan-400/50 shadow-sm"
                            onError={e => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-cyan-950/80 border border-cyan-400/40 flex items-center justify-center text-sm font-black text-cyan-300 shadow-sm">
                            {cust.facebook_name.slice(0, 1) || '👤'}
                          </div>
                        )}
                        {cust.vip_tier === 'DIAMOND' && (
                          <span className="absolute -top-1 -right-1 text-xs" title="Diamond VIP">
                            💎
                          </span>
                        )}
                        {cust.vip_tier === 'GOLD' && (
                          <span className="absolute -top-1 -right-1 text-xs" title="Gold VIP">
                            👑
                          </span>
                        )}
                      </div>

                      {/* Name & Tiers */}
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-xs sm:text-sm text-white truncate max-w-[150px] sm:max-w-[200px]">
                            {cust.facebook_name}
                          </span>

                          {/* VIP Tier Badge */}
                          {cust.vip_tier === 'DIAMOND' && (
                            <span className="bg-purple-950/90 text-purple-300 border border-purple-400/60 text-[9.5px] font-black px-1.5 py-0.2 rounded-md">
                              💎 Diamond
                            </span>
                          )}
                          {cust.vip_tier === 'GOLD' && (
                            <span className="bg-amber-950/90 text-amber-300 border border-amber-400/60 text-[9.5px] font-black px-1.5 py-0.2 rounded-md">
                              👑 Gold VIP
                            </span>
                          )}
                          {cust.vip_tier === 'SILVER' && (
                            <span className="bg-blue-950/90 text-blue-300 border border-blue-400/50 text-[9.5px] font-black px-1.5 py-0.2 rounded-md">
                              🥈 Regular
                            </span>
                          )}
                          {cust.vip_tier === 'INACTIVE' && (
                            <span className="bg-purple-950/80 text-purple-300 border border-purple-500/40 text-[9.5px] font-bold px-1.5 py-0.2 rounded-md">
                              💤 បាត់មុខ
                            </span>
                          )}
                          {cust.is_blacklist && (
                            <span className="bg-rose-950/90 text-rose-300 border border-rose-500 text-[9.5px] font-black px-1.5 py-0.2 rounded-md">
                              ⚠️ Blacklist
                            </span>
                          )}
                        </div>

                        {/* Order Stats */}
                        <div className="flex items-center gap-2 text-[10.5px] text-slate-400 font-medium">
                          <span>📦 <strong className="text-cyan-300 font-mono">{cust.total_orders}</strong> កន្ត្រក</span>
                          <span>‧</span>
                          <span>💰 <strong className="text-emerald-300 font-mono">${cust.total_spent.toFixed(2)}</strong></span>
                          {cust.days_since_last_order !== undefined && (
                            <>
                              <span>‧</span>
                              <span className="text-slate-400">
                                {cust.days_since_last_order === 0 ? 'ទើបទិញថ្ងៃនេះ' : `${cust.days_since_last_order} ថ្ងៃមុន`}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Eligibility Badge (KEY USER REQUIREMENT) */}
                    <div className="flex flex-col items-end flex-shrink-0">
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm whitespace-nowrap ${
                          isEligible
                            ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-400/70'
                            : isRecent
                            ? 'bg-amber-950/90 text-amber-300 border border-amber-400/60'
                            : 'bg-slate-900 text-slate-400 border border-slate-700'
                        }`}
                        title={cust.eligibility.description}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          isEligible ? 'bg-emerald-400 animate-pulse' : isRecent ? 'bg-amber-400' : 'bg-slate-500'
                        }`} />
                        <span>{cust.eligibility.label}</span>
                      </span>

                      {/* Location Badge */}
                      <span className="text-[10px] text-slate-400 pt-0.5">
                        {cust.location_zone === 'PP' ? '🏙️ ភ្នំពេញ' : '🏞️ តាមខេត្ត'}
                      </span>

                      {/* Remarket Status Badge */}
                      {cust.last_remarketed_at ? (
                        <span className="text-[9.5px] text-emerald-400 font-bold flex items-center gap-0.5 mt-0.5 bg-emerald-950/80 border border-emerald-500/50 px-1.5 py-0.2 rounded shadow-sm">
                          <span>✓</span>
                          <span>ផ្ញើរួច ({formatRemarketTime(cust.last_remarketed_at)})</span>
                        </span>
                      ) : (
                        <span className="text-[9.5px] text-slate-400 font-medium mt-0.5 bg-slate-900/90 border border-slate-800 px-1.5 py-0.2 rounded">
                          ⏳ មិនទាន់ផ្ញើ
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Contact Info (Phone & Address) */}
                  <div className="bg-[#030712]/90 rounded-xl p-2 border border-slate-800/80 text-[11px] flex flex-col gap-1">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-1">
                        <span>📞</span>
                        <strong className="text-cyan-300 font-mono">
                          {cust.phone_number || 'មិនទាន់មានលេខ'}
                        </strong>
                      </span>
                      {cust.is_zone_locked && (
                        <span className="text-[9.5px] bg-cyan-950 text-cyan-300 border border-cyan-500/40 px-1 py-0.2 rounded font-bold">
                          🔒 ចាក់សោរទីតាំង
                        </span>
                      )}
                    </div>
                    {cust.address && (
                      <div className="text-slate-400 truncate flex items-center gap-1">
                        <span>📍</span>
                        <span className="truncate">{cust.address}</span>
                      </div>
                    )}
                  </div>

                  {/* Notes / Tags if any */}
                  {(cust.notes || (cust.tags && cust.tags.length > 0)) && (
                    <div className="flex items-center gap-1.5 flex-wrap text-[10.5px]">
                      {cust.notes && (
                        <span className="bg-slate-800/90 text-amber-200 border border-amber-500/30 px-2 py-0.5 rounded-md font-medium truncate max-w-full">
                          📝 {cust.notes}
                        </span>
                      )}
                      {cust.tags?.map((t, idx) => (
                        <span key={idx} className="bg-cyan-950/80 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.2 rounded text-[10px] font-bold">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Live Comment Context & Private Reply Action if available */}
                  {(cust.last_comment_id || (cust.comment_ids && cust.comment_ids.length > 0)) && (
                    <div className="bg-gradient-to-r from-teal-950/60 to-slate-900/80 border border-teal-500/40 rounded-xl p-2.5 text-[11px] flex flex-col gap-1.5 shadow-sm">
                      <div className="flex items-center justify-between gap-1.5 flex-wrap">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-teal-400 font-bold flex items-center gap-1">
                            <span>💬</span>
                            <span>Comment ក្នុង Live ៖</span>
                          </span>
                          {cust.comment_ids && cust.comment_ids.length > 1 ? (
                            <select
                              value={selectedCommentMap[cust.customer_id] || cust.last_comment_id || cust.comment_ids[0]}
                              onChange={e => {
                                const val = e.target.value;
                                setSelectedCommentMap(prev => ({ ...prev, [cust.customer_id]: val }));
                              }}
                              className="bg-slate-950 border border-teal-400/50 rounded-lg px-2 py-0.5 text-[10px] text-teal-300 font-mono outline-none cursor-pointer"
                              title="ជ្រើសរើស Comment ID ដើម្បីផ្ញើ Private Reply"
                            >
                              {cust.comment_ids.map((cid, cIdx) => (
                                <option key={cIdx} value={cid}>
                                  #{cid} {cIdx === 0 ? '(ចុងក្រោយ)' : ''}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <strong className="text-cyan-300 font-mono text-[10.5px] bg-slate-950 px-1.5 py-0.2 rounded border border-teal-500/30">
                              #{cust.last_comment_id || cust.comment_ids?.[0]}
                            </strong>
                          )}
                          <span className="text-[9px] bg-teal-900/60 text-teal-300 border border-teal-500/30 px-1.5 py-0.2 rounded-full font-bold">
                            Meta 7D Window
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSendPrivateReply(cust)}
                          disabled={sendingPrivateReplyId === cust.customer_id}
                          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white px-2.5 py-1 rounded-xl text-[10.5px] font-black flex items-center gap-1 shadow-sm cursor-pointer active:scale-95 transition-all"
                          title="ផ្ញើ Private Reply ទៅកាន់ខមិននេះតាមរយៈ Meta Graph API ដោយស្វ័យប្រវត្តិ"
                        >
                          <span>{sendingPrivateReplyId === cust.customer_id ? '⏳' : '⚡'}</span>
                          <span>{sendingPrivateReplyId === cust.customer_id ? 'កំពុងផ្ញើ...' : 'ផ្ញើ Private Reply (API)'}</span>
                        </button>
                      </div>

                      {cust.recent_live_comments?.[0]?.comment_text && (
                        <div className="text-slate-300 text-[10.5px] bg-slate-950/80 rounded-lg px-2 py-1 border border-slate-800 italic flex items-center justify-between gap-1">
                          <span className="truncate">"{cust.recent_live_comments[0].comment_text}"</span>
                          {cust.recent_live_comments[0].created_time && (
                            <span className="text-[9px] text-slate-400 font-mono flex-shrink-0">
                              {new Date(cust.recent_live_comments[0].created_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons Row */}
                  <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-slate-800/80">
                    {/* Button 1: Copy Message */}
                    <button
                      type="button"
                      onClick={() => handleCopyMessage(cust)}
                      className={`py-1.5 px-1.5 rounded-xl text-xs font-black flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition-all shadow-sm ${
                        copiedId === cust.customer_id
                          ? 'bg-emerald-600 text-white'
                          : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border border-cyan-400/40'
                      }`}
                      title={activeTemplate === 'PRIVATE_REPLY' ? 'ចម្លងសារ Private Reply' : 'ចម្លងសារ Remarketing សម្រាប់ភ្ញៀវនេះ'}
                    >
                      <span>{copiedId === cust.customer_id ? '✓' : '📋'}</span>
                      <span className="text-[10.5px] whitespace-nowrap">
                        {copiedId === cust.customer_id
                          ? 'បានចម្លង'
                          : activeTemplate === 'PRIVATE_REPLY'
                          ? 'Copy Private'
                          : 'Copy សារ'}
                      </span>
                    </button>

                    {/* Button 2: Direct Chat (<24h) OR Copy Name & Open Meta Suite (>24h) */}
                    {cust.eligibility.status === 'SAFE_24H' ? (
                      <button
                        type="button"
                        onClick={() => handleOpenDirectChat(cust)}
                        className="py-1.5 px-1.5 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-400/50 flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition-all shadow-sm"
                        title="អតិថិជនស្ថិតក្នុងគម្លាត ២៤ ម៉ោង — បើកប្រអប់ឆាត Direct ភ្លាមៗ (បាន Copy សារ)"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        <span className="text-[10px] sm:text-[10.5px] whitespace-nowrap font-bold">
                          ឆាត Direct 24h
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleCopyNameAndOpenMetaSuite(cust)}
                        className={`py-1.5 px-1 rounded-xl text-xs font-black flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition-all shadow-sm ${
                          copiedNameId === cust.customer_id
                            ? 'bg-emerald-600 text-white border border-emerald-400'
                            : 'bg-gradient-to-r from-amber-600 via-orange-600 to-indigo-700 hover:from-amber-500 hover:to-indigo-600 text-white border border-amber-400/60'
                        }`}
                        title="ហួស ២៤ ម៉ោង — ចុចដើម្បីចម្លងឈ្មោះ និងបើក Meta Business Suite ស្វែងរកក្នុង Inbox"
                      >
                        <span>{copiedNameId === cust.customer_id ? '✓' : '📋'}</span>
                        <span className="text-[9.5px] sm:text-[10px] whitespace-nowrap font-bold">
                          {copiedNameId === cust.customer_id ? 'បានចម្លងឈ្មោះ' : 'ចម្លងឈ្មោះ & Meta'}
                        </span>
                      </button>
                    )}

                    {/* Button 3: Telegram or Call */}
                    {cust.phone_number && cust.phone_number !== 'គ្មានលេខ' ? (
                      <a
                        href={`tel:${cust.phone_number.replace(/\s+/g, '')}`}
                        className="py-1.5 px-1.5 rounded-xl text-xs font-black bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-300 flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition-all text-center"
                        title="ខលទៅកាន់លេខទូរស័ព្ទ"
                      >
                        <span>📞</span>
                        <span className="text-[10.5px] whitespace-nowrap">ខល</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="py-1.5 px-1.5 rounded-xl text-xs font-bold bg-slate-900 text-slate-600 border border-slate-800 flex items-center justify-center gap-1 cursor-not-allowed opacity-60"
                      >
                        <span>📞</span>
                        <span className="text-[10.5px]">គ្មានលេខ</span>
                      </button>
                    )}

                    {/* Button 4: Edit Details */}
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(cust)}
                      className="py-1.5 px-1.5 rounded-xl text-xs font-black bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition-all shadow-sm"
                      title="កែប្រែព័ត៌មាន និងចំណាំ"
                    >
                      <span>✏️</span>
                      <span className="text-[10.5px] whitespace-nowrap">Note</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-800 bg-[#040813] flex items-center justify-between text-xs text-slate-400 flex-shrink-0">
          <span>បង្ហាញ <strong>{filteredCustomers.length}</strong> / {customers.length} នាក់</span>
          <button
            type="button"
            onClick={fetchCRMData}
            className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Sub-Modal: Edit Customer Info & Staff Notes                     */}
      {/* ------------------------------------------------------------- */}
      {editingCust && (
        <div
          className="fixed inset-0 z-[100010] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3"
          onClick={() => setEditingCust(null)}
        >
          <div
            className="w-full max-w-md bg-[#09152B] border border-cyan-500/50 rounded-2xl shadow-2xl p-4 flex flex-col gap-3 text-slate-100 animate-scaleUp"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">✏️</span>
                <div className="flex flex-col">
                  <h3 className="font-black text-sm text-white">
                    កែប្រែព័ត៌មាន {editingCust.facebook_name}
                  </h3>
                  <span className="text-[10px] text-cyan-400 font-mono">
                    ID: #{editingCust.customer_id}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingCust(null)}
                className="w-7 h-7 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Inputs Form */}
            <div className="flex flex-col gap-2.5 max-h-[65vh] overflow-y-auto pr-1">
              {/* Phone */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-300">
                  📞 លេខទូរស័ព្ទ ៖
                </label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  placeholder="012 345 678"
                  className="bg-[#030712] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono outline-none focus:border-cyan-400"
                />
              </div>

              {/* Address */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-300">
                  📍 អាសយដ្ឋាន / សាខាផ្ញើ ៖
                </label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={e => setEditAddress(e.target.value)}
                  placeholder="ផ្ទះលេខ... ផ្លូវ... ឬឈ្មោះសាខាឡាន"
                  className="bg-[#030712] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400"
                />
              </div>

              {/* Location Zone Switcher */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-300">
                  🌐 តំបន់ដឹកជញ្ជូន (Location Zone) ៖
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditZone('PP')}
                    className={`py-1.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-all ${
                      editZone === 'PP'
                        ? 'bg-emerald-600 text-white border border-emerald-400 shadow-md'
                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                    }`}
                  >
                    <span>🏙️ ភ្នំពេញ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditZone('PROVINCE')}
                    className={`py-1.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-all ${
                      editZone === 'PROVINCE'
                        ? 'bg-amber-600 text-white border border-amber-400 shadow-md'
                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                    }`}
                  >
                    <span>🏕️ តាមខេត្ត</span>
                  </button>
                </div>
              </div>

              {/* Checkboxes: Lock Zone, VIP, Blacklist */}
              <div className="flex flex-col gap-2 pt-1 border-t border-slate-800/80">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-cyan-300">
                  <input
                    type="checkbox"
                    checked={editZoneLocked}
                    onChange={e => setEditZoneLocked(e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-500 focus:ring-0"
                  />
                  <span>🔒 ចាក់សោរទីតាំងនេះ (Live ក្រោយមិនឱ្យច្រឡំទៀត)</span>
                </label>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-300 p-2 rounded-xl bg-amber-950/30 border border-amber-500/30">
                    <input
                      type="checkbox"
                      checked={editIsVip}
                      onChange={e => setEditIsVip(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-500 focus:ring-0"
                    />
                    <span>⭐ ម៉ូយ VIP</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-rose-300 p-2 rounded-xl bg-rose-950/30 border border-rose-500/30">
                    <input
                      type="checkbox"
                      checked={editIsBlacklist}
                      onChange={e => setEditIsBlacklist(e.target.checked)}
                      className="w-4 h-4 rounded text-rose-500 focus:ring-0"
                    />
                    <span>⚠️ Blacklist</span>
                  </label>
                </div>
              </div>

              {/* Notes */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-300">
                  📝 ចំណាំរបស់បុគ្គលិក (Staff Notes) ៖
                </label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="ឧ. ចូលចិត្ត Size L, វេរលុយលឿន, ផ្ញើវីរៈប៊ុនថាំសាខាផ្សារលើ..."
                  className="bg-[#030712] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400 resize-none"
                />
              </div>

              {/* Tags Preset */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-slate-300">
                  🏷️ ស្លាកសម្គាល់ (Tags) ៖
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {PRESET_TAGS.map(tag => {
                    const selected = editTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleToggleTag(tag)}
                        className={`text-[10px] font-bold px-2 py-0.8 rounded-lg cursor-pointer transition-all border ${
                          selected
                            ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-black'
                            : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'
                        }`}
                      >
                        {tag} {selected ? '✓' : '+'}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingCust(null)}
                className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs hover:bg-slate-700 cursor-pointer"
              >
                បោះបង់
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveCustomer}
                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-black text-xs shadow-md border border-emerald-400/50 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isSaving ? 'កំពុងរក្សាទុក...' : 'រក្សាទុក (Save)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
