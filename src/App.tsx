import { useState, useEffect, useRef, useMemo, useCallback, CSSProperties } from 'react';
import {
  Invoice,
  OrderItem,
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
import { FullStockManagerModal } from './components/Modals/FullStockManagerModal';
import { SystemSettingsModal } from './components/Modals/SystemSettingsModal';
import { PickingModal } from './components/Modals/PickingModal';
import { PackerModal } from './components/Modals/PackerModal';
import { FacebookAuthModal } from './components/Modals/FacebookAuthModal';
import { ImageZoomModal } from './components/Modals/ImageZoomModal';
import { ReceiptModal } from './components/Modals/ReceiptModal';
import { VipInvoiceModal } from './components/Modals/VipInvoiceModal';
import { KHQRModal } from './components/Modals/KHQRModal';
import { DatabaseModal } from './components/Modals/DatabaseModal';
import { ManageLiveSessionsModal } from './components/Modals/ManageLiveSessionsModal';
import { RequirePackerNameModal } from './components/Modals/RequirePackerNameModal';
import { CreateLiveSessionModal } from './components/Modals/CreateLiveSessionModal';
import { BacklogModal } from './components/Modals/BacklogModal';
import { FastCheckSlipsModal } from './components/Modals/FastCheckSlipsModal';
import { ChatbotModal } from './components/Modals/ChatbotModal';
import { CustomerOrderPortal } from './components/CustomerOrderPortal';
import { AdminPinModal } from './components/Modals/AdminPinModal';
import { CameraScannerModal, parseScannedText } from './components/Modals/CameraScannerModal';
import { NoBasketUsersModal } from './components/Modals/NoBasketUsersModal';
import { playSuccessFanfare, playWarningBuzzer, playPureTone, playCollisionAlert, triggerHapticAlert } from './utils/audio';

export default function App() {
  // Check if current user is viewing as a customer via public link
  const [publicOrderId, setPublicOrderId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('order') || params.get('invoice') || params.get('id') || params.get('bill') || params.get('track');
    }
    return null;
  });

  // Application Data States
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [liveSessions, setLiveSessions] = useState<{
    live_id: string;
    created_at: string;
    basket_count?: number;
    product_count?: number;
    unsold_product_count?: number;
    is_active?: boolean;
  }[]>([]);
  const [selectedLiveId, setSelectedLiveId] = useState<string>(() => {
    return localStorage.getItem('selectedLiveId') || '1626350178950100';
  });
  const selectedLiveIdRef = useRef<string>(selectedLiveId);
  useEffect(() => {
    selectedLiveIdRef.current = selectedLiveId;
  }, [selectedLiveId]);
  const [activePage, setActivePage] = useState<FacebookPage | null>(null);
  const [currentRevision, setCurrentRevision] = useState<number>(0);
  const currentRevisionRef = useRef<number>(0);
  const pendingMutationsRef = useRef<Map<number, {
    timestamp: number;
    minRevision?: number;
    items?: OrderItem[];
    unmatched_comments?: string[];
    total_amount?: number;
    location_zone?: 'PP' | 'PROVINCE';
    shipping_fee?: number;
  }>>(new Map());
  const isFetchingInvoicesRef = useRef<boolean>(false);
  const fetchRequestIdRef = useRef<number>(0);
  const networkFailureCountRef = useRef<number>(0);
  const [networkOnline, setNetworkOnline] = useState<boolean>(true);

  // Workflow & UI Filters
  const [currentMasterStage, setCurrentMasterStage] = useState<number>(1); // 1: Unpicked, 2: Staged, 3: Paid/QC, 4: Dispatched
  const [activeSubFilter, setActiveSubFilter] = useState<'ALL' | 'AMOUNT_DESC' | 'PP' | 'PROVINCE' | 'EMPTY' | 'DELAYED_FIRST'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [displayedLimit, setDisplayedLimit] = useState<number>(25);

  // User / Packer Settings & Role (Admin vs Staff)
  const [userRole, setUserRole] = useState<'admin' | 'staff'>(() => {
    return (localStorage.getItem('userRole') as 'admin' | 'staff') || 'staff';
  });
  const [isAdminPinModalOpen, setIsAdminPinModalOpen] = useState<boolean>(false);
  const [pendingAdminAction, setPendingAdminAction] = useState<(() => void) | null>(null);
  const [adminPinModalDesc, setAdminPinModalDesc] = useState<string>('មុខងារនេះតម្រូវឱ្យមានការអនុញ្ញាតពីម្ចាស់ហាង (Admin Only)');

  const [packerName, setPackerName] = useState<string>(() => localStorage.getItem('packerName') || '');
  const [isRequirePackerModalOpen, setIsRequirePackerModalOpen] = useState<boolean>(() => !localStorage.getItem('packerName'));
  const [fontScale, setFontScale] = useState<number>(() => parseFloat(localStorage.getItem('fontScale') || '1'));
  const [khmerFont, setKhmerFont] = useState<string>(() => localStorage.getItem('khmerFont') || 'kantumruy');

  // Ensure pure dark mode and remove any residual theme attributes
  useEffect(() => {
    try {
      localStorage.removeItem('theme');
      document.documentElement.removeAttribute('data-theme');
      document.body.removeAttribute('data-theme');
      document.documentElement.classList.remove('light-theme');
      document.documentElement.classList.remove('light');
    } catch {}
  }, []);

  // 🔒 Smart Filter: Hide Busy Baskets (Baskets currently locked by other packers)
  const [hideBusyBaskets, setHideBusyBaskets] = useState<boolean>(() => {
    return localStorage.getItem('hideBusyBaskets') === 'true';
  });

  const handleToggleHideBusyBaskets = () => {
    setHideBusyBaskets(prev => {
      const next = !prev;
      localStorage.setItem('hideBusyBaskets', String(next));
      playPureTone(next ? 820 : 600, 0.04);
      showToast(next ? '👁️ បានលាក់កន្ត្រកដែលអ្នកដទៃកំពុងរើស' : '👥 បានបង្ហាញកន្ត្រកទាំងអស់');
      return next;
    });
  };

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const toastTimeoutRef = useRef<any>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  }, []);

  // ⚡ Last Pinged Customer State (Direct Meta Business Suite Link)
  const [lastPingedCustomer, setLastPingedCustomer] = useState<{
    basket_no: string | number;
    customer_name: string;
    meta_inbox_url?: string;
    delivery_method?: string;
    timestamp: number;
  } | null>(null);

  useEffect(() => {
    if (!lastPingedCustomer) return;
    const t = setTimeout(() => {
      setLastPingedCustomer(null);
    }, 20000);
    return () => clearTimeout(t);
  }, [lastPingedCustomer]);

  const [checkedState, setCheckedState] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('checkedItemsState') || '{}');
    } catch {
      return {};
    }
  });

  useEffect(() => {
    document.body.setAttribute('data-khmer-font', khmerFont);
  }, [khmerFont]);

  // ⚡ Handle QR-Scanned Instant Basket Verification with Security Guard
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const scanBasket = params.get('open_basket') || params.get('basket') || params.get('verify') || params.get('staff_basket');
    const scanLive = params.get('live');

    if (scanBasket) {
      const cleanBasket = scanBasket.trim().replace(/^#/, '');

      // 🔒 SECURITY CHECK: If this is an external customer device (not authenticated shop staff),
      // safely redirect them directly to the Read-Only Customer Order Portal!
      const isStaffDevice = Boolean(localStorage.getItem('isStaffDevice') || localStorage.getItem('userRole') || localStorage.getItem('packerName'));
      if (!isStaffDevice) {
        setPublicOrderId(cleanBasket);
        return;
      }

      setSearchQuery(cleanBasket);
      setActiveSubFilter('ALL');

      // Call API to locate the exact stage and live session of this basket
      fetch(`/api/find_basket?basket=${encodeURIComponent(cleanBasket)}${scanLive ? `&live=${encodeURIComponent(scanLive)}` : ''}`)
        .then(r => r.json())
        .then(data => {
          if (data.success && data.found) {
            let stageNum = 1;
            if (typeof data.stage === 'number') {
              stageNum = data.stage;
            } else if (data.stage === 'WAITING_PAYMENT' || data.stage === 'STAGED' || data.stage_code === 'WAITING_PAYMENT') {
              stageNum = 2;
            } else if (data.stage === 'QC_VERIFY' || data.stage === 'PAID' || data.stage_code === 'QC_VERIFY') {
              stageNum = 3;
            } else if (data.stage === 'DISPATCHED' || data.stage_code === 'DISPATCHED') {
              stageNum = 4;
            }

            const targetLive = data.live_id || scanLive;
            if (targetLive && targetLive !== selectedLiveIdRef.current) {
              selectedLiveIdRef.current = targetLive;
              setSelectedLiveId(targetLive);
              localStorage.setItem('selectedLiveId', targetLive);
              setCurrentRevision(0);
              currentRevisionRef.current = 0;
              if (data.invoice) {
                setInvoices([data.invoice]);
              }
              setCurrentMasterStage(stageNum);
              setActiveSubFilter('ALL');
              fetchInvoices(targetLive, 0);
              fetchStock(targetLive);
              fetchBacklogCount(targetLive);
            } else {
              if (data.invoice) {
                handleUpdateInvoice(data.invoice);
              }
              setCurrentMasterStage(stageNum);
              setActiveSubFilter('ALL');
            }
            playSuccessFanfare();
            showToast(`⚡ រកឃើញកន្ត្រក #${cleanBasket} ក្នុងផ្នែក «${data.stage_name || 'ត្រួតពិនិត្យ'}»!`, 'success');
          } else {
            playSuccessFanfare();
            showToast(`⚡ ស្កេនកន្ត្រក #${cleanBasket}`, 'success');
          }
        })
        .catch(() => {
          playSuccessFanfare();
          showToast(`⚡ ស្កេនកន្ត្រក #${cleanBasket}`, 'success');
        });

      // Clean URL parameter without reloading page
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [showToast, selectedLiveId]);

  useEffect(() => {
    const validScale = Number.isFinite(fontScale) && fontScale >= 0.7 && fontScale <= 1.8 ? fontScale : 1;
    document.documentElement.style.fontSize = `${validScale * 100}%`;
    document.documentElement.style.setProperty('--font-scale', String(validScale));
  }, [fontScale]);

  // Modals visibility
  const [isQCModalOpen, setIsQCModalOpen] = useState(false);
  const [qcInvoice, setQcInvoice] = useState<Invoice | null>(null);

  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [dispatchedCount, setDispatchedCount] = useState<number>(0);

  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isFullStockManagerOpen, setIsFullStockManagerOpen] = useState(false);
  const [isSystemSettingsOpen, setIsSystemSettingsOpen] = useState(false);
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
  const [isDatabaseModalOpen, setIsDatabaseModalOpen] = useState(false);
  const [isManageLiveModalOpen, setIsManageLiveModalOpen] = useState(false);
  const [isCreateLiveModalOpen, setIsCreateLiveModalOpen] = useState(false);
  const [isCommentStreamOpen, setIsCommentStreamOpen] = useState(false);
  const [isNoBasketModalOpen, setIsNoBasketModalOpen] = useState(false);

  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);
  const [zoomCode, setZoomCode] = useState('');
  const [zoomName, setZoomName] = useState('');
  const [zoomImageUrl, setZoomImageUrl] = useState<string | undefined>(undefined);
  const [zoomPrice, setZoomPrice] = useState<number | undefined>(undefined);
  const [zoomStockQty, setZoomStockQty] = useState<number | undefined>(undefined);
  const [zoomItems, setZoomItems] = useState<{ code: string; name: string; imageUrl?: string; price?: number; stockQty?: number; quantity?: number; comment?: string; isChecked?: boolean }[]>([]);
  const [zoomInitialIndex, setZoomInitialIndex] = useState<number>(0);
  const [zoomInvoiceId, setZoomInvoiceId] = useState<number | undefined>(undefined);

  // 📷 In-App Camera Scanner State
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [crossLiveMatch, setCrossLiveMatch] = useState<{
    live_id: string;
    live_title?: string;
    stage_num: number;
    stage_name: string;
    basket_no: string | number;
    customer_name: string;
    invoice: Invoice;
  } | null>(null);

  // Cross-Live Backlog Alert & Modal State
  const [isBacklogModalOpen, setIsBacklogModalOpen] = useState(false);
  const [backlogCount, setBacklogCount] = useState(0);
  const [backlogRefreshTrigger, setBacklogRefreshTrigger] = useState(0);

  // All Live QC & Fast Check States
  const [isAllLiveQc, setIsAllLiveQc] = useState(false);
  const [allLivePaidInvoices, setAllLivePaidInvoices] = useState<Invoice[]>([]);
  const [allLivePaidCount, setAllLivePaidCount] = useState(0);
  const [isFastCheckModalOpen, setIsFastCheckModalOpen] = useState(false);
  const [isChatbotModalOpen, setIsChatbotModalOpen] = useState(false);

  // All Live Dispatched States & Daily Output Metrics
  const [isAllLiveDispatched, setIsAllLiveDispatched] = useState(false);
  const [allLiveDispatchedInvoices, setAllLiveDispatchedInvoices] = useState<Invoice[]>([]);
  const [allLiveDispatchedStats, setAllLiveDispatchedStats] = useState({
    total: 0,
    today: 0,
    pp: 0,
    province: 0,
    today_pp: 0,
    today_province: 0
  });
  const [dispatchedTimeFilter, setDispatchedTimeFilter] = useState<'ALL' | 'TODAY' | 'PP' | 'PROVINCE'>('ALL');

  const fetchAllLivePaidInvoices = async () => {
    try {
      const res = await fetch(`/api/qc_all_lives?t=${Date.now()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setAllLivePaidInvoices(json.invoices || []);
          setAllLivePaidCount(json.total_count || 0);
        }
      }
    } catch {
      // silently ignore
    }
  };

  const fetchAllLiveDispatchedInvoices = async () => {
    try {
      const res = await fetch(`/api/dispatched_all_lives?t=${Date.now()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setAllLiveDispatchedInvoices(json.invoices || []);
          setAllLiveDispatchedStats({
            total: json.total_count || 0,
            today: json.today_count || 0,
            pp: json.pp_count || 0,
            province: json.province_count || 0,
            today_pp: json.today_pp_count || 0,
            today_province: json.today_province_count || 0
          });
        }
      }
    } catch {
      // silently ignore
    }
  };

  const fetchBacklogCount = async (targetLiveId?: string) => {
    try {
      const lid = targetLiveId !== undefined ? targetLiveId : selectedLiveId;
      const res = await fetch(`/api/backlog_invoices?current_live_id=${encodeURIComponent(lid)}&t=${Date.now()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setBacklogCount(json.total_backlog || 0);
        }
      }
    } catch (e) {
      // silently ignore
    }
  };

  const handleUndispatch = useCallback(async (inv: Invoice) => {
    try {
      const res = await fetch('/api/undispatch_pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: inv.invoice_id })
      });
      const data = await res.json();
      if (data.success) {
        playSuccessFanfare();
        showToast(`✅ បានត្រឡប់កន្ត្រក #${inv.basket_no || inv.invoice_id} មកផ្ទាំង QC វិញ!`);
        fetchInvoices();
        fetchBacklogCount();
        fetchAllLiveDispatchedInvoices();
      } else {
        playWarningBuzzer();
        showToast(`❌ មិនអាចត្រឡប់បានទេ ៖ ${data.error || data.message}`, 'error');
      }
    } catch (e) {
      showToast('⚠️ បរាជ័យក្នុងការតភ្ជាប់បណ្តាញ!', 'error');
    }
  }, [showToast]);

  const handleOpenQCModal = useCallback((i: Invoice) => {
    setQcInvoice(i);
    setIsQCModalOpen(true);
  }, []);

  const handleOpenZoomModal = useCallback((
    c: string,
    n: string,
    img?: string,
    pr?: number,
    sq?: number,
    items?: { code: string; name: string; imageUrl?: string; price?: number; stockQty?: number; quantity?: number; comment?: string; isChecked?: boolean }[],
    index?: number,
    invoiceId?: number
  ) => {
    setZoomCode(c);
    setZoomName(n);
    setZoomImageUrl(img);
    setZoomPrice(pr);
    setZoomStockQty(sq);
    setZoomItems(items || [{ code: c, name: n, imageUrl: img, price: pr, stockQty: sq, quantity: 1 }]);
    setZoomInitialIndex(index !== undefined ? index : 0);
    setZoomInvoiceId(invoiceId);
    setIsZoomModalOpen(true);
  }, []);

  const handleDataChanged = useCallback(() => {
    fetchInvoices();
    fetchStock();
  }, []);

  // Receipt Modal State
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptInvoice, setReceiptInvoice] = useState<Invoice | null>(null);

  const handleOpenReceiptModal = useCallback((inv: Invoice) => {
    setReceiptInvoice(inv);
    setIsReceiptModalOpen(true);
  }, []);

  // VIP Invoice Modal State
  const [isVipModalOpen, setIsVipModalOpen] = useState(false);
  const [vipInvoice, setVipInvoice] = useState<Invoice | null>(null);

  const handleOpenVipModal = useCallback((inv: Invoice) => {
    setVipInvoice(inv);
    setIsVipModalOpen(true);
  }, []);

  // Bakong Dynamic KHQR Modal State
  const [isKHQRModalOpen, setIsKHQRModalOpen] = useState(false);
  const [khqrInvoice, setKhqrInvoice] = useState<Invoice | null>(null);

  const handleOpenKHQRModal = useCallback((inv?: Invoice) => {
    setKhqrInvoice(inv || null);
    setIsKHQRModalOpen(true);
  }, []);

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
    const next = Math.round(Math.max(0.75, Math.min(1.6, fontScale + delta)) * 100) / 100;
    setFontScale(next);
    localStorage.setItem('fontScale', String(next));
    playPureTone(Math.round(450 + next * 300), 0.04);
    showToast(`🔎 ទំហំអក្សរ (Font Size)៖ ${Math.round(next * 100)}%`);
  };

  const handleResetFontSize = () => {
    setFontScale(1);
    localStorage.setItem('fontScale', '1');
    playPureTone(600, 0.05);
    showToast('🔄 បានកំណត់ទំហំអក្សរដើម 100% វិញ');
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

  const handleChangePackerName = (newName: string, role: 'admin' | 'staff' = 'staff') => {
    setPackerName(newName);
    localStorage.setItem('packerName', newName);
    setUserRole(role);
    localStorage.setItem('userRole', role);
    showToast(role === 'admin' ? `👑 ចូលជា Admin៖ ${newName}` : `👤 ប្តូរឈ្មោះអ្នកច្រក៖ ${newName}`);
  };

  const handleRequestAdminAccess = (action?: () => void, customDesc?: string) => {
    if (userRole === 'admin') {
      if (action) action();
      return;
    }
    setPendingAdminAction(() => action || null);
    if (customDesc) setAdminPinModalDesc(customDesc);
    else setAdminPinModalDesc('មុខងារនេះតម្រូវឱ្យមានការអនុញ្ញាតពីម្ចាស់ហាង (Admin Only)');
    setIsAdminPinModalOpen(true);
  };

  const handleAdminPinSuccess = () => {
    setUserRole('admin');
    localStorage.setItem('userRole', 'admin');
    showToast('👑 បានផ្ទៀងផ្ទាត់ Admin Mode ជោគជ័យ!', 'success');
    if (pendingAdminAction) {
      pendingAdminAction();
      setPendingAdminAction(null);
    }
  };

  const handleLockAdmin = () => {
    setUserRole('staff');
    localStorage.setItem('userRole', 'staff');
    playPureTone(450, 0.08);
    showToast('🔒 បានចាក់សោរ & ប្តូរមកជា Staff Mode!');
  };

  const handleToggleItemCheck = useCallback((invId: number, code: string) => {
    const key = `${invId}_${code}`;
    setCheckedState(prev => {
      const next = { ...prev, [key]: !prev[key] };
      playPureTone(next[key] ? 880 : 440, 0.05);
      localStorage.setItem('checkedItemsState', JSON.stringify(next));
      return next;
    });
  }, []);

  // Immediate Optimistic Update for 0ms Smoothness (No Lag)
  const handleOptimisticItemUpdate = useCallback((invoiceId: number, code: string, targetQty: number) => {
    setInvoices(prev => {
      const inv = prev.find(i => i.invoice_id === invoiceId);
      if (!inv) return prev;
      const cleanCode = code.toUpperCase();
      let updatedItems = [...(inv.items || [])];
      const idx = updatedItems.findIndex(it => it.product_code.toUpperCase() === cleanCode);
      if (idx !== -1) {
        if (targetQty <= 0) {
          updatedItems.splice(idx, 1);
        } else {
          updatedItems[idx] = { ...updatedItems[idx], quantity: targetQty };
        }
      }
      const subtotal = updatedItems.reduce((s, it) => s + (it.price * it.quantity), 0);
      const ship = inv.is_free_ship ? 0 : (inv.shipping_fee || (inv.location_zone === 'PROVINCE' ? 2.0 : 1.25));
      const total = subtotal + ship;

      pendingMutationsRef.current.set(invoiceId, {
        timestamp: Date.now(),
        minRevision: currentRevisionRef.current + 1,
        items: updatedItems,
        total_amount: total
      });

      return prev.map(item => item.invoice_id === invoiceId ? {
        ...item,
        items: updatedItems,
        total_amount: total,
        updated_at: new Date().toISOString()
      } : item);
    });
  }, []);

  // Immediate Optimistic Item Code / Price / Qty Editing for 0ms Smoothness
  const handleOptimisticEditItem = useCallback((
    invoiceId: number,
    oldCode: string,
    newCode: string,
    newQty?: number,
    newPrice?: number,
    newImage?: string,
    newName?: string
  ) => {
    const cleanOld = oldCode.toUpperCase().trim();
    const cleanNew = newCode.toUpperCase().trim();

    // Preserve checked state if code changes
    if (cleanOld !== cleanNew) {
      setCheckedState(prev => {
        const oldKey = `${invoiceId}_${cleanOld}`;
        if (prev[oldKey]) {
          const next = { ...prev, [`${invoiceId}_${cleanNew}`]: true };
          delete next[oldKey];
          localStorage.setItem('checkedItemsState', JSON.stringify(next));
          return next;
        }
        return prev;
      });
    }

    setInvoices(prev => {
      const inv = prev.find(i => i.invoice_id === invoiceId);
      if (!inv) return prev;
      let updatedItems = [...(inv.items || [])];
      const idx = updatedItems.findIndex(it => it.product_code.toUpperCase() === cleanOld);
      if (idx !== -1) {
        const item = updatedItems[idx];
        const qty = newQty !== undefined && newQty > 0 ? newQty : item.quantity;
        const price = newPrice !== undefined ? newPrice : item.price;
        updatedItems[idx] = {
          ...item,
          product_code: cleanNew,
          product_name: newName || (cleanOld === cleanNew ? item.product_name : `កូដ [${cleanNew}]`),
          quantity: qty,
          price: price,
          image_file: newImage !== undefined ? newImage : item.image_file
        };
      }
      const subtotal = updatedItems.reduce((s, it) => s + (it.price * it.quantity), 0);
      const ship = inv.is_free_ship ? 0 : (inv.shipping_fee || (inv.location_zone === 'PROVINCE' ? 2.0 : 1.25));
      const total = subtotal + ship;

      pendingMutationsRef.current.set(invoiceId, {
        timestamp: Date.now(),
        minRevision: currentRevisionRef.current + 1,
        items: updatedItems,
        total_amount: total
      });

      return prev.map(item => item.invoice_id === invoiceId ? {
        ...item,
        items: updatedItems,
        total_amount: total,
        updated_at: new Date().toISOString()
      } : item);
    });
  }, []);

  // Immediate Optimistic Zone Update for Silky-Smooth 0ms Switching
  const handleOptimisticZoneUpdate = useCallback((
    invoiceId: number,
    newZone: 'PP' | 'PROVINCE',
    serverTotal?: number,
    serverShipping?: number
  ) => {
    setInvoices(prev => {
      const inv = prev.find(i => i.invoice_id === invoiceId);
      if (!inv) return prev;
      const shipping = serverShipping !== undefined ? serverShipping : (inv.shipping_fee || (newZone === 'PP' ? 1.25 : 2.0));
      const subtotal = (inv.items || []).reduce((s, it) => s + (it.price * it.quantity), 0);
      const total = serverTotal !== undefined ? serverTotal : (subtotal + shipping);

      pendingMutationsRef.current.set(invoiceId, {
        timestamp: Date.now(),
        location_zone: newZone,
        shipping_fee: shipping,
        total_amount: total
      });

      return prev.map(item => item.invoice_id === invoiceId ? {
        ...item,
        location_zone: newZone,
        location_label: newZone === 'PP' ? '🏙️ ភ្នំពេញ' : '🏞️ តាមខេត្ត',
        shipping_fee: shipping,
        total_amount: total,
        updated_at: new Date().toISOString()
      } : item);
    });
  }, []);

  // Optimistic Add Item from comment or manual (0ms instant response, rock-solid lock)
  const handleOptimisticAddItem = useCallback((
    invoiceId: number,
    code: string,
    qty: number,
    commentText?: string,
    price?: number,
    imageFile?: string,
    productName?: string
  ) => {
    setInvoices(prev => {
      const inv = prev.find(i => i.invoice_id === invoiceId);
      if (!inv) return prev;
      const cleanCode = code.toUpperCase();
      let updatedItems = [...(inv.items || [])];
      const existingIdx = updatedItems.findIndex(it => it.product_code.toUpperCase() === cleanCode);
      const itemPrice = price !== undefined ? price : 5.0;

      if (existingIdx !== -1) {
        updatedItems[existingIdx] = {
          ...updatedItems[existingIdx],
          quantity: updatedItems[existingIdx].quantity + qty,
          image_file: imageFile || updatedItems[existingIdx].image_file
        };
      } else {
        updatedItems.push({
          id: Date.now(),
          invoice_id: invoiceId,
          product_code: cleanCode,
          product_name: productName || cleanCode,
          quantity: qty,
          price: itemPrice,
          is_packed: false,
          item_comment: commentText,
          image_file: imageFile || ''
        });
      }

      let updatedUnmatched = inv.unmatched_comments;
      if (commentText && updatedUnmatched) {
        const cleanComment = commentText.trim();
        updatedUnmatched = updatedUnmatched.filter(c => c.trim() !== cleanComment);
      }

      const subtotal = updatedItems.reduce((s, it) => s + (it.price * it.quantity), 0);
      const ship = inv.is_free_ship ? 0 : (inv.shipping_fee || (inv.location_zone === 'PROVINCE' ? 2.0 : 1.25));
      const totalAmount = subtotal + ship;

      // Lock optimistic state for this invoice so background polls cannot overwrite it!
      pendingMutationsRef.current.set(invoiceId, {
        timestamp: Date.now(),
        minRevision: currentRevisionRef.current + 1,
        items: updatedItems,
        unmatched_comments: updatedUnmatched,
        total_amount: totalAmount
      });

      return prev.map(item => item.invoice_id === invoiceId ? {
        ...item,
        items: updatedItems,
        unmatched_comments: updatedUnmatched,
        total_amount: totalAmount,
        updated_at: new Date().toISOString()
      } : item);
    });
  }, []);

  // Sync single updated invoice directly without full refetch & update server revision
  const handleUpdateInvoice = useCallback((updatedInv: Invoice, serverRev?: number) => {
    const rev = typeof serverRev === 'number' ? serverRev : currentRevisionRef.current;
    if (rev > currentRevisionRef.current) {
      currentRevisionRef.current = rev;
      setCurrentRevision(rev);
    }

    // Keep pending lock for 3000ms grace period so in-flight polls CANNOT overwrite it!
    pendingMutationsRef.current.set(updatedInv.invoice_id, {
      timestamp: Date.now(),
      minRevision: rev,
      items: updatedInv.items,
      unmatched_comments: updatedInv.unmatched_comments,
      total_amount: updatedInv.total_amount,
      location_zone: updatedInv.location_zone,
      shipping_fee: updatedInv.shipping_fee
    });

    setInvoices(prev => {
      const idx = prev.findIndex(inv => inv.invoice_id === updatedInv.invoice_id);
      if (idx === -1) return [updatedInv, ...prev];
      const copy = [...prev];
      copy[idx] = updatedInv;
      return copy;
    });
  }, []);

  // Immediate 0ms Optimistic Stage Transition (Zero-Lag Stage Transition with Race Revert Guard)
  const handleOptimisticStageTransition = useCallback(async (
    invoiceId: number,
    targetStage: 'STAGED' | 'PAID' | 'DISPATCHED' | 'UNPICKED',
    options?: {
      payment_method?: string;
      customSuccessMsg?: string;
    }
  ): Promise<boolean> => {
    let previousInv: Invoice | undefined;
    let targetInvState: Partial<Invoice> = {};

    setInvoices(prev => {
      const existing = prev.find(i => i.invoice_id === invoiceId);
      if (!existing) return prev;
      previousInv = { ...existing };

      const nowIso = new Date().toISOString();
      if (targetStage === 'STAGED') {
        targetInvState = {
          packing_stage: 'STAGED',
          staged_by: packerName,
          staged_at: nowIso,
          is_locked: false,
          locked_by: undefined
        };
      } else if (targetStage === 'PAID') {
        targetInvState = {
          status: 'Paid',
          payment_status: 'Paid',
          paid_by: packerName,
          paid_at: nowIso,
          payment_method: options?.payment_method || existing.payment_method || 'ABA/Bakong',
          packing_stage: existing.packing_stage === 'UNPICKED' ? 'STAGED' : existing.packing_stage,
          is_locked: false,
          locked_by: undefined
        };
      } else if (targetStage === 'DISPATCHED') {
        targetInvState = {
          packing_stage: 'DISPATCHED',
          status: 'Dispatched',
          dispatched_at: nowIso,
          dispatched_by: packerName,
          is_locked: false,
          locked_by: undefined
        };
      } else if (targetStage === 'UNPICKED') {
        targetInvState = {
          packing_stage: 'UNPICKED',
          status: 'Pending',
          payment_status: 'Unpaid',
          is_locked: false,
          locked_by: undefined
        };
      }

      // Lock optimistic state for 3500ms so background polls CANNOT overwrite or resurrect the basket back to old stage!
      pendingMutationsRef.current.set(invoiceId, {
        timestamp: Date.now(),
        minRevision: currentRevisionRef.current + 1,
        ...targetInvState
      });

      return prev.map(inv => inv.invoice_id === invoiceId ? {
        ...inv,
        ...targetInvState,
        updated_at: nowIso
      } : inv);
    });

    try {
      let endpoint = '';
      let body: any = { invoice_id: invoiceId, packer_name: packerName };

      if (targetStage === 'STAGED') {
        endpoint = '/api/stage_pack';
      } else if (targetStage === 'PAID') {
        endpoint = '/api/mark_invoice_paid';
        body.payment_method = options?.payment_method || 'ABA/Bakong';
      } else if (targetStage === 'DISPATCHED') {
        endpoint = '/api/dispatch_pack';
      } else if (targetStage === 'UNPICKED') {
        endpoint = '/api/mark_invoice_unpaid';
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (res.status === 409 || data.locked) {
        // Concurrency collision! Another packer already grabbed or packed this basket!
        playCollisionAlert();
        showToast(data.message || data.error || `⚠️ កន្ត្រក #${invoiceId} ត្រូវបានចាក់សោ ឬរើសដោយបុគ្គលិកផ្សេងរួចហើយ!`, 'error');
        // Revert optimistic mutation
        if (previousInv) {
          pendingMutationsRef.current.delete(invoiceId);
          setInvoices(prev => prev.map(inv => inv.invoice_id === invoiceId ? (data.invoice || previousInv!) : inv));
        }
        return false;
      }

      if (data.success) {
        if (data.revision && data.revision > currentRevisionRef.current) {
          currentRevisionRef.current = data.revision;
          setCurrentRevision(data.revision);
        }
        if (options?.customSuccessMsg) {
          showToast(options.customSuccessMsg, 'success');
        }
        return true;
      } else {
        throw new Error(data.message || data.error || 'Server error');
      }
    } catch (err: any) {
      if (err.message && err.message.includes('ចាក់សោ')) {
        return false;
      }
      playWarningBuzzer();
      showToast(err.message || '⚠️ មានបញ្ហាតភ្ជាប់បណ្តាញ!', 'error');
      // Revert if error
      if (previousInv) {
        pendingMutationsRef.current.delete(invoiceId);
        setInvoices(prev => prev.map(inv => inv.invoice_id === invoiceId ? previousInv! : inv));
      }
      return false;
    }
  }, [packerName, showToast]);

  // Data Fetching: Invoices with 0ms revision check, concurrency lock, and optimistic preservation
  const fetchInvoices = async (overrideLiveId?: string, overrideRev?: number) => {
    // Avoid piling parallel polls on slow networks
    if (isFetchingInvoicesRef.current && overrideLiveId === undefined && overrideRev === undefined) {
      return;
    }
    const reqId = ++fetchRequestIdRef.current;
    isFetchingInvoicesRef.current = true;

    try {
      const targetLive = overrideLiveId !== undefined ? overrideLiveId : selectedLiveIdRef.current;
      const targetRev = overrideRev !== undefined ? overrideRev : currentRevisionRef.current;
      const res = await fetch(`/api/invoices?live_id=${encodeURIComponent(targetLive)}&rev=${targetRev}&t=${Date.now()}`);
      if (!res.ok) {
        networkFailureCountRef.current += 1;
        if (networkFailureCountRef.current >= 3) {
          setNetworkOnline(false);
        }
        return;
      }
      networkFailureCountRef.current = 0;
      setNetworkOnline(true);
      const json = await res.json();

      // If a newer request was dispatched while this was in flight, discard stale response
      if (reqId !== fetchRequestIdRef.current) {
        return;
      }

      if (json && json.changed === false) {
        return; // No change
      }

      // CRITICAL: Drop any stale poll response that was generated before a client-side mutation!
      if (typeof json.revision === 'number' && json.revision < currentRevisionRef.current) {
        return;
      }

      // Guard: If response is for another session and user switched session, discard
      if (overrideLiveId === undefined && targetLive !== selectedLiveIdRef.current) {
        return;
      }

      if (json.data) {
        const now = Date.now();
        if (typeof json.revision === 'number' && json.revision > currentRevisionRef.current) {
          currentRevisionRef.current = json.revision;
          setCurrentRevision(json.revision);
        }

        setInvoices(prev => {
          return json.data.map((serverInv: Invoice) => {
            const pending = pendingMutationsRef.current.get(serverInv.invoice_id);
            if (pending) {
              if (now - pending.timestamp < 3000 || (pending.minRevision && json.revision && json.revision < pending.minRevision)) {
                // An optimistic mutation is in-flight: preserve user changes to prevent jumping/flicker
                const local = prev.find(p => p.invoice_id === serverInv.invoice_id);
                if (local) {
                  return {
                    ...serverInv,
                    items: pending.items || local.items,
                    unmatched_comments: pending.unmatched_comments !== undefined ? pending.unmatched_comments : local.unmatched_comments,
                    total_amount: pending.total_amount !== undefined ? pending.total_amount : local.total_amount,
                    location_zone: pending.location_zone || local.location_zone,
                    shipping_fee: pending.shipping_fee !== undefined ? pending.shipping_fee : local.shipping_fee,
                    packing_stage: pending.packing_stage !== undefined ? pending.packing_stage : local.packing_stage,
                    status: pending.status !== undefined ? pending.status : local.status,
                    payment_status: pending.payment_status !== undefined ? pending.payment_status : (local as any).payment_status,
                    paid_at: pending.paid_at !== undefined ? pending.paid_at : local.paid_at,
                    paid_by: pending.paid_by !== undefined ? pending.paid_by : local.paid_by,
                    dispatched_at: pending.dispatched_at !== undefined ? pending.dispatched_at : (local as any).dispatched_at,
                    dispatched_by: pending.dispatched_by !== undefined ? pending.dispatched_by : (local as any).dispatched_by
                  };
                }
              } else {
                pendingMutationsRef.current.delete(serverInv.invoice_id);
              }
            }
            return serverInv;
          });
        });
      }
    } catch (e) {
      networkFailureCountRef.current += 1;
      if (networkFailureCountRef.current >= 3) {
        setNetworkOnline(false);
      }
    } finally {
      isFetchingInvoicesRef.current = false;
    }
  };

  // Unsold products count for the active session (stock_qty > 0)
  const unsoldStockCount = useMemo(() => {
    return products.filter(p => (p.stock_qty ?? 0) > 0).length;
  }, [products]);

  // Data Fetching: Products and Stock (filtered strictly by liveId)
  const fetchStock = async (liveId?: string) => {
    try {
      const targetLive = liveId || selectedLiveIdRef.current;
      const url = targetLive ? `/api/obs_data?live_id=${encodeURIComponent(targetLive)}&t=${Date.now()}` : `/api/obs_data?t=${Date.now()}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        // Guard: only apply products if this response belongs to the currently active live session!
        if (json.products && (!targetLive || targetLive === selectedLiveIdRef.current)) {
          setProducts(json.products);
        }
      }
    } catch (e) {}
  };

  // Keep stock updated when switching session
  useEffect(() => {
    if (selectedLiveId) {
      fetchStock(selectedLiveId);
    }
  }, [selectedLiveId]);

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
          selectedLiveIdRef.current = chosenId;
          setSelectedLiveId(chosenId);
          localStorage.setItem('selectedLiveId', chosenId);
          fetchInvoices(chosenId, 0);
          fetchStock(chosenId);
        }
      }
    } catch (e) {}
  };

  const handleSelectLiveSession = (id: string) => {
    selectedLiveIdRef.current = id;
    setSelectedLiveId(id);
    localStorage.setItem('selectedLiveId', id);
    setCurrentRevision(0);
    currentRevisionRef.current = 0;
    setProducts([]); // Clear old session's products immediately
    fetchInvoices(id, 0);
    fetchStock(id);
    fetchBacklogCount(id);
    setLiveSessions(prev =>
      prev.map(s => ({
        ...s,
        is_active: s.live_id === id
      }))
    );
    fetch('/api/set_active_live_id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ live_id: id })
    })
      .then(() => fetchLiveSessions())
      .catch(() => {});
  };

  const handleCreateLiveSessionWithMode = async (options: {
    live_id?: string;
    mode: 'blank' | 'clone_unsold';
    source_live_id: string;
  }) => {
    try {
      const res = await fetch('/api/create_live_session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options)
      });
      const data = await res.json();
      if (data.success) {
        playSuccessFanfare();
        setSelectedLiveId(data.live_id);
        localStorage.setItem('selectedLiveId', data.live_id);
        setCurrentRevision(0);
        await fetchLiveSessions();
        await fetchInvoices(data.live_id, 0);
        await fetchStock(data.live_id);
        const modeMsg = options.mode === 'clone_unsold'
          ? `🎉 បានបង្កើត Live ថ្មី & ចម្លងទំនិញសល់ (${data.cloned_products_count || 0} មុខ) ដោយជោគជ័យ!`
          : `🎉 បានបង្កើត Live ថ្មីជាមួយស្តុកទទេស្រឡាង (ការពារជាន់កូដ 100%)!`;
        showToast(modeMsg);
        setIsCreateLiveModalOpen(false);
      } else {
        playWarningBuzzer();
        showToast(data.error || 'មិនអាចបង្កើត Live ថ្មីបានទេ', 'error');
        throw new Error(data.error);
      }
    } catch (e: any) {
      playWarningBuzzer();
      showToast(e.message || '⚠️ មិនអាចបង្កើត Live ថ្មីបានទេ', 'error');
      throw e;
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

  // 📷 In-App Camera Scanner Handler (Cross-Live Session Auto-Switch & Messenger Auto-Bump #1)
  const handleCameraScanSuccess = useCallback(async (scannedVal: string, scannedLiveId?: string) => {
    const cleanBasket = scannedVal.trim().replace(/^#/, '');
    setSearchQuery(cleanBasket);
    setActiveSubFilter('ALL');

    try {
      // Query server to find basket & stage across ALL live sessions + trigger auto_ping to Messenger
      const queryUrl = `/api/find_basket?basket=${encodeURIComponent(cleanBasket)}${scannedLiveId ? `&live=${encodeURIComponent(scannedLiveId)}` : ''}&auto_ping=1`;
      const res = await fetch(queryUrl);
      const data = await res.json();

      if (data.success && data.found) {
        let stageNum = 1;
        if (typeof data.stage === 'number') {
          stageNum = data.stage;
        } else if (data.stage === 'WAITING_PAYMENT' || data.stage === 'STAGED' || data.stage_code === 'WAITING_PAYMENT') {
          stageNum = 2;
        } else if (data.stage === 'QC_VERIFY' || data.stage === 'PAID' || data.stage_code === 'QC_VERIFY') {
          stageNum = 3;
        } else if (data.stage === 'DISPATCHED' || data.stage_code === 'DISPATCHED') {
          stageNum = 4;
        }

        const targetLive = data.live_id || scannedLiveId;

        // Auto-switch live session immediately if from another session
        if (targetLive && targetLive !== selectedLiveIdRef.current) {
          selectedLiveIdRef.current = targetLive;
          setSelectedLiveId(targetLive);
          localStorage.setItem('selectedLiveId', targetLive);
          setCurrentRevision(0);
          currentRevisionRef.current = 0;

          // Seed the invoice immediately into UI so it displays in 0ms!
          if (data.invoice) {
            setInvoices([data.invoice]);
          }

          setCurrentMasterStage(stageNum);
          setActiveSubFilter('ALL');

          // Fetch full data for the new live session in background
          fetchInvoices(targetLive, 0);
          fetchStock(targetLive);
          fetchBacklogCount(targetLive);
        } else {
          // Same live session: switch stage & update invoice immediately
          if (data.invoice) {
            handleUpdateInvoice(data.invoice);
          }
          setCurrentMasterStage(stageNum);
          setActiveSubFilter('ALL');
        }

        playSuccessFanfare();
        const liveLabel = targetLive ? ` (Live #${targetLive.replace('LIVE_', '')})` : '';

        // If Messenger Ping succeeded, notify staff that conversation is bumped to #1 in Meta Business Suite!
        if (data.ping_result && data.ping_result.pinged) {
          setLastPingedCustomer({
            basket_no: cleanBasket,
            customer_name: data.customer_name,
            meta_inbox_url: data.meta_inbox_url || data.ping_result.meta_inbox_url,
            delivery_method: data.ping_result.delivery_title || 'Messenger',
            timestamp: Date.now()
          });
          showToast(`⚡ ស្កេន #${cleanBasket}${liveLabel} ➔ បាន Ping ភ្ញៀវ (${data.customer_name}) លើ Messenger! (ឆាតលោតលើគេក្នុង Meta)`, 'success');
        } else {
          if (data.meta_inbox_url) {
            setLastPingedCustomer({
              basket_no: cleanBasket,
              customer_name: data.customer_name,
              meta_inbox_url: data.meta_inbox_url,
              delivery_method: 'Inbox Direct',
              timestamp: Date.now()
            });
          }
          showToast(`⚡ ស្កេនឃើញកន្ត្រក #${cleanBasket}${liveLabel} ក្នុងផ្នែក «${data.stage_name || 'ត្រួតពិនិត្យ'}»!`, 'success');
        }
      } else {
        playSuccessFanfare();
        showToast(`⚡ ស្កេនកន្ត្រក #${cleanBasket}`, 'success');
      }
    } catch {
      playSuccessFanfare();
      showToast(`⚡ ស្កេនកន្ត្រក #${cleanBasket}`, 'success');
    }
  }, [showToast, handleUpdateInvoice]);

  // ⚡ Manual Ping Messenger for an Invoice (Bumps conversation to #1 in Meta Business Suite)
  const handleManualScanPing = useCallback(async (inv: Invoice) => {
    try {
      showToast(`⏳ កំពុងផ្ញើសារ Ping ទៅកាន់ Messenger (${inv.facebook_name})...`);
      const res = await fetch('/api/scan_ping_messenger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: inv.invoice_id,
          basket_no: inv.basket_no,
          live_id: inv.live_id
        })
      });
      const data = await res.json();
      if (data.success && data.pinged) {
        playSuccessFanfare();
        showToast(`⚡ បាន Ping ទៅ Messenger ភ្ញៀវ (${inv.facebook_name}) រួចរាល់! ឆាតបានលោតឡើងលេខ ១ ក្នុង Meta Business Suite`, 'success');
        setLastPingedCustomer({
          basket_no: inv.basket_no || inv.invoice_id,
          customer_name: inv.facebook_name,
          meta_inbox_url: data.meta_inbox_url,
          delivery_method: data.delivery_title || 'Messenger',
          timestamp: Date.now()
        });
      } else {
        showToast(data.message || data.error || 'មិនទាន់អាចផ្ញើ Ping បានទេ', 'error');
      }
    } catch (err: any) {
      showToast('⚠️ មានបញ្ហាតភ្ជាប់', 'error');
    }
  }, [showToast]);

  // Initial loads and polling
  useEffect(() => {
    fetchInvoices();
    fetchStock();
    fetchLiveSessions();
    fetchPackerStats();
    fetchBacklogCount(selectedLiveIdRef.current);
    fetchAllLivePaidInvoices();
    fetchAllLiveDispatchedInvoices();

    // Initial Facebook status
    fetch('/api/fb/status')
      .then(r => r.json())
      .then(d => {
        if (d.activePage) setActivePage(d.activePage);
      })
      .catch(() => {});

    // ⚡ Real-Time Server-Sent Events (SSE) Stream (~50ms Instant Push)
    let eventSource: EventSource | null = null;
    let sseReconnectTimer: any = null;

    const connectSSE = () => {
      try {
        eventSource = new EventSource('/api/realtime_events');

        eventSource.addEventListener('basket:locked', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (data.revision && data.revision > currentRevisionRef.current) {
              currentRevisionRef.current = data.revision;
              setCurrentRevision(data.revision);
            }
            setInvoices(prev =>
              prev.map(inv =>
                inv.invoice_id === data.invoice_id
                  ? { ...inv, is_locked: true, locked_by: data.locked_by }
                  : inv
              )
            );
          } catch {}
        });

        eventSource.addEventListener('basket:unlocked', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (data.revision && data.revision > currentRevisionRef.current) {
              currentRevisionRef.current = data.revision;
              setCurrentRevision(data.revision);
            }
            setInvoices(prev =>
              prev.map(inv =>
                inv.invoice_id === data.invoice_id
                  ? { ...inv, is_locked: false, locked_by: undefined }
                  : inv
              )
            );
          } catch {}
        });

        eventSource.addEventListener('basket:stage_changed', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (data.revision && data.revision > currentRevisionRef.current) {
              currentRevisionRef.current = data.revision;
              setCurrentRevision(data.revision);
            }
            if (data.invoice) {
              handleUpdateInvoice(data.invoice, data.revision);
            } else if (data.invoice_id && data.stage) {
              setInvoices(prev =>
                prev.map(inv => {
                  if (inv.invoice_id !== data.invoice_id) return inv;
                  if (data.stage === 'STAGED') return { ...inv, packing_stage: 'STAGED', is_locked: false, locked_by: undefined };
                  if (data.stage === 'PAID') return { ...inv, status: 'Paid', payment_status: 'Paid', is_locked: false, locked_by: undefined };
                  if (data.stage === 'DISPATCHED') return { ...inv, packing_stage: 'DISPATCHED', status: 'Dispatched', is_locked: false, locked_by: undefined };
                  if (data.stage === 'UNPICKED') return { ...inv, packing_stage: 'UNPICKED', status: 'Pending', is_locked: false, locked_by: undefined };
                  return inv;
                })
              );
            }
          } catch {}
        });

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          clearTimeout(sseReconnectTimer);
          sseReconnectTimer = setTimeout(connectSSE, 3000);
        };
      } catch {}
    };

    connectSSE();

    // Smart adaptive polling: only poll when tab is active and visible
    const isVisible = () => typeof document === 'undefined' || !document.hidden;

    const invTimer = setInterval(() => {
      if (isVisible()) fetchInvoices();
    }, 15000);

    const stockTimer = setInterval(() => {
      if (isVisible()) fetchStock();
    }, 30000);

    const packerTimer = setInterval(() => {
      if (isVisible()) fetchPackerStats();
    }, 30000);

    const backlogTimer = setInterval(() => {
      if (isVisible()) fetchBacklogCount(selectedLiveIdRef.current);
    }, 30000);

    const allLiveQcTimer = setInterval(() => {
      if (isVisible()) fetchAllLivePaidInvoices();
    }, 30000);

    const allLiveDispatchedTimer = setInterval(() => {
      if (isVisible()) fetchAllLiveDispatchedInvoices();
    }, 30000);

    // Immediate refresh when tab becomes active again
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchInvoices();
        fetchStock();
        fetchBacklogCount(selectedLiveIdRef.current);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(sseReconnectTimer);
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      clearInterval(invTimer);
      clearInterval(stockTimer);
      clearInterval(packerTimer);
      clearInterval(backlogTimer);
      clearInterval(allLiveQcTimer);
      clearInterval(allLiveDispatchedTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [selectedLiveId, packerName]);

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
          const rawScanned = buffer.trim();
          const parsed = parseScannedText(rawScanned);

          // If scanned a basket QR URL, #ID, or numeric basket ID via barcode gun
          if (parsed && (rawScanned.includes('?') || rawScanned.startsWith('http') || rawScanned.startsWith('#') || /^\d+$/.test(rawScanned))) {
            showToast(`🔍 ស្កេនកន្ត្រក ៖ #${parsed.basket}`);
            handleCameraScanSuccess(parsed.basket, parsed.liveId);
            buffer = '';
            return;
          }

          // Otherwise handle product code check
          const scanned = rawScanned.toUpperCase();
          showToast(`🔍 ស្កេនឃើញកូដ ៖ [${scanned}]`);
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
          buffer = '';
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [invoices, handleCameraScanSuccess]);

  // Check if a basket is completely empty ($0.00 / 0 items)
  const isBasketEmpty = (inv: Invoice | null | undefined): boolean => {
    if (!inv) return false;
    // If no items array or empty array
    if (!inv.items || !Array.isArray(inv.items) || inv.items.length === 0) return true;
    // If total quantity of all items is 0
    const totalQty = inv.items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    if (totalQty <= 0) return true;
    // If all items have empty product codes or 0 quantity
    const validItems = inv.items.filter(it => it.product_code && it.product_code.trim() !== '' && (Number(it.quantity) || 0) > 0);
    if (validItems.length === 0) return true;
    return false;
  };

  // Bulk Clean All Empty Baskets
  const handleBulkCleanEmptyBaskets = async () => {
    const countToDelete = emptyBasketsCount;
    if (countToDelete === 0) {
      showToast('គ្មានកន្ត្រកទទេត្រូវសម្អាតឡើយ');
      return;
    }
    if (!window.confirm(`តើអ្នកពិតជាចង់លុបកន្ត្រកទទេទាំងអស់ (${countToDelete} កន្ត្រក) ចេញពីប្រព័ន្ធមែនទេ?`)) return;
    try {
      const res = await fetch('/api/clean_empty_baskets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ live_id: selectedLiveId })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'បានសម្អាតកន្ត្រកទទេជោគជ័យ');
        fetchInvoices(undefined, 0);
      } else {
        showToast(data.message || 'មិនអាចលុបបានទេ', 'error');
      }
    } catch {
      showToast('កំហុសក្នុងការសម្អាតកន្ត្រកទទេ', 'error');
    }
  };

  // Delete a single basket
  const handleDeleteBasket = async (invoiceId: number) => {
    if (!window.confirm(`តើអ្នកពិតជាចង់លុបកន្ត្រក #${invoiceId} នេះចេញពីប្រព័ន្ធមែនទេ?`)) return;
    try {
      const res = await fetch('/api/delete_basket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId, packer_name: packerName })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || `បានលុបកន្ត្រក #${invoiceId} រួចរាល់`);
        fetchInvoices(undefined, 0);
      } else {
        showToast(data.message || 'មិនអាចលុបបានទេ', 'error');
      }
    } catch {
      showToast('កំហុសក្នុងការលុបកន្ត្រក', 'error');
    }
  };

  // Counts for 3 Stage tabs
  const unpickedCount = invoices.filter(
    i => (i.packing_stage === 'UNPICKED' || !i.packing_stage) &&
         i.status !== 'Paid' &&
         i.payment_status !== 'Paid' &&
         !i.paid_at &&
         i.status !== 'Packed' &&
         i.status !== 'Dispatched' &&
         i.packing_stage !== 'DISPATCHED' &&
         i.status !== 'Cancelled' &&
         !isBasketEmpty(i)
  ).length;

  const emptyBasketsCount = invoices.filter(
    i => i.status !== 'Dispatched' &&
         i.status !== 'Packed' &&
         i.packing_stage !== 'DISPATCHED' &&
         i.status !== 'Paid' &&
         i.payment_status !== 'Paid' &&
         !i.paid_at &&
         i.status !== 'Cancelled' &&
         isBasketEmpty(i)
  ).length;

  const waitingCount = invoices.filter(
    i => i.packing_stage === 'STAGED' &&
         i.status !== 'Paid' &&
         i.payment_status !== 'Paid' &&
         !i.paid_at &&
         i.status !== 'Packed' &&
         i.status !== 'Dispatched' &&
         i.packing_stage !== 'DISPATCHED' &&
         i.status !== 'Cancelled' &&
         !isBasketEmpty(i)
  ).length;

  const paidQcCount = invoices.filter(
    i => (i.status === 'Paid' || i.payment_status === 'Paid' || Boolean(i.paid_at)) &&
         i.status !== 'Packed' &&
         i.status !== 'Dispatched' &&
         i.packing_stage !== 'DISPATCHED' &&
         i.status !== 'Cancelled'
  ).length;

  const totalDispatched = invoices.filter(i => i.status === 'Dispatched' || i.status === 'Packed' || i.packing_stage === 'DISPATCHED').length;
  useEffect(() => {
    setDispatchedCount(totalDispatched);
  }, [totalDispatched]);

  // Busy Baskets Count (baskets locked by other packers in active session)
  const busyBasketsCount = useMemo(() => {
    return invoices.filter(inv =>
      inv.is_locked &&
      inv.locked_by &&
      inv.locked_by.trim().toLowerCase() !== packerName.trim().toLowerCase() &&
      inv.status !== 'Dispatched' &&
      inv.status !== 'Cancelled'
    ).length;
  }, [invoices, packerName]);

  // Delayed payment orders from past live sessions waiting in QC
  const delayedPaidCount = useMemo(() => {
    if (!selectedLiveId) return 0;
    return allLivePaidInvoices.filter(i => i.live_id && i.live_id !== selectedLiveId).length;
  }, [allLivePaidInvoices, selectedLiveId]);

  const sourceInvoices =
    (currentMasterStage === 3 && isAllLiveQc)
      ? allLivePaidInvoices
      : (currentMasterStage === 4 && isAllLiveDispatched)
        ? allLiveDispatchedInvoices
        : invoices;

  // Filter invoices for display
  let filtered = sourceInvoices.filter(inv => {
    if (inv.status === 'Cancelled') return false;

    // 🔒 Smart Filter: Hide Busy Baskets (If enabled, hide baskets locked by other packers unless searching)
    if (hideBusyBaskets && !searchQuery.trim()) {
      const isLockedByOther =
        inv.is_locked &&
        inv.locked_by &&
        inv.locked_by.trim().toLowerCase() !== packerName.trim().toLowerCase();
      if (isLockedByOther) return false;
    }

    // 🗑️ Empty Filter (Applies when empty filter is active on either Stage 1 or Stage 2)
    if (activeSubFilter === 'EMPTY') {
      return inv.status !== 'Dispatched' &&
             inv.status !== 'Packed' &&
             inv.packing_stage !== 'DISPATCHED' &&
             inv.status !== 'Paid' &&
             inv.payment_status !== 'Paid' &&
             !inv.paid_at &&
             isBasketEmpty(inv);
    }

    if (currentMasterStage === 1) {
      const isStage1 = (inv.packing_stage === 'UNPICKED' || !inv.packing_stage) &&
                       inv.status !== 'Paid' &&
                       inv.payment_status !== 'Paid' &&
                       !inv.paid_at &&
                       inv.status !== 'Packed' &&
                       inv.status !== 'Dispatched' &&
                       inv.packing_stage !== 'DISPATCHED';
      if (!isStage1) return false;

      return !isBasketEmpty(inv);
    }
    if (currentMasterStage === 2) {
      const isStage2 = inv.packing_stage === 'STAGED' &&
                       inv.status !== 'Paid' &&
                       inv.payment_status !== 'Paid' &&
                       !inv.paid_at &&
                       inv.status !== 'Packed' &&
                       inv.status !== 'Dispatched' &&
                       inv.packing_stage !== 'DISPATCHED';
      if (!isStage2) return false;

      return !isBasketEmpty(inv);
    }
    if (currentMasterStage === 3) {
      return (inv.status === 'Paid' || inv.payment_status === 'Paid' || Boolean(inv.paid_at)) && inv.status !== 'Packed' && inv.status !== 'Dispatched' && inv.packing_stage !== 'DISPATCHED';
    }
    if (currentMasterStage === 4) {
      const isDispatched = (inv.status === 'Dispatched' || inv.status === 'Packed' || inv.packing_stage === 'DISPATCHED');
      if (!isDispatched) return false;
      if (isAllLiveDispatched) {
        if (dispatchedTimeFilter === 'TODAY') {
          const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' });
          const dispDate = (inv as any).dispatched_at || inv.created_at || '';
          if (!dispDate) return false;
          try {
            const dispDateStr = new Date(dispDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' });
            return dispDateStr === todayStr;
          } catch {
            return typeof dispDate === 'string' && dispDate.startsWith(todayStr);
          }
        }
        if (dispatchedTimeFilter === 'PP') {
          return inv.location_zone === 'PP';
        }
        if (dispatchedTimeFilter === 'PROVINCE') {
          return inv.location_zone !== 'PP';
        }
      }
      return true;
    }
    return true;
  });

  // Sub-filter & Sorting (Sub-filters PP/PROVINCE/AMOUNT_DESC apply to Stage 1 & Stage 2)
  if (currentMasterStage === 1 || currentMasterStage === 2) {
    if (activeSubFilter === 'PP') {
      filtered = filtered.filter(i => i.location_zone === 'PP');
    } else if (activeSubFilter === 'PROVINCE') {
      filtered = filtered.filter(i => i.location_zone !== 'PP');
    }

    if (activeSubFilter === 'AMOUNT_DESC') {
      filtered = [...filtered].sort((a, b) => {
        const qtyA = (a.items || []).reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
        const qtyB = (b.items || []).reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
        const amtA = Number(a.total_amount || 0);
        const amtB = Number(b.total_amount || 0);

        // 1. 🎯 Primary: Sort by highest item quantity (ច្រើនមុខ/ច្រើនចំនួនមុន e.g. 107 -> 74 -> 58 -> ... -> 1)
        if (qtyB !== qtyA) {
          return qtyB - qtyA;
        }

        // 2. 💰 Secondary: If total quantities are equal, sort by highest total amount (តម្លៃ/លុយច្រើនមុន)
        if (Math.abs(amtB - amtA) > 0.001) {
          return amtB - amtA;
        }

        // 3. 🔢 Tertiary: Stable tie-breaker by basket number descending
        return Number(b.basket_no || b.invoice_id) - Number(a.basket_no || a.invoice_id);
      });
    } else {
      filtered = [...filtered].sort((a, b) => {
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        if (timeB !== timeA) return timeB - timeA;
        return Number(b.basket_no || b.invoice_id) - Number(a.basket_no || a.invoice_id);
      });
    }
  } else if (currentMasterStage === 3) {
    // 🔍 Stage 3 (QC & Packaging): Sub-filters & Priority Aging Sort
    if (activeSubFilter === 'DELAYED_FIRST') {
      filtered = filtered.filter(i => selectedLiveId && i.live_id && i.live_id !== selectedLiveId);
    } else if (activeSubFilter === 'PP') {
      filtered = filtered.filter(i => i.location_zone === 'PP');
    } else if (activeSubFilter === 'PROVINCE') {
      filtered = filtered.filter(i => i.location_zone !== 'PP');
    }

    // Sort: In All Live QC, delayed orders (from older live sessions) are surfaced FIRST, followed by oldest orders
    filtered = [...filtered].sort((a, b) => {
      if (isAllLiveQc && selectedLiveId) {
        const isDelayedA = Boolean(a.live_id && a.live_id !== selectedLiveId);
        const isDelayedB = Boolean(b.live_id && b.live_id !== selectedLiveId);
        if (isDelayedA && !isDelayedB) return -1;
        if (!isDelayedA && isDelayedB) return 1;
      }
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      if (timeA !== timeB) return timeA - timeB; // Oldest first to clear aging backlog
      return Number(b.basket_no || b.invoice_id) - Number(a.basket_no || a.invoice_id);
    });
  } else {
    // 🚚 Stage 4 (Dispatched): Sub-filter and newest dispatched first
    if (activeSubFilter === 'PP') {
      filtered = filtered.filter(i => i.location_zone === 'PP');
    } else if (activeSubFilter === 'PROVINCE') {
      filtered = filtered.filter(i => i.location_zone !== 'PP');
    }

    filtered = [...filtered].sort((a, b) => {
      const dispA = new Date((a as any).dispatched_at || a.created_at || 0).getTime();
      const dispB = new Date((b as any).dispatched_at || b.created_at || 0).getTime();
      if (dispB !== dispA) return dispB - dispA;
      return Number(b.basket_no || b.invoice_id) - Number(a.basket_no || a.invoice_id);
    });
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

  // Find if matching basket exists in another stage tab or another live session
  const otherStageMatch = useMemo(() => {
    if (!searchQuery.trim() || totalFilteredBaskets > 0) return null;
    const q = searchQuery.trim().toLowerCase();

    // Look across all loaded invoices for current live
    const found = invoices.find(i =>
      String(i.basket_no) === q ||
      String(i.invoice_id) === q ||
      i.facebook_name.toLowerCase().includes(q) ||
      i.phone_number.includes(q)
    );

    if (!found) return null;

    let targetStage = 1;
    let stageName = 'មិនទាន់រើស';
    if (found.status === 'Dispatched' || found.status === 'Packed' || found.packing_stage === 'DISPATCHED') {
      targetStage = 4;
      stageName = 'ចេញរួចហើយ';
    } else if (found.status === 'Paid' || found.payment_status === 'Paid' || Boolean(found.paid_at)) {
      targetStage = 3;
      stageName = 'បង្កក-QC';
    } else if (found.packing_stage === 'STAGED') {
      targetStage = 2;
      stageName = 'រង់ចាំបង់';
    } else {
      targetStage = 1;
      stageName = 'មិនទាន់រើស';
    }

    if (targetStage === currentMasterStage) return null;

    return {
      invoice: found,
      stage: targetStage,
      stageName,
      basketNo: found.basket_no || found.invoice_id,
      customerName: found.facebook_name
    };
  }, [searchQuery, totalFilteredBaskets, invoices, currentMasterStage]);

  // Cross-Live search when query yields 0 results in current session
  useEffect(() => {
    const q = searchQuery.trim().replace(/^#/, '');
    if (!q || totalFilteredBaskets > 0 || otherStageMatch) {
      setCrossLiveMatch(null);
      return;
    }

    const timer = setTimeout(() => {
      fetch(`/api/find_basket?basket=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(data => {
          if (data.success && data.found && data.invoice) {
            let stageNum = 1;
            if (typeof data.stage === 'number') {
              stageNum = data.stage;
            } else if (data.stage === 'WAITING_PAYMENT' || data.stage === 'STAGED' || data.stage_code === 'WAITING_PAYMENT') {
              stageNum = 2;
            } else if (data.stage === 'QC_VERIFY' || data.stage === 'PAID' || data.stage_code === 'QC_VERIFY') {
              stageNum = 3;
            } else if (data.stage === 'DISPATCHED' || data.stage_code === 'DISPATCHED') {
              stageNum = 4;
            }

            setCrossLiveMatch({
              live_id: data.live_id,
              live_title: data.live_title,
              stage_num: stageNum,
              stage_name: data.stage_name,
              basket_no: data.basket_no,
              customer_name: data.customer_name,
              invoice: data.invoice
            });
          } else {
            setCrossLiveMatch(null);
          }
        })
        .catch(() => setCrossLiveMatch(null));
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, totalFilteredBaskets, otherStageMatch]);

  // If customer is viewing public order link (?order=123 or ?id=123)
  if (publicOrderId) {
    return (
      <CustomerOrderPortal
        orderId={publicOrderId}
        onBackToApp={() => {
          window.history.pushState({}, '', window.location.pathname);
          setPublicOrderId(null);
        }}
      />
    );
  }

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
        {/* 1. Sleek 2-Button Header */}
        <Header
          onOpenSystemSettings={() => {
            if (userRole === 'admin') {
              setIsSystemSettingsOpen(true);
            } else {
              handleRequestAdminAccess(() => setIsSystemSettingsOpen(true), 'សូមបញ្ចូលលេខកូដ Admin PIN ដើម្បីបើកការកំណត់ (Settings)');
            }
          }}
          onOpenFullStockManager={() => setIsFullStockManagerOpen(true)}
          productsCount={products.length}
          outStockCount={products.filter(p => (p.stock_qty ?? 0) <= 0).length}
          activePage={activePage}
          packerName={packerName}
          dispatchedCount={dispatchedCount}
          liveSessions={liveSessions}
          selectedLiveId={selectedLiveId}
          onSelectLiveId={id => {
            handleSelectLiveSession(id);
            showToast(`🎥 ប្តូរវគ្គ Live៖ ${id.length > 10 ? id.slice(-8) : id}`);
          }}
          onCreateLiveSession={() => {
            if (userRole === 'admin') {
              setIsCreateLiveModalOpen(true);
            } else {
              handleRequestAdminAccess(() => setIsCreateLiveModalOpen(true), 'សូមបញ្ចូលលេខកូដ Admin PIN ដើម្បីបង្កើត Live ថ្មី');
            }
          }}
          onOpenManageLiveModal={() => setIsManageLiveModalOpen(true)}
          onToggleCommentStream={() => setIsCommentStreamOpen(!isCommentStreamOpen)}
          isStreamOpen={isCommentStreamOpen}
          totalBasketCount={invoices.filter(i => i.status !== 'Cancelled').length}
          userRole={userRole}
        />

        {/* 2. Live Comment Stream Drawer / Simulator */}
        <LiveCommentStream
          isOpen={isCommentStreamOpen}
          onClose={() => setIsCommentStreamOpen(false)}
          activeLiveId={selectedLiveId}
          onCommentProcessed={() => {
            fetchInvoices();
            fetchLiveSessions();
            fetchStock();
          }}
          onShowToast={showToast}
          onOpenNoBasketModal={() => setIsNoBasketModalOpen(true)}
        />

        {/* 3. Streamlined Bar: Picking List, Non-Basket Users, Slips & Backlog Alert */}
        <GamifiedHud
          backlogCount={backlogCount}
          onOpenPickingModal={() => setIsPickingModalOpen(true)}
          onOpenNoBasketModal={() => setIsNoBasketModalOpen(true)}
          onOpenFastCheck={() => setIsFastCheckModalOpen(true)}
          onOpenBacklog={() => setIsBacklogModalOpen(true)}
        />

        {/* 5. Workflow Tabs & Sub-Filters & Search Bar */}
        <WorkflowTabs
          currentStage={currentMasterStage}
          onSwitchStage={stage => {
            setCurrentMasterStage(stage);
            setDisplayedLimit(25);
            playPureTone(650, 0.04);
            if (stage === 3) {
              if (!isAllLiveQc) {
                setIsAllLiveQc(true);
              }
              fetchAllLivePaidInvoices();
              if (activeSubFilter === 'AMOUNT_DESC' || activeSubFilter === 'EMPTY') {
                setActiveSubFilter('ALL');
              }
            } else if (stage === 4) {
              if (!isAllLiveDispatched) {
                setIsAllLiveDispatched(true);
              }
              fetchAllLiveDispatchedInvoices();
              if (activeSubFilter === 'AMOUNT_DESC' || activeSubFilter === 'EMPTY' || activeSubFilter === 'DELAYED_FIRST') {
                setActiveSubFilter('ALL');
              }
            } else {
              if (activeSubFilter === 'DELAYED_FIRST') {
                setActiveSubFilter('ALL');
              }
            }
          }}
          unpickedCount={unpickedCount}
          emptyBasketsCount={emptyBasketsCount}
          onCleanEmptyBaskets={handleBulkCleanEmptyBaskets}
          waitingCount={waitingCount}
          paidQcCount={paidQcCount}
          dispatchedCount={totalDispatched}
          backlogCount={backlogCount}
          onOpenBacklog={() => setIsBacklogModalOpen(true)}
          isAllLiveQc={isAllLiveQc}
          onToggleAllLiveQc={() => {
            setIsAllLiveQc(prev => !prev);
            fetchAllLivePaidInvoices();
          }}
          allLivePaidCount={allLivePaidCount}
          delayedPaidCount={delayedPaidCount}
          isAllLiveDispatched={isAllLiveDispatched}
          onToggleAllLiveDispatched={() => {
            setIsAllLiveDispatched(prev => !prev);
            fetchAllLiveDispatchedInvoices();
          }}
          allLiveDispatchedStats={allLiveDispatchedStats}
          dispatchedTimeFilter={dispatchedTimeFilter}
          onSetDispatchedTimeFilter={setDispatchedTimeFilter}
          activeSubFilter={activeSubFilter}
          onSetSubFilter={flt => {
            setActiveSubFilter(flt);
            setDisplayedLimit(25);
            playPureTone(700, 0.04);
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          totalFilteredBaskets={totalFilteredBaskets}
          onOpenScanner={() => setIsCameraScannerOpen(true)}
          onOpenFastCheck={() => setIsFastCheckModalOpen(true)}
          hideBusyBaskets={hideBusyBaskets}
          onToggleHideBusyBaskets={handleToggleHideBusyBaskets}
          busyBasketsCount={busyBasketsCount}
        />

        {/* 6. Baskets Feed */}
        <div className="flex flex-col gap-3 mt-1">
          {/* Smart cross-stage jump alert if search query is found in another stage */}
          {otherStageMatch && (
            <div className="bg-gradient-to-r from-amber-950/90 via-slate-900 to-amber-950/90 border-2 border-amber-400 p-3.5 rounded-2xl shadow-2xl text-center flex flex-col items-center gap-2 animate-pulse">
              <div className="text-amber-300 font-black text-xs sm:text-sm flex items-center gap-1.5">
                <span>🔎 រកឃើញកន្ត្រក #{otherStageMatch.basketNo} ({otherStageMatch.customerName})!</span>
              </div>
              <div className="text-[11px] text-slate-300">
                កន្ត្រកនេះកំពុងស្ថិតក្នុងផ្នែក <strong>«{otherStageMatch.stageName}»</strong>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCurrentMasterStage(otherStageMatch.stage);
                  setActiveSubFilter('ALL');
                  playSuccessFanfare();
                  showToast(`⚡ បានប្តូរទៅកាន់ផ្ទាំង «${otherStageMatch.stageName}» ភ្លាមៗ!`, 'success');
                }}
                className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-4 py-2 rounded-xl text-xs shadow-lg active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>⚡ ចុចទីនេះដើម្បីបើកមើលផ្ទាំង «{otherStageMatch.stageName}» ភ្លាមៗ</span>
              </button>
            </div>
          )}

          {/* Smart Cross-Live Session Search Result Alert */}
          {crossLiveMatch && !otherStageMatch && (
            <div className="bg-gradient-to-r from-blue-950/90 via-slate-900 to-indigo-950/90 border-2 border-cyan-400 p-3.5 rounded-2xl shadow-2xl text-center flex flex-col items-center gap-2 animate-pulse">
              <div className="text-cyan-300 font-black text-xs sm:text-sm flex items-center gap-1.5">
                <span>🔎 រកឃើញកន្ត្រក #{crossLiveMatch.basket_no} ({crossLiveMatch.customer_name})!</span>
              </div>
              <div className="text-[11px] text-slate-300">
                កន្ត្រកនេះស្ថិតក្នុង <strong>Live Session ផ្សេង</strong> ផ្នែក <strong>«{crossLiveMatch.stage_name}»</strong>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (crossLiveMatch.live_id !== selectedLiveIdRef.current) {
                    selectedLiveIdRef.current = crossLiveMatch.live_id;
                    setSelectedLiveId(crossLiveMatch.live_id);
                    localStorage.setItem('selectedLiveId', crossLiveMatch.live_id);
                    setCurrentRevision(0);
                    currentRevisionRef.current = 0;
                    if (crossLiveMatch.invoice) {
                      setInvoices([crossLiveMatch.invoice]);
                    }
                    setCurrentMasterStage(crossLiveMatch.stage_num);
                    setActiveSubFilter('ALL');
                    setCrossLiveMatch(null);
                    fetchInvoices(crossLiveMatch.live_id, 0);
                    fetchStock(crossLiveMatch.live_id);
                    fetchBacklogCount(crossLiveMatch.live_id);
                  } else {
                    if (crossLiveMatch.invoice) {
                      handleUpdateInvoice(crossLiveMatch.invoice);
                    }
                    setCurrentMasterStage(crossLiveMatch.stage_num);
                    setActiveSubFilter('ALL');
                    setCrossLiveMatch(null);
                  }
                  playSuccessFanfare();
                  showToast(`⚡ បានប្តូរទៅកាន់ Live Session & ផ្នែក «${crossLiveMatch.stage_name}»!`, 'success');
                }}
                className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black px-4 py-2 rounded-xl text-xs shadow-lg active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>⚡ ចុចទីនេះដើម្បីប្តូរទៅ Live នោះ & បើកកន្ត្រកភ្លាមៗ</span>
              </button>
            </div>
          )}

          {visibleBaskets.length === 0 ? (
            <div className="text-center py-16 px-4 bg-slate-900/40 rounded-2xl border border-slate-800">
              <div className="text-3xl mb-2">{otherStageMatch ? '💡' : '🎉'}</div>
              <div className="text-sm font-bold text-slate-400">
                {otherStageMatch
                  ? `កន្ត្រក #${otherStageMatch.basketNo} ស្ថិតក្នុងផ្ទាំង «${otherStageMatch.stageName}»`
                  : 'គ្មានកន្ត្រកក្នុងផ្នែកនេះឡើយ។'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {otherStageMatch
                  ? 'សូមចុចប៊ូតុងពណ៌លឿងខាងលើដើម្បីប្តូរទៅកាន់ផ្នែកនោះភ្លាមៗ'
                  : 'សូមជ្រើសរើស Tab ផ្សេង ឬសាកល្បងបញ្ចូល Comment ក្នុងផ្ទាំង Live Comment។'}
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
                activeLiveId={selectedLiveId}
                onToggleItemCheck={handleToggleItemCheck}
                onOpenQCModal={handleOpenQCModal}
                onOpenReceiptModal={handleOpenReceiptModal}
                onOpenVipModal={handleOpenVipModal}
                onOpenKHQRModal={handleOpenKHQRModal}
                onOpenZoomModal={handleOpenZoomModal}
                onDataChanged={handleDataChanged}
                onOptimisticItemUpdate={handleOptimisticItemUpdate}
                onOptimisticEditItem={handleOptimisticEditItem}
                onOptimisticZoneUpdate={handleOptimisticZoneUpdate}
                onOptimisticAddItem={handleOptimisticAddItem}
                onOptimisticStageTransition={handleOptimisticStageTransition}
                onUpdateInvoice={handleUpdateInvoice}
                onShowToast={showToast}
                onUndispatch={handleUndispatch}
                onDeleteBasket={handleDeleteBasket}
                onScanPingCustomer={handleManualScanPing}
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

      {/* Network Status Indicator (Only floating alert if offline, otherwise subtle indicator) */}
      {!networkOnline && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-black z-[99999] shadow-2xl flex items-center gap-1.5 bg-rose-950/95 border border-rose-500 text-rose-200 animate-bounce"
        >
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
          <span>⚠️ ដាច់សេវាបណ្តាញ WiFi!</span>
        </div>
      )}

      {/* All Modals */}
      <QCModal
        isOpen={isQCModalOpen}
        onClose={() => setIsQCModalOpen(false)}
        invoice={qcInvoice}
        packerName={packerName}
        productMap={productMap}
        activeLiveId={selectedLiveId}
        onOpenZoomModal={(c, n, img, pr, sq) => {
          setZoomCode(c);
          setZoomName(n);
          setZoomImageUrl(img);
          setZoomPrice(pr);
          setZoomStockQty(sq);
          setIsZoomModalOpen(true);
        }}
        onDispatchSuccess={() => {
          fetchInvoices();
          fetchPackerStats();
          fetchBacklogCount(selectedLiveId);
          setBacklogRefreshTrigger(prev => prev + 1);
        }}
        onShowToast={showToast}
        onScanPingCustomer={handleManualScanPing}
        onOptimisticStageTransition={handleOptimisticStageTransition}
      />

      {/* 💬 Floating Notification: Last Pinged Customer (Direct Meta Business Suite Link) */}
      {lastPingedCustomer && (
        <div className="fixed bottom-5 right-5 z-[99999] bg-[#07132B]/95 border border-sky-400/50 rounded-2xl shadow-[0_8px_32px_rgba(0,132,255,0.35)] p-3.5 flex items-center gap-3 backdrop-blur-md animate-fade-in max-w-[92vw] sm:max-w-[420px]">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#0084FF] to-[#0055D4] flex items-center justify-center text-white flex-shrink-0 shadow-[0_0_12px_rgba(0,132,255,0.45)]">
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.43 3.14 7.15.16.14.26.35.26.57l-.05 1.77c-.02.59.54 1.01 1.07.78l1.97-.87c.18-.08.38-.09.57-.04.97.27 2.01.42 3.1.42 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm1.09 13.06l-2.54-2.71-4.96 2.71c-.55.3-1.18-.28-.9-.82l5.44-8.62c.32-.51 1.07-.5 1.38.01l2.54 2.71 4.96-2.71c.55-.3 1.18.28.9.82l-5.44 8.62c-.32.51-1.07.5-1.38-.01z"/>
            </svg>
          </div>
          <div className="flex flex-col text-left min-w-0 flex-1">
            <div className="text-xs font-black text-sky-400 flex items-center gap-1.5 truncate">
              <span>ឆាតលោតលេខ #1 ក្នុង Meta Business Suite</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping flex-shrink-0"></span>
            </div>
            <div className="text-[11.5px] text-slate-200 truncate mt-0.5">
              កន្ត្រក #{lastPingedCustomer.basket_no} ៖ <span className="font-bold text-white">{lastPingedCustomer.customer_name}</span>
            </div>
          </div>
          {lastPingedCustomer.meta_inbox_url && (
            <a
              href={lastPingedCustomer.meta_inbox_url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gradient-to-r from-[#0084FF] to-[#0055D4] hover:from-[#0094FF] hover:to-[#0066EE] text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all flex-shrink-0 cursor-pointer"
            >
              <span>💬 បើកឆាត Meta</span>
              <span className="text-xs">↗</span>
            </a>
          )}
          <button
            onClick={() => setLastPingedCustomer(null)}
            className="text-slate-400 hover:text-white text-sm p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer flex-shrink-0"
            title="បិទ"
          >
            ✕
          </button>
        </div>
      )}

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
        activeLiveId={selectedLiveId}
        onStockUpdated={() => {
          fetchStock(selectedLiveIdRef.current);
          fetchInvoices(selectedLiveIdRef.current);
        }}
        onShowToast={showToast}
        onOpenSync={handleOpenStockSync}
      />

      <StockSyncModal
        isOpen={isStockSyncModalOpen}
        onClose={() => setIsStockSyncModalOpen(false)}
        products={products}
        activeLiveId={selectedLiveId}
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
        onStockUpdated={() => {
          fetchStock();
          fetchInvoices();
        }}
        onShowToast={showToast}
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
        onOpenNoBasketModal={() => setIsNoBasketModalOpen(true)}
      />

      {/* ⚠️ Non-Basket Users & Unmatched Commenters Modal */}
      <NoBasketUsersModal
        isOpen={isNoBasketModalOpen}
        onClose={() => setIsNoBasketModalOpen(false)}
        activeLiveId={selectedLiveId}
        onShowToast={showToast}
        onBasketCreated={() => {
          fetchInvoices();
          fetchLiveSessions();
          fetchStock();
        }}
      />

      <ImageZoomModal
        isOpen={isZoomModalOpen}
        onClose={() => setIsZoomModalOpen(false)}
        code={zoomCode}
        name={zoomName}
        imageUrl={zoomImageUrl}
        price={zoomPrice}
        stockQty={zoomStockQty}
        items={zoomItems}
        initialIndex={zoomInitialIndex}
        invoiceId={zoomInvoiceId}
        activeLiveId={selectedLiveId}
        onToggleItemCheck={handleToggleItemCheck}
        onPhotoUploaded={() => {
          fetchStock(selectedLiveIdRef.current);
          fetchInvoices(selectedLiveIdRef.current);
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
        onOptimisticStageTransition={handleOptimisticStageTransition}
      />

      <VipInvoiceModal
        isOpen={isVipModalOpen}
        onClose={() => setIsVipModalOpen(false)}
        invoice={vipInvoice}
        onShowToast={showToast}
        onDataChanged={() => {
          fetchInvoices();
        }}
      />

      <KHQRModal
        isOpen={isKHQRModalOpen}
        onClose={() => setIsKHQRModalOpen(false)}
        invoice={khqrInvoice}
        onOpenReceiptModal={handleOpenReceiptModal}
        onShowToast={showToast}
      />

      <DatabaseModal
        isOpen={isDatabaseModalOpen}
        onClose={() => setIsDatabaseModalOpen(false)}
        packerName={packerName}
        onChangePackerName={handleChangePackerName}
        userRole={userRole}
        onSelectDateFilter={selectedDate => {
          setSearchQuery(selectedDate);
          showToast(`📅 បានជ្រើសរើសផ្ទៀងផ្ទាត់កាលបរិច្ឆេទ៖ ${selectedDate}`);
        }}
        onShowToast={showToast}
      />

      <ManageLiveSessionsModal
        isOpen={isManageLiveModalOpen}
        onClose={() => setIsManageLiveModalOpen(false)}
        liveSessions={liveSessions}
        activeLiveId={selectedLiveId}
        onSelectLiveId={id => {
          handleSelectLiveSession(id);
          showToast(`🎥 បានប្តូរទៅកាន់វគ្គ Live៖ ${id.length > 10 ? id.slice(-8) : id}`);
        }}
        onCreateNewLive={() => {
          if (userRole === 'admin') {
            setIsCreateLiveModalOpen(true);
          } else {
            handleRequestAdminAccess(() => setIsCreateLiveModalOpen(true), 'សូមបញ្ចូលលេខកូដ Admin PIN ដើម្បីបង្កើត Live ថ្មី');
          }
        }}
        onRefreshLiveSessions={() => {
          fetchLiveSessions();
          fetchInvoices();
          fetchStock();
        }}
        onShowToast={showToast}
        userRole={userRole}
        onRequireAdminPin={() => handleRequestAdminAccess(() => setIsCreateLiveModalOpen(true), 'សូមបញ្ចូល Admin PIN ដើម្បីដោះសោរបង្កើត & លុប Live')}
      />

      <RequirePackerNameModal
        isOpen={isRequirePackerModalOpen || !packerName}
        currentPackerName={packerName}
        onSavePackerName={(name, role) => {
          handleChangePackerName(name, role || 'staff');
          setIsRequirePackerModalOpen(false);
        }}
        onOpenAdminPinModal={() => {
          setIsRequirePackerModalOpen(false);
          handleRequestAdminAccess(undefined, 'បញ្ចូល Admin PIN ដើម្បីចូលជាម្ចាស់ហាង');
        }}
      />

      {/* Admin PIN Verification Modal */}
      <AdminPinModal
        isOpen={isAdminPinModalOpen}
        onClose={() => {
          setIsAdminPinModalOpen(false);
          setPendingAdminAction(null);
        }}
        onSuccess={handleAdminPinSuccess}
        title="🔒 ផ្ទៀងផ្ទាត់ Admin PIN"
        description={adminPinModalDesc}
      />

      {/* System & Settings Modal (Button 1) */}
      <SystemSettingsModal
        isOpen={isSystemSettingsOpen}
        onClose={() => setIsSystemSettingsOpen(false)}
        packerName={packerName}
        onChangePackerName={() => setIsRequirePackerModalOpen(true)}
        onOpenPackerHistory={() => {
          setPackerModalMode('history');
          setIsPackerModalOpen(true);
        }}
        onOpenPackerLeaderboard={() => {
          setPackerModalMode('leaderboard');
          setIsPackerModalOpen(true);
        }}
        onOpenKHQRModal={() => handleOpenKHQRModal()}
        dispatchedCount={dispatchedCount}
        onOpenDispatchModal={() => setIsDispatchModalOpen(true)}
        activePage={activePage}
        onOpenFbModal={() => setIsFbModalOpen(true)}
        onOpenDatabaseModal={() => setIsDatabaseModalOpen(true)}
        khmerFont={khmerFont}
        onChangeKhmerFont={handleChangeKhmerFont}
        fontScale={fontScale}
        onAdjustFontSize={handleAdjustFontSize}
        onResetFontSize={handleResetFontSize}
        userRole={userRole}
        onLockAdmin={handleLockAdmin}
        onOpenChatbot={() => setIsChatbotModalOpen(true)}
      />

      {/* Full-Screen Stock Management Modal (Button 2) */}
      <FullStockManagerModal
        isOpen={isFullStockManagerOpen}
        onClose={() => setIsFullStockManagerOpen(false)}
        products={products}
        activeLiveId={selectedLiveId}
        onSelectProductToEdit={p => {
          setIsAddingNewStock(false);
          setSelectedStockProduct(p);
          setIsStockModalOpen(true);
        }}
        onOpenAddNewStock={() => {
          setIsAddingNewStock(true);
          setSelectedStockProduct(null);
          setIsStockModalOpen(true);
        }}
        onOpenStockSync={handleOpenStockSync}
        onStockUpdated={() => {
          fetchStock(selectedLiveIdRef.current);
          fetchInvoices(selectedLiveIdRef.current);
        }}
        onShowToast={showToast}
        onOpenZoomModal={handleOpenZoomModal}
      />

      {/* Create New Live Session with Stock Isolation Modal */}
      <CreateLiveSessionModal
        isOpen={isCreateLiveModalOpen}
        onClose={() => setIsCreateLiveModalOpen(false)}
        currentLiveId={selectedLiveId}
        unsoldStockCount={unsoldStockCount}
        totalStockCount={products.length}
        onCreateSession={handleCreateLiveSessionWithMode}
      />

      {/* Cross-Live Unsent Backlog Modal */}
      <BacklogModal
        isOpen={isBacklogModalOpen}
        onClose={() => {
          setIsBacklogModalOpen(false);
          fetchInvoices();
          fetchBacklogCount(selectedLiveId);
        }}
        currentLiveId={selectedLiveId}
        refreshKey={backlogRefreshTrigger}
        onOpenQCModal={inv => {
          setQcInvoice(inv);
          setIsQCModalOpen(true);
        }}
        onOpenReceiptModal={handleOpenReceiptModal}
        onShowToast={showToast}
        onRefreshAll={() => {
          fetchInvoices();
          fetchBacklogCount(selectedLiveId);
        }}
      />

      {/* ⚡ AI Fast-Check Slips & Batch Payments Modal */}
      <FastCheckSlipsModal
        isOpen={isFastCheckModalOpen}
        onClose={() => setIsFastCheckModalOpen(false)}
        onSuccess={(count) => {
          fetchInvoices();
          fetchAllLivePaidInvoices();
          fetchBacklogCount(selectedLiveId);
          showToast(`🎉 បានសម្គាល់បង់រួច ${count} កន្ត្រកដោយជោគជ័យ!`, 'success');
        }}
        onShowToast={showToast}
      />

      {/* 🤖 KARI AI Chatbot Control & Simulator Modal */}
      <ChatbotModal
        isOpen={isChatbotModalOpen}
        onClose={() => setIsChatbotModalOpen(false)}
        onShowToast={showToast}
        onDataChanged={() => {
          fetchInvoices();
          fetchStock();
          fetchAllLivePaidInvoices();
        }}
      />

      {/* 📷 In-App Camera Scanner Modal (QR & Barcode) */}
      <CameraScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScanSuccess={handleCameraScanSuccess}
        onShowToast={showToast}
      />
    </div>
  );
}
