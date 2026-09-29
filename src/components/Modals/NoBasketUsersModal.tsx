import React, { useState, useEffect } from 'react';
import { playSuccessFanfare, playPureTone, playWarningBuzzer } from '../../utils/audio';
import { getLiveDisplayTitle } from '../../utils/liveUtils';

export interface NonBasketComment {
  id?: string;
  text: string;
  created_at: string;
}

export interface NonBasketUser {
  user_id: string;
  facebook_name: string;
  picture_url?: string;
  comment_count: number;
  last_comment_time: string;
  primary_reason: 'QUESTION_OR_INQUIRY' | 'PURE_PHONE_OR_LOCATION' | 'UNMATCHED_CODE' | 'OUT_OF_STOCK' | 'GENERAL_CHAT';
  reason_label: string;
  reason_color: string;
  detected_phone?: string;
  detected_location?: string;
  suggested_codes: string[];
  comments: NonBasketComment[];
}

interface ApiResponse {
  success: boolean;
  total_commenters_count: number;
  commenters_with_basket_count: number;
  commenters_without_basket_count: number;
  total_comments_count: number;
  active_live_id: string;
  categories: {
    inquiries_count: number;
    phone_only_count: number;
    unmatched_codes_count: number;
    out_of_stock_count: number;
    general_count: number;
  };
  users: NonBasketUser[];
}

interface NoBasketUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeLiveId: string;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
  onBasketCreated?: () => void;
}

