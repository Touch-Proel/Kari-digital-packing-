import React, { useState, useEffect } from 'react';

interface OrderItem {
  product_code: string;
  product_name: string;
  quantity: number;
  price: number;
  image_file?: string;
  item_comment?: string;
}

interface PublicOrderData {
  invoice_id: number;
  facebook_name: string;
  customer_id?: string;
  phone?: string;
  shipping_address?: string;
  status: string;
  payment_status: string;
  is_paid?: boolean;
  paid_at?: string | null;
  packing_stage?: string;
  items: OrderItem[];
  subtotal: number;
  shipping_fee: number;
  total_amount: number;
  comments?: string[];
  location_zone?: 'PP' | 'PROVINCE';
  created_at?: string;
  is_dispatched?: boolean;
  is_picked?: boolean;
  packer_name?: string;
  bakong_khqr?: {
    account_id: string;
    merchant_name: string;
  } | null;
}

interface CustomerOrderPortalProps {
  orderId: string | number;
  onBackToApp?: () => void;
}

export function CustomerOrderPortal({ orderId, onBackToApp }: CustomerOrderPortalProps) {
  const [order, setOrder] = useState<PublicOrderData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Phone & Address Form
  const [phone, setPhone] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [isEditingInfo, setIsEditingInfo] = useState<boolean>(false);
  const [savingInfo, setSavingInfo] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Fullscreen Photo Zoom
  const [activeZoomIdx, setActiveZoomIdx] = useState<number | null>(null);

  // Fetch Order Details
  useEffect(() => {
    async function fetchOrder() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/public/order/${orderId}`);
        const data = await res.json();
        if (data.success && data.data) {
          setOrder(data.data);
          setPhone(data.data.phone || '');
          setAddress(data.data.shipping_address || '');
          if (!data.data.phone || !data.data.shipping_address) {
            setIsEditingInfo(true);
          }
        } else {
          setError(data.error || 'រកមិនឃើញវិក្កយបត្រនេះឡើយ');
        }
      } catch (err) {
        setError('⚠️ បញ្ហាក្នុងការតភ្ជាប់បណ្តាញ');
      } finally {
        setLoading(false);
      }
    }

    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);

  // Handle Save Info
  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId) return;
    setSavingInfo(true);
    try {
      const res = await fetch(`/api/public/order/${orderId}/update_info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, address })
      });
      const data = await res.json();
      if (data.success) {
        setIsEditingInfo(false);
        setSaveSuccessMsg('✅ បានរក្សាទុកព័ត៌មានដឹកជញ្ជូនជោគជ័យ!');
        setTimeout(() => setSaveSuccessMsg(null), 4000);
      }
    } catch {
      alert('បរាជ័យក្នុងការរក្សាទុកព័ត៌មាន');
    } finally {
      setSavingInfo(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070D19] text-white flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-cyan-300 font-bold font-mono">កំពុងទាញយកព័ត៌មានកុម្ម៉ង់...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#070D19] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-rose-950/80 border border-rose-500 rounded-3xl flex items-center justify-center text-3xl mb-4 shadow-[0_0_30px_rgba(244,63,94,0.3)]">
          ❌
        </div>
        <h2 className="text-xl font-black text-rose-300 mb-2">រកមិនឃើញវិក្កយបត្រ #{orderId}</h2>
        <p className="text-slate-400 text-sm max-w-sm mb-6">
          {error || 'តំណភ្ជាប់នេះអាចនឹងមិនត្រឹមត្រូវ ឬវិក្កយបត្រត្រូវបានលុប។'}
        </p>
        {onBackToApp && (
          <button
            onClick={onBackToApp}
            className="bg-slate-800 hover:bg-slate-700 text-cyan-300 px-6 py-2.5 rounded-xl font-bold text-sm border border-cyan-500/30"
          >
            ← ត្រឡប់ទៅកម្មវិធីដើម
          </button>
        )}
      </div>
    );
  }

  const isPaid =
    order.is_paid === true ||
    (order.payment_status && order.payment_status.toUpperCase() === 'PAID') ||
    (order.status && order.status.toUpperCase() === 'PAID') ||
    order.status === 'Packed' ||
    order.status === 'Dispatched' ||
    Boolean(order.paid_at);

  const isDispatched =
    order.is_dispatched === true ||
    (order.status && order.status.toUpperCase() === 'DISPATCHED') ||
    order.packing_stage === 'DISPATCHED';

  const isPicked =
    order.is_picked === true ||
    isDispatched ||
    order.packing_stage === 'STAGED' ||
    order.packing_stage === 'DISPATCHED' ||
    isPaid;

  const totalItemsCount = order.items.reduce((sum, it) => sum + (it.quantity || 1), 0);

  return (
    <div className="min-h-screen bg-[#060B16] text-slate-100 font-sans pb-16 antialiased selection:bg-cyan-500 selection:text-black">
      {/* Top Header & Store Branding */}
      <header className="sticky top-0 z-30 bg-[#0B1426]/90 backdrop-blur-xl border-b border-cyan-500/20 px-4 py-3.5 shadow-2xl">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-xl shadow-[0_0_15px_rgba(6,182,212,0.4)] ring-1 ring-white/20">
              🛍️
            </div>
            <div>
              <h1 className="font-black text-white text-base leading-tight tracking-wide flex items-center gap-1.5">
                <span>កញ្ចប់ទំនិញរបស់អ្នក</span>
              </h1>
              <span className="text-[11px] font-mono font-bold text-cyan-300/80">
                វិក្កយបត្រ #{order.invoice_id}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-xl text-xs font-black font-mono shadow-md flex items-center gap-1 ${
                isPaid
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/50 animate-pulse'
              }`}
            >
              {isPaid ? '✓ PAID' : '⏳ UNPAID'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 pt-4 space-y-4">
        {/* Customer Status Banner */}
        <div className="bg-gradient-to-br from-[#0F1E38] to-[#091325] border border-cyan-500/30 rounded-3xl p-4.5 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

          {/* Customer Name */}
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-cyan-400/40 flex items-center justify-center text-xl font-black text-cyan-300 shadow">
                {order.facebook_name ? order.facebook_name.charAt(0).toUpperCase() : '👤'}
              </div>
              <div>
                <h2 className="text-base font-black text-white leading-tight">
                  {order.facebook_name}
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  ទំនិញសរុប ៖ <span className="text-amber-400 font-bold">{totalItemsCount} ដើម</span> ({order.items.length} មុខ)
                </p>
              </div>
            </div>

            {/* Quick Share Link Button */}
            <button
              onClick={() => {
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(window.location.href);
                  alert('📋 បានចម្លងតំណភ្ជាប់ (Link) នេះរួចរាល់!');
                }
              }}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 text-xs font-bold transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
              title="ចម្លង Link"
            >
              <span>🔗 Share</span>
            </button>
          </div>

          {/* Step Progress Bar */}
          <div className="grid grid-cols-3 gap-1.5 pt-3 border-t border-slate-700/60 text-center font-mono">
            <div className="bg-cyan-500/20 border border-cyan-400/50 p-2 rounded-xl">
              <span className="text-base block mb-0.5">🛍️</span>
              <span className="text-[10.5px] font-bold text-cyan-300">១. ទទួលការទិញ</span>
            </div>
            <div
              className={`p-2 rounded-xl border ${
                isPicked
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                  : 'bg-slate-800/60 border-slate-700 text-slate-400'
              }`}
            >
              <span className="text-base block mb-0.5">📦</span>
              <span className="text-[10.5px] font-bold">២. រើស & វេចខ្ចប់</span>
            </div>
            <div
              className={`p-2 rounded-xl border ${
                isDispatched
                  ? 'bg-indigo-500/20 border-indigo-400/50 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.2)]'
                  : 'bg-slate-800/60 border-slate-700 text-slate-400'
              }`}
            >
              <span className="text-base block mb-0.5">🚚</span>
              <span className="text-[10.5px] font-bold">៣. កំពុងដឹកជូន</span>
            </div>
          </div>
        </div>

        {/* Shipping Information & Quick Edit */}
        <div className="bg-[#0D182E] border border-slate-800 rounded-3xl p-4 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-black uppercase text-cyan-400 flex items-center gap-1.5 tracking-wider font-mono">
              <span>📍</span>
              <span>ព័ត៌មានដឹកជញ្ជូន</span>
            </h3>
            {!isEditingInfo && (
              <button
                onClick={() => setIsEditingInfo(true)}
                className="text-xs text-amber-300 hover:text-amber-200 font-bold underline cursor-pointer"
              >
                ✏️ កែប្រែទីតាំង / លេខ
              </button>
            )}
          </div>

          {saveSuccessMsg && (
            <div className="bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 text-xs font-bold p-2.5 rounded-xl mb-3 animate-fadeIn text-center">
              {saveSuccessMsg}
            </div>
          )}

          {isEditingInfo ? (
            <form onSubmit={handleSaveInfo} className="space-y-2.5">
              <div>
                <label className="text-[11px] font-bold text-slate-300 mb-1 block">
                  📞 លេខទូរស័ព្ទទទួលទំនិញ ៖
                </label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="ឧ. 012 345 678"
                  className="w-full bg-slate-900 text-white font-mono text-sm px-3 py-2 rounded-xl border border-cyan-500/50 outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 mb-1 block">
                  🏠 អាសយដ្ឋាន ឬទីតាំងដឹកជញ្ជូន ៖
                </label>
                <textarea
                  rows={2}
                  required
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="ផ្ទះលេខ... ផ្លូវលេខ... សង្កាត់/ខណ្ឌ..."
                  className="w-full bg-slate-900 text-white text-sm px-3 py-2 rounded-xl border border-cyan-500/50 outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={savingInfo}
                  className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black py-2 rounded-xl text-xs shadow-lg transition-all active:scale-95 cursor-pointer"
                >
                  {savingInfo ? '⏳ កំពុងរក្សាទុក...' : '✓ រក្សាទុកព័ត៌មាន'}
                </button>
                {order.phone && order.shipping_address && (
                  <button
                    type="button"
                    onClick={() => setIsEditingInfo(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs cursor-pointer"
                  >
                    បោះបង់
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div className="space-y-1.5 text-xs text-slate-300 font-mono">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">📞 លេខទូរស័ព្ទ:</span>
                <span className="font-bold text-white text-sm">{order.phone || 'មិនទាន់មាន'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-slate-400 flex-shrink-0">🏠 ទីតាំង:</span>
                <span className="font-bold text-white">{order.shipping_address || 'មិនទាន់មាន'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Ordered Products Gallery */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-black text-cyan-300 flex items-center gap-1.5 font-mono uppercase tracking-wider">
              <span>📸</span>
              <span>រូបភាពទំនិញដែលបានកុម្ម៉ង់ ({order.items.length} មុខ)</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">ចុចលើរូបដើម្បីពង្រីក</span>
          </div>

          <div className="space-y-2.5">
            {order.items.map((item, idx) => {
              const itemTotal = item.price * (item.quantity || 1);
              return (
                <div
                  key={`${item.product_code}-${idx}`}
                  className="bg-[#0C172B] border border-slate-800 hover:border-cyan-500/40 rounded-2xl p-3 flex gap-3 shadow-lg transition-all"
                >
                  {/* Product Image */}
                  <div
                    onClick={() => setActiveZoomIdx(idx)}
                    className="w-20 h-20 min-w-20 rounded-xl bg-slate-950 border border-slate-700 overflow-hidden flex items-center justify-center relative cursor-zoom-in group shadow"
                  >
                    {item.image_file ? (
                      <img
                        src={item.image_file}
                        alt={item.product_code}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                    ) : (
                      <span className="font-mono font-black text-cyan-400 text-xs">
                        [{item.product_code}]
                      </span>
                    )}

                    <span className="absolute bottom-0 inset-x-0 bg-black/80 text-[9px] font-mono font-black text-cyan-300 text-center truncate py-0.5">
                      🔍 ចុចពង្រីក
                    </span>
                  </div>

                  {/* Product Details */}
                  <div className="flex-1 flex flex-col justify-between overflow-hidden">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="bg-cyan-500 text-slate-950 font-mono font-black px-2 py-0.5 rounded-lg text-xs shadow-sm">
                          [{item.product_code}]
                        </span>

                        <span className="bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 font-mono font-black px-2 py-0.5 rounded-lg text-xs shadow-sm">
                          x{item.quantity || 1} ដើម
                        </span>

                        <span className="font-bold text-white text-xs truncate">
                          {item.product_name}
                        </span>
                      </div>

                      {item.item_comment && (
                        <div className="text-[11px] text-amber-200 bg-amber-950/60 border border-amber-500/30 px-2 py-0.5 rounded-md font-mono inline-block mb-1">
                          💬 ខមិន ៖ <span className="text-white font-bold">{item.item_comment}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-800/80">
                      <span className="text-slate-400 font-mono">
                        ${item.price.toFixed(2)} × {item.quantity || 1}
                      </span>
                      <span className="font-mono font-black text-amber-400 text-sm">
                        ${itemTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Invoice Summary & Total Calculation */}
        <div className="bg-gradient-to-b from-[#0F1E38] to-[#0A1426] border-2 border-cyan-500/40 rounded-3xl p-4.5 shadow-2xl space-y-2.5">
          <h3 className="text-xs font-black uppercase tracking-wider text-cyan-400 font-mono">
            💵 ការទូទាត់ប្រាក់ (Payment Summary)
          </h3>

          <div className="space-y-1.5 text-xs font-mono pt-1">
            <div className="flex justify-between text-slate-300">
              <span>តម្លៃទំនិញសរុប ({totalItemsCount} ដើម) ៖</span>
              <span className="font-bold text-white">${order.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>សេវាដឹកជញ្ជូន ({order.location_zone === 'PP' ? 'ភ្នំពេញ' : 'ខេត្ត'}) ៖</span>
              <span className="font-bold text-white">${order.shipping_fee.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-center text-base pt-2.5 border-t border-slate-700 text-white font-black">
              <span className="text-cyan-300">ទឹកប្រាក់សរុប ៖</span>
              <span className="text-xl font-mono text-amber-400 shadow-sm">
                ${order.total_amount.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Bakong KHQR Box for UNPAID Orders */}
          {!isPaid && (
            <div className="mt-4 pt-3 border-t border-slate-700/80 text-center">
              <p className="text-xs font-bold text-amber-300 mb-2">
                📲 ស្កេនទូទាត់ប្រាក់តាម Bakong KHQR / ABA Bank
              </p>
              <div className="bg-white p-3 rounded-2xl inline-block shadow-2xl border-2 border-amber-400">
                <img
                  src={`/api/khqr_png?amount=${order.total_amount}&name=${encodeURIComponent(order.facebook_name)}`}
                  alt="Bakong KHQR"
                  className="w-48 h-48 object-contain mx-auto"
                />
                <span className="text-[10px] font-mono font-bold text-slate-900 block mt-1">
                  ស្កេនជាមួយគ្រប់ App ធនាគារក្នុងស្រុក
                </span>
              </div>
            </div>
          )}

          {isPaid && (
            <div className="bg-emerald-950/70 border border-emerald-500/60 p-3 rounded-2xl text-center text-emerald-300 font-bold text-xs mt-3 flex items-center justify-center gap-2">
              <span className="text-base">✅</span>
              <span>ការកុម្ម៉ង់នេះបានទូទាត់ប្រាក់រួចរាល់ហើយ! អរគុណច្រើនបង!</span>
            </div>
          )}
        </div>
      </main>

      {/* Fullscreen Photo Zoom Modal */}
      {activeZoomIdx !== null && (
        <div
          onClick={() => setActiveZoomIdx(null)}
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 animate-fadeIn"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-[#0B1426] border-2 border-cyan-400 rounded-3xl overflow-hidden shadow-2xl flex flex-col"
          >
            {/* Top Bar */}
            <div className="p-3 bg-black/60 flex items-center justify-between border-b border-slate-800">
              <span className="font-mono font-black text-cyan-300 text-xs">
                [{order.items[activeZoomIdx].product_code}] ({activeZoomIdx + 1} / {order.items.length})
              </span>
              <button
                onClick={() => setActiveZoomIdx(null)}
                className="w-7 h-7 rounded-xl bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white flex items-center justify-center font-bold text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Big Image */}
            <div className="w-full h-80 bg-slate-950 flex items-center justify-center p-2 relative">
              {order.items[activeZoomIdx].image_file ? (
                <img
                  src={order.items[activeZoomIdx].image_file}
                  alt={order.items[activeZoomIdx].product_code}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="font-mono text-cyan-400 font-black text-xl">
                  [{order.items[activeZoomIdx].product_code}]
                </div>
              )}

              {/* Prev / Next buttons */}
              {order.items.length > 1 && (
                <>
                  <button
                    onClick={() =>
                      setActiveZoomIdx(prev => (prev! > 0 ? prev! - 1 : order.items.length - 1))
                    }
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-black/70 text-white flex items-center justify-center text-xl font-bold cursor-pointer hover:bg-cyan-600"
                  >
                    ‹
                  </button>
                  <button
                    onClick={() =>
                      setActiveZoomIdx(prev => (prev! < order.items.length - 1 ? prev! + 1 : 0))
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-black/70 text-white flex items-center justify-center text-xl font-bold cursor-pointer hover:bg-cyan-600"
                  >
                    ›
                  </button>
                </>
              )}
            </div>

            {/* Bottom info */}
            <div className="p-3 bg-[#0D182E] flex items-center justify-between text-xs border-t border-slate-800">
              <span className="font-bold text-white">
                {order.items[activeZoomIdx].product_name}
              </span>
              <span className="font-mono font-black text-amber-400">
                x{order.items[activeZoomIdx].quantity || 1} (${order.items[activeZoomIdx].price.toFixed(2)})
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
