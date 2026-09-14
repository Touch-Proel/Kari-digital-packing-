import { useState, useEffect, useRef, useMemo, CSSProperties } from 'react';
import {
  Invoice,
  Product,
  FacebookPage
} from './types';
import { Header } from './components/Header';
import { StockDock } from './components/StockDock';
import { GamifiedHud } from './components/GamifiedHud';
import { WorkflowTabs } from './components/WorkflowTabs';
import { BasketCard } from './components/BasketCard';
import { LiveCommentStream } from './components/LiveCommentStream';
import { QCModal } from './components/Modals/QCModal';
import { DispatchModal } from './components/Modals/DispatchModal';
import { StockModal } from './components/Modals/StockModal';
import { StockSyncModal } from './components/Modals/StockSyncModal';
import { PickingModal } from './components/Modals/PickingModal';
import { PackerModal } from './components/Modals/PackerModal';
import { FacebookAuthModal } from './components/Modals/FacebookAuthModal';
import { ImageZoomModal } from './components/Modals/ImageZoomModal';
import { ReceiptModal } from './components/Modals/ReceiptModal';
import { playSuccessFanfare, playWarningBuzzer, playPureTone } from './utils/audio';

export default function App() {
  // Application Data States
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [liveSessions, setLiveSessions] = useState<{ live_id: string; created_at: string; basket_count?: number }[]>([]);
  const [selectedLiveId, setSelectedLiveId] = useState<string>(() => {
    return localStorage.getItem('selectedLiveId') || '1626350178950100';
  });
  const [activePage, setActivePage] = useState<FacebookPage | null>(null);
  const [currentRevision, setCurrentRevision] = useState<number>(0);
  const [networkOnline, setNetworkOnline] = useState<boolean>(true);

  // Workflow & UI Filters
  const [currentMasterStage, setCurrentMasterStage] = useState<number>(1); // 1: Unpicked, 2: Staged, 3: Paid/QC
  const [activeSubFilter, setActiveSubFilter] = useState<'ALL' | 'AMOUNT_DESC' | 'PP' | 'PROVINCE'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [displayedLimit, setDisplayedLimit] = useState<number>(25);

  // User / Packer Settings
  const [packerName, setPackerName] = useState<string>(() => localStorage.getItem('packerName') || 'សុខា');
  const [fontScale, setFontScale] = useState<number>(() => parseFloat(localStorage.getItem('fontScale') || '1'));
  const [khmerFont, setKhmerFont] = useState<string>(() => localStorage.getItem('khmerFont') || 'kantumruy');

  useEffect(() => {
    document.body.setAttribute('data-khmer-font', khmerFont);
  }, [khmerFont]);
  const [checkedState, setCheckedState] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('checkedItemsState') || '{}');
    } catch {
      return {};
    }
  });

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const toastTimeoutRef = useRef<any>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  };

  // Modals visibility
  const [isQCModalOpen, setIsQCModalOpen] = useState(false);
  const [qcInvoice, setQcInvoice] = useState<Invoice | null>(null);

  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [dispatchedCount, setDispatchedCount] = useState<number>(0);

  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isAddingNewStock, setIsAddingNewStock] = useState(false);
  const [selectedStockProduct, setSelectedStockProduct] = useState<Product | null>(null);

  const [isStockSyncModalOpen, setIsStockSyncModalOpen] = useState(false);
  const [stockSyncInitialTab, setStockSyncInitialTab] = useState<'telegram' | 'paste' | 'file' | 'export'>('telegram');

  const handleOpenStockSync = (tab: 'telegram' | 'paste' | 'file' | 'export' = 'telegram') => {
    setStockSyncInitialTab(tab);
    setIsStockSyncModalOpen(true);
  };

  const [isPickingModalOpen, setIsPickingModalOpen] = useState(false);

  const [isPackerModalOpen, setIsPackerModalOpen] = useState(false);
  const [packerModalMode, setPackerModalMode] = useState<'leaderboard' | 'history'>('leaderboard');
  const [topPackerName, setTopPackerName] = useState('សុខា (3 កន្ត្រក)');
  const [mySessionPacks, setMySessionPacks] = useState(0);

  const [isFbModalOpen, setIsFbModalOpen] = useState(false);
  const [isCommentStreamOpen, setIsCommentStreamOpen] = useState(false);

  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);
  const [zoomCode, setZoomCode] = useState('');
  const [zoomName, setZoomName] = useState('');
  const [zoomImageUrl, setZoomImageUrl] = useState<string | undefined>(undefined);
  const [zoomPrice, setZoomPrice] = useState<number | undefined>(undefined);
  const [zoomStockQty, setZoomStockQty] = useState<number | undefined>(undefined);

  // Receipt Modal State
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptInvoice, setReceiptInvoice] = useState<Invoice | null>(null);

  const handleOpenReceiptModal = (inv: Invoice) => {
    setReceiptInvoice(inv);
    setIsReceiptModalOpen(true);
  };

  // Fast Product Lookup Map for Instant Basket Thumbnail & Image Matching
  const productMap = useMemo(() => {
    const map: Record<string, Product> = {};
    for (const p of products) {
      if (p.code) {
        map[p.code.toUpperCase()] = p;
      }
    }
    return map;
  }, [products]);

  // Save font scale and packer name
  const handleAdjustFontSize = (delta: number) => {
    const next = Math.max(0.85, Math.min(1.3, fontScale + delta));
    setFontScale(next);
    localStorage.setItem('fontScale', String(next));
  };

  const handleChangeKhmerFont = (font: string) => {
    setKhmerFont(font);
    localStorage.setItem('khmerFont', font);
    document.body.setAttribute('data-khmer-font', font);
    const names: Record<string, string> = {
      kantumruy: 'Kantumruy Pro (ស្រទន់ ទំនើប)',
      santepheap: 'Koh Santepheap (ស្រឡះ)',
      battambang: 'Battambang (បុរាណ)',
      koulen: 'Koulen (អក្សរឆ្លាក់)'
    };
    showToast(`✨ បានប្តូរ Font ៖ ${names[font] || font}`);
  };

  const handleChangePackerName = (newName: string) => {
    setPackerName(newName);
    localStorage.setItem('packerName', newName);
    showToast(`👤 ប្តូរឈ្មោះអ្នកច្រក៖ ${newName}`);
  };

  const handleToggleItemCheck = (invId: number, code: string) => {
    const key = `${invId}_${code}`;
    setCheckedState(prev => {
      const next = { ...prev, [key]: !prev[key] };
      playPureTone(next[key] ? 880 : 440, 0.05);
      localStorage.setItem('checkedItemsState', JSON.stringify(next));
      return next;
    });
  };

  // Data Fetching: Invoices with 0ms revision check
  const fetchInvoices = async (overrideLiveId?: string, overrideRev?: number) => {
    try {
      const targetLive = overrideLiveId !== undefined ? overrideLiveId : selectedLiveId;
      const targetRev = overrideRev !== undefined ? overrideRev : currentRevision;
      const res = await fetch(`/api/invoices?live_id=${encodeURIComponent(targetLive)}&rev=${targetRev}&t=${Date.now()}`);
      if (!res.ok) {
        setNetworkOnline(false);
        return;
      }
      setNetworkOnline(true);
      const json = await res.json();
      if (json && json.changed === false) {
        return; // No change
      }
      if (json.data) {
        setInvoices(json.data);
        if (json.revision) setCurrentRevision(json.revision);
      }
    } catch (e) {
      setNetworkOnline(false);
    }
  };

  // Data Fetching: Products and Stock
  const fetchStock = async () => {
    try {
      const res = await fetch('/api/obs_data');
      if (res.ok) {
        const json = await res.json();
        if (json.products) {
          setProducts(json.products);
        }
      }
    } catch (e) {}
  };

  // Data Fetching: Live Sessions
  const fetchLiveSessions = async () => {
    try {
      const res = await fetch('/api/live_sessions');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.sessions || []);
        const serverActiveId = !Array.isArray(data) ? data.active_live_id : undefined;
        setLiveSessions(list);

        const saved = localStorage.getItem('selectedLiveId');
        let chosenId = selectedLiveId;

        if (saved && list.some((s: any) => s.live_id === saved)) {
          chosenId = saved;
        } else if (serverActiveId && list.some((s: any) => s.live_id === serverActiveId)) {
          chosenId = serverActiveId;
        } else if (list.length > 0) {
          chosenId = list[0].live_id;
        }

        if (chosenId && chosenId !== selectedLiveId) {
          setSelectedLiveId(chosenId);
          localStorage.setItem('selectedLiveId', chosenId);
          fetchInvoices(chosenId, 0);
        }
      }
    } catch (e) {}
  };

  const handleSelectLiveSession = (id: string) => {
    setSelectedLiveId(id);
    localStorage.setItem('selectedLiveId', id);
    setCurrentRevision(0);
    fetchInvoices(id, 0);
    fetch('/api/set_active_live_id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ live_id: id })
    }).catch(() => {});
  };

  const handleCreateNewLiveSession = async () => {
    try {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const newLiveId = `LIVE_${dateStr}_${timeStr}`;

      const res = await fetch('/api/create_live_session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ live_id: newLiveId })
      });
      const data = await res.json();
      if (data.success) {
        playSuccessFanfare();
        setSelectedLiveId(data.live_id);
        localStorage.setItem('selectedLiveId', data.live_id);
        setCurrentRevision(0);
        await fetchLiveSessions();
        await fetchInvoices(data.live_id, 0);
        showToast(`🎉 បានបង្កើត Live ថ្មី! វិក្កយបត្រម្សិលមិញត្រូវបានរក្សាសុវត្ថិភាព។`);
      }
    } catch (e) {
      playWarningBuzzer();
      showToast('⚠️ មិនអាចបង្កើត Live ថ្មីបានទេ', 'error');
    }
  };

  // Data Fetching: Packer productivity
  const fetchPackerStats = async () => {
    try {
      const res = await fetch('/api/packer_leaderboard');
      if (res.ok) {
        const list = await res.json();
        if (list.length > 0) {
          setTopPackerName(`${list[0].packer_name} (${list[0].total_bags} កន្ត្រក)`);
        }
        const me = list.find((p: any) => p.packer_name.toLowerCase() === packerName.toLowerCase());
        setMySessionPacks(me ? me.total_bags : 0);
      }
    } catch (e) {}
  };

  // Initial loads and polling
  useEffect(() => {
    fetchInvoices();
    fetchStock();
    fetchLiveSessions();
    fetchPackerStats();

    // Initial Facebook status
    fetch('/api/fb/status')
      .then(r => r.json())
      .then(d => {
        if (d.activePage) setActivePage(d.activePage);
      })
      .catch(() => {});

    const invTimer = setInterval(fetchInvoices, 2000);
    const stockTimer = setInterval(fetchStock, 6000);
    const packerTimer = setInterval(fetchPackerStats, 6000);

    return () => {
      clearInterval(invTimer);
      clearInterval(stockTimer);
      clearInterval(packerTimer);
    };
  }, [selectedLiveId, currentRevision, packerName]);

  // Barcode Scanner Listener
  useEffect(() => {
    let buffer = '';
    let lastKey = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toUpperCase();
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

      const now = Date.now();
      if (now - lastKey > 150) buffer = '';
      lastKey = now;

      if (e.key === 'Enter') {
        if (buffer.length >= 1) {
          const scanned = buffer.trim().toUpperCase();
          showToast(`🔍 ស្កេនឃើញ ៖ [${scanned}]`);

          // If numeric or starts with INV, search invoice
          if (/^\d+$/.test(scanned) || scanned.startsWith('#')) {
            setSearchQuery(scanned.replace(/\D/g, ''));
          } else {
            // Find in current baskets and check it
            let matched = false;
            invoices.forEach(inv => {
              inv.items.forEach(it => {
                if (it.product_code.toUpperCase() === scanned) {
                  handleToggleItemCheck(inv.invoice_id, it.product_code);
                  matched = true;
                }
              });
            });
            if (matched) playSuccessFanfare();
          }
          buffer = '';
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [invoices]);

  // Counts for 3 Stage tabs
  const unpickedCount = invoices.filter(
    i => (i.packing_stage === 'UNPICKED' || !i.packing_stage) &&
         i.status !== 'Paid' &&
         i.status !== 'Packed' &&
         i.status !== 'Dispatched' &&
         i.status !== 'Cancelled'
  ).length;

  const waitingCount = invoices.filter(
    i => i.packing_stage === 'STAGED' &&
         i.status !== 'Paid' &&
         i.status !== 'Packed' &&
         i.status !== 'Dispatched' &&
         i.status !== 'Cancelled'
  ).length;

  const paidQcCount = invoices.filter(
    i => i.status === 'Paid' &&
         i.status !== 'Packed' &&
         i.status !== 'Dispatched' &&
         i.status !== 'Cancelled'
  ).length;

  const totalDispatched = invoices.filter(i => i.status === 'Dispatched' || i.status === 'Packed').length;
  useEffect(() => {
    setDispatchedCount(totalDispatched);
  }, [totalDispatched]);

  // Filter invoices for display
  let filtered = invoices.filter(inv => {
    if (inv.status === 'Cancelled') return false;
    if (currentMasterStage === 1) {
      return (inv.packing_stage === 'UNPICKED' || !inv.packing_stage) && inv.status !== 'Paid' && inv.status !== 'Packed' && inv.status !== 'Dispatched';
    }
    if (currentMasterStage === 2) {
      return inv.packing_stage === 'STAGED' && inv.status !== 'Paid' && inv.status !== 'Packed' && inv.status !== 'Dispatched';
    }
    if (currentMasterStage === 3) {
      return inv.status === 'Paid' && inv.status !== 'Packed' && inv.status !== 'Dispatched';
    }
    return true;
  });

  // Sub-filter
  if (activeSubFilter === 'PP') {
    filtered = filtered.filter(i => i.location_zone === 'PP');
  } else if (activeSubFilter === 'PROVINCE') {
    filtered = filtered.filter(i => i.location_zone === 'PROVINCE');
  } else if (activeSubFilter === 'AMOUNT_DESC') {
    filtered = [...filtered].sort((a, b) => b.total_amount - a.total_amount);
  }

  // Search filter
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filtered = filtered.filter(i =>
      String(i.basket_no).includes(q) ||
      String(i.invoice_id).includes(q) ||
      i.facebook_name.toLowerCase().includes(q) ||
      i.phone_number.includes(q) ||
      i.items.some(it => it.product_code.toLowerCase().includes(q) || it.product_name.toLowerCase().includes(q))
    );
  }

  const totalFilteredBaskets = filtered.length;
  const visibleBaskets = filtered.slice(0, displayedLimit);

  return (
    <div
      style={{ '--font-scale': fontScale } as CSSProperties}
      className="min-h-screen bg-[#030712] text-slate-100 flex justify-center p-2.5 antialiased selection:bg-cyan-500 selection:text-black"
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-3 left-1/2 -translate-x-1/2 z-[1000000] px-4 py-2 rounded-full font-black text-xs shadow-2xl flex items-center gap-1.5 transition-all animate-bounce ${
            toastType === 'error'
              ? 'bg-rose-950 border-[1.5px] border-rose-500 text-rose-200'
              : 'bg-[#0B1325] border-[1.5px] border-emerald-500 text-white'
          }`}
        >
          <span>{toastType === 'error' ? '⚠️' : '⚡'}</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Viewport Container (Strictly Mobile UI Max-width 480px) */}
      <div className="w-full max-w-[480px] flex flex-col gap-2.5 pb-16">
        {/* 1. Header */}
        <Header
          activePage={activePage}
          onOpenFbModal={() => setIsFbModalOpen(true)}
          dispatchedCount={dispatchedCount}
          onOpenDispatchModal={() => setIsDispatchModalOpen(true)}
          packerName={packerName}
          onOpenPackerHistory={() => {
            setPackerModalMode('history');
            setIsPackerModalOpen(true);
          }}
          liveSessions={liveSessions}
          selectedLiveId={selectedLiveId}
          onSelectLiveId={id => {
            handleSelectLiveSession(id);
            showToast(`🎥 ប្តូរវគ្គ Live៖ ${id.length > 10 ? id.slice(-8) : id}`);
          }}
          onCreateLiveSession={handleCreateNewLiveSession}
          onOpenPickingModal={() => setIsPickingModalOpen(true)}
          onToggleCommentStream={() => setIsCommentStreamOpen(!isCommentStreamOpen)}
          isStreamOpen={isCommentStreamOpen}
          onAdjustFontSize={handleAdjustFontSize}
          khmerFont={khmerFont}
          onChangeKhmerFont={handleChangeKhmerFont}
        />

        {/* 2. Live Comment Stream Drawer / Simulator */}
        <LiveCommentStream
          isOpen={isCommentStreamOpen}
          onClose={() => setIsCommentStreamOpen(false)}
          activeLiveId={selectedLiveId}
          onCommentProcessed={() => {
            fetchInvoices();
            fetchStock();
          }}
          onShowToast={showToast}
        />

        {/* 3. Stock Management Dock */}
        <StockDock
          products={products}
          onSelectProduct={p => {
            setIsAddingNewStock(false);
            setSelectedStockProduct(p);
            setIsStockModalOpen(true);
          }}
          onOpenAddStockPrompt={() => {
            setIsAddingNewStock(true);
            setSelectedStockProduct(null);
            setIsStockModalOpen(true);
          }}
          onOpenStockSync={handleOpenStockSync}
        />

        {/* 4. Gamified HUD Strip */}
        <GamifiedHud
          topPackerName={topPackerName}
          mySessionPacks={mySessionPacks}
          onOpenLeaderboard={() => {
            setPackerModalMode('leaderboard');
            setIsPackerModalOpen(true);
          }}
          onOpenMyHistory={() => {
            setPackerModalMode('history');
            setIsPackerModalOpen(true);
          }}
        />

        {/* 5. Workflow Tabs & Sub-Filters & Search Bar */}
        <WorkflowTabs
          currentStage={currentMasterStage}
          onSwitchStage={stage => {
            setCurrentMasterStage(stage);
            setDisplayedLimit(25);
            playPureTone(650, 0.04);
          }}
          unpickedCount={unpickedCount}
          waitingCount={waitingCount}
          paidQcCount={paidQcCount}
          activeSubFilter={activeSubFilter}
          onSetSubFilter={flt => {
            setActiveSubFilter(flt);
            setDisplayedLimit(25);
            playPureTone(700, 0.04);
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          totalFilteredBaskets={totalFilteredBaskets}
        />

        {/* 6. Baskets Feed */}
        <div className="flex flex-col gap-3 mt-1">
          {visibleBaskets.length === 0 ? (
            <div className="text-center py-16 px-4 bg-slate-900/40 rounded-2xl border border-slate-800">
              <div className="text-3xl mb-2">🎉</div>
              <div className="text-sm font-bold text-slate-400">គ្មានកន្ត្រកក្នុងផ្នែកនេះឡើយ។</div>
              <div className="text-xs text-slate-500 mt-1">
                សូមជ្រើសរើស Tab ផ្សេង ឬសាកល្បងបញ្ចូល Comment ក្នុងផ្ទាំង Live Comment។
              </div>
            </div>
          ) : (
            visibleBaskets.map(inv => (
              <BasketCard
                key={inv.invoice_id}
                invoice={inv}
                currentMasterStage={currentMasterStage}
                myPackerName={packerName}
                checkedState={checkedState}
                productMap={productMap}
                onToggleItemCheck={handleToggleItemCheck}
                onOpenQCModal={i => {
                  setQcInvoice(i);
                  setIsQCModalOpen(true);
                }}
                onOpenReceiptModal={handleOpenReceiptModal}
                onOpenZoomModal={(c, n, img, pr, sq) => {
                  setZoomCode(c);
                  setZoomName(n);
                  setZoomImageUrl(img || productMap[c.toUpperCase()]?.image_file);
                  setZoomPrice(pr);
                  setZoomStockQty(sq);
                  setIsZoomModalOpen(true);
                }}
                onDataChanged={() => {
                  fetchInvoices();
                  fetchStock();
                }}
                onShowToast={showToast}
              />
            ))
          )}

          {/* Load More Button */}
          {totalFilteredBaskets > displayedLimit && (
            <div className="text-center py-3">
              <button
                onClick={() => {
                  setDisplayedLimit(prev => prev + 25);
                  playPureTone(700, 0.04);
                }}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-blue-900 to-sky-700 text-white font-black text-xs border border-sky-400 shadow-lg active:scale-98"
              >
                ⬇️ មើល ២៥ កន្ត្រកទៀត (នៅសល់ {totalFilteredBaskets - displayedLimit})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Network Status Badge */}
      <div
        className={`fixed bottom-3 right-3 px-2.5 py-1 rounded-xl text-[11px] font-black z-[99999] shadow-lg flex items-center gap-1 ${
          networkOnline
            ? 'bg-emerald-950/90 border border-emerald-500 text-emerald-300'
            : 'bg-rose-950/90 border border-rose-500 text-rose-300'
        }`}
      >
        <span className={`w-2 h-2 rounded-full ${networkOnline ? 'bg-emerald-400' : 'bg-rose-500 animate-ping'}`}></span>
        <span>{networkOnline ? 'WiFi ភ្ជាប់រួចរាល់' : 'ដាច់សេវា WiFi!'}</span>
      </div>

      {/* All Modals */}
      <QCModal
        isOpen={isQCModalOpen}
        onClose={() => setIsQCModalOpen(false)}
        invoice={qcInvoice}
        packerName={packerName}
        onDispatchSuccess={() => {
          fetchInvoices();
          fetchPackerStats();
        }}
        onShowToast={showToast}
      />

      <DispatchModal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        onShowToast={showToast}
      />

      <StockModal
        isOpen={isStockModalOpen}
        onClose={() => {
          setIsStockModalOpen(false);
          setIsAddingNewStock(false);
        }}
        product={selectedStockProduct}
        isAddingNew={isAddingNewStock}
        onStockUpdated={() => {
          fetchStock();
          fetchInvoices();
        }}
        onShowToast={showToast}
        onOpenSync={handleOpenStockSync}
      />

      <StockSyncModal
        isOpen={isStockSyncModalOpen}
        onClose={() => setIsStockSyncModalOpen(false)}
        products={products}
        onStockUpdated={() => {
          fetchStock();
          fetchInvoices();
        }}
        onShowToast={showToast}
        initialTab={stockSyncInitialTab}
      />

      <PickingModal
        isOpen={isPickingModalOpen}
        onClose={() => setIsPickingModalOpen(false)}
        liveId={selectedLiveId}
      />

      <PackerModal
        isOpen={isPackerModalOpen}
        onClose={() => setIsPackerModalOpen(false)}
        mode={packerModalMode}
        packerName={packerName}
        onChangePackerName={handleChangePackerName}
      />

      <FacebookAuthModal
        isOpen={isFbModalOpen}
        onClose={() => setIsFbModalOpen(false)}
        activePage={activePage}
        onPageSelected={setActivePage}
        activeLiveId={selectedLiveId}
        onSelectLiveId={id => {
          handleSelectLiveSession(id);
        }}
        onSyncSuccess={(targetLiveId, _orders, baskets) => {
          handleSelectLiveSession(targetLiveId);
          fetchLiveSessions();
          fetchStock();
          if (baskets > 0) {
            setIsFbModalOpen(false);
          }
        }}
        onShowToast={showToast}
      />

      <ImageZoomModal
        isOpen={isZoomModalOpen}
        onClose={() => setIsZoomModalOpen(false)}
        code={zoomCode}
        name={zoomName}
        imageUrl={zoomImageUrl}
        price={zoomPrice}
        stockQty={zoomStockQty}
        onPhotoUploaded={() => {
          fetchStock();
          fetchInvoices();
        }}
        onShowToast={showToast}
      />

      <ReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        invoice={receiptInvoice}
        myPackerName={packerName}
        onShowToast={showToast}
        onStagePackSuccess={() => {
          fetchInvoices();
          fetchPackerStats();
        }}
      />
    </div>
  );
}