export function NoBasketUsersModal({
  isOpen,
  onClose,
  activeLiveId,
  onShowToast,
  onBasketCreated
}: NoBasketUsersModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  // Quick Create Basket Form State
  const [creatingUser, setCreatingUser] = useState<NonBasketUser | null>(null);
  const [inputCode, setInputCode] = useState('');
  const [inputQty, setInputQty] = useState(1);
  const [inputPrice, setInputPrice] = useState<number | ''>('');
  const [inputPhone, setInputPhone] = useState('');
  const [inputAddress, setInputAddress] = useState('');
  const [submittingBasket, setSubmittingBasket] = useState(false);

  const fetchNonBasketUsers = async () => {
    setLoading(true);
    try {
      const liveParam = activeLiveId ? `?live_id=${encodeURIComponent(activeLiveId)}` : '';
      const res = await fetch(`/api/comments/non_basket_users${liveParam}`);
      const json: ApiResponse = await res.json();
      if (json.success) {
        setData(json);
      } else {
        onShowToast('មិនអាចទាញទិន្នន័យបានទេ', 'error');
      }
    } catch {
      onShowToast('Network error loading non-basket users', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNonBasketUsers();
    }
  }, [isOpen, activeLiveId]);

  if (!isOpen) return null;

  const toggleExpand = (userName: string) => {
    playPureTone(600, 0.04);
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userName)) {
        next.delete(userName);
      } else {
        next.add(userName);
      }
      return next;
    });
  };

  const handleOpenCreateBasket = (user: NonBasketUser) => {
    playPureTone(700, 0.05);
    setCreatingUser(user);
    setInputPhone(user.detected_phone || '');
    setInputAddress(user.detected_location || '');
    setInputCode(user.suggested_codes[0] || '');
    setInputQty(1);
    setInputPrice('');
  };

  const handleCreateBasket = async () => {
    if (!creatingUser) return;
    setSubmittingBasket(true);
    try {
      const items = inputCode.trim()
        ? [{
            product_code: inputCode.trim().toUpperCase(),
            quantity: Number(inputQty) || 1,
            price: inputPrice === '' ? undefined : Number(inputPrice)
          }]
        : [];

      const res = await fetch('/api/comments/create_basket_for_user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          live_id: activeLiveId,
          user_id: creatingUser.user_id,
          facebook_name: creatingUser.facebook_name,
          picture_url: creatingUser.picture_url,
          phone_number: inputPhone.trim() || undefined,
          address: inputAddress.trim() || undefined,
          items
        })
      });

      const resData = await res.json();
      if (resData.success) {
        playSuccessFanfare();
        onShowToast(resData.message || '🎉 បានបង្កើតកន្ត្រកជោគជ័យ!', 'success');
        setCreatingUser(null);
        fetchNonBasketUsers();
        if (onBasketCreated) onBasketCreated();
      } else {
        playWarningBuzzer();
        onShowToast(resData.error || 'មិនអាចបង្កើតកន្ត្រកបានទេ', 'error');
      }
    } catch {
      onShowToast('Error creating basket', 'error');
    } finally {
      setSubmittingBasket(false);
    }
  };

  const handleCopyUserInfo = (user: NonBasketUser) => {
    playPureTone(900, 0.05);
    const commentSummary = user.comments.map(c => `- ${c.text}`).join('\n');
    const textToCopy = `👤 អតិថិជន: ${user.facebook_name}\n📞 លេខទូរស័ព្ទ: ${user.detected_phone || 'គ្មានលេខ'}\n📍 អាសយដ្ឋាន: ${user.detected_location || 'មិនទាន់មាន'}\n💬 ខំមិនក្នុង Live:\n${commentSummary}`;
    navigator.clipboard.writeText(textToCopy);
    onShowToast(`📋 បានចម្លងព័ត៌មាន «${user.facebook_name}» រួចរាល់!`);
  };

  const formatTime = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('km-KH', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // Filter users based on category and search
  const filteredUsers = (data?.users || []).filter(u => {
    if (selectedCategory !== 'ALL' && u.primary_reason !== selectedCategory) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchName = u.facebook_name.toLowerCase().includes(q);
    const matchPhone = u.detected_phone && u.detected_phone.includes(q);
    const matchLocation = u.detected_location && u.detected_location.toLowerCase().includes(q);
    const matchComment = u.comments.some(c => c.text.toLowerCase().includes(q));
    return matchName || matchPhone || matchLocation || matchComment;
  });

  const liveTitle = getLiveDisplayTitle(activeLiveId);

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[999999] flex items-center justify-center p-2 sm:p-4 animate-fadeIn">
      <div className="bg-[#071328] border border-cyan-500/40 rounded-3xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden shadow-[0_25px_70px_rgba(0,0,0,0.85)]">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-[#071a3d] via-[#0b2759] to-[#081836] border-b border-cyan-500/30 flex justify-between items-center shadow-md">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-cyan-400 p-0.5 flex items-center justify-center shadow-lg shadow-amber-500/20 flex-shrink-0">
              <div className="w-full h-full bg-[#061226] rounded-[14px] flex items-center justify-center text-xl">
                👥
              </div>
            </div>
            <div className="min-w-0">
              <div className="font-black text-white text-base sm:text-lg tracking-tight flex items-center gap-2 truncate">
                <span>អ្នកខំមិនដែលគ្មានកន្ត្រក (Non-Basket Users)</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-950/90 text-cyan-300 border border-cyan-500/40 font-mono">
                  {liveTitle}
                </span>
              </div>
              <div className="text-[11.5px] text-cyan-300/90 font-medium">
                ត្រួតពិនិត្យអ្នកខំមិនទាំងអស់ដែលប្រព័ន្ធមិនបានបង្កើតកន្ត្រក (សួរនាំ, ផ្ញើតែលេខ, កូដខុស, ឬដាច់ស្តុក)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchNonBasketUsers}
              disabled={loading}
              className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-cyan-300 rounded-xl text-xs font-bold border border-cyan-500/30 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              title="ទាញយកទិន្នន័យឡើងវិញ"
            >
              <span className={loading ? 'animate-spin' : ''}>🔄</span>
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-rose-900/60 text-slate-300 hover:text-white font-black flex items-center justify-center transition-all border border-slate-700 active:scale-95"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Top Summary Stat Grid */}
        <div className="p-3 sm:p-4 bg-[#050e1f] border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Total Commenters */}
          <div className="bg-[#081836]/90 border border-slate-800 rounded-2xl p-2.5 flex flex-col items-center justify-center text-center shadow-sm">
            <span className="text-[11px] text-slate-400 font-bold flex items-center gap-1">
              <span>👥</span> អ្នកខំមិនសរុប
            </span>
            <span className="font-mono font-black text-white text-xl sm:text-2xl mt-0.5">
              {(data?.total_commenters_count || 0).toLocaleString()} <span className="text-xs font-normal text-slate-400">នាក់</span>
            </span>
          </div>

          {/* With Basket */}
          <div className="bg-gradient-to-b from-emerald-950/40 to-slate-900/90 border border-emerald-500/40 rounded-2xl p-2.5 flex flex-col items-center justify-center text-center shadow-sm">
            <span className="text-[11px] text-emerald-300 font-bold flex items-center gap-1">
              <span>🛒</span> បានបង្កើតកន្ត្រក
            </span>
            <span className="font-mono font-black text-emerald-400 text-xl sm:text-2xl mt-0.5">
              {(data?.commenters_with_basket_count || 0).toLocaleString()} <span className="text-xs font-normal text-emerald-300/70">នាក់</span>
            </span>
          </div>

          {/* Without Basket - PROMINENT HIGHLIGHT */}
          <div className="bg-gradient-to-b from-rose-950/50 via-amber-950/30 to-slate-900/90 border-2 border-rose-500/60 rounded-2xl p-2.5 flex flex-col items-center justify-center text-center shadow-[0_0_20px_rgba(244,63,94,0.2)]">
            <span className="text-[11px] text-rose-300 font-black flex items-center gap-1">
              <span>⚠️</span> គ្មានកន្ត្រក (សល់)
            </span>
            <span className="font-mono font-black text-rose-400 text-xl sm:text-2xl mt-0.5 animate-pulse">
              {(data?.commenters_without_basket_count || 0).toLocaleString()} <span className="text-xs font-normal text-rose-300/80">នាក់</span>
            </span>
          </div>

          {/* Total Comments */}
          <div className="bg-[#081836]/90 border border-slate-800 rounded-2xl p-2.5 flex flex-col items-center justify-center text-center shadow-sm">
            <span className="text-[11px] text-cyan-300 font-bold flex items-center gap-1">
              <span>💬</span> ខំមិនវិភាគសរុប
            </span>
            <span className="font-mono font-black text-cyan-400 text-xl sm:text-2xl mt-0.5">
              {(data?.total_comments_count || 0).toLocaleString()} <span className="text-xs font-normal text-slate-400">ខំមិន</span>
            </span>
          </div>
        </div>

        {/* Filter Tabs & Search Bar */}
        <div className="p-3 sm:p-4 bg-[#061022] border-b border-slate-800 flex flex-col gap-3">
          {/* Category Filter Badges */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scroll">
            <button
              onClick={() => { playPureTone(500, 0.03); setSelectedCategory('ALL'); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === 'ALL'
                  ? 'bg-cyan-500 text-slate-950 font-black shadow-md shadow-cyan-500/30 scale-102'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              ទាំងអស់ ({data?.commenters_without_basket_count || 0})
            </button>

            <button
              onClick={() => { playPureTone(500, 0.03); setSelectedCategory('PURE_PHONE_OR_LOCATION'); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1 transition-all cursor-pointer ${
                selectedCategory === 'PURE_PHONE_OR_LOCATION'
                  ? 'bg-cyan-500 text-slate-950 font-black shadow-md shadow-cyan-500/30'
                  : 'bg-cyan-950/50 text-cyan-300 border border-cyan-800/40 hover:bg-cyan-900/40'
              }`}
            >
              <span>📞</span> ផ្ញើតែលេខ/ទីតាំង ({data?.categories.phone_only_count || 0})
            </button>

            <button
              onClick={() => { playPureTone(500, 0.03); setSelectedCategory('QUESTION_OR_INQUIRY'); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1 transition-all cursor-pointer ${
                selectedCategory === 'QUESTION_OR_INQUIRY'
                  ? 'bg-indigo-500 text-white font-black shadow-md shadow-indigo-500/30'
                  : 'bg-indigo-950/50 text-indigo-300 border border-indigo-800/40 hover:bg-indigo-900/40'
              }`}
            >
              <span>💬</span> សួរនាំ/តម្លៃ ({data?.categories.inquiries_count || 0})
            </button>

            <button
              onClick={() => { playPureTone(500, 0.03); setSelectedCategory('UNMATCHED_CODE'); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1 transition-all cursor-pointer ${
                selectedCategory === 'UNMATCHED_CODE'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/30'
                  : 'bg-amber-950/50 text-amber-300 border border-amber-800/40 hover:bg-amber-900/40'
              }`}
            >
              <span>❓</span> កូដមិនត្រូវ ({data?.categories.unmatched_codes_count || 0})
            </button>

            <button
              onClick={() => { playPureTone(500, 0.03); setSelectedCategory('OUT_OF_STOCK'); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1 transition-all cursor-pointer ${
                selectedCategory === 'OUT_OF_STOCK'
                  ? 'bg-rose-500 text-white font-black shadow-md shadow-rose-500/30'
                  : 'bg-rose-950/50 text-rose-300 border border-rose-800/40 hover:bg-rose-900/40'
              }`}
            >
              <span>❌</span> ដាច់ស្តុក ({data?.categories.out_of_stock_count || 0})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="ស្វែងរកតាមឈ្មោះ, លេខទូរស័ព្ទ, ទីតាំង, ឬពាក្យក្នុងខំមិន..."
              className="w-full bg-[#030914] border border-slate-700/80 focus:border-cyan-400 rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm text-cyan-200 outline-none placeholder:text-slate-500 transition-all shadow-inner"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs px-1"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* User List Content */}
        <div className="p-3 sm:p-4 overflow-y-auto flex-1 flex flex-col gap-3 bg-[#040a17] custom-scroll">
          {loading ? (
            <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-9 h-9 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-cyan-300 text-sm font-bold">កំពុងវិភាគអ្នកខំមិនដែលគ្មានកន្ត្រក...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-16 text-center text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800 flex flex-col items-center justify-center gap-2">
              <span className="text-4xl">🎉</span>
              <div className="font-bold text-slate-200 text-base">
                {searchQuery ? 'មិនមានលទ្ធផលត្រូវនឹងការស្វែងរកឡើយ' : 'អស្ចារ្យណាស់! គ្មានអ្នកខំមិនណាសល់ចោលដោយគ្មានកន្ត្រកឡើយ'}
              </div>
              <div className="text-xs text-slate-500 max-w-md">
                អ្នកខំមិនទាំងអស់ត្រូវបានបង្កើតកន្ត្រក ឬមិនទាន់មានទិន្នន័យខំមិនក្នុង Live នេះទេ។
              </div>
            </div>
          ) : (
            filteredUsers.map((user, idx) => {
              const isExpanded = expandedUsers.has(user.facebook_name);
              const reasonBadgeClass =
                user.primary_reason === 'PURE_PHONE_OR_LOCATION'
                  ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/50'
                  : user.primary_reason === 'QUESTION_OR_INQUIRY'
                  ? 'bg-indigo-950/80 text-indigo-300 border-indigo-500/50'
                  : user.primary_reason === 'UNMATCHED_CODE'
                  ? 'bg-amber-950/80 text-amber-300 border-amber-500/50'
                  : user.primary_reason === 'OUT_OF_STOCK'
                  ? 'bg-rose-950/80 text-rose-300 border-rose-500/50'
                  : 'bg-slate-900 text-slate-400 border-slate-700';

              return (
                <div
                  key={`${user.facebook_name}-${idx}`}
                  className="bg-[#08152e]/90 border border-slate-800 hover:border-cyan-500/40 rounded-2xl p-3 sm:p-4 transition-all flex flex-col gap-2.5 shadow-md"
                >
                  {/* Top Row: User Meta + Badges + Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    
                    {/* User Profile */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 p-0.5 flex-shrink-0 shadow">
                        {user.picture_url ? (
                          <img src={user.picture_url} alt={user.facebook_name} className="w-full h-full object-cover rounded-[10px]" />
                        ) : (
                          <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center font-bold text-xs text-cyan-300">
                            {user.facebook_name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-white text-sm sm:text-base truncate">
                            {user.facebook_name}
                          </span>
                          <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full border ${reasonBadgeClass}`}>
                            {user.reason_label}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 flex-wrap">
                          {user.detected_phone && (
                            <span className="text-cyan-300 font-mono font-bold flex items-center gap-1 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
                              <span>📞</span> {user.detected_phone}
                            </span>
                          )}
                          {user.detected_location && (
                            <span className="text-emerald-300 font-medium flex items-center gap-1 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
                              <span>📍</span> {user.detected_location}
                            </span>
                          )}
                          <span className="text-[11px] text-slate-500 font-mono">
                            {user.comment_count} ខំមិន • {formatTime(user.last_comment_time)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                      <button
                        onClick={() => handleCopyUserInfo(user)}
                        className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                        title="Copy ព័ត៌មានអតិថិជន"
                      >
                        <span>📋</span> <span className="hidden sm:inline">Copy</span>
                      </button>

                      <button
                        onClick={() => handleOpenCreateBasket(user)}
                        className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer border border-emerald-400/40"
                      >
                        <span>➕</span> <span>បង្កើតកន្ត្រក</span>
                      </button>
                    </div>
                  </div>

                  {/* Comment History List */}
                  <div className="bg-[#030914] border border-slate-800/80 rounded-xl p-2.5 flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-[11px] text-slate-400 font-bold px-1">
                      <span>ខំមិនក្នុង Live ៖</span>
                      {user.comments.length > 1 && (
                        <button
                          onClick={() => toggleExpand(user.facebook_name)}
                          className="text-cyan-400 hover:text-cyan-300 text-[10.5px] underline cursor-pointer"
                        >
                          {isExpanded ? 'បង្រួម' : `មើលទាំងអស់ (${user.comments.length})`}
                        </button>
                      )}
                    </div>

                    {(isExpanded ? user.comments : user.comments.slice(0, 1)).map((c, cIdx) => (
                      <div
                        key={c.id || `c-${cIdx}`}
                        className="bg-[#08162d] border border-slate-700/60 rounded-lg p-2 text-xs flex justify-between items-start gap-2"
                      >
                        <div className="text-slate-100 font-medium leading-relaxed break-words flex-1">
                          💬 "{c.text}"
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
                          {formatTime(c.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 bg-[#071736] border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>📊 សរុបបង្ហាញ ៖</span>
            <span className="font-mono font-bold text-white">{filteredUsers.length} នាក់</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all active:scale-95"
          >
            បិទផ្ទាំង
          </button>
        </div>
      </div>

      {/* Quick Create Basket Sub-Modal */}
      {creatingUser && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[9999999] flex items-center justify-center p-3 animate-fadeIn">
          <div className="bg-[#0b1b36] border-2 border-emerald-500/60 rounded-3xl w-full max-w-md p-5 flex flex-col gap-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="font-black text-white text-base flex items-center gap-2">
                <span>➕ បង្កើតកន្ត្រកដោយដៃ</span>
              </div>
              <button
                onClick={() => setCreatingUser(null)}
                className="text-slate-400 hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-3 bg-slate-900/90 p-3 rounded-2xl border border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 p-0.5 flex-shrink-0">
                {creatingUser.picture_url ? (
                  <img src={creatingUser.picture_url} alt="" className="w-full h-full object-cover rounded-[10px]" />
                ) : (
                  <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center font-bold text-xs text-cyan-300">
                    FB
                  </div>
                )}
              </div>
              <div>
                <div className="font-black text-white text-sm">{creatingUser.facebook_name}</div>
                <div className="text-[11px] text-cyan-300 font-mono">Live: #{activeLiveId}</div>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-bold block mb-1">កូដទំនិញ (Product Code) ៖</label>
                <input
                  type="text"
                  value={inputCode}
                  onChange={e => setInputCode(e.target.value)}
                  placeholder="ឧ. A12, 24, R01 (ទុកទទេបើមិនទាន់មានកូដ)..."
                  className="w-full bg-[#040c1a] border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:border-cyan-400 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-300 font-bold block mb-1">ចំនួន (Qty) ៖</label>
                  <input
                    type="number"
                    min={1}
                    value={inputQty}
                    onChange={e => setInputQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-[#040c1a] border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:border-cyan-400 outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-bold block mb-1">តម្លៃ ($) (ជាជម្រើស) ៖</label>
                  <input
                    type="number"
                    value={inputPrice}
                    onChange={e => setInputPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Auto or $10"
                    className="w-full bg-[#040c1a] border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:border-cyan-400 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">លេខទូរស័ព្ទ (Phone) ៖</label>
                <input
                  type="text"
                  value={inputPhone}
                  onChange={e => setInputPhone(e.target.value)}
                  placeholder="012345678..."
                  className="w-full bg-[#040c1a] border border-slate-700 rounded-xl px-3 py-2 text-cyan-300 font-mono text-xs focus:border-cyan-400 outline-none"
                />
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">អាសយដ្ឋាន (Address) ៖</label>
                <input
                  type="text"
                  value={inputAddress}
                  onChange={e => setInputAddress(e.target.value)}
                  placeholder="ចោមចៅ, ភ្នំពេញ, ឬតាមខេត្ត..."
                  className="w-full bg-[#040c1a] border border-slate-700 rounded-xl px-3 py-2 text-emerald-300 text-xs focus:border-cyan-400 outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setCreatingUser(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all"
              >
                បោះបង់
              </button>
              <button
                type="button"
                onClick={handleCreateBasket}
                disabled={submittingBasket}
                className="flex-2 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-xl text-xs shadow-lg shadow-emerald-600/30 transition-all active:scale-95 disabled:opacity-50"
              >
                {submittingBasket ? 'កំពុងបង្កើត...' : '✓ បង្កើតកន្ត្រកភ្លាម'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
