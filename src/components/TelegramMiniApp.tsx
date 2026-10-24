import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  generateBakongKHQRString,
  generateKHQRDataUrl,
  decodeQRFromImageFile,
  parseBakongKHQRString,
  drawKHQRToCanvas
} from '../utils/khqr';

export interface MiniAppVariant {
  id: string;
  color: string;
  size: 'Size S' | 'Size M' | 'Size L' | 'Size XL' | 'Free Size';
  stock: number;
}

export interface MiniAppProduct {
  id: string;
  code: string;
  name: string;
  price: number;
  originalPrice: number;
  category: 'women' | 'men' | 'kids' | 'unisex';
  imageUrl: string;
  images?: string[];
  variants: MiniAppVariant[];
  createdAt: string;
}

function getProductImages(p: MiniAppProduct): string[] {
  const arr = Array.isArray(p.images) ? p.images.map(u => String(u || '').trim()).filter(Boolean) : [];
  if (arr.length > 0) return arr;
  return p.imageUrl ? [p.imageUrl] : [];
}

export interface SizeGuideRow {
  size: string;
  weightRange: string;
  bustRange: string;
  note?: string;
}

export interface MiniAppConfig {
  storeName: string;
  storeLogoLetter: string;
  storeLogoUrl?: string;
  storeSubtitle: string;
  promoBannerText: string;
  promoBadgeText: string;
  shippingFeePP: number;
  shippingFeeProvince: number;
  freeShippingThreshold: number;
  khqrMerchantName: string;
  khqrAccountNumber?: string;
  khqrBakongId?: string;
  khqrAccountInfo: string;
  khqrImageUrl: string;
  khqrRawString?: string;
  abaPaymentLink?: string;
  telegramNotifyChatId?: string;
  telegramBotToken?: string;
  adminPin?: string;
  miniAppUrl?: string;
  menuButtonText?: string;
  botUsername?: string;
  fbPageId?: string;
  fbPageName?: string;
  fbPageAccessToken?: string;
  fbVerifyToken?: string;
  fbAutoReplyEnabled?: boolean;
  fbButtonText?: string;
  sizeGuide?: SizeGuideRow[];
}

export interface CartItem {
  productId: string;
  code: string;
  name: string;
  price: number;
  variantId: string;
  color: string;
  size: string;
  qty: number;
  maxStock: number;
  imageUrl: string;
}

export interface MiniAppOrder {
  id: string;
  createdAt: string;
  customerName: string;
  telegramUsername?: string;
  telegramUserId?: string;
  channel?: 'TELEGRAM' | 'FACEBOOK' | 'WEB';
  fbPsid?: string;
  phone: string;
  address: string;
  zone: 'PP' | 'PROVINCE';
  deliveryCompany: string;
  paymentMethod: 'KHQR' | 'COD';
  paymentSlipUrl?: string;
  items: Array<{
    productId: string;
    code: string;
    name: string;
    price: number;
    variantId: string;
    color: string;
    size: string;
    qty: number;
    imageUrl: string;
  }>;
  subtotal: number;
  shippingFee: number;
  totalAmount: number;
  status: 'NEW' | 'CONFIRMED' | 'SHIPPED' | 'CANCELLED';
  note?: string;
  trackingInfo?: string;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        initDataUnsafe?: {
          user?: {
            id?: number;
            first_name?: string;
            last_name?: string;
            username?: string;
          };
        };
      };
    };
  }
}

const SIZE_OPTIONS: Array<'ទាំងអស់' | 'Size S' | 'Size M' | 'Size L' | 'Size XL' | 'Free Size'> = [
  'ទាំងអស់',
  'Size S',
  'Size M',
  'Size L',
  'Size XL',
  'Free Size'
];

const DEFAULT_SIZE_GUIDE: SizeGuideRow[] = [
  { size: 'Size S', weightRange: '40kg – 47kg', bustRange: '32" – 34"', note: 'រាងតូច / ស្លីម' },
  { size: 'Size M', weightRange: '48kg – 54kg', bustRange: '34" – 36"', note: 'ទំហំពេញនិយម' },
  { size: 'Size L', weightRange: '55kg – 62kg', bustRange: '36" – 38"', note: 'ពាក់ស្រួលខ្លួន' },
  { size: 'Size XL', weightRange: '63kg – 72kg', bustRange: '38" – 41"', note: 'រាងធំ / ទូលាយ' },
  { size: 'Free Size', weightRange: '42kg – 60kg', bustRange: '32" – 38"', note: 'សាច់យឺត ពាក់បានទូទៅ' }
];

export function TelegramMiniApp({ onBackToPos }: { onBackToPos?: () => void }) {
  const [config, setConfig] = useState<MiniAppConfig>({
    storeName: 'ហាងខោអាវ Kari Arnett',
    storeLogoLetter: 'K',
    storeSubtitle: '⚡ ប្រមូលផ្តុំម៉ូតស្អាតៗសល់ពីឡាយ (សល់ 1-3 ឈុត)',
    promoBannerText: '🔥 ម៉ូតសល់តិចពីឡាយ (1-3 ឈុត) កម្ម៉ង់មុនបានមុន!',
    promoBadgeText: 'តម្លៃពិសេស',
    shippingFeePP: 1.5,
    shippingFeeProvince: 2.0,
    freeShippingThreshold: 30.0,
    khqrMerchantName: 'KARI ARNETT SHOP',
    khqrAccountInfo: 'ABA / KHQR (USD)',
    khqrImageUrl: '',
    sizeGuide: DEFAULT_SIZE_GUIDE
  });

  const [products, setProducts] = useState<MiniAppProduct[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'women' | 'men' | 'kids'>('all');
  const [activeSize, setActiveSize] = useState<string>('ទាំងអស់');
  const [sortBy, setSortBy] = useState<'default' | 'price_asc' | 'price_desc' | 'discount'>('default');
  const [onlyWishlist, setOnlyWishlist] = useState<boolean>(false);
  const [orderLookupQuery, setOrderLookupQuery] = useState<string>('');
  const [isLookingUpOrder, setIsLookingUpOrder] = useState<boolean>(false);

  // Customer Wishlist persisted in localStorage
  const [wishlistIds, setWishlistIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('tg_miniapp_wishlist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Track which variant is currently selected on each product card
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});

  // Shopping Cart state (persisted in localStorage)
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('tg_miniapp_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Customer Order History stored locally on customer phone
  const [myOrders, setMyOrders] = useState<MiniAppOrder[]>(() => {
    try {
      const saved = localStorage.getItem('tg_miniapp_my_orders');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Modals
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [isMyOrdersOpen, setIsMyOrdersOpen] = useState<boolean>(false);
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState<boolean>(false);
  const [deliverySlipOrder, setDeliverySlipOrder] = useState<MiniAppOrder | null>(null);
  const [trackingInputs, setTrackingInputs] = useState<Record<string, string>>({});
  const [isInquiring, setIsInquiring] = useState<boolean>(false);
  const [zoomProduct, setZoomProduct] = useState<MiniAppProduct | null>(null);
  const [zoomImageIdx, setZoomImageIdx] = useState<number>(0);
  const [zoomTouchStartX, setZoomTouchStartX] = useState<number | null>(null);
  const [showShareOptions, setShowShareOptions] = useState<boolean>(false);
  const [showReturnPolicyDetail, setShowReturnPolicyDetail] = useState<boolean>(false);
  const pdpScrollRef = useRef<HTMLDivElement | null>(null);
  const [cardImageIdx, setCardImageIdx] = useState<Record<string, number>>({});
  const [completedOrder, setCompletedOrder] = useState<MiniAppOrder | null>(null);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Customer Checkout Form & Multi-Step KHQR Payment Flow
  const [customerName, setCustomerName] = useState<string>(() => localStorage.getItem('tg_cust_name') || '');
  const [telegramUsername, setTelegramUsername] = useState<string>('');
  const [telegramUserId, setTelegramUserId] = useState<string>('');
  const [fbPsid, setFbPsid] = useState<string>(() => localStorage.getItem('fb_cust_psid') || '');
  const [isFbMessenger, setIsFbMessenger] = useState<boolean>(false);
  const [phone, setPhone] = useState<string>(() => localStorage.getItem('tg_cust_phone') || '');
  const [address, setAddress] = useState<string>(() => localStorage.getItem('tg_cust_address') || '');
  const [zone, setZone] = useState<'PP' | 'PROVINCE'>('PP');
  const [deliveryCompany, setDeliveryCompany] = useState<string>('ដឹកក្នុងក្រុងភ្នំពេញ');
  const [paymentMethod, setPaymentMethod] = useState<'KHQR' | 'COD'>('KHQR');
  const [selectedKhqrType, setSelectedKhqrType] = useState<'KHQR' | 'ABA_KHQR'>('KHQR');
  const [checkoutStep, setCheckoutStep] = useState<'SUMMARY' | 'KHQR_SCAN'>('SUMMARY');
  const [isEditingAddress, setIsEditingAddress] = useState<boolean>(() => {
    const savedPhone = localStorage.getItem('tg_cust_phone') || '';
    const savedAddr = localStorage.getItem('tg_cust_address') || '';
    return !savedPhone.trim() || !savedAddr.trim();
  });
  const [qrCountdown, setQrCountdown] = useState<number>(300);
  const [isGeneratingKhqrCard, setIsGeneratingKhqrCard] = useState<boolean>(false);
  const [paymentSlipUrl, setPaymentSlipUrl] = useState<string>('');
  const [isUploadingSlip, setIsUploadingSlip] = useState<boolean>(false);
  const [orderNote, setOrderNote] = useState<string>('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);

  // Standalone Admin Mode States
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname.includes('admin') || new URLSearchParams(window.location.search).get('admin') === '1';
    }
    return false;
  });
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => {
    return sessionStorage.getItem('tg_miniapp_admin_unlocked') === 'true';
  });
  const [adminPinInput, setAdminPinInput] = useState<string>('');
  const [adminTab, setAdminTab] = useState<'products' | 'orders' | 'settings'>('products');
  const [adminOrders, setAdminOrders] = useState<MiniAppOrder[]>([]);
  const [adminOrderFilter, setAdminOrderFilter] = useState<'ALL' | 'NEW' | 'KHQR' | 'COD'>('ALL');
  const [editingProduct, setEditingProduct] = useState<MiniAppProduct | null>(null);
  const [isProductFormOpen, setIsProductFormOpen] = useState<boolean>(false);

  // Admin Product Form State
  const [formCode, setFormCode] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formPrice, setFormPrice] = useState<string>('6.50');
  const [formOrigPrice, setFormOrigPrice] = useState<string>('10.00');
  const [formCategory, setFormCategory] = useState<'women' | 'men' | 'kids' | 'unisex'>('women');
  const [formImageUrl, setFormImageUrl] = useState<string>('');
  const [formImages, setFormImages] = useState<string[]>([]);
  const [formVariants, setFormVariants] = useState<MiniAppVariant[]>([
    { id: 'v-1', color: 'ស', size: 'Size M', stock: 1 }
  ]);
  const [isUploadingProductImg, setIsUploadingProductImg] = useState<boolean>(false);
  const [isSavingProduct, setIsSavingProduct] = useState<boolean>(false);
  const [botTokenInput, setBotTokenInput] = useState<string>('');
  const [isSettingUpBot, setIsSettingUpBot] = useState<boolean>(false);
  const [isSendingShopCard, setIsSendingShopCard] = useState<boolean>(false);

  // Facebook Page Messenger Admin States
  const [connectedFbPages, setConnectedFbPages] = useState<Array<{ id: string; name: string; access_token: string }>>([]);
  const [fbTokenInput, setFbTokenInput] = useState<string>('');
  const [isSettingUpFbPage, setIsSettingUpFbPage] = useState<boolean>(false);
  const [isSendingFbTestCard, setIsSendingFbTestCard] = useState<boolean>(false);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => {
      setToast(prev => (prev?.text === text ? null : prev));
    }, 2600);
  };

  // Initialize Telegram WebApp SDK or Facebook Messenger Webview & load catalog
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const sourceParam = params.get('source');
      const psidParam = params.get('psid');
      const cnameParam = params.get('cname');
      const tgUidParam = params.get('tg_uid');
      const ua = navigator.userAgent || '';
      const isFbUa = /FBAN|FBAV|Messenger|FB_IAB/i.test(ua);
      const savedFbPsid = localStorage.getItem('fb_cust_psid') || '';

      if (sourceParam === 'fb' || psidParam || isFbUa || savedFbPsid) {
        setIsFbMessenger(true);
      }
      if (psidParam) {
        setFbPsid(psidParam);
        try {
          localStorage.setItem('fb_cust_psid', psidParam);
        } catch {}
      } else if (savedFbPsid) {
        setFbPsid(savedFbPsid);
      }
      if (cnameParam && !customerName) {
        setCustomerName(cnameParam);
        try {
          localStorage.setItem('tg_cust_name', cnameParam);
        } catch {}
      }
      if (tgUidParam) {
        setTelegramUserId(tgUidParam);
      }

      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
        const user = tg.initDataUnsafe?.user;
        if (user) {
          const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
          if (fullName && !customerName) setCustomerName(fullName);
          if (user.username) setTelegramUsername(user.username);
          if (user.id) setTelegramUserId(String(user.id));
        }
      }
    } catch {}
    fetchCatalog();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('tg_miniapp_cart', JSON.stringify(cart));
    } catch {}
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem('tg_miniapp_wishlist', JSON.stringify(wishlistIds));
    } catch {}
  }, [wishlistIds]);

  const toggleWishlist = (productId: string, code: string) => {
    setWishlistIds(prev => {
      const exists = prev.includes(productId);
      if (exists) {
        showToast(`បានដកកូដ ${code} ចេញពីបញ្ជីពេញចិត្ត`);
        return prev.filter(id => id !== productId);
      } else {
        showToast(`❤️ បានរក្សាទុកកូដ ${code} ក្នុងបញ្ជីពេញចិត្ត!`);
        return [...prev, productId];
      }
    });
  };

  // Eagerly preload product images in the browser cache so opening any product is 0ms instant & crystal-clear
  useEffect(() => {
    if (!products || products.length === 0) return;
    const timer = setTimeout(() => {
      products.slice(0, 24).forEach(p => {
        const imgs = getProductImages(p);
        imgs.forEach(url => {
          if (url && !url.startsWith('data:image/svg')) {
            const img = new Image();
            img.decoding = 'async';
            img.src = url;
          }
        });
      });
    }, 80);
    return () => clearTimeout(timer);
  }, [products]);

  // Immediately preload all gallery angles when a product is opened in the PDP
  useEffect(() => {
    if (!zoomProduct) {
      setShowShareOptions(false);
      setShowReturnPolicyDetail(false);
      return;
    }
    const imgs = getProductImages(zoomProduct);
    imgs.forEach(url => {
      if (url) {
        const img = new Image();
        img.decoding = 'sync';
        img.src = url;
      }
    });
  }, [zoomProduct]);

  const getProductShareUrl = (product: MiniAppProduct): string => {
    const base = (config.miniAppUrl || '').trim();
    if (base && base.startsWith('http')) {
      try {
        const u = new URL(base);
        u.searchParams.set('code', product.code);
        return u.toString();
      } catch {}
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/miniapp?code=${encodeURIComponent(product.code)}`;
  };

  const handleCopyProductLink = async (product: MiniAppProduct) => {
    const shareUrl = getProductShareUrl(product);
    const origStr =
      product.originalPrice > product.price ? ` (តម្លៃដើម $${product.originalPrice.toFixed(2)})` : '';
    const shareText = `✨ [${product.code}] ${product.name}\n💰 តម្លៃពិសេស៖ $${product.price.toFixed(2)}${origStr}\n👇 ចុចមើលរូបច្បាស់ៗ និងកម្ម៉ង់ទិញនៅទីនេះ៖\n${shareUrl}`;
    try {
      await navigator.clipboard.writeText(shareText);
      showToast(`🔗 បានចម្លងលីងម៉ូតកូដ [${product.code}] រួចរាល់! អាច Paste ផ្ញើឱ្យមិត្តភក្តិបានភ្លាម`);
    } catch {
      showToast(`🔗 លីងម៉ូត៖ ${shareUrl}`);
    }
  };

  const handleShareProduct = async (product: MiniAppProduct) => {
    const shareUrl = getProductShareUrl(product);
    const origStr =
      product.originalPrice > product.price ? ` (តម្លៃដើម $${product.originalPrice.toFixed(2)})` : '';
    const shareTitle = `[កូដ ${product.code}] ${product.name} — $${product.price.toFixed(2)}`;
    const shareText = `✨ [${product.code}] ${product.name} — តម្លៃពិសេស $${product.price.toFixed(2)}${origStr} នៅ ${config.storeName}`;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl
        });
        showToast(`✅ បានចែករំលែកលីងម៉ូតកូដ [${product.code}] រួចរាល់!`);
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    // Fallback or WebView mode: toggle quick share bar & copy link automatically
    setShowShareOptions(prev => !prev);
    await handleCopyProductLink(product);
  };

  const handleAskAboutProduct = async (product: MiniAppProduct) => {
    if (isInquiring) return;
    setIsInquiring(true);
    try {
      const res = await fetch('/api/miniapp/inquire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: product.code,
          name: product.name,
          price: product.price,
          customerName: customerName || (isFbMessenger ? 'អតិថិជន Facebook' : 'អតិថិជន Telegram'),
          telegramUsername,
          telegramUserId,
          fbPsid
        })
      });
      const data = await res.json();
      if (data.resolvedFbPsid) {
        setFbPsid(data.resolvedFbPsid);
        setIsFbMessenger(true);
        try {
          localStorage.setItem('fb_cust_psid', data.resolvedFbPsid);
        } catch {}
      }

      if (data.sentToCustomerChat) {
        showToast(`💬 បានផ្ញើម៉ូតកូដ [${product.code}] ចូលឆាតរបស់បងហើយ! សូមចូលឆាតវាយសំណួរបានភ្លាម`);
        setZoomProduct(null);
        if (window.Telegram?.WebApp?.close && telegramUserId) {
          setTimeout(() => {
            try {
              window.Telegram?.WebApp?.close();
            } catch {}
          }, 1200);
        }
        return;
      }

      // If opened in browser or without user ID yet, redirect cleanly to Bot or FB Page link
      if (isFbMessenger && config.fbPageId) {
        window.location.href = `https://m.me/${config.fbPageId}`;
        return;
      }
      if (config.botUsername) {
        window.location.href = `https://t.me/${config.botUsername}?start=ask_${encodeURIComponent(product.code)}`;
        return;
      }
      if (config.fbPageId) {
        window.location.href = `https://m.me/${config.fbPageId}`;
        return;
      }

      // Fallback: copy inquiry text to clipboard
      const askText = `សួស្តីបង! ខ្ញុំចង់សួរអំពីម៉ូតកូដ [${product.code}] — ${product.name} ($${product.price.toFixed(2)})`;
      navigator.clipboard.writeText(askText).catch(() => {});
      showToast(`💬 បានផ្ញើដំណឹងទៅម្ចាស់ហាង និងចម្លងកូដ [${product.code}] រួចរាល់!`);
    } catch {
      showToast('បានផ្ញើដំណឹងពីម៉ូតនេះទៅកាន់ម្ចាស់ហាង!', 'success');
    } finally {
      setIsInquiring(false);
    }
  };

  const activeSizeGuide = useMemo(() => {
    return Array.isArray(config.sizeGuide) && config.sizeGuide.length > 0
      ? config.sizeGuide
      : DEFAULT_SIZE_GUIDE;
  }, [config.sizeGuide]);

  const getWeightHintForSize = (sizeName: string): string => {
    const found = activeSizeGuide.find(r => r.size.toLowerCase() === sizeName.toLowerCase());
    return found?.weightRange || '';
  };

  const fetchCatalog = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/miniapp/catalog');
      const data = await res.json();
      if (data.success) {
        if (data.config) setConfig(prev => ({ ...prev, ...data.config }));
        if (Array.isArray(data.products)) {
          setProducts(data.products);
          // Default select first available variant for each product
          const initialSelections: Record<string, string> = {};
          for (const p of data.products) {
            const firstAvailable = p.variants.find((v: MiniAppVariant) => v.stock > 0) || p.variants[0];
            if (firstAvailable) {
              initialSelections[p.id] = firstAvailable.id;
            }
          }
          setSelectedVariants(prev => ({ ...initialSelections, ...prev }));

          // If deep-linked via ?code=A02, auto-open that product's zoom modal
          const codeParam = new URLSearchParams(window.location.search).get('code');
          if (codeParam) {
            const matched = data.products.find(
              (p: MiniAppProduct) => p.code.toUpperCase() === codeParam.trim().toUpperCase()
            );
            if (matched) {
              setZoomProduct(matched);
              setZoomImageIdx(0);
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch MiniApp catalog:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminData = async () => {
    try {
      const res = await fetch('/api/miniapp/admin/data');
      const data = await res.json();
      if (data.success) {
        setConfig(prev => ({ ...prev, ...data.config }));
        setProducts(data.products || []);
        setAdminOrders(data.orders || []);
        if (Array.isArray(data.orders)) {
          const initialTrack: Record<string, string> = {};
          for (const o of data.orders) {
            if (o.trackingInfo) initialTrack[o.id] = o.trackingInfo;
          }
          setTrackingInputs(prev => ({ ...initialTrack, ...prev }));
        }
        if (Array.isArray(data.connectedFbPages)) {
          setConnectedFbPages(data.connectedFbPages);
        }
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    }
  };

  useEffect(() => {
    if (isAdminOpen && isAdminUnlocked) {
      fetchAdminData();
    }
  }, [isAdminOpen, isAdminUnlocked]);

  // Filter products based on search, category, wishlist, and size (Always sort In-Stock items first!)
  const filteredProducts = useMemo(() => {
    const filtered = products.filter(p => {
      if (onlyWishlist && !wishlistIds.includes(p.id)) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = p.code.toLowerCase().includes(q);
        const matchName = p.name.toLowerCase().includes(q);
        const matchColor = p.variants.some(v => v.color.toLowerCase().includes(q));
        if (!matchCode && !matchName && !matchColor) return false;
      }

      // Category filter
      if (activeCategory === 'women') {
        if (p.category !== 'women' && p.category !== 'unisex') return false;
      } else if (activeCategory === 'men') {
        if (p.category !== 'men' && p.category !== 'unisex') return false;
      } else if (activeCategory === 'kids') {
        if (p.category !== 'kids') return false;
      }

      // Size filter
      if (activeSize !== 'ទាំងអស់') {
        const hasSizeInStock = p.variants.some(v => v.size === activeSize && v.stock > 0);
        if (!hasSizeInStock) return false;
      }

      return true;
    });

    // Sort in-stock items before sold-out items, then apply user sort preference
    return [...filtered].sort((a, b) => {
      const stockA = a.variants.reduce((acc, v) => acc + v.stock, 0);
      const stockB = b.variants.reduce((acc, v) => acc + v.stock, 0);
      if (stockA > 0 && stockB <= 0) return -1;
      if (stockA <= 0 && stockB > 0) return 1;

      if (sortBy === 'price_asc') return a.price - b.price;
      if (sortBy === 'price_desc') return b.price - a.price;
      if (sortBy === 'discount') {
        const discA = a.originalPrice > a.price ? (a.originalPrice - a.price) / a.originalPrice : 0;
        const discB = b.originalPrice > b.price ? (b.originalPrice - b.price) / b.originalPrice : 0;
        return discB - discA;
      }
      return 0;
    });
  }, [products, searchQuery, activeCategory, activeSize, sortBy, onlyWishlist, wishlistIds]);

  const handleLookupOrders = async (queryOverride?: string) => {
    const q = (queryOverride ?? orderLookupQuery ?? phone).trim();
    if (!q) {
      showToast('សូមបញ្ចូលលេខទូរស័ព្ទ ឬលេខវិក្កយបត្រដើម្បីស្វែងរក', 'error');
      return;
    }
    setIsLookingUpOrder(true);
    try {
      const res = await fetch(`/api/miniapp/orders/lookup?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.orders)) {
        if (data.orders.length === 0 && queryOverride === undefined) {
          showToast('មិនឃើញវិក្កយបត្រត្រូវនឹងលេខនេះទេ', 'error');
          return;
        }
        if (data.orders.length > 0) {
          setMyOrders(prev => {
            const map = new Map<string, MiniAppOrder>();
            for (const o of data.orders) map.set(o.id, o);
            for (const o of prev) {
              if (!map.has(o.id)) map.set(o.id, o);
            }
            const merged = Array.from(map.values()).slice(0, 25);
            try {
              localStorage.setItem('tg_miniapp_my_orders', JSON.stringify(merged));
            } catch {}
            return merged;
          });
          if (queryOverride === undefined) {
            showToast(`✅ រកឃើញវិក្កយបត្រចំនួន ${data.orders.length}!`);
          }
        }
      }
    } catch {
      if (queryOverride === undefined) {
        showToast('មិនអាចភ្ជាប់ស្វែងរកវិក្កយបត្របានទេ', 'error');
      }
    } finally {
      setIsLookingUpOrder(false);
    }
  };

  // Cart calculations
  const totalCartItems = useMemo(() => cart.reduce((sum, item) => sum + item.qty, 0), [cart]);
  const cartSubtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.qty, 0), [cart]);
  const shippingFee = useMemo(() => {
    if (cart.length === 0) return 0;
    if (config.freeShippingThreshold > 0 && cartSubtotal >= config.freeShippingThreshold) return 0;
    return zone === 'PROVINCE' ? config.shippingFeeProvince : config.shippingFeePP;
  }, [cart.length, cartSubtotal, zone, config.freeShippingThreshold, config.shippingFeeProvince, config.shippingFeePP]);
  const cartTotal = useMemo(() => Number((cartSubtotal + shippingFee).toFixed(2)), [cartSubtotal, shippingFee]);

  const handleAddToCart = (product: MiniAppProduct, explicitVariant?: MiniAppVariant) => {
    const chosenVariantId = explicitVariant?.id || selectedVariants[product.id];
    const variant = product.variants.find(v => v.id === chosenVariantId) || product.variants.find(v => v.stock > 0);

    if (!variant || variant.stock <= 0) {
      showToast('ម៉ូតនេះអស់ស្តុកហើយ!', 'error');
      return;
    }

    setCart(prev => {
      const existingIdx = prev.findIndex(item => item.productId === product.id && item.variantId === variant.id);
      if (existingIdx >= 0) {
        const currentQty = prev[existingIdx].qty;
        if (currentQty >= variant.stock) {
          showToast(`សល់ត្រឹមតែ ${variant.stock} ឈុតប៉ុណ្ណោះក្នុងស្តុក!`, 'error');
          return prev;
        }
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          qty: currentQty + 1,
          maxStock: variant.stock
        };
        showToast(`បានបន្ថែម [${product.code}] ${variant.color} - ${variant.size} ចូលកន្ត្រក!`);
        return updated;
      } else {
        showToast(`បានដាក់ [${product.code}] ${variant.color} - ${variant.size} ចូលកន្ត្រក!`);
        return [
          ...prev,
          {
            productId: product.id,
            code: product.code,
            name: product.name,
            price: product.price,
            variantId: variant.id,
            color: variant.color,
            size: variant.size,
            qty: 1,
            maxStock: variant.stock,
            imageUrl: product.imageUrl
          }
        ];
      }
    });
  };

  const handleUpdateCartQty = (productId: string, variantId: string, delta: number) => {
    setCart(prev =>
      prev
        .map(item => {
          if (item.productId === productId && item.variantId === variantId) {
            const nextQty = item.qty + delta;
            if (nextQty > item.maxStock) {
              showToast(`សល់ត្រឹមតែ ${item.maxStock} ឈុតប៉ុណ្ណោះ!`, 'error');
              return item;
            }
            return nextQty > 0 ? { ...item, qty: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const compressImageOnClient = (rawFile: File, target: 'slip' | 'product' | 'logo' | 'khqr'): Promise<string> => {
    return new Promise((resolve, reject) => {
      // Keep original file 100% untouched if <= 1.5MB for maximum crystal-clear studio sharpness
      if (rawFile.size <= 1536 * 1024 && ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(rawFile.type)) {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('FileReader error'));
          }
        };
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(rawFile);
        return;
      }

      const objectUrl = URL.createObjectURL(rawFile);
      const img = new Image();
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Image load error'));
      };
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        try {
          const canvas = document.createElement('canvas');
          // Ultra-HD 2000px resolution at 0.95 quality so clothing fabric & details stay razor-sharp when zoomed
          const maxDim = target === 'logo' ? 1000 : target === 'khqr' ? 1500 : target === 'slip' ? 1600 : 2000;
          let w = img.naturalWidth || img.width || 1800;
          let h = img.naturalHeight || img.height || 1800;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
            resolve(dataUrl);
          } else {
            reject(new Error('Canvas context error'));
          }
        } catch (e) {
          reject(e);
        }
      };
      img.src = objectUrl;
    });
  };

  const uploadBase64ToServer = async (base64Data: string): Promise<string> => {
    if (!base64Data.startsWith('data:image/') || base64Data.startsWith('data:image/svg+xml')) {
      return base64Data;
    }

    const CHUNK_SIZE = 550_000; // ~550KB per request, always safely below Nginx's default 1MB limit

    // If image is > 550KB Base64, upload in chunks so Ultra-HD images never hit 413 Payload Too Large
    if (base64Data.length > CHUNK_SIZE) {
      const uploadId = `up_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);
      for (let i = 0; i < totalChunks; i++) {
        const chunkData = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        let chunkOk = false;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch('/api/miniapp/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                uploadId,
                chunkIndex: i,
                totalChunks,
                chunkData
              })
            });
            if (res.ok) {
              const data = await res.json();
              chunkOk = true;
              if (data.success && data.url) {
                return String(data.url);
              }
              break;
            }
          } catch {}
        }
        if (!chunkOk) break;
      }
    }

    // Standard single-request upload for images <= 550KB
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch('/api/miniapp/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64Data })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.url) {
            return String(data.url);
          }
        }
      } catch {}
    }
    return base64Data;
  };

  const handleUploadFile = async (file: File, target: 'slip' | 'product' | 'logo' | 'khqr', silentToast = false) => {
    if (target === 'slip') setIsUploadingSlip(true);
    else setIsUploadingProductImg(true);

    try {
      // If uploading a KHQR screenshot in Admin Settings, automatically decode the real EMVCo QR string using jsQR!
      let decodedKhqrMeta: Partial<MiniAppConfig> = {};
      if (target === 'khqr') {
        try {
          const { qrString } = await decodeQRFromImageFile(file);
          if (qrString) {
            const parsed = parseBakongKHQRString(qrString);
            decodedKhqrMeta.khqrRawString = qrString;
            if (parsed.isValidKHQR) {
              if (parsed.accountNumber) decodedKhqrMeta.khqrAccountNumber = parsed.accountNumber;
              if (parsed.bakongAccountId) decodedKhqrMeta.khqrBakongId = parsed.bakongAccountId;
              if (parsed.merchantName) decodedKhqrMeta.khqrMerchantName = parsed.merchantName;
            }
          }
        } catch {}
      }

      const compressedBase64 = await compressImageOnClient(file, target);

      // Immediately preview the compressed image so user sees it right away
      if (target === 'slip') {
        setPaymentSlipUrl(compressedBase64);
      } else if (target === 'logo') {
        setConfig(prev => ({ ...prev, storeLogoUrl: compressedBase64 }));
      } else if (target === 'khqr') {
        setConfig(prev => ({ ...prev, ...decodedKhqrMeta, khqrImageUrl: compressedBase64 }));
      }

      const finalUploadedUrl = await uploadBase64ToServer(compressedBase64);

      if (target === 'slip') {
        setPaymentSlipUrl(finalUploadedUrl);
      } else if (target === 'logo') {
        setConfig(prev => ({ ...prev, storeLogoUrl: finalUploadedUrl }));
      } else if (target === 'khqr') {
        setConfig(prev => ({ ...prev, ...decodedKhqrMeta, khqrImageUrl: finalUploadedUrl }));
      } else if (target === 'product') {
        setFormImages(prev => {
          const next = [...prev, finalUploadedUrl];
          setFormImageUrl(next[0] || finalUploadedUrl);
          return next;
        });
      }

      if (target === 'slip') {
        showToast('✅ បានភ្ជាប់រូបស្លីបបង់ប្រាក់រួចរាល់!');
      } else if (target === 'logo') {
        const updatedCfg = { ...config, storeLogoUrl: finalUploadedUrl };
        await fetch('/api/miniapp/admin/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedCfg)
        }).catch(() => null);
        showToast('✅ បានប្តូររូបឡូហ្គោហាងរួចរាល់!');
      } else if (target === 'khqr') {
        const updatedCfg = { ...config, ...decodedKhqrMeta, khqrImageUrl: finalUploadedUrl };
        await fetch('/api/miniapp/admin/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedCfg)
        }).catch(() => null);
        showToast(
          decodedKhqrMeta.khqrAccountNumber
            ? `✅ បានអានកូដ KHQR ស្វ័យប្រវត្តិ (គណនី ${decodedKhqrMeta.khqrAccountNumber})!`
            : '✅ បានដាក់រូប KHQR ធនាគាររបស់ហាងរួចរាល់!'
        );
      } else if (!silentToast) {
        showToast('✅ បានបង្ហោះរូបម៉ូតខោអាវរួចរាល់!');
      }
    } catch {
      showToast('មិនអាចអានរូបភាពបានទេ សូមជ្រើសរើសរូបផ្សេង', 'error');
    } finally {
      if (target === 'slip') {
        setIsUploadingSlip(false);
      } else if (!silentToast) {
        setIsUploadingProductImg(false);
      }
    }
  };

  const handleUploadMultipleProductFiles = async (fileList: FileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setIsUploadingProductImg(true);
    try {
      for (let i = 0; i < files.length; i++) {
        await handleUploadFile(files[i], 'product', true);
      }
      showToast(`✅ បានបង្ហោះរូបភាពចំនួន ${files.length} សន្លឹករួចរាល់!`);
    } finally {
      setIsUploadingProductImg(false);
    }
  };

  // Live 5-minute countdown timer when on the KHQR Scan screen
  useEffect(() => {
    if (!isCheckoutOpen || checkoutStep !== 'KHQR_SCAN') return;
    const timer = setInterval(() => {
      setQrCountdown(prev => (prev > 0 ? prev - 1 : 300));
    }, 1000);
    return () => clearInterval(timer);
  }, [isCheckoutOpen, checkoutStep]);

  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Extract clean ABA Account Number (digits only) for display & copy
  const cleanAbaAccountNumber = useMemo(() => {
    if (config.khqrAccountNumber && /\d{6,}/.test(config.khqrAccountNumber)) {
      return config.khqrAccountNumber.replace(/\s+/g, '');
    }
    const matchFromInfo = (config.khqrAccountInfo || '').match(/\d[\d\s]{5,}\d/);
    if (matchFromInfo) {
      return matchFromInfo[0].replace(/\s+/g, '');
    }
    return '000474559';
  }, [config.khqrAccountNumber, config.khqrAccountInfo]);

  // Real NBC EMVCo Dynamic Bakong KHQR String (Scannable by ABA Mobile, ACLEDA, Wing, Bakong, etc.)
  const realKhqrPayloadString = useMemo(() => {
    try {
      // If merchant uploaded a real KHQR and we decoded its account info, use that for dynamic amount generation
      const parsedRaw = config.khqrRawString ? parseBakongKHQRString(config.khqrRawString) : null;
      const effectiveAccount = parsedRaw?.accountNumber || cleanAbaAccountNumber;
      const effectiveBakongId = parsedRaw?.bakongAccountId || config.khqrBakongId || 'abaakhppxxx@abaa';
      const effectiveMerchantType = parsedRaw?.merchantType || 'merchant';
      const effectiveMerchantName = config.khqrMerchantName || parsedRaw?.merchantName || config.storeName || 'Kari Arnett';

      return generateBakongKHQRString({
        amount: Number(cartTotal.toFixed(2)),
        currency: 'USD',
        storeLabel: effectiveMerchantName,
        config: {
          bankName: 'ABA Bank',
          accountNumber: effectiveAccount,
          accountName: effectiveMerchantName,
          merchantName: effectiveMerchantName,
          bakongAccountId: effectiveBakongId,
          merchantCity: parsedRaw?.merchantCity || 'Phnom Penh',
          currency: 'USD',
          qrMode: 'dynamic',
          merchantType: effectiveMerchantType,
          acquiringBank: parsedRaw?.acquiringBank || 'abaa',
          enabled: true
        }
      });
    } catch {
      return config.khqrRawString || '';
    }
  }, [cartTotal, cleanAbaAccountNumber, config.khqrBakongId, config.khqrMerchantName, config.khqrRawString, config.storeName]);

  const [generatedKhqrDataUrl, setGeneratedKhqrDataUrl] = useState<string>('');

  useEffect(() => {
    if (!realKhqrPayloadString) return;
    generateKHQRDataUrl(realKhqrPayloadString, { width: 480, margin: 1 })
      .then(url => setGeneratedKhqrDataUrl(url))
      .catch(() => {});
  }, [realKhqrPayloadString]);

  const hasCustomUploadedKhqrImage = Boolean(
    config.khqrImageUrl &&
      !config.khqrImageUrl.includes('api.qrserver.com') &&
      !config.khqrRawString
  );

  const getKhqrQrSrc = (): string => {
    if (hasCustomUploadedKhqrImage) return config.khqrImageUrl;
    if (generatedKhqrDataUrl) return generatedKhqrDataUrl;
    return `https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=4&data=${encodeURIComponent(realKhqrPayloadString)}`;
  };

  // Direct 1-Click Open ABA Mobile App (plus auto-copy ABA account number for instant paste if needed)
  const handleOpenAbaDirect = () => {
    try {
      navigator.clipboard?.writeText(cleanAbaAccountNumber).catch(() => {});
    } catch {}

    const customAbaLink = (config.abaPaymentLink || '').trim();
    if (customAbaLink && (customAbaLink.startsWith('http://') || customAbaLink.startsWith('https://') || customAbaLink.startsWith('abamobilebank://'))) {
      showToast(`🚀 កំពុងបើកកម្មវិធី ABA Mobile... (គណនី ${cleanAbaAccountNumber})`);
      try {
        const tgWebApp = (window as any).Telegram?.WebApp;
        if (tgWebApp && typeof tgWebApp.openLink === 'function' && customAbaLink.startsWith('http')) {
          tgWebApp.openLink(customAbaLink);
          return;
        }
      } catch {}
      window.location.href = customAbaLink;
      return;
    }

    // Standard ABA Mobile Deep Link with encoded real EMVCo KHQR payload
    const abaSchemeUrl = `abamobilebank://ababank.com?type=payway&qrcode=${encodeURIComponent(realKhqrPayloadString)}`;
    showToast(`🚀 កំពុងបើក ABA Mobile និងចម្លងលេខគណនី ${cleanAbaAccountNumber} ស្វ័យប្រវត្តិ!`);

    try {
      const a = document.createElement('a');
      a.href = abaSchemeUrl;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      window.location.href = abaSchemeUrl;
    }
  };

  // Renders the complete official Bakong KHQR Card to a high-res PNG Blob for Save / Share
  const generateKhqrCardBlob = async (): Promise<Blob | null> => {
    return new Promise(resolve => {
      try {
        const canvas = document.createElement('canvas');
        const W = 720;
        const H = 1000;
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        // Outer clean background
        ctx.fillStyle = '#F4F5F7';
        ctx.fillRect(0, 0, W, H);

        // Card container
        const cardX = 50;
        const cardY = 45;
        const cardW = W - 100;
        const cardH = H - 90;
        const radius = 44;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, radius);
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(15,23,42,0.10)';
        ctx.shadowBlur = 32;
        ctx.shadowOffsetY = 12;
        ctx.fill();
        ctx.restore();

        // Clip inside card for header
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, radius);
        ctx.clip();

        // Official KHQR Red top header (#CE3232) with right diagonal notch
        ctx.fillStyle = '#CE3232';
        ctx.beginPath();
        ctx.moveTo(cardX, cardY);
        ctx.lineTo(cardX + cardW, cardY);
        ctx.lineTo(cardX + cardW, cardY + 152);
        ctx.lineTo(cardX + cardW - 105, cardY + 106);
        ctx.lineTo(cardX, cardY + 106);
        ctx.closePath();
        ctx.fill();

        // White KHQR title in header
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 42px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('KHQR', W / 2, cardY + 68);

        // Merchant Name & Total Amount
        ctx.textAlign = 'left';
        ctx.fillStyle = '#0F172A';
        ctx.font = '800 28px system-ui, -apple-system, sans-serif';
        ctx.fillText(config.khqrMerchantName || config.storeName, cardX + 52, cardY + 166);

        ctx.font = '900 54px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#0F172A';
        ctx.fillText(`$${cartTotal.toFixed(2)}`, cardX + 52, cardY + 232);

        // Dashed divider
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 10]);
        ctx.beginPath();
        ctx.moveTo(cardX + 48, cardY + 268);
        ctx.lineTo(cardX + cardW - 48, cardY + 268);
        ctx.stroke();
        ctx.setLineDash([]);

        // Inner QR rounded border box
        const qrBoxX = cardX + 52;
        const qrBoxY = cardY + 302;
        const qrBoxSize = cardW - 104;
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 32);
        ctx.stroke();

        // Draw genuine EMVCo QR directly onto the canvas
        if (!hasCustomUploadedKhqrImage && realKhqrPayloadString) {
          drawKHQRToCanvas(ctx, realKhqrPayloadString, W / 2, qrBoxY + 36, qrBoxSize - 72);
          const cx = qrBoxX + qrBoxSize / 2;
          const cy = qrBoxY + qrBoxSize / 2;
          ctx.beginPath();
          ctx.arc(cx, cy, 40, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(cx, cy, 35, 0, Math.PI * 2);
          ctx.fillStyle = '#CE3232';
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '900 16px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('KHQR', cx, cy);
          ctx.restore();
          canvas.toBlob(blob => resolve(blob), 'image/png', 1.0);
          return;
        }

        const qrImg = new Image();
        qrImg.crossOrigin = 'anonymous';
        qrImg.onload = () => {
          const pad = 30;
          ctx.drawImage(qrImg, qrBoxX + pad, qrBoxY + pad, qrBoxSize - pad * 2, qrBoxSize - pad * 2);
          ctx.restore();
          canvas.toBlob(blob => resolve(blob), 'image/png', 1.0);
        };
        qrImg.onerror = () => {
          ctx.restore();
          canvas.toBlob(blob => resolve(blob), 'image/png', 1.0);
        };
        qrImg.src = getKhqrQrSrc();
      } catch {
        resolve(null);
      }
    });
  };

  const handleSaveKhqrImage = async () => {
    if (isGeneratingKhqrCard) return;
    setIsGeneratingKhqrCard(true);
    try {
      const blob = await generateKhqrCardBlob();
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `KHQR-${(config.khqrMerchantName || 'Shop').replace(/\s+/g, '_')}-${cartTotal.toFixed(2)}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        showToast('✅ បានរក្សាទុករូប KHQR ចូលទូរស័ព្ទរួចរាល់! អាចបើកស្កេនក្នុង ABA / ធនាគារបានភ្លាម');
      } else {
        window.open(getKhqrQrSrc(), '_blank');
      }
    } catch {
      showToast('មិនអាចរក្សាទុករូប QR បានទេ', 'error');
    } finally {
      setIsGeneratingKhqrCard(false);
    }
  };

  const handleShareKhqrImage = async () => {
    if (isGeneratingKhqrCard) return;
    setIsGeneratingKhqrCard(true);
    try {
      const blob = await generateKhqrCardBlob();
      if (blob && navigator.share) {
        const file = new File([blob], `KHQR-${cartTotal.toFixed(2)}.png`, { type: 'image/png' });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `KHQR ${config.storeName} ($${cartTotal.toFixed(2)})`,
            text: `ទូទាត់ប្រាក់ $${cartTotal.toFixed(2)} ទៅកាន់ ${config.khqrMerchantName || config.storeName} (ABA: ${cleanAbaAccountNumber})`,
            files: [file]
          });
          showToast('✅ បានចែករំលែករូប KHQR រួចរាល់!');
          return;
        }
      }
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `KHQR-${cartTotal.toFixed(2)}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        showToast('✅ បានទាញយករូប KHQR សម្រាប់ចែករំលែកទៅកម្មវិធីធនាគារ!');
      }
    } catch {
      // User cancelled share sheet or fallback
    } finally {
      setIsGeneratingKhqrCard(false);
    }
  };

  const handleChoosePaymentMethod = (chosen: 'KHQR' | 'ABA_KHQR' | 'COD') => {
    if (cart.length === 0) {
      showToast('កន្ត្រកទំនិញទទេ!', 'error');
      return;
    }
    if (!phone.trim() || !address.trim()) {
      setIsEditingAddress(true);
      showToast('សូមបំពេញលេខទូរស័ព្ទ និងអាសយដ្ឋានដឹកជញ្ជូនជាមុនសិន!', 'error');
      return;
    }
    try {
      localStorage.setItem('tg_cust_name', customerName);
      localStorage.setItem('tg_cust_phone', phone);
      localStorage.setItem('tg_cust_address', address);
    } catch {}
    setIsEditingAddress(false);

    if (chosen === 'COD') {
      setPaymentMethod('COD');
      submitOrderWithMethod('COD');
    } else {
      setPaymentMethod('KHQR');
      setSelectedKhqrType(chosen);
      setQrCountdown(300);
      setCheckoutStep('KHQR_SCAN');
      // If user clicked ABA QR, immediately trigger ABA Mobile direct launch!
      if (chosen === 'ABA_KHQR') {
        setTimeout(() => {
          handleOpenAbaDirect();
        }, 120);
      }
    }
  };

  const submitOrderWithMethod = async (methodOverride?: 'KHQR' | 'COD') => {
    const finalMethod = methodOverride || paymentMethod;
    if (cart.length === 0) {
      showToast('កន្ត្រកទំនិញទទេ!', 'error');
      return;
    }
    if (!phone.trim()) {
      setIsEditingAddress(true);
      showToast('សូមបញ្ចូលលេខទូរស័ព្ទរបស់អ្នក!', 'error');
      return;
    }
    if (!address.trim()) {
      setIsEditingAddress(true);
      showToast('សូមបញ្ចូលទីតាំងដឹកជញ្ជូនរបស់អ្នក!', 'error');
      return;
    }

    try {
      setIsSubmittingOrder(true);
      localStorage.setItem('tg_cust_name', customerName);
      localStorage.setItem('tg_cust_phone', phone);
      localStorage.setItem('tg_cust_address', address);

      const res = await fetch('/api/miniapp/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName:
            customerName.trim() || (isFbMessenger ? 'អតិថិជន Facebook Page' : 'អតិថិជន Telegram'),
          telegramUsername,
          telegramUserId,
          channel: isFbMessenger ? 'FACEBOOK' : telegramUserId ? 'TELEGRAM' : 'WEB',
          fbPsid: fbPsid || undefined,
          phone: phone.trim(),
          address: address.trim(),
          zone,
          deliveryCompany,
          paymentMethod: finalMethod,
          paymentSlipUrl,
          items: cart,
          note: orderNote.trim()
        })
      });
      const data = await res.json();
      if (!data.success) {
        showToast(data.error || 'មិនអាចកម្ម៉ង់បានទេ', 'error');
        fetchCatalog();
        return;
      }

      if (Array.isArray(data.products)) {
        setProducts(data.products);
      }
      if (data.order?.fbPsid) {
        setFbPsid(data.order.fbPsid);
        setIsFbMessenger(true);
        try {
          localStorage.setItem('fb_cust_psid', data.order.fbPsid);
        } catch {}
      }
      setCart([]);
      setPaymentSlipUrl('');
      setOrderNote('');
      setCheckoutStep('SUMMARY');
      setIsCheckoutOpen(false);
      setCompletedOrder(data.order);

      const updatedHistory = [data.order, ...myOrders].slice(0, 20);
      setMyOrders(updatedHistory);
      try {
        localStorage.setItem('tg_miniapp_my_orders', JSON.stringify(updatedHistory));
      } catch {}

      showToast(
        data.sentToFbChat
          ? '🎉 កម្ម៉ង់ជោគជ័យ! បានផ្ញើវិក្កយបត្រចូលឆាត Messenger របស់បងហើយ!'
          : '🎉 កម្ម៉ង់ជោគជ័យ! អរគុណសម្រាប់ការគាំទ្រ'
      );
    } catch {
      showToast('មានបញ្ហាបណ្តាញ សូមព្យាយាមម្តងទៀត', 'error');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitOrderWithMethod();
  };

  // Admin Handlers
  const handleUnlockAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/miniapp/admin/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPinInput })
      });
      const data = await res.json();
      if (data.success) {
        setIsAdminUnlocked(true);
        sessionStorage.setItem('tg_miniapp_admin_unlocked', 'true');
        setAdminPinInput('');
        fetchAdminData();
      } else {
        showToast(data.error || 'លេខកូដ PIN មិនត្រឹមត្រូវ', 'error');
      }
    } catch {
      showToast('មិនអាចផ្ទៀងផ្ទាត់ PIN បានទេ', 'error');
    }
  };

  const openEditProductModal = (prod?: MiniAppProduct) => {
    if (prod) {
      const existingImgs = getProductImages(prod);
      setEditingProduct(prod);
      setFormCode(prod.code);
      setFormName(prod.name);
      setFormPrice(String(prod.price));
      setFormOrigPrice(String(prod.originalPrice));
      setFormCategory(prod.category);
      setFormImageUrl(existingImgs[0] || prod.imageUrl);
      setFormImages(existingImgs);
      setFormVariants(prod.variants.length > 0 ? prod.variants : [{ id: 'v-1', color: 'ស', size: 'Size M', stock: 1 }]);
    } else {
      setEditingProduct(null);
      const nextNum = products.length + 1;
      setFormCode(`A0${nextNum}`);
      setFormName('');
      setFormPrice('6.50');
      setFormOrigPrice('10.00');
      setFormCategory('women');
      setFormImageUrl('');
      setFormImages([]);
      setFormVariants([
        { id: `v-${Date.now()}-1`, color: 'ស', size: 'Size M', stock: 1 },
        { id: `v-${Date.now()}-2`, color: 'ខ្មៅ', size: 'Size L', stock: 1 }
      ]);
    }
    setIsProductFormOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploadingProductImg) {
      showToast('⏳ សូមរង់ចាំការបង្ហោះរូបភាពឱ្យចប់សិន...', 'error');
      return;
    }
    if (isSavingProduct) return;

    setIsSavingProduct(true);
    try {
      // Ensure any inline base64 images are uploaded individually first so the POST body stays tiny (< 5KB)
      const rawList = formImages.filter(Boolean);
      const uploadedImages: string[] = [];
      for (const imgItem of rawList) {
        if (imgItem.startsWith('data:image/') && !imgItem.startsWith('data:image/svg+xml')) {
          const serverUrl = await uploadBase64ToServer(imgItem);
          uploadedImages.push(serverUrl);
        } else {
          uploadedImages.push(imgItem);
        }
      }

      let primaryImage = uploadedImages[0] || formImageUrl;
      if (primaryImage && primaryImage.startsWith('data:image/') && !primaryImage.startsWith('data:image/svg+xml')) {
        primaryImage = await uploadBase64ToServer(primaryImage);
      }

      const res = await fetch('/api/miniapp/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingProduct?.id,
          code: formCode,
          name: formName,
          price: parseFloat(formPrice) || 0,
          originalPrice: parseFloat(formOrigPrice) || 0,
          category: formCategory,
          imageUrl: primaryImage,
          images: uploadedImages.length > 0 ? uploadedImages : primaryImage ? [primaryImage] : [],
          variants: formVariants
        })
      });

      if (!res.ok) {
        let errText = 'មិនអាចរក្សាទុកបានទេ';
        try {
          const errJson = await res.json();
          if (errJson?.error) errText = errJson.error;
        } catch {
          if (res.status === 413) {
            errText = 'ទំហំរូបភាពធំពេក សូមលុបរូបចាស់រួចជ្រើសរើសរូបម្តងទៀត';
          }
        }
        showToast(errText, 'error');
        return;
      }

      const data = await res.json();
      if (data.success) {
        setProducts(data.products);
        setIsProductFormOpen(false);
        showToast('✅ រក្សាទុកម៉ូតខោអាវដោយជោគជ័យ!');
      } else {
        showToast(data.error || 'មិនអាចរក្សាទុកបានទេ', 'error');
      }
    } catch {
      showToast('កំហុសបណ្តាញពេលរក្សាទុកម៉ូតខោអាវ', 'error');
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      const res = await fetch(`/api/miniapp/admin/products/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setProducts(data.products);
        showToast('បានលុបម៉ូតខោអាវរួចរាល់!');
      }
    } catch {
      showToast('មិនអាចលុបបានទេ', 'error');
    }
  };

  const handleQuickRestockProduct = async (id: string, code: string) => {
    try {
      const res = await fetch(`/api/miniapp/admin/products/${id}/restock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addQty: 3 })
      });
      const data = await res.json();
      if (data.success) {
        setProducts(data.products);
        showToast(`✅ បានបន្ថែមស្តុក +3 គ្រប់ Size សម្រាប់កូដ ${code}!`);
      }
    } catch {
      showToast('មិនអាចបន្ថែមស្តុកបានទេ', 'error');
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: MiniAppOrder['status']) => {
    try {
      const trackingInfo = trackingInputs[orderId];
      const res = await fetch(`/api/miniapp/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, trackingInfo })
      });
      const data = await res.json();
      if (data.success) {
        setAdminOrders(data.orders);
        setProducts(data.products);
        // Also update local customer order history if testing on same device
        setMyOrders(prev => {
          const next = prev.map(o =>
            o.id === orderId ? { ...o, status, trackingInfo: trackingInfo ?? o.trackingInfo } : o
          );
          try {
            localStorage.setItem('tg_miniapp_my_orders', JSON.stringify(next));
          } catch {}
          return next;
        });
        if (data.notifiedCustomer) {
          showToast(`🔔 បានប្តូរស្ថានភាព #${orderId} និងផ្ញើសារជូនដំណឹងចូលឆាតភ្ញៀវរួចរាល់!`);
        } else {
          showToast(`✅ បានប្តូរស្ថានភាពអর্ডার #${orderId} ទៅជា ${status}`);
        }
      }
    } catch {
      showToast('មិនអាចប្តូរស្ថានភាពបានទេ', 'error');
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/miniapp/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        showToast('បានរក្សាទុកការកំណត់ហាងរួចរាល់!');
      }
    } catch {
      showToast('មិនអាចរក្សាទុកការកំណត់បានទេ', 'error');
    }
  };

  const miniAppPublicUrl =
    typeof window !== 'undefined' && window.location.origin.startsWith('https://')
      ? `${window.location.origin}/miniapp`
      : 'https://chatbotkh.com/miniapp';

  const handleSetupTelegramBot = async () => {
    setIsSettingUpBot(true);
    try {
      const targetUrl = (config.miniAppUrl || miniAppPublicUrl).trim();
      const effectiveToken = (botTokenInput.trim() || config.telegramBotToken || '').trim();
      const res = await fetch('/api/miniapp/admin/setup-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: effectiveToken || undefined,
          miniAppUrl: targetUrl,
          menuButtonText: config.menuButtonText || '🛍️ ទិញទំនិញ'
        })
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        showToast(`ភ្ជាប់ជោគជ័យជាមួយ @${data.botUsername}! ភ្ញៀវអាចចុចប៊ូតុងហាងក្នុង Bot បានភ្លាមៗ!`);
      } else {
        showToast(data.error || 'មិនអាចភ្ជាប់ទៅ Telegram Bot បានទេ', 'error');
      }
    } catch {
      showToast('មានបញ្ហាក្នុងការភ្ជាប់ទៅ Telegram Bot', 'error');
    } finally {
      setIsSettingUpBot(false);
    }
  };

  const handleSendShopCardToGroup = async () => {
    setIsSendingShopCard(true);
    try {
      const res = await fetch('/api/miniapp/admin/send-shop-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success) {
        showToast('បានផ្ញើប៊ូតុងហាងទំនិញចូល Telegram រួចរាល់!');
      } else {
        showToast(data.error || 'មិនអាចផ្ញើសារចូល Telegram បានទេ', 'error');
      }
    } catch {
      showToast('មានបញ្ហាក្នុងការផ្ញើសារទៅ Telegram', 'error');
    } finally {
      setIsSendingShopCard(false);
    }
  };

  const handleSetupFacebookPage = async () => {
    setIsSettingUpFbPage(true);
    try {
      const targetUrl = (config.miniAppUrl || miniAppPublicUrl).trim();
      const effectiveFbToken = (fbTokenInput.trim() || config.fbPageAccessToken || '').trim();
      const res = await fetch('/api/miniapp/admin/setup-fb-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fbPageAccessToken: effectiveFbToken || undefined,
          miniAppUrl: targetUrl,
          fbButtonText: config.fbButtonText || '🛍️ ចុចទិញទំនិញ',
          fbAutoReplyEnabled: config.fbAutoReplyEnabled ?? true,
          fbVerifyToken: config.fbVerifyToken || '1688'
        })
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        showToast(`ភ្ជាប់ជោគជ័យជាមួយ Facebook Page "${data.pageName}"! ${data.note || ''}`);
      } else {
        showToast(data.error || 'មិនអាចភ្ជាប់ទៅ Facebook Page បានទេ', 'error');
      }
    } catch {
      showToast('មានបញ្ហាក្នុងការភ្ជាប់ទៅ Facebook Page', 'error');
    } finally {
      setIsSettingUpFbPage(false);
    }
  };

  const handleSendFbTestCard = async () => {
    setIsSendingFbTestCard(true);
    try {
      const res = await fetch('/api/miniapp/admin/send-fb-test-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success) {
        showToast(`បានផ្ញើប៊ូតុងហាងទំនិញចូលឆាតភ្ញៀវ "${data.customerName}" រួចរាល់!`);
      } else {
        showToast(data.error || 'មិនអាចផ្ញើប៊ូតុងហាងទៅឆាតភ្ញៀវបានទេ', 'error');
      }
    } catch {
      showToast('មានបញ្ហាក្នុងការផ្ញើសារទៅ Facebook Messenger', 'error');
    } finally {
      setIsSendingFbTestCard(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex justify-center antialiased selection:bg-[#DB1D43] selection:text-white">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-3 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2.5 rounded-2xl font-bold text-xs shadow-xl flex items-center gap-2 transition-all ${
            toast.type === 'error'
              ? 'bg-[#BE123C] text-white'
              : 'bg-[#0F172A] text-white border border-slate-700'
          }`}
        >
          <span>{toast.type === 'error' ? '⚠️' : '✅'}</span>
          <span>{toast.text}</span>
        </div>
      )}

      {/* Main Mobile-First Container (expands cleanly on desktop) */}
      <div className={`w-full max-w-[480px] bg-white min-h-screen shadow-sm flex flex-col relative ${totalCartItems > 0 ? 'pb-28' : 'pb-8'}`}>
        {/* 1. TOP HEADER (Spacious brand title + uniform SVG customer icons) */}
        <header className="px-3.5 pt-3 pb-2.5 flex items-center justify-between gap-2 bg-white/95 backdrop-blur-md sticky top-0 z-30 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {onBackToPos && (
              <button
                type="button"
                onClick={onBackToPos}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 text-xs font-bold shrink-0 cursor-pointer active:scale-95 transition-transform"
                title="ត្រឡប់ទៅផ្ទាំង POS"
              >
                ←
              </button>
            )}
            {/* Circular Brand Avatar */}
            <button
              type="button"
              onClick={() => {
                setAdminTab('settings');
                setIsAdminOpen(true);
              }}
              className="w-10 h-10 rounded-full bg-[#DB1D43] text-white font-black text-base flex items-center justify-center shadow-xs shrink-0 cursor-pointer active:scale-95 transition-transform overflow-hidden ring-2 ring-rose-100"
              title="ចុចដើម្បីដូររូបឡូហ្គោ និងកែឈ្មោះហាង (Admin)"
            >
              {config.storeLogoUrl ? (
                <img
                  src={config.storeLogoUrl}
                  alt={config.storeName}
                  className="w-full h-full object-cover"
                />
              ) : (
                config.storeLogoLetter || 'K'
              )}
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <h1 className="font-extrabold text-[15.5px] leading-tight text-[#0F172A] truncate">
                  {config.storeName}
                </h1>
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-black shrink-0" title="ហាងផ្លូវការ">
                  ✓
                </span>
              </div>
              <p className="text-[11px] font-bold text-[#D97706] truncate mt-0.5">
                {config.storeSubtitle}
              </p>
            </div>
          </div>

          {/* Right Customer Action Buttons: Wishlist + Order History + Cart (All matching SVG icons) */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setOnlyWishlist(prev => !prev)}
              className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                onlyWishlist
                  ? 'bg-[#DB1D43] text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-rose-50 text-rose-500'
              }`}
              title="ម៉ូតដែលខ្ញុំពេញចិត្ត (Wishlist)"
              aria-label="ម៉ូតដែលខ្ញុំពេញចិត្ត"
            >
              <svg className="w-4 h-4" fill={onlyWishlist || wishlistIds.length > 0 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              {wishlistIds.length > 0 && (
                <span
                  className={`absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full text-[9.5px] font-black flex items-center justify-center tabular-nums ring-2 ring-white ${
                    onlyWishlist ? 'bg-slate-900 text-white' : 'bg-[#DB1D43] text-white'
                  }`}
                >
                  {wishlistIds.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsMyOrdersOpen(true);
                if (phone.trim()) {
                  handleLookupOrders(phone.trim());
                }
              }}
              className="relative w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 cursor-pointer active:scale-95 transition-transform"
              title="វិក្កយបត្រ និងតាមដានអីវ៉ាន់របស់ខ្ញុំ"
              aria-label="វិក្កយបត្រ និងតាមដានអីវ៉ាន់របស់ខ្ញុំ"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {myOrders.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-slate-800 text-white text-[9.5px] font-black flex items-center justify-center tabular-nums ring-2 ring-white">
                  {myOrders.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setCheckoutStep('SUMMARY');
                setIsEditingAddress(!phone.trim() || !address.trim());
                setIsCheckoutOpen(true);
              }}
              className="relative w-10 h-10 rounded-full bg-[#FFF1F2] hover:bg-rose-100 border border-rose-200/80 flex items-center justify-center text-[#DB1D43] cursor-pointer active:scale-95 transition-transform"
              aria-label="មើលកន្ត្រកទំនិញ"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.1} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              {totalCartItems > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 rounded-full bg-[#DB1D43] text-white font-extrabold text-[10px] flex items-center justify-center shadow-xs tabular-nums ring-2 ring-white">
                  {totalCartItems}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* 2. SEARCH BAR + DISCREET ADMIN GEAR */}
        <div className="px-3.5 pb-2.5 pt-2 bg-white flex items-center gap-2">
          <div className="relative flex items-center flex-1">
            <svg className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="ស្វែងរកកូដ ឬឈ្មោះម៉ូត (ឧ. A01, រ៉ូប, អាវយឺត)..."
              className="w-full pl-9 pr-8 py-2 rounded-full bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-medium text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#DB1D43] focus:bg-white transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 w-5 h-5 rounded-full bg-slate-300 text-slate-700 text-[10px] font-bold flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsAdminOpen(true)}
            className="w-8 h-8 rounded-full bg-[#F8FAFC] hover:bg-slate-100 border border-[#E2E8F0] flex items-center justify-center text-slate-400 hover:text-slate-700 shrink-0 cursor-pointer active:scale-95 transition-all"
            title="គ្រប់គ្រងហាង (Admin)"
            aria-label="គ្រប់គ្រងហាង (Admin)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-1.543.94-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* 3. FULL-WIDTH ORANGE-RED URGENCY PROMO BANNER */}
        <div className="bg-gradient-to-r from-[#EA8D1B] via-[#E3462F] to-[#DB1D43] px-3.5 py-2 flex items-center justify-between gap-2 text-white shadow-2xs">
          <div className="text-[12px] font-extrabold truncate">
            {config.promoBannerText}
          </div>
          <span className="bg-white/25 backdrop-blur-xs text-white text-[10.5px] font-extrabold px-2.5 py-0.5 rounded-full shrink-0 whitespace-nowrap">
            {config.promoBadgeText}
          </span>
        </div>

        {/* 4. BOUTIQUE 4-COLUMN CATEGORY MENU (All 4 fit symmetrically without cut-off) */}
        <div className="px-3 pt-3 pb-2.5 bg-white border-b border-slate-100">
          <div className="grid grid-cols-4 gap-2">
            {[
              {
                id: 'all' as const,
                label: 'ម៉ូតទាំងអស់',
                count: products.length,
                icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.1} viewBox="0 0 24 24">
                    <rect x="3" y="3" width="7" height="7" rx="2" />
                    <rect x="14" y="3" width="7" height="7" rx="2" />
                    <rect x="3" y="14" width="7" height="7" rx="2" />
                    <rect x="14" y="14" width="7" height="7" rx="2" />
                  </svg>
                )
              },
              {
                id: 'women' as const,
                label: 'ខោអាវនារី',
                count: products.filter(p => p.category === 'women' || p.category === 'unisex').length,
                icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 3l1.5 4h3L15 3m-4.5 4L8 12l-3 8h14l-3-8-2.5-5" />
                  </svg>
                )
              },
              {
                id: 'men' as const,
                label: 'ខោអាវបុរស',
                count: products.filter(p => p.category === 'men' || p.category === 'unisex').length,
                icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 4L4 7.5 6 11l2-1v10h8V10l2 1 2-3.5L15.5 4c-.8 1.5-2 2.2-3.5 2.2S9.3 5.5 8.5 4z" />
                  </svg>
                )
              },
              {
                id: 'kids' as const,
                label: 'ខោអាវក្មេង',
                count: products.filter(p => p.category === 'kids').length,
                icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.9 3.8 4.2.6-3 3 .7 4.2-3.8-2-3.8 2 .7-4.2-3-3 4.2-.6L12 3z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 18.5c1.5-1.2 3.2-1.8 5-1.8s3.5.6 5 1.8" />
                  </svg>
                )
              }
            ].map(tab => {
              const isActive = activeCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveCategory(tab.id)}
                  className={`relative py-2 px-1.5 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                    isActive
                      ? 'bg-gradient-to-br from-[#E11D48] to-[#BE123C] text-white shadow-sm shadow-rose-500/20 ring-1 ring-[#BE123C]'
                      : 'bg-[#F8FAFC] hover:bg-rose-50/60 text-[#334155] border border-slate-200/80'
                  }`}
                >
                  {tab.count > 0 && (
                    <span
                      className={`absolute top-1.5 right-1.5 min-w-[16px] h-[16px] px-1 rounded-full text-[9.5px] font-extrabold flex items-center justify-center tabular-nums ${
                        isActive
                          ? 'bg-white text-[#DB1D43]'
                          : 'bg-slate-200/90 text-slate-600'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-white text-[#DB1D43] shadow-2xs border border-rose-100/80'
                    }`}
                  >
                    {tab.icon}
                  </div>
                  <span
                    className={`text-[11px] font-extrabold leading-tight whitespace-nowrap ${
                      isActive ? 'text-white' : 'text-[#1E293B]'
                    }`}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 5. SIZE FILTER ROW + SIZE GUIDE BY WEIGHT BUTTON (All compact so nothing is clipped) */}
        <div className="px-3 py-2 flex items-center justify-between gap-1.5 bg-white border-b border-slate-100">
          <div className="flex items-center gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex-1">
            <span className="text-[11px] font-bold text-[#64748B] shrink-0 mr-0.5">ទំហំ:</span>
            {SIZE_OPTIONS.map(sz => {
              const shortLabel =
                sz === 'ទាំងអស់'
                  ? 'ទាំងអស់'
                  : sz === 'Free Size'
                  ? 'Free'
                  : sz.replace(/^Size\s+/i, '');
              const kgHint = sz === 'ទាំងអស់' ? '' : getWeightHintForSize(sz);
              return (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setActiveSize(sz)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold whitespace-nowrap shrink-0 transition-all cursor-pointer flex items-center gap-1 ${
                    activeSize === sz
                      ? 'bg-[#0F172A] text-white shadow-2xs'
                      : 'bg-[#F1F5F9] text-[#334155] hover:bg-slate-200'
                  }`}
                >
                  <span>{shortLabel}</span>
                  {activeSize === sz && kgHint && (
                    <span className="text-[9.5px] font-bold text-amber-300">({kgHint})</span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setIsSizeGuideOpen(true)}
            className="px-2.5 py-1 rounded-lg bg-[#FFF1F2] hover:bg-rose-100 border border-rose-200 text-[#BE123C] text-[10.5px] font-extrabold whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer active:scale-95 transition-transform"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3-3 15 15-3 3L3 6zm5-1l2 2m3 1l2 2m3 1l2 2" />
            </svg>
            <span>តារាងគីឡូ</span>
          </button>
        </div>

        {/* 5B. QUICK SORT & CATALOG STATUS BAR */}
        <div className="px-3.5 py-1.5 bg-[#F8FAFC] border-b border-slate-200/70 flex items-center justify-between gap-2">
          <div className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
            <span>បង្ហាញ <b className="text-slate-900">{filteredProducts.length}</b> ម៉ូត</span>
            {(activeCategory !== 'all' || activeSize !== 'ទាំងអស់' || searchQuery || sortBy !== 'default') && (
              <button
                type="button"
                onClick={() => {
                  setActiveCategory('all');
                  setActiveSize('ទាំងអស់');
                  setSearchQuery('');
                  setSortBy('default');
                }}
                className="text-[10px] font-extrabold text-[#DB1D43] hover:underline cursor-pointer"
              >
                (លុបតម្រង)
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            {[
              { id: 'default' as const, label: '✨ ពេញនិយម' },
              { id: 'price_asc' as const, label: '💲 តម្លៃទាប' },
              { id: 'discount' as const, label: '🔥 បញ្ចុះតម្លៃខ្លាំង' }
            ].map(srt => (
              <button
                key={srt.id}
                type="button"
                onClick={() => setSortBy(srt.id)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold transition-colors cursor-pointer ${
                  sortBy === srt.id
                    ? 'bg-rose-100 text-[#BE123C] border border-rose-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {srt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Active Wishlist Banner when filtering by Favorites */}
        {onlyWishlist && (
          <div className="px-3.5 py-2 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
            <div className="text-xs font-extrabold text-[#BE123C] flex items-center gap-1.5">
              <span>❤️</span>
              <span>កំពុងបង្ហាញម៉ូតដែលអ្នកបានរក្សាទុក ({wishlistIds.length})</span>
            </div>
            <button
              type="button"
              onClick={() => setOnlyWishlist(false)}
              className="text-[11px] font-extrabold text-slate-700 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 cursor-pointer"
            >
              បង្ហាញទាំងអស់វិញ ✕
            </button>
          </div>
        )}

        {/* 6. 2-COLUMN PRODUCT GRID */}
        <div className="p-2.5 bg-[#F8FAFC] flex-1">
          {loading ? (
            <div className="grid grid-cols-2 gap-2.5">
              {[1, 2, 3, 4].map(n => (
                <div key={n} className="bg-white rounded-2xl border border-slate-200 p-2.5 h-80 animate-pulse flex flex-col justify-between">
                  <div className="w-full h-48 bg-slate-200 rounded-xl" />
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-8 bg-slate-200 rounded-xl w-full" />
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center my-4">
              <div className="text-3xl mb-2">{onlyWishlist ? '❤️' : '👗'}</div>
              <div className="font-bold text-slate-800 text-sm">
                {onlyWishlist ? 'មិនទាន់មានម៉ូតក្នុងបញ្ជីពេញចិត្តទេ' : 'មិនមានម៉ូតខោអាវត្រូវនឹងការស្វែងរកទេ'}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {onlyWishlist
                  ? 'សូមចុចរូបបេះដូង ❤️ លើម៉ូតណាមួយដើម្បីរក្សាទុកមើលពេលក្រោយ'
                  : 'សូមសាកល្បងជ្រើសរើសទំហំ «ទាំងអស់» ឬស្វែងរកកូដផ្សេង'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory('all');
                  setActiveSize('ទាំងអស់');
                  setOnlyWishlist(false);
                }}
                className="mt-3 px-4 py-2 rounded-xl bg-[#DB1D43] text-white text-xs font-bold cursor-pointer"
              >
                បង្ហាញម៉ូតទាំងអស់វិញ
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {filteredProducts.map(product => {
                const totalStock = product.variants.reduce((acc, v) => acc + v.stock, 0);
                const firstAvailableVariant = product.variants.find(v => v.stock > 0) || product.variants[0];
                const selectedVarId = selectedVariants[product.id] || firstAvailableVariant?.id;
                const activeVariant = product.variants.find(v => v.id === selectedVarId) || firstAvailableVariant;
                const qtyInCart = cart
                  .filter(c => c.productId === product.id)
                  .reduce((sum, c) => sum + c.qty, 0);
                const discountPct =
                  product.originalPrice > product.price && product.originalPrice > 0
                    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
                    : 0;

                const prodImages = getProductImages(product);
                const activeImgIdx = Math.min(cardImageIdx[product.id] || 0, Math.max(0, prodImages.length - 1));
                const currentCardImage = prodImages[activeImgIdx] || product.imageUrl;

                return (
                  <div
                    key={product.id}
                    className={`bg-white rounded-2xl border overflow-hidden flex flex-col justify-between transition-all ${
                      totalStock <= 0
                        ? 'border-slate-200/80 opacity-80'
                        : 'border-[#E2E8F0] shadow-2xs hover:shadow-md'
                    }`}
                  >
                    <div>
                      {/* Product Photo Container (3:4 Aspect Ratio + Multi-Image Switcher) */}
                      <div
                        onClick={() => {
                          setZoomProduct(product);
                          setZoomImageIdx(activeImgIdx);
                        }}
                        className="relative aspect-[3/4] w-full bg-[#F1F5F9] overflow-hidden cursor-pointer group"
                      >
                        <img
                          src={currentCardImage}
                          alt={product.name}
                          loading="eager"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 [image-rendering:-webkit-optimize-contrast] ${
                            totalStock <= 0 ? 'grayscale-[25%]' : ''
                          }`}
                        />

                        {/* Top-Left Code Badge */}
                        <div className="absolute top-2 left-2 bg-[#0F172A]/85 backdrop-blur-xs text-white px-2.5 py-0.5 rounded-lg text-[10.5px] font-extrabold tracking-tight shadow-2xs">
                          កូដ: {product.code}
                        </div>

                        {/* Top-Right Stock Urgency Badge */}
                        {totalStock <= 0 ? (
                          <div className="absolute inset-0 bg-slate-900/35 flex items-center justify-center">
                            <span className="bg-slate-900/90 text-white px-3 py-1.5 rounded-full text-xs font-extrabold shadow-md border border-white/20">
                              អស់ស្តុកហើយ
                            </span>
                          </div>
                        ) : totalStock === 1 ? (
                          <div className="absolute top-2 right-2 bg-[#E11D48] text-white px-2 py-0.5 rounded-lg text-[10px] font-extrabold shadow-2xs">
                            ⚡ សល់ 1 ឈុត!
                          </div>
                        ) : (
                          <div className="absolute top-2 right-2 bg-[#F59E0B] text-[#0F172A] px-2 py-0.5 rounded-lg text-[10px] font-extrabold shadow-2xs">
                            🔥 សល់ {totalStock}
                          </div>
                        )}

                        {/* Multi-Photo Left/Right Controls & Counter on Card */}
                        {prodImages.length > 1 && (
                          <>
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setCardImageIdx(prev => ({
                                  ...prev,
                                  [product.id]: (activeImgIdx - 1 + prodImages.length) % prodImages.length
                                }));
                              }}
                              className="absolute left-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/45 hover:bg-black/70 text-white text-xs font-bold flex items-center justify-center backdrop-blur-xs cursor-pointer"
                              aria-label="រូបមុន"
                            >
                              ‹
                            </button>
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setCardImageIdx(prev => ({
                                  ...prev,
                                  [product.id]: (activeImgIdx + 1) % prodImages.length
                                }));
                              }}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/45 hover:bg-black/70 text-white text-xs font-bold flex items-center justify-center backdrop-blur-xs cursor-pointer"
                              aria-label="រូបបន្ទាប់"
                            >
                              ›
                            </button>
                            <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-xs text-white px-2 py-0.5 rounded-full text-[10px] font-extrabold tabular-nums">
                              📸 {activeImgIdx + 1}/{prodImages.length}
                            </div>
                          </>
                        )}

                        {/* Bottom-Right Wishlist Heart & Share Link Buttons */}
                        <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              toggleWishlist(product.id, product.code);
                            }}
                            className={`w-7 h-7 rounded-full backdrop-blur-xs flex items-center justify-center transition-transform active:scale-90 cursor-pointer shadow-2xs ${
                              wishlistIds.includes(product.id)
                                ? 'bg-[#DB1D43] text-white'
                                : 'bg-white/90 text-slate-700 hover:text-[#DB1D43]'
                            }`}
                            aria-label="រក្សាទុកក្នុងបញ្ជីពេញចិត្ត"
                            title="រក្សាទុកក្នុងបញ្ជីពេញចិត្ត"
                          >
                            <svg
                              className="w-3.5 h-3.5"
                              fill={wishlistIds.includes(product.id) ? 'currentColor' : 'none'}
                              stroke="currentColor"
                              strokeWidth={2.2}
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                              />
                            </svg>
                          </button>

                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              handleShareProduct(product);
                            }}
                            className="w-7 h-7 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-[#DB1D43] backdrop-blur-xs flex items-center justify-center transition-transform active:scale-90 cursor-pointer shadow-2xs"
                            aria-label="ចែករំលែកលីងម៉ូតនេះ"
                            title="ចែករំលែកលីងម៉ូតនេះ"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Product Info & Interactive Variant Chips */}
                      <div className="p-2.5">
                        <h2 className="font-bold text-[13px] leading-snug text-[#0F172A] truncate" title={product.name}>
                          {product.name}
                        </h2>

                        {/* Price & Strikethrough Original Price + Discount % */}
                        <div className="flex items-center justify-between gap-1 mt-1 tabular-nums">
                          <div className="flex items-baseline gap-1.5">
                            <span className={`font-extrabold text-[17px] ${totalStock <= 0 ? 'text-slate-500' : 'text-[#DB1D43]'}`}>
                              ${product.price.toFixed(2)}
                            </span>
                            {product.originalPrice > product.price && (
                              <span className="text-[11px] text-[#94A3B8] line-through font-medium">
                                ${product.originalPrice.toFixed(2)}
                              </span>
                            )}
                          </div>
                          {discountPct > 0 && totalStock > 0 && (
                            <span className="text-[10px] font-extrabold text-[#BE123C] bg-[#FFF1F2] px-1.5 py-0.5 rounded-md">
                              -{discountPct}%
                            </span>
                          )}
                        </div>

                        {/* Variant Chips (Compact wrap grid so customers can tap with 1 thumb) */}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {product.variants.map(variant => {
                            const isSelected = activeVariant?.id === variant.id && variant.stock > 0;
                            const isOut = variant.stock <= 0;
                            const cleanSize = variant.size.replace(/^Size\s+/i, '');
                            return (
                              <button
                                key={variant.id}
                                type="button"
                                disabled={isOut}
                                onClick={() =>
                                  setSelectedVariants(prev => ({
                                    ...prev,
                                    [product.id]: variant.id
                                  }))
                                }
                                className={`px-2 py-1 rounded-lg text-[10.5px] font-bold border transition-all truncate max-w-full cursor-pointer ${
                                  isOut
                                    ? 'bg-slate-50 text-slate-300 border-slate-200/80 line-through cursor-not-allowed'
                                    : isSelected
                                    ? 'bg-[#FFF1F2] text-[#BE123C] border-[#FB7185] ring-1 ring-[#FB7185]/30'
                                    : 'bg-[#F8FAFC] text-[#334155] border-[#E2E8F0] hover:border-slate-300'
                                }`}
                              >
                                {isSelected ? '✓ ' : ''}
                                {variant.color} · {cleanSize} ({variant.stock})
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Add To Cart CTA inside Card (Crisp White SVG Icon instead of dark red emoji) */}
                    <div className="px-2.5 pb-2.5 pt-0.5">
                      <button
                        type="button"
                        disabled={totalStock <= 0}
                        onClick={() => handleAddToCart(product, activeVariant)}
                        className={`w-full py-2 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          totalStock <= 0
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-[#DB1D43] hover:bg-[#BE123C] text-white shadow-xs active:scale-[0.98]'
                        }`}
                      >
                        {totalStock <= 0 ? (
                          <span>អស់ស្តុកហើយ</span>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5 stroke-[2.5] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            <span>ដាក់ចូលកន្ត្រក</span>
                          </>
                        )}
                        {qtyInCart > 0 && (
                          <span className="bg-white text-[#DB1D43] min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center tabular-nums">
                            {qtyInCart}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Customer Storefront Trust & Quick Help Footer */}
          <div className="mt-5 mb-2 p-3.5 rounded-2xl bg-white border border-slate-200/80 space-y-2.5 text-center shadow-2xs">
            <div className="grid grid-cols-3 gap-2 text-[10.5px] font-extrabold text-slate-700">
              <div className="p-2 rounded-xl bg-slate-50 flex flex-col items-center gap-0.5">
                <span className="text-sm">⚡</span>
                <span>ដឹករហ័ស ២៥ ខេត្ត-ក្រុង</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 flex flex-col items-center gap-0.5">
                <span className="text-sm">💳</span>
                <span>ស្កេន KHQR / COD</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 flex flex-col items-center gap-0.5">
                <span className="text-sm">💯</span>
                <span>ធានាសាច់ក្រណាត់ស្អាត</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsMyOrdersOpen(true);
                  if (phone.trim()) handleLookupOrders(phone.trim());
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[11px] flex items-center gap-1 cursor-pointer"
              >
                <span>📋</span>
                <span>ឆែកមើលអីវ៉ាន់ដែលបានកម្ម៉ង់</span>
              </button>
              <button
                type="button"
                onClick={() => setIsSizeGuideOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-[#BE123C] font-extrabold text-[11px] flex items-center gap-1 cursor-pointer"
              >
                <span>📏</span>
                <span>មើលតារាងគីឡូ</span>
              </button>
            </div>
          </div>
        </div>

        {/* 7. STICKY BOTTOM CHECKOUT BAR (Only appears when cart has items so it never covers Add-to-Cart buttons!) */}
        {totalCartItems > 0 && (
          <div className="fixed bottom-3 left-1/2 -translate-x-1/2 w-full max-w-[460px] px-3 z-40">
            <button
              type="button"
              onClick={() => {
                setCheckoutStep('SUMMARY');
                setIsEditingAddress(!phone.trim() || !address.trim());
                setIsCheckoutOpen(true);
              }}
              className="w-full bg-[#DB1D43] hover:bg-[#BE123C] text-white rounded-2xl px-4 py-3 shadow-[0_12px_28px_rgba(219,29,67,0.38)] border border-rose-400/30 flex items-center justify-between gap-2 active:scale-[0.99] transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0 relative">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-[#DB1D43] text-[10px] font-black flex items-center justify-center tabular-nums">
                    {totalCartItems}
                  </span>
                </div>
                <div className="text-left min-w-0">
                  <div className="font-extrabold text-[14px] leading-tight whitespace-nowrap">
                    មើលកន្ត្រក & កម្ម៉ង់ទិញ
                  </div>
                  <div className="text-[10.5px] text-rose-100 font-medium truncate mt-0.5">
                    {config.freeShippingThreshold > 0 && cartSubtotal >= config.freeShippingThreshold
                      ? '🎉 ទទួលបានការដឹកជញ្ជូនឥតគិតថ្លៃ (Free ដឹក)!'
                      : config.freeShippingThreshold > 0 && cartSubtotal > 0
                      ? `ទិញថែម $${(config.freeShippingThreshold - cartSubtotal).toFixed(2)} ទៀតដើម្បី Free ដឹកជញ្ជូន`
                      : 'ស្កេន KHQR ក៏បាន • បង់ពេលដឹកដល់ (COD) ក៏បាន'}
                  </div>
                </div>
              </div>
              <div className="bg-[#9F1239] px-3.5 py-2 rounded-xl font-extrabold text-xs sm:text-sm tabular-nums whitespace-nowrap shrink-0 shadow-inner">
                ${cartSubtotal.toFixed(2)} ({totalCartItems} មុខ)
              </div>
            </button>
          </div>
        )}
      </div>

      {/* =====================================================================
          MODAL 1: FULL-SCREEN LUXURY PRODUCT DETAIL VIEW (PDP)
          (Surpassing NH Mall reference: Floating Top Bar, Ultra-HD Swipe Gallery,
           Share Link & Wishlist, Variant Picker, Return Guarantee, & Instant Buy Bar)
         ===================================================================== */}
      {zoomProduct && (() => {
        const zoomImages = getProductImages(zoomProduct);
        const safeZoomIdx = Math.min(zoomImageIdx, Math.max(0, zoomImages.length - 1));
        const activeZoomImg = zoomImages[safeZoomIdx] || zoomProduct.imageUrl;
        const totalZoomStock = zoomProduct.variants.reduce((acc, v) => acc + v.stock, 0);
        const firstAvailVar = zoomProduct.variants.find(v => v.stock > 0) || zoomProduct.variants[0];
        const selectedZoomVarId = selectedVariants[zoomProduct.id] || firstAvailVar?.id;
        const activeZoomVariant =
          zoomProduct.variants.find(v => v.id === selectedZoomVarId) || firstAvailVar;
        const zoomDiscountPct =
          zoomProduct.originalPrice > zoomProduct.price && zoomProduct.originalPrice > 0
            ? Math.round(((zoomProduct.originalPrice - zoomProduct.price) / zoomProduct.originalPrice) * 100)
            : 0;
        const isFav = wishlistIds.includes(zoomProduct.id);
        const qtyOfProductInCart = cart
          .filter(c => c.productId === zoomProduct.id)
          .reduce((s, c) => s + c.qty, 0);
        const shareUrl = getProductShareUrl(zoomProduct);

        // Smart Related & Recommended Products (Prioritize In-Stock + Same Category + Matching Selected Size)
        const targetSize = activeZoomVariant?.size;
        const relatedProducts = products
          .filter(p => p.id !== zoomProduct.id)
          .map(p => {
            const pStock = p.variants.reduce((acc, v) => acc + v.stock, 0);
            const sameCategory =
              p.category === zoomProduct.category || p.category === 'unisex' || zoomProduct.category === 'unisex';
            const hasMatchingSizeInStock = targetSize
              ? p.variants.some(v => v.size === targetSize && v.stock > 0)
              : false;
            const hasDiscount = p.originalPrice > p.price;
            const score =
              (pStock > 0 ? 100 : 0) +
              (sameCategory ? 30 : 0) +
              (hasMatchingSizeInStock ? 20 : 0) +
              (hasDiscount ? 5 : 0);
            return { product: p, pStock, sameCategory, hasMatchingSizeInStock, score };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 6);

        return (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center">
            <div className="w-full max-w-[480px] h-full bg-[#F8FAFC] flex flex-col justify-between overflow-hidden shadow-2xl relative">
              {/* SCROLLABLE MAIN CONTENT (Hero Gallery + Product Details + Related Products) */}
              <div ref={pdpScrollRef} className="flex-1 overflow-y-auto overscroll-contain pb-6">
                {/* 1. HERO FULL-BLEED ULTRA-HD IMAGE GALLERY + FLOATING TOP ACTION BAR */}
                <div
                  className="relative aspect-[4/4.5] w-full bg-[#0F172A] overflow-hidden select-none"
                  onTouchStart={e => {
                    if (e.touches && e.touches[0]) {
                      setZoomTouchStartX(e.touches[0].clientX);
                    }
                  }}
                  onTouchEnd={e => {
                    if (zoomTouchStartX === null || zoomImages.length <= 1) return;
                    const endX = e.changedTouches?.[0]?.clientX ?? zoomTouchStartX;
                    const diff = zoomTouchStartX - endX;
                    if (Math.abs(diff) > 40) {
                      if (diff > 0) {
                        setZoomImageIdx((safeZoomIdx + 1) % zoomImages.length);
                      } else {
                        setZoomImageIdx((safeZoomIdx - 1 + zoomImages.length) % zoomImages.length);
                      }
                    }
                    setZoomTouchStartX(null);
                  }}
                >
                  {/* Top Subtle Gradient Scrim for Floating Navigation Icons */}
                  <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/45 via-black/15 to-transparent pointer-events-none z-10" />

                  {/* FLOATING TOP OVERLAY BAR: Back (Left) • Search & Cart with Badge (Right) */}
                  <div className="absolute top-3.5 inset-x-3.5 flex items-center justify-between z-20">
                    <button
                      type="button"
                      onClick={() => setZoomProduct(null)}
                      className="w-10 h-10 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur-md text-white border border-white/20 flex items-center justify-center shadow-lg active:scale-92 transition-all cursor-pointer"
                      aria-label="ត្រឡប់ក្រោយ"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>

                    <div className="flex items-center gap-2">
                      {/* Quick Search Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setZoomProduct(null);
                          setTimeout(() => {
                            const searchEl = document.querySelector<HTMLInputElement>('input[placeholder*="ស្វែងរក"]');
                            searchEl?.focus();
                          }, 100);
                        }}
                        className="w-10 h-10 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur-md text-white border border-white/20 flex items-center justify-center shadow-lg active:scale-92 transition-all cursor-pointer"
                        aria-label="ស្វែងរកម៉ូត"
                      >
                        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth={2.3} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </button>

                      {/* Shopping Cart Button with Live Red Badge */}
                      <button
                        type="button"
                        onClick={() => {
                          setZoomProduct(null);
                          setCheckoutStep('SUMMARY');
                          setIsEditingAddress(!phone.trim() || !address.trim());
                          setIsCheckoutOpen(true);
                        }}
                        className="relative w-10 h-10 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur-md text-white border border-white/20 flex items-center justify-center shadow-lg active:scale-92 transition-all cursor-pointer"
                        aria-label="មើលកន្ត្រកទំនិញ"
                      >
                        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        {totalCartItems > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 rounded-full bg-[#DB1D43] text-white font-black text-[10.5px] flex items-center justify-center shadow-md tabular-nums ring-2 ring-white">
                            {totalCartItems}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Ultra-Sharp Product Image */}
                  <img
                    src={activeZoomImg}
                    alt={zoomProduct.name}
                    loading="eager"
                    decoding="sync"
                    fetchPriority="high"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-all duration-200 [image-rendering:-webkit-optimize-contrast]"
                  />

                  {/* Left/Right Navigation Arrows when multiple photos exist */}
                  {zoomImages.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setZoomImageIdx((safeZoomIdx - 1 + zoomImages.length) % zoomImages.length)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/65 backdrop-blur-xs text-white border border-white/15 text-xl font-bold flex items-center justify-center cursor-pointer active:scale-90 transition-transform z-10"
                        aria-label="រូបមុន"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={() => setZoomImageIdx((safeZoomIdx + 1) % zoomImages.length)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/65 backdrop-blur-xs text-white border border-white/15 text-xl font-bold flex items-center justify-center cursor-pointer active:scale-90 transition-transform z-10"
                        aria-label="រូបបន្ទាប់"
                      >
                        ›
                      </button>
                    </>
                  )}

                  {/* Bottom Scrim + Pill Pagination Dots (Center) + Photo Counter Pill (Right) */}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 via-black/15 to-transparent pointer-events-none" />

                  {zoomImages.length > 1 && (
                    <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/25 backdrop-blur-xs z-10">
                      {zoomImages.map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setZoomImageIdx(idx)}
                          className={`h-1.5 rounded-full transition-all cursor-pointer ${
                            safeZoomIdx === idx ? 'w-5 bg-white shadow-xs' : 'w-1.5 bg-white/55 hover:bg-white/80'
                          }`}
                          aria-label={`រូបទី ${idx + 1}`}
                        />
                      ))}
                    </div>
                  )}

                  <div className="absolute bottom-3 right-3.5 bg-black/65 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-extrabold tabular-nums border border-white/15 shadow-sm z-10">
                    {safeZoomIdx + 1}/{Math.max(1, zoomImages.length)}
                  </div>
                </div>

                {/* Thumbnail Strip when product has multiple photos */}
                {zoomImages.length > 1 && (
                  <div className="bg-white px-4 pt-3 pb-1 flex items-center gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {zoomImages.map((imgUrl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setZoomImageIdx(idx)}
                        className={`w-13 h-15 rounded-xl overflow-hidden border-2 shrink-0 cursor-pointer transition-all ${
                          safeZoomIdx === idx
                            ? 'border-[#DB1D43] ring-2 ring-rose-500/20 scale-105 shadow-xs'
                            : 'border-slate-200/80 opacity-65 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={imgUrl}
                          alt=""
                          loading="eager"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}

                {/* 2. PRODUCT TITLE, PRICE, SOLD/STOCK BADGE & WISHLIST / SHARE LINK BUTTONS */}
                <div className="bg-white px-4 pt-3.5 pb-4 border-b border-slate-100 shadow-2xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="bg-[#0F172A] text-white text-[10.5px] font-black px-2.5 py-0.5 rounded-md tracking-tight">
                          កូដ {zoomProduct.code}
                        </span>
                        {zoomDiscountPct > 0 && (
                          <span className="bg-[#FFF1F2] text-[#DB1D43] border border-rose-200 text-[10.5px] font-extrabold px-2 py-0.5 rounded-md">
                            បញ្ចុះ -{zoomDiscountPct}%
                          </span>
                        )}
                      </div>
                      <h2 className="font-black text-[18px] leading-snug text-[#0F172A] break-words">
                        {zoomProduct.name}
                      </h2>
                    </div>

                    {/* Right Circular Action Buttons: Heart (Wishlist) + Share Link (Matching & Elevating Reference) */}
                    <div className="flex items-center gap-2 shrink-0 pt-0.5">
                      <button
                        type="button"
                        onClick={() => toggleWishlist(zoomProduct.id, zoomProduct.code)}
                        className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-2xs ${
                          isFav
                            ? 'bg-[#FFF1F2] text-[#DB1D43] border-rose-300'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200/90'
                        }`}
                        aria-label="រក្សាទុកក្នុងបញ្ជីពេញចិត្ត"
                        title="រក្សាទុកក្នុងបញ្ជីពេញចិត្ត"
                      >
                        <svg
                          className="w-5 h-5"
                          fill={isFav ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                          />
                        </svg>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleShareProduct(zoomProduct)}
                        className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-2xs ${
                          showShareOptions
                            ? 'bg-[#0F172A] text-white border-[#0F172A]'
                            : 'bg-slate-50 hover:bg-rose-50 text-slate-700 hover:text-[#DB1D43] border-slate-200/90'
                        }`}
                        aria-label="ចែករំលែកលីងម៉ូតនេះ"
                        title="ចែករំលែកលីងម៉ូតនេះ"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Expandable Quick Share Link Bar (Appears when Share button is tapped or in WebViews) */}
                  {showShareOptions && (
                    <div className="mt-3 p-2.5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2 animate-fadeIn">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-extrabold text-slate-700 flex items-center gap-1">
                          <span>🔗</span>
                          <span>លីងចែករំលែកម៉ូតកូដ {zoomProduct.code} ទៅកាន់មិត្តភក្តិ៖</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowShareOptions(false)}
                          className="text-[10.5px] font-bold text-slate-400 hover:text-slate-700 cursor-pointer"
                        >
                          បិទ ✕
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          readOnly
                          value={shareUrl}
                          onClick={e => (e.target as HTMLInputElement).select()}
                          className="flex-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-[11px] font-mono text-slate-600 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopyProductLink(zoomProduct)}
                          className="px-3 py-1.5 rounded-xl bg-[#DB1D43] hover:bg-[#BE123C] text-white text-[11px] font-extrabold shrink-0 cursor-pointer active:scale-95 transition-transform"
                        >
                          📋 ចម្លងលីង
                        </button>
                        <a
                          href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(
                            `✨ [${zoomProduct.code}] ${zoomProduct.name} — $${zoomProduct.price.toFixed(2)}`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-xl bg-[#0088CC] hover:bg-[#0077B5] text-white text-[11px] font-extrabold shrink-0 flex items-center gap-1"
                        >
                          <span>✈️</span>
                          <span>Telegram</span>
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Price & Social Proof / Stock Pill Row */}
                  <div className="mt-2.5 flex items-baseline justify-between gap-2 flex-wrap">
                    <div className="flex items-baseline gap-2 tabular-nums">
                      <span className="text-[26px] font-black text-[#DB1D43] tracking-tight">
                        ${zoomProduct.price.toFixed(2)}
                      </span>
                      {zoomProduct.originalPrice > zoomProduct.price && (
                        <span className="text-sm text-slate-400 line-through font-semibold">
                          ${zoomProduct.originalPrice.toFixed(2)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-extrabold tabular-nums">
                        🔥 លក់ដាច់ខ្លាំង • សល់ {totalZoomStock} ឈុត
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. INTERACTIVE COLOR & SIZE VARIANT SELECTOR CARD */}
                <div className="mt-2.5 mx-3 bg-white rounded-2xl border border-slate-200/80 p-3.5 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-extrabold text-[#0F172A] flex items-center gap-1.5">
                      <span>🎨</span>
                      <span>ជ្រើសរើសពណ៌ និងទំហំ (Size)៖</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsSizeGuideOpen(true)}
                      className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-[#BE123C] border border-rose-200/80 text-[10.5px] font-extrabold flex items-center gap-1 cursor-pointer"
                    >
                      <span>📏</span>
                      <span>តារាងគីឡូ</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {zoomProduct.variants.map(v => {
                      const isSelected = activeZoomVariant?.id === v.id && v.stock > 0;
                      const isOut = v.stock <= 0;
                      const weightHint = getWeightHintForSize(v.size);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          disabled={isOut}
                          onClick={() =>
                            setSelectedVariants(prev => ({
                              ...prev,
                              [zoomProduct.id]: v.id
                            }))
                          }
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                            isOut
                              ? 'bg-slate-50 text-slate-300 border-slate-200/70 line-through cursor-not-allowed'
                              : isSelected
                              ? 'bg-[#FFF1F2] text-[#BE123C] border-[#DB1D43] ring-2 ring-[#DB1D43]/20 shadow-2xs'
                              : 'bg-[#F8FAFC] hover:bg-slate-100 text-[#0F172A] border-slate-200'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[11.5px] font-extrabold leading-snug break-words">
                              {isSelected ? '✓ ' : ''}
                              {v.color} • {v.size.replace(/^Size\s+/i, '')}
                            </div>
                            {weightHint && (
                              <div className="text-[10px] opacity-80 font-bold mt-0.5 truncate">
                                ⚖️ {weightHint}
                              </div>
                            )}
                          </div>
                          <span
                            className={`px-1.5 py-0.5 rounded-md text-[9.5px] font-black shrink-0 tabular-nums ${
                              isOut
                                ? 'bg-slate-100 text-slate-400'
                                : isSelected
                                ? 'bg-[#DB1D43] text-white'
                                : 'bg-slate-200/80 text-slate-700'
                            }`}
                          >
                            {isOut ? 'អស់' : `សល់ ${v.stock}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. RETURN POLICY & QUALITY GUARANTEE CARD (Matching & Surpassing Reference Screenshot) */}
                <div className="mt-2.5 mx-3 bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setShowReturnPolicyDetail(prev => !prev)}
                    className="w-full px-3.5 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-rose-50 text-[#DB1D43] flex items-center justify-center shrink-0">
                        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                          />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-[#0F172A]">
                          គោលការណ៍ត្រឡប់ទំនិញ & ធានាគុណភាព ១០០%
                        </div>
                        <div className="text-[10.5px] text-slate-500 truncate mt-0.5">
                          ដូរទំហំជូនដោយឥតគិតថ្លៃ • ធានាសាច់ក្រណាត់ស្អាតដូចរូប
                        </div>
                      </div>
                    </div>
                    <svg
                      className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                        showReturnPolicyDetail ? 'rotate-90' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.2}
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {showReturnPolicyDetail && (
                    <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100 text-[11px] text-slate-600 space-y-1.5 bg-slate-50/50">
                      <div className="flex items-start gap-2">
                        <span className="text-emerald-600 font-black">✓</span>
                        <span>អាចប្តូរទំហំ (Size) ឬប្តូរម៉ូតបានក្នុងរយៈពេល ៣ ថ្ងៃបន្ទាប់ពីទទួលអីវ៉ាន់។</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-emerald-600 font-black">✓</span>
                        <span>ធានាសាច់ក្រណាត់ស្អាត ថ្នេរដេរមាំ និងពណ៌ដូចរូបភាពពិត ១០០%។</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-emerald-600 font-black">✓</span>
                        <span>ដឹកជញ្ជូនរហ័សទាន់ចិត្តគ្រប់ ២៥ ខេត្ត-ក្រុង (ស្កេន KHQR ក៏បាន / បង់ពេលដឹកដល់ COD ក៏បាន)។</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 5. DIRECT CHAT WITH SHOP OWNER CARD */}
                <div className="mt-2.5 mx-3">
                  <button
                    type="button"
                    disabled={isInquiring}
                    onClick={() => handleAskAboutProduct(zoomProduct)}
                    className="w-full py-2.5 px-3.5 rounded-2xl bg-white hover:bg-slate-50 text-[#0F172A] border border-slate-200/90 font-extrabold text-xs flex items-center justify-between gap-2 cursor-pointer active:scale-[0.99] transition-all shadow-2xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center text-sm">💬</span>
                      <span>
                        {isInquiring
                          ? 'កំពុងភ្ជាប់ចូលឆាត...'
                          : `មានចម្ងល់ពីសាច់ក្រណាត់ ឬទំហំ? ឆាតសួរម្ចាស់ហាងពីកូដ ${zoomProduct.code}`}
                      </span>
                    </div>
                    <span className="text-[#DB1D43] font-black text-xs shrink-0">ឆាតភ្លាម ›</span>
                  </button>
                </div>

                {/* 6. RELATED & RECOMMENDED PRODUCTS SECTION (ម៉ូតស្រដៀងគ្នា & ណែនាំសម្រាប់បង) */}
                {relatedProducts.length > 0 && (
                  <div className="mt-4 mx-3 space-y-2.5">
                    {/* Section Header + Smart Free Shipping Upsell Hint */}
                    <div className="flex items-center justify-between gap-2 px-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-6 h-6 rounded-lg bg-[#FFF1F2] text-[#DB1D43] flex items-center justify-center text-xs font-black">
                          ✨
                        </span>
                        <div>
                          <h3 className="text-[13px] font-black text-[#0F172A] leading-tight">
                            ម៉ូតស្រដៀងគ្នា & ណែនាំសម្រាប់បង
                          </h3>
                          <p className="text-[10px] text-slate-500 font-medium">
                            ជ្រើសរើសម៉ូតស្អាតៗបន្ថែម ដើម្បីចំណេញថ្លៃដឹកជញ្ជូន
                          </p>
                        </div>
                      </div>

                      {config.freeShippingThreshold > 0 && cartSubtotal < config.freeShippingThreshold && (
                        <span className="bg-amber-50 text-amber-800 border border-amber-200/80 px-2 py-1 rounded-lg text-[10px] font-extrabold shrink-0 tabular-nums">
                          🚚 ខ្វះ ${(config.freeShippingThreshold - cartSubtotal).toFixed(2)} Free ដឹក
                        </span>
                      )}
                    </div>

                    {/* 2-Column Boutique Related Products Grid */}
                    <div className="grid grid-cols-2 gap-2.5">
                      {relatedProducts.map(({ product: relProd, pStock, hasMatchingSizeInStock }) => {
                        const relImages = getProductImages(relProd);
                        const relThumb = relImages[0] || relProd.imageUrl;
                        const relFirstVar =
                          (targetSize && relProd.variants.find(v => v.size === targetSize && v.stock > 0)) ||
                          relProd.variants.find(v => v.stock > 0) ||
                          relProd.variants[0];
                        const relDiscPct =
                          relProd.originalPrice > relProd.price && relProd.originalPrice > 0
                            ? Math.round(((relProd.originalPrice - relProd.price) / relProd.originalPrice) * 100)
                            : 0;
                        const relQtyInCart = cart
                          .filter(c => c.productId === relProd.id)
                          .reduce((s, c) => s + c.qty, 0);

                        return (
                          <div
                            key={relProd.id}
                            className={`bg-white rounded-2xl border overflow-hidden flex flex-col justify-between transition-all ${
                              pStock <= 0
                                ? 'border-slate-200/70 opacity-75'
                                : 'border-slate-200/90 shadow-2xs hover:border-rose-200'
                            }`}
                          >
                            <div
                              onClick={() => {
                                setZoomProduct(relProd);
                                setZoomImageIdx(0);
                                setShowShareOptions(false);
                                pdpScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="cursor-pointer group"
                            >
                              <div className="relative aspect-[3/4] w-full bg-slate-100 overflow-hidden">
                                <img
                                  src={relThumb}
                                  alt={relProd.name}
                                  loading="eager"
                                  decoding="async"
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 [image-rendering:-webkit-optimize-contrast]"
                                />
                                {/* Code Badge */}
                                <div className="absolute top-2 left-2 bg-[#0F172A]/85 backdrop-blur-xs text-white px-2 py-0.5 rounded-md text-[10px] font-extrabold">
                                  កូដ {relProd.code}
                                </div>
                                {/* Stock or Discount Badge */}
                                {pStock <= 0 ? (
                                  <div className="absolute top-2 right-2 bg-slate-900/85 text-white px-2 py-0.5 rounded-md text-[9.5px] font-extrabold">
                                    អស់ស្តុក
                                  </div>
                                ) : relDiscPct > 0 ? (
                                  <div className="absolute top-2 right-2 bg-[#DB1D43] text-white px-1.5 py-0.5 rounded-md text-[9.5px] font-extrabold">
                                    -{relDiscPct}%
                                  </div>
                                ) : (
                                  <div className="absolute top-2 right-2 bg-[#F59E0B] text-[#0F172A] px-1.5 py-0.5 rounded-md text-[9.5px] font-extrabold">
                                    សល់ {pStock}
                                  </div>
                                )}

                                {/* Matching Size Hint Badge */}
                                {hasMatchingSizeInStock && targetSize && (
                                  <div className="absolute bottom-2 left-2 bg-emerald-950/80 backdrop-blur-xs text-emerald-200 px-2 py-0.5 rounded-md text-[9.5px] font-extrabold border border-emerald-400/30">
                                    ✓ មាន {targetSize.replace(/^Size\s+/i, '')}
                                  </div>
                                )}
                              </div>

                              <div className="p-2.5 pb-1.5">
                                <div className="font-bold text-xs text-[#0F172A] truncate">
                                  {relProd.name}
                                </div>
                                <div className="flex items-baseline justify-between gap-1 mt-1 tabular-nums">
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="font-black text-[15px] text-[#DB1D43]">
                                      ${relProd.price.toFixed(2)}
                                    </span>
                                    {relProd.originalPrice > relProd.price && (
                                      <span className="text-[10.5px] text-slate-400 line-through">
                                        ${relProd.originalPrice.toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[9.5px] font-bold text-slate-500">
                                    សល់ {pStock}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Quick 1-Tap Add to Cart on Related Card */}
                            <div className="px-2.5 pb-2.5 pt-1">
                              <button
                                type="button"
                                disabled={pStock <= 0}
                                onClick={e => {
                                  e.stopPropagation();
                                  handleAddToCart(relProd, relFirstVar);
                                }}
                                className={`w-full py-1.5 px-2.5 rounded-xl font-extrabold text-[11px] flex items-center justify-center gap-1 transition-all cursor-pointer ${
                                  pStock <= 0
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    : 'bg-[#FFF1F2] hover:bg-[#DB1D43] text-[#BE123C] hover:text-white border border-rose-200/80 active:scale-95'
                                }`}
                              >
                                <span>+ ដាក់ចូលកន្ត្រក</span>
                                {relQtyInCart > 0 && (
                                  <span className="bg-[#DB1D43] text-white min-w-[16px] h-[16px] px-1 rounded-full text-[9.5px] font-black flex items-center justify-center tabular-nums">
                                    {relQtyInCart}
                                  </span>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* =================================================================
                  6. STICKY BOTTOM PURCHASE DOCK (Matching & Surpassing Reference)
                  Top Row: Price Badge ($6.50) + Green Stock Pill (✓ មាន X ក្នុងស្តុក)
                  Bottom Row: [🛒 ដាក់ក្នុងរទេះទំនិញ] + [⚡ ទិញឥឡូវ]
                 ================================================================= */}
              <div className="bg-white border-t border-slate-200/90 px-3.5 pt-2.5 pb-3.5 shadow-[0_-10px_28px_rgba(15,23,42,0.08)] z-20 space-y-2.5">
                {/* Top Status Row inside Sticky Dock */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-slate-100 text-[#0F172A] font-black text-sm px-3 py-1 rounded-xl tabular-nums">
                      ${zoomProduct.price.toFixed(2)}
                    </span>
                    {activeZoomVariant && activeZoomVariant.stock > 0 && (
                      <span className="text-[11px] font-bold text-slate-500 truncate max-w-[140px]">
                        ({activeZoomVariant.color} • {activeZoomVariant.size.replace(/^Size\s+/i, '')})
                      </span>
                    )}
                  </div>

                  {totalZoomStock > 0 ? (
                    <div className="bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-3 py-1 rounded-xl text-xs font-extrabold flex items-center gap-1.5 tabular-nums">
                      <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.8} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>មាន {activeZoomVariant ? activeZoomVariant.stock : totalZoomStock} ក្នុងស្តុក</span>
                    </div>
                  ) : (
                    <div className="bg-rose-50 text-rose-700 border border-rose-200 px-3 py-1 rounded-xl text-xs font-extrabold">
                      អស់ស្តុកបណ្ដោះអាសន្ន
                    </div>
                  )}
                </div>

                {/* Bottom Dual Action Buttons: Add to Cart + Buy Now */}
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Left: Add to Cart (ដាក់ក្នុងរទេះទំនិញ) */}
                  <button
                    type="button"
                    disabled={totalZoomStock <= 0}
                    onClick={() => handleAddToCart(zoomProduct, activeZoomVariant)}
                    className={`py-3 px-3 rounded-2xl font-extrabold text-[13px] flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      totalZoomStock <= 0
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-[#0F172A] hover:bg-slate-800 text-white shadow-sm active:scale-[0.98]'
                    }`}
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span>ដាក់ក្នុងរទេះទំនិញ</span>
                    {qtyOfProductInCart > 0 && (
                      <span className="bg-[#DB1D43] text-white min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center tabular-nums">
                        {qtyOfProductInCart}
                      </span>
                    )}
                  </button>

                  {/* Right: Instant Buy Now (ទិញឥឡូវ) */}
                  <button
                    type="button"
                    disabled={totalZoomStock <= 0}
                    onClick={() => {
                      const alreadyInCart = cart.some(
                        c => c.productId === zoomProduct.id && c.variantId === activeZoomVariant?.id
                      );
                      if (!alreadyInCart) {
                        handleAddToCart(zoomProduct, activeZoomVariant);
                      }
                      setZoomProduct(null);
                      setCheckoutStep('SUMMARY');
                      setIsEditingAddress(!phone.trim() || !address.trim());
                      setIsCheckoutOpen(true);
                    }}
                    className={`py-3 px-3 rounded-2xl font-extrabold text-[13px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      totalZoomStock <= 0
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-[#E11D48] to-[#BE123C] hover:from-[#BE123C] hover:to-[#9F1239] text-white shadow-[0_8px_20px_rgba(219,29,67,0.35)] active:scale-[0.98]'
                    }`}
                  >
                    <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                    <span>ទិញឥឡូវ</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =====================================================================
          MODAL 2: FULL-SCREEN CHECKOUT & OFFICIAL KHQR / ABA KHQR (Unified App Theme)
         ===================================================================== */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 bg-[#F8FAFC] flex flex-col items-center justify-start overflow-hidden">
          <div className="w-full max-w-[480px] h-full flex flex-col bg-[#F8FAFC] overflow-hidden shadow-2xl">
            {/* 1. TOP HEADER + 3-STEP PROGRESS BAR (Unified Rose-Crimson App Theme) */}
            <div className="bg-white px-5 pt-4 pb-3.5 border-b border-slate-100 shadow-[0_1px_4px_rgba(15,23,42,0.03)] shrink-0">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    if (checkoutStep === 'KHQR_SCAN') {
                      setCheckoutStep('SUMMARY');
                    } else {
                      setIsCheckoutOpen(false);
                    }
                  }}
                  className="w-10 h-10 rounded-full bg-[#F8FAFC] hover:bg-[#FFF1F2] border border-[#E2E8F0] hover:border-rose-200 text-[#0F172A] hover:text-[#DB1D43] flex items-center justify-center cursor-pointer active:scale-95 transition-all"
                  aria-label="ត្រឡប់ក្រោយ"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m0 0l7-7m-7 7l7 7" />
                  </svg>
                </button>

                <h2 className="font-black text-[18px] text-[#0F172A] tracking-tight">
                  ទូទាត់ប្រាក់
                </h2>

                <div className="w-10 h-10" />
              </div>

              {/* 3-Step Horizontal Stepper with App Brand Rose-Crimson Circles */}
              <div className="mt-4 px-3 flex items-start justify-between">
                {/* Step 1: អាសយដ្ឋាន */}
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#E11D48] to-[#BE123C] text-white flex items-center justify-center font-black text-sm shadow-xs shadow-rose-500/20">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="mt-1.5 text-[12px] font-extrabold text-[#DB1D43]">
                    អាសយដ្ឋាន
                  </span>
                </div>

                {/* Line 1 -> 2 */}
                <div className="flex-1 h-[2px] bg-[#DB1D43] mt-[18px] -mx-1" />

                {/* Step 2: ទូទាត់ */}
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#E11D48] to-[#BE123C] text-white flex items-center justify-center font-black text-[14px] shadow-xs shadow-rose-500/20">
                    {checkoutStep === 'KHQR_SCAN' ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      '2'
                    )}
                  </div>
                  <span className="mt-1.5 text-[12px] font-extrabold text-[#DB1D43]">
                    ទូទាត់
                  </span>
                </div>

                {/* Line 2 -> 3 */}
                <div
                  className={`flex-1 h-[2px] mt-[18px] -mx-1 ${
                    checkoutStep === 'KHQR_SCAN' ? 'bg-[#DB1D43]' : 'bg-[#E2E8F0]'
                  }`}
                />

                {/* Step 3: បានបញ្ជាក់ */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-[14px] ${
                      checkoutStep === 'KHQR_SCAN'
                        ? 'bg-gradient-to-br from-[#E11D48] to-[#BE123C] text-white shadow-xs shadow-rose-500/20'
                        : 'bg-[#F1F5F9] text-slate-400'
                    }`}
                  >
                    3
                  </div>
                  <span
                    className={`mt-1.5 text-[12px] font-extrabold ${
                      checkoutStep === 'KHQR_SCAN' ? 'text-[#DB1D43]' : 'text-slate-400'
                    }`}
                  >
                    បានបញ្ជាក់
                  </span>
                </div>
              </div>
            </div>

            {/* ===============================================================
                BODY: STEP 1 (SUMMARY + PAYMENT METHODS) OR STEP 2 (KHQR SCAN)
               =============================================================== */}
            {cart.length === 0 ? (
              <div className="p-8 text-center my-auto">
                <div className="text-4xl mb-2">🛒</div>
                <div className="font-bold text-slate-800 text-sm">មិនទាន់មានម៉ូតខោអាវក្នុងកន្ត្រកទេ</div>
                <p className="text-xs text-slate-500 mt-1">សូមជ្រើសរើសម៉ូតខោអាវដែលអ្នកពេញចិត្តជាមុនសិន</p>
              </div>
            ) : checkoutStep === 'SUMMARY' ? (
              <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3.5 pb-8">
                {/* CARD 1: SHIPPING ADDRESS ("| អាសយដ្ឋានដឹកជញ្ជូន") */}
                <div className="bg-white rounded-2xl p-4 shadow-2xs border border-[#E2E8F0]">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="w-1 h-5 rounded-full bg-[#DB1D43]" />
                      <h3 className="font-black text-[15.5px] text-[#0F172A]">អាសយដ្ឋានដឹកជញ្ជូន</h3>
                    </div>

                    {!isEditingAddress && phone.trim() && address.trim() && (
                      <button
                        type="button"
                        onClick={() => setIsEditingAddress(true)}
                        className="px-3 py-1.5 rounded-full bg-[#FFF1F2] hover:bg-rose-100 border border-rose-200 text-[#BE123C] font-extrabold text-[12px] flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                      >
                        <span className="w-4 h-4 rounded-full bg-[#DB1D43] text-white text-[10px] flex items-center justify-center">
                          ✎
                        </span>
                        <span>កែប្រែអាសយដ្ឋាន</span>
                      </button>
                    )}
                  </div>

                  {!isEditingAddress && phone.trim() && address.trim() ? (
                    <div className="rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] p-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-[15.5px] text-[#0F172A]">
                            {customerName.trim() || 'អតិថិជនហាង'}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-[#334155] text-[11px] font-extrabold">
                            Home
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-[#FFF1F2] border border-rose-200 text-[#DB1D43] text-[11px] font-extrabold">
                            ★ Default
                          </span>
                        </div>

                        <span className="text-[13.5px] font-extrabold text-[#0F172A] bg-white px-2.5 py-1 rounded-lg border border-slate-200/80 flex items-center gap-1.5 tabular-nums">
                          <svg className="w-3.5 h-3.5 text-[#DB1D43]" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          {phone}
                        </span>
                      </div>

                      <div className="flex items-start gap-2 pt-0.5">
                        <span className="text-sm mt-0.5">📍</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-extrabold text-[14.5px] text-[#0F172A] leading-snug break-words">
                            {address}
                          </div>
                          <div className="text-[12.5px] font-bold text-slate-500 mt-0.5">
                            {zone === 'PP'
                              ? `ភ្នំពេញ • ដឹកជញ្ជូនក្នុងក្រុង ($${config.shippingFeePP.toFixed(2)})`
                              : `ខេត្ត • ${deliveryCompany} ($${config.shippingFeeProvince.toFixed(2)})`}
                            {orderNote ? ` • ចំណាំ: ${orderNote}` : ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-1">
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">ឈ្មោះរបស់អ្នក</label>
                          <input
                            type="text"
                            value={customerName}
                            onChange={e => setCustomerName(e.target.value)}
                            placeholder="ឈ្មោះភ្ញៀវ..."
                            className="w-full px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-bold text-[#0F172A] focus:bg-white focus:outline-none focus:border-[#DB1D43]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">លេខទូរស័ព្ទ *</label>
                          <input
                            type="tel"
                            required
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            placeholder="010 / 012 / 096..."
                            className="w-full px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-extrabold text-[#0F172A] focus:bg-white focus:outline-none focus:border-[#DB1D43]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setZone('PP');
                            setDeliveryCompany('ដឹកក្នុងក្រុងភ្នំពេញ');
                          }}
                          className={`p-2.5 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                            zone === 'PP'
                              ? 'bg-[#DB1D43] border-[#DB1D43] text-white shadow-xs'
                              : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155] hover:border-slate-300'
                          }`}
                        >
                          <span>🛵 ភ្នំពេញ (${config.shippingFeePP.toFixed(2)})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setZone('PROVINCE');
                            setDeliveryCompany('វីរៈប៊ុនថាំ (VET)');
                          }}
                          className={`p-2.5 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                            zone === 'PROVINCE'
                              ? 'bg-[#DB1D43] border-[#DB1D43] text-white shadow-xs'
                              : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155] hover:border-slate-300'
                          }`}
                        >
                          <span>🚚 ខេត្ត (${config.shippingFeeProvince.toFixed(2)})</span>
                        </button>
                      </div>

                      {zone === 'PROVINCE' && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {['វីរៈប៊ុនថាំ (VET)', 'J&T Express', 'Capitol'].map(comp => (
                            <button
                              key={comp}
                              type="button"
                              onClick={() => setDeliveryCompany(comp)}
                              className={`px-3 py-1 rounded-lg text-[11px] font-extrabold border cursor-pointer transition-all ${
                                deliveryCompany === comp
                                  ? 'bg-[#FFF1F2] text-[#BE123C] border-[#FB7185] ring-1 ring-[#FB7185]/30'
                                  : 'bg-white text-slate-600 border-[#E2E8F0] hover:border-slate-300'
                              }`}
                            >
                              {deliveryCompany === comp ? `✓ ${comp}` : comp}
                            </button>
                          ))}
                        </div>
                      )}

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          ទីតាំងដឹកជញ្ជូន / អាសយដ្ឋាន *
                        </label>
                        <input
                          type="text"
                          required
                          value={address}
                          onChange={e => setAddress(e.target.value)}
                          placeholder="ឧ. ផ្ទះលេខ, ផ្លូវ, សង្កាត់/ឃុំ, ខណ្ឌ/ខេត្ត..."
                          className="w-full px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-bold text-[#0F172A] focus:bg-white focus:outline-none focus:border-[#DB1D43]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          ចំណាំបន្ថែម (មិនបាច់បំពេញក៏បាន)
                        </label>
                        <input
                          type="text"
                          value={orderNote}
                          onChange={e => setOrderNote(e.target.value)}
                          placeholder="ឧ. សូមតេមុនដឹក ១៥ នាទី..."
                          className="w-full px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-medium text-[#0F172A] focus:bg-white focus:outline-none focus:border-[#DB1D43]"
                        />
                      </div>

                      {phone.trim() && address.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              localStorage.setItem('tg_cust_name', customerName);
                              localStorage.setItem('tg_cust_phone', phone);
                              localStorage.setItem('tg_cust_address', address);
                            } catch {}
                            setIsEditingAddress(false);
                          }}
                          className="w-full py-2.5 rounded-xl bg-[#DB1D43] hover:bg-[#BE123C] text-white font-extrabold text-xs cursor-pointer shadow-xs transition-colors"
                        >
                          ✓ រក្សាទុកអាសយដ្ឋានដឹកជញ្ជូន
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* CARD 2: ORDER SUMMARY ("| បញ្ជីទំនិញកម្ម៉ង់") */}
                <div className="bg-white rounded-2xl p-4 shadow-2xs border border-[#E2E8F0]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="w-1 h-5 rounded-full bg-[#DB1D43]" />
                      <h3 className="font-black text-[15.5px] text-[#0F172A]">បញ្ជីទំនិញកម្ម៉ង់ (Order Summary)</h3>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-[#FFF1F2] border border-rose-200 text-[#BE123C] font-extrabold text-[12px]">
                      {totalCartItems} មុខ
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {cart.map(item => (
                      <div
                        key={`${item.productId}-${item.variantId}`}
                        className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                      >
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="w-14 h-14 rounded-2xl object-cover bg-[#F8FAFC] border border-[#E2E8F0] shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-extrabold text-[14px] text-[#0F172A] truncate">
                            {item.name}
                          </div>
                          <div className="text-[12px] font-bold text-slate-500 mt-0.5">
                            កូដ <span className="text-[#0F172A] font-extrabold">{item.code}</span> • {item.color} • {item.size}
                          </div>
                          <div className="text-[13px] font-black text-[#DB1D43] mt-0.5 tabular-nums">
                            ${item.price.toFixed(2)} × {item.qty} = ${(item.price * item.qty).toFixed(2)}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleUpdateCartQty(item.productId, item.variantId, -1)}
                            className="w-7 h-7 rounded-lg bg-[#F8FAFC] hover:bg-[#FFF1F2] hover:text-[#DB1D43] border border-[#E2E8F0] font-black text-slate-700 flex items-center justify-center cursor-pointer transition-colors"
                          >
                            -
                          </button>
                          <span className="text-xs font-extrabold w-5 text-center tabular-nums text-[#0F172A]">{item.qty}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateCartQty(item.productId, item.variantId, 1)}
                            className="w-7 h-7 rounded-lg bg-[#F8FAFC] hover:bg-[#FFF1F2] hover:text-[#DB1D43] border border-[#E2E8F0] font-black text-slate-700 flex items-center justify-center cursor-pointer transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Subtotal + Shipping Breakdown */}
                  <div className="mt-3.5 pt-3 border-t border-dashed border-slate-200 space-y-1.5 text-[13px]">
                    <div className="flex items-center justify-between text-slate-500 font-bold">
                      <span>តម្លៃទំនិញសរុប ({totalCartItems} មុខ)</span>
                      <span className="tabular-nums text-[#0F172A] font-extrabold">${cartSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500 font-bold">
                      <span>សេវាដឹកជញ្ជូន ({zone === 'PP' ? 'ភ្នំពេញ' : deliveryCompany})</span>
                      <span className="tabular-nums text-[#0F172A] font-extrabold">
                        {shippingFee === 0 ? 'ឥតគិតថ្លៃ' : `$${shippingFee.toFixed(2)}`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* =============================================================
                    CARD 3: "ជ្រើសរើសវិធីទូទាត់" (Unified Rose-Crimson & Clean Slate Theme)
                   ============================================================= */}
                <div className="rounded-2xl bg-white p-4 shadow-2xs border border-[#E2E8F0]">
                  <div className="flex items-center justify-between gap-2 mb-3.5">
                    <div className="flex items-start gap-2.5">
                      <span className="w-1 h-5 rounded-full bg-[#DB1D43] mt-1 shrink-0" />
                      <div>
                        <h3 className="font-black text-[16.5px] text-[#0F172A]">
                          ជ្រើសរើសវិធីទូទាត់
                        </h3>
                        <p className="text-[12px] font-bold text-slate-500 mt-0.5">
                          ទឹកប្រាក់ត្រូវបង់សរុប (រួមទាំងសេវាដឹក)
                        </p>
                      </div>
                    </div>
                    <span className="bg-[#FFF1F2] border border-rose-200 px-3.5 py-1.5 rounded-full font-black text-[17px] text-[#DB1D43] tabular-nums shrink-0">
                      ${cartTotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {/* OPTION 1: KHQR */}
                    <button
                      type="button"
                      disabled={isSubmittingOrder}
                      onClick={() => handleChoosePaymentMethod('KHQR')}
                      className="w-full p-3.5 rounded-2xl bg-[#F8FAFC] hover:bg-[#FFF1F2]/70 border border-[#E2E8F0] hover:border-rose-300 flex items-center justify-between gap-3 cursor-pointer active:scale-[0.99] transition-all text-left group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-center shrink-0">
                          <span className="bg-[#CE3232] text-white font-black text-[10px] tracking-wider px-2 py-1 rounded">
                            KHQR
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="font-black text-[15px] text-[#0F172A] group-hover:text-[#DB1D43] transition-colors">
                            KHQR
                          </div>
                          <div className="text-[12px] font-medium text-slate-500 truncate mt-0.5">
                            ស្គេនទូទាត់តាមធនាគារជាសមាជិក
                          </div>
                        </div>
                      </div>
                      <svg className="w-5 h-5 text-slate-400 group-hover:text-[#DB1D43] shrink-0 transition-colors" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    {/* OPTION 2: ABA KHQR */}
                    <button
                      type="button"
                      disabled={isSubmittingOrder}
                      onClick={() => handleChoosePaymentMethod('ABA_KHQR')}
                      className="w-full p-3.5 rounded-2xl bg-[#F8FAFC] hover:bg-[#FFF1F2]/70 border border-[#E2E8F0] hover:border-rose-300 flex items-center justify-between gap-3 cursor-pointer active:scale-[0.99] transition-all text-left group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-2xs flex flex-col shrink-0">
                          <div className="bg-[#1B5271] flex-1 flex items-center justify-center">
                            <span className="text-white font-black text-[13px] tracking-tight">
                              ABA<span className="text-[#E1232E]">&apos;</span>
                            </span>
                          </div>
                          <div className="bg-[#CE3232] h-4 flex items-center justify-center">
                            <span className="text-white font-black text-[8px] tracking-wider">
                              KHQR
                            </span>
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="font-black text-[15px] text-[#0F172A] group-hover:text-[#DB1D43] transition-colors">
                            ABA KHQR
                          </div>
                          <div className="text-[12px] font-medium text-slate-500 truncate mt-0.5">
                            ចុចបើកកម្មវិធី ABA Mobile ផ្ទាល់ ឬស្គេន QR
                          </div>
                        </div>
                      </div>
                      <svg className="w-5 h-5 text-slate-400 group-hover:text-[#DB1D43] shrink-0 transition-colors" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    {/* OPTION 3: COD (បង់ប្រាក់ពេលដឹកដល់) */}
                    <button
                      type="button"
                      disabled={isSubmittingOrder}
                      onClick={() => handleChoosePaymentMethod('COD')}
                      className="w-full p-3.5 rounded-2xl bg-[#F8FAFC] hover:bg-[#FFF1F2]/70 border border-[#E2E8F0] hover:border-rose-300 flex items-center justify-between gap-3 cursor-pointer active:scale-[0.99] transition-all text-left group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-center text-lg shrink-0">
                          🚚
                        </div>
                        <div className="min-w-0">
                          <div className="font-black text-[15px] text-[#0F172A] group-hover:text-[#DB1D43] transition-colors">
                            {isSubmittingOrder && paymentMethod === 'COD'
                              ? 'កំពុងបញ្ជូនការកម្ម៉ង់ COD...'
                              : 'បង់ពេលទទួលទំនិញ (COD)'}
                          </div>
                          <div className="text-[12px] font-medium text-slate-500 truncate mt-0.5">
                            ទូទាត់សាច់ប្រាក់ផ្ទាល់ពេលទំនិញដឹកដល់ដៃ
                          </div>
                        </div>
                      </div>
                      <svg className="w-5 h-5 text-slate-400 group-hover:text-[#DB1D43] shrink-0 transition-colors" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* =============================================================
                 STEP 2 VIEW: OFFICIAL KHQR CARD + SAVE / SHARE / ABA (Unified App Theme)
                 ============================================================= */
              <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col items-center">
                {/* 1. OFFICIAL FULL-SIZE KHQR CARD ( shrink-0 prevents any vertical clipping! ) */}
                <div className="w-full max-w-[330px] bg-white rounded-[28px] shadow-[0_8px_28px_rgba(15,23,42,0.08)] border border-[#E2E8F0] overflow-hidden shrink-0">
                  {/* Top Crimson Red KHQR Banner with Diagonal Right Cut */}
                  <div className="relative h-[60px] bg-[#CE3232] flex items-center justify-center">
                    <span className="text-white font-black text-[21px] tracking-[0.14em]">
                      KHQR
                    </span>
                    <div
                      className="absolute bottom-0 left-0 right-11 h-3.5 bg-white"
                      style={{ clipPath: 'polygon(0 0, 88% 0, 100% 100%, 0% 100%)' }}
                    />
                  </div>

                  {/* Merchant Name & Exact Total Amount */}
                  <div className="px-7 pt-2 pb-4 text-left">
                    <div className="font-extrabold text-[15px] text-[#0F172A] truncate">
                      {config.khqrMerchantName || config.storeName}
                    </div>
                    <div className="font-black text-[28px] text-[#DB1D43] tracking-tight tabular-nums mt-0.5 leading-tight">
                      ${cartTotal.toFixed(2)}
                    </div>
                  </div>

                  {/* Dashed Horizontal Line */}
                  <div className="mx-6 border-b-[1.5px] border-dashed border-slate-200" />

                  {/* Unclipped Square QR Code Box with Centered Red KHQR Emblem */}
                  <div className="p-5">
                    <div className="p-3.5 rounded-[22px] border border-slate-200 bg-white flex items-center justify-center relative aspect-square w-full">
                      <img
                        src={getKhqrQrSrc()}
                        alt="KHQR Code"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain block"
                      />

                      {/* Centered Circular Red KHQR Emblem with White Mini QR Icon */}
                      {!hasCustomUploadedKhqrImage && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-11 h-11 rounded-full bg-[#CE3232] border-[2.5px] border-white shadow-md flex items-center justify-center text-white">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm13-2h3v2h-3v-2zm-3 0h2v3h-2v-3zm3 3h3v2h-3v-2zm-3 3h2v2h-2v-2zm3 0h3v2h-3v-2z" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. EXPIRATION COUNTDOWN PILL */}
                <div className="mt-4 px-5 py-2 rounded-full bg-[#FFF1F2] border border-rose-200 text-[#BE123C] font-extrabold text-[13px] flex items-center gap-2 shadow-2xs shrink-0">
                  <svg className="w-4 h-4 text-[#DB1D43]" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="tabular-nums">
                    QR ផុតកំណត់ក្នុងរយៈពេល {formatCountdown(qrCountdown)}
                  </span>
                </div>

                {/* 3. SAVE & SHARE BUTTONS (Matched to App's Slate & Rose-Crimson Palette) */}
                <div className="mt-4 w-full max-w-[350px] grid grid-cols-2 gap-3 shrink-0">
                  <button
                    type="button"
                    disabled={isGeneratingKhqrCard}
                    onClick={handleSaveKhqrImage}
                    className="py-2.5 px-4 rounded-2xl bg-[#0F172A] hover:bg-slate-800 text-white font-extrabold text-[14px] shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all"
                  >
                    <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
                      </svg>
                    </span>
                    <span>{isGeneratingKhqrCard ? 'កំពុងរក្សា...' : 'រក្សាទុក'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isGeneratingKhqrCard}
                    onClick={handleShareKhqrImage}
                    className="py-2.5 px-4 rounded-2xl bg-[#DB1D43] hover:bg-[#BE123C] text-white font-extrabold text-[14px] shadow-xs shadow-rose-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all"
                  >
                    <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 6l-4-4m0 0L8 6m4-4v12" />
                      </svg>
                    </span>
                    <span>ចែករំលែក</span>
                  </button>
                </div>

                {/* 4. WAITING FOR PAYMENT CONFIRMATION STATUS BAR */}
                <div className="mt-3.5 w-full max-w-[350px] py-3 px-4 rounded-2xl bg-white border border-[#E2E8F0] flex items-center justify-center gap-2.5 text-[#334155] font-extrabold text-[13px] shadow-2xs shrink-0">
                  <svg className="w-4 h-4 text-[#DB1D43] animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                  </svg>
                  <span>កំពុងរង់ចាំការបញ្ជាក់ការទូទាត់...</span>
                </div>

                {/* 5. OPTIONAL ABA DIRECT OPEN + SLIP UPLOAD & CONFIRM */}
                <div className="mt-3 w-full max-w-[350px] space-y-2 pb-4 shrink-0">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleOpenAbaDirect}
                      className="py-2.5 px-3 rounded-xl bg-[#1B5271] hover:bg-[#133E57] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <span>🚀 បើក ABA ផ្ទាល់</span>
                    </button>

                    <label className="py-2.5 px-3 rounded-xl bg-white hover:bg-[#FFF1F2] border border-[#E2E8F0] hover:border-rose-200 text-[#334155] hover:text-[#BE123C] font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors">
                      <span>
                        📸 {isUploadingSlip ? 'កំពុងបង្ហោះ...' : paymentSlipUrl ? 'ប្តូររូបស្លីប ✓' : 'ភ្ជាប់ស្លីបបង់ប្រាក់'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadFile(file, 'slip');
                        }}
                      />
                    </label>
                  </div>

                  {paymentSlipUrl && (
                    <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 p-2 rounded-xl">
                      <img
                        src={paymentSlipUrl}
                        alt="Payment Slip"
                        referrerPolicy="no-referrer"
                        className="w-8 h-10 object-cover rounded-lg border border-emerald-300"
                      />
                      <div className="text-xs font-extrabold text-emerald-800">
                        ✅ បានភ្ជាប់រូបស្លីបបង់ប្រាក់រួចរាល់!
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={isSubmittingOrder}
                    onClick={() => submitOrderWithMethod('KHQR')}
                    className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-[#E11D48] to-[#BE123C] hover:from-[#BE123C] hover:to-[#9F1239] text-white font-extrabold text-xs sm:text-sm shadow-md shadow-rose-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.99] transition-all"
                  >
                    <span>
                      {isSubmittingOrder
                        ? '⏳ កំពុងបញ្ជូនការកម្ម៉ង់...'
                        : `✅ បញ្ជាក់ការកម្ម៉ង់ • បានបង់ប្រាក់ ($${cartTotal.toFixed(2)})`}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: COMPLETED ORDER RECEIPT
         ===================================================================== */}
      {completedOrder && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 text-2xl flex items-center justify-center mx-auto mb-2 font-bold">
                ✓
              </div>
              <h3 className="font-extrabold text-lg text-slate-900">កម្ម៉ង់ជោគជ័យ!</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                លេខវិក្កយបត្រ៖ <span className="font-extrabold text-[#DB1D43]">#{completedOrder.id}</span>
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">អតិថិជន:</span>
                <span className="font-bold text-slate-900">{completedOrder.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ទូរស័ព្ទ:</span>
                <span className="font-bold text-slate-900">{completedOrder.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ទីតាំង:</span>
                <span className="font-bold text-slate-900 text-right">{completedOrder.address}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ការទូទាត់:</span>
                <span className="font-extrabold text-[#DB1D43]">
                  {completedOrder.paymentMethod === 'KHQR' ? '💳 ស្កេនបង់ប្រាក់ (KHQR)' : '🚚 បង់ពេលដឹកដល់ (COD)'}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 space-y-1">
                {completedOrder.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between text-[11px]">
                    <span>
                      [{it.code}] {it.color} - {it.size} x{it.qty}
                    </span>
                    <span className="font-bold tabular-nums">${(it.price * it.qty).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 font-extrabold text-sm text-slate-900 tabular-nums">
                <span>សរុបរួម (រួមទាំងថ្លៃដឹក):</span>
                <span className="text-[#DB1D43]">${completedOrder.totalAmount.toFixed(2)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  const summary = [
                    `🧾 វិក្កយបត្រ #${completedOrder.id} — ${config.storeName}`,
                    `👤 អតិថិជន: ${completedOrder.customerName} (${completedOrder.phone})`,
                    `📍 ទីតាំង: ${completedOrder.address}`,
                    `👗 ទំនិញ: ${completedOrder.items.map(i => `[${i.code}] ${i.color}-${i.size} x${i.qty}`).join(', ')}`,
                    `💵 សរុបរួម: $${completedOrder.totalAmount.toFixed(2)} (${completedOrder.paymentMethod})`
                  ].join('\n');
                  navigator.clipboard.writeText(summary);
                  showToast('📋 បានចម្លងវិក្កយបត្រទុករួចរាល់!');
                }}
                className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs cursor-pointer"
              >
                📋 ចម្លងវិក្កយបត្រ
              </button>
              <button
                type="button"
                onClick={() => {
                  setCompletedOrder(null);
                  setIsMyOrdersOpen(true);
                }}
                className="py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-[#BE123C] font-extrabold text-xs cursor-pointer"
              >
                🚚 តាមដានអីវ៉ាន់
              </button>
            </div>

            <button
              type="button"
              onClick={() => setCompletedOrder(null)}
              className="w-full py-3 rounded-2xl bg-slate-900 text-white font-extrabold text-xs cursor-pointer"
            >
              បន្តទិញម៉ូតផ្សេងទៀត
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 4: CUSTOMER ORDER HISTORY & LIVE TRACKING BY PHONE
         ===================================================================== */}
      {isMyOrdersOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsMyOrdersOpen(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-extrabold text-sm text-slate-900">📋 វិក្កយបត្រ & តាមដានអីវ៉ាន់របស់ខ្ញុំ</h3>
                <p className="text-[10.5px] text-slate-500">ពិនិត្យស្ថានភាពដឹកជញ្ជូន និងលេខកូដផ្ញើអីវ៉ាន់</p>
              </div>
              <button
                type="button"
                onClick={() => setIsMyOrdersOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Live Order Lookup Bar by Phone Number or Order ID */}
            <div className="p-3 bg-white border-b border-slate-100 flex items-center gap-2">
              <input
                type="text"
                value={orderLookupQuery}
                onChange={e => setOrderLookupQuery(e.target.value)}
                placeholder="វាយលេខទូរស័ព្ទ ឬលេខវិក្កយបត្រ (ឧ. 012... ឬ TG-1001)"
                className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold focus:outline-none focus:border-[#DB1D43]"
              />
              <button
                type="button"
                disabled={isLookingUpOrder}
                onClick={() => handleLookupOrders()}
                className="px-3.5 py-2 rounded-xl bg-[#DB1D43] hover:bg-[#BE123C] text-white font-extrabold text-xs shrink-0 cursor-pointer disabled:opacity-50"
              >
                {isLookingUpOrder ? 'កំពុងឆែក...' : '🔍 ឆែកមើល'}
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {myOrders.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <div className="text-3xl">📦</div>
                  <div className="font-extrabold text-xs text-slate-800">
                    មិនទាន់មានវិក្កយបត្រនៅលើទូរស័ព្ទនេះទេ
                  </div>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                    ប្រសិនបើបងធ្លាប់កម្ម៉ង់រួច សូមវាយលេខទូរស័ព្ទរបស់បងនៅប្រអប់ខាងលើ រួចចុច «🔍 ឆែកមើល» ដើម្បីមើលស្ថានភាពដឹកជញ្ជូន!
                  </p>
                </div>
              ) : (
                myOrders.map(ord => (
                <div key={ord.id} className="p-3 rounded-2xl border border-slate-200 bg-slate-50 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between font-extrabold">
                    <span className="text-[#DB1D43]">#{ord.id}</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                          ord.status === 'SHIPPED'
                            ? 'bg-blue-100 text-blue-800'
                            : ord.status === 'CONFIRMED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : ord.status === 'CANCELLED'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {ord.status === 'SHIPPED'
                          ? '🚚 បានដាក់ផ្ញើចេញ'
                          : ord.status === 'CONFIRMED'
                          ? '✅ ហាងបានទទួលអর্ডার'
                          : ord.status === 'CANCELLED'
                          ? '❌ បានបោះបង់'
                          : '⏳ រង់ចាំបញ្ជាក់'}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white text-[10px]">
                        {ord.paymentMethod === 'KHQR' ? '💳 KHQR' : '🚚 COD'}
                      </span>
                    </div>
                  </div>
                  <div className="text-slate-600">
                    {ord.items.map(i => `[${i.code}] ${i.color}-${i.size} x${i.qty}`).join(', ')}
                  </div>
                  {ord.trackingInfo && (
                    <div className="p-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 font-bold text-[11px]">
                      🔖 លេខដឹកជញ្ជូន / តៃកុង៖ {ord.trackingInfo}
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-200">
                    <span>{new Date(ord.createdAt).toLocaleString('km-KH')}</span>
                    <span>${ord.totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 5: STANDALONE MINI APP ADMIN DASHBOARD
         ===================================================================== */}
      {isAdminOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Admin Header */}
            <div className="px-4 py-3.5 bg-[#0F172A] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">👑</span>
                <div>
                  <h2 className="font-extrabold text-sm">ផ្ទាំងគ្រប់គ្រងហាង Telegram Mini App (ដាច់ដោយឡែក)</h2>
                  <p className="text-[11px] text-slate-400">បញ្ចូលម៉ូតខោអាវ មើលអর্ডার KHQR/COD និងកំណត់ហាង</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAdminOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold cursor-pointer"
              >
                បិទ ✕
              </button>
            </div>

            {!isAdminUnlocked ? (
              <form onSubmit={handleUnlockAdmin} className="p-6 max-w-xs mx-auto text-center space-y-4">
                <div className="text-3xl">🔒</div>
                <h3 className="font-extrabold text-base text-slate-900">បញ្ចូលលេខកូដសម្ងាត់ Admin</h3>
                <p className="text-xs text-slate-500">លេខកូដដើមគឺ 1688</p>
                <input
                  type="password"
                  value={adminPinInput}
                  onChange={e => setAdminPinInput(e.target.value)}
                  placeholder="បញ្ចូលលេខ PIN..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-center font-extrabold text-base tracking-widest"
                  autoFocus
                />
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-[#DB1D43] text-white font-extrabold text-xs cursor-pointer"
                >
                  ដោះសោចូលគ្រប់គ្រង
                </button>
              </form>
            ) : (
              <>
                {/* Admin KPI Summary Strip */}
                <div className="grid grid-cols-4 gap-2 px-4 py-2.5 bg-slate-900 text-white border-b border-slate-800 text-center">
                  <div className="bg-slate-800/90 rounded-xl p-2">
                    <div className="text-[10px] text-slate-400 font-bold">ចំណូលសរុប</div>
                    <div className="font-black text-xs sm:text-sm text-emerald-400 tabular-nums">
                      $
                      {adminOrders
                        .filter(o => o.status !== 'CANCELLED')
                        .reduce((sum, o) => sum + o.totalAmount, 0)
                        .toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-slate-800/90 rounded-xl p-2">
                    <div className="text-[10px] text-slate-400 font-bold">អর্ডারថ្មី</div>
                    <div className="font-black text-xs sm:text-sm text-amber-400 tabular-nums">
                      {adminOrders.filter(o => o.status === 'NEW').length} អর্ডার
                    </div>
                  </div>
                  <div className="bg-slate-800/90 rounded-xl p-2">
                    <div className="text-[10px] text-slate-400 font-bold">ស្តុកសរុប</div>
                    <div className="font-black text-xs sm:text-sm text-sky-400 tabular-nums">
                      {products.reduce((s, p) => s + p.variants.reduce((vs, v) => vs + v.stock, 0), 0)} ឈុត
                    </div>
                  </div>
                  <div className="bg-slate-800/90 rounded-xl p-2">
                    <div className="text-[10px] text-slate-400 font-bold">ម៉ូតអស់ស្តុក</div>
                    <div className="font-black text-xs sm:text-sm text-rose-400 tabular-nums">
                      {products.filter(p => p.variants.reduce((vs, v) => vs + v.stock, 0) <= 0).length} ម៉ូត
                    </div>
                  </div>
                </div>

                {/* Admin Navigation Tabs */}
                <div className="flex border-b border-slate-200 bg-slate-100 px-3 pt-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdminTab('products')}
                    className={`px-4 py-2 rounded-t-xl text-xs font-extrabold cursor-pointer ${
                      adminTab === 'products' ? 'bg-white text-[#DB1D43] shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    👗 ម៉ូតខោអាវ ({products.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdminTab('orders');
                      fetchAdminData();
                    }}
                    className={`px-4 py-2 rounded-t-xl text-xs font-extrabold cursor-pointer ${
                      adminTab === 'orders' ? 'bg-white text-[#DB1D43] shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    🛍️ អর্ডারភ្ញៀវ ({adminOrders.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminTab('settings')}
                    className={`px-4 py-2 rounded-t-xl text-xs font-extrabold cursor-pointer ${
                      adminTab === 'settings' ? 'bg-white text-[#DB1D43] shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    ⚙️ កំណត់ហាង & Link Telegram
                  </button>
                </div>

                {/* Admin Tab Body */}
                <div className="p-4 overflow-y-auto flex-1 bg-slate-50">
                  {/* TAB 1: PRODUCTS MANAGER */}
                  {adminTab === 'products' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-slate-600">
                          បញ្ជីម៉ូតខោអាវក្នុងហាង Telegram Mini App
                        </div>
                        <button
                          type="button"
                          onClick={() => openEditProductModal()}
                          className="px-3.5 py-2 rounded-xl bg-[#DB1D43] text-white font-extrabold text-xs shadow-xs cursor-pointer"
                        >
                          + បន្ថែមម៉ូតខោអាវថ្មី
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {products.map(p => {
                          const totalProdStock = p.variants.reduce((acc, v) => acc + v.stock, 0);
                          return (
                            <div
                              key={p.id}
                              className="bg-white p-3 rounded-2xl border border-slate-200 flex gap-3 items-center justify-between"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="relative w-14 h-16 shrink-0">
                                  <img
                                    src={p.imageUrl}
                                    alt={p.name}
                                    referrerPolicy="no-referrer"
                                    className="w-14 h-16 rounded-xl object-cover bg-slate-100"
                                  />
                                  {getProductImages(p).length > 1 && (
                                    <span className="absolute bottom-1 right-1 bg-black/75 text-white text-[9px] font-extrabold px-1.5 py-0.2 rounded-md">
                                      📸 {getProductImages(p).length}
                                    </span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="bg-slate-900 text-white text-[10px] font-extrabold px-2 py-0.5 rounded">
                                      {p.code}
                                    </span>
                                    <span className="font-bold text-xs text-slate-900 truncate">{p.name}</span>
                                  </div>
                                  <div className="text-xs font-extrabold text-[#DB1D43] mt-0.5">
                                    ${p.price.toFixed(2)}{' '}
                                    <span className="text-slate-400 line-through text-[10px]">
                                      ${p.originalPrice.toFixed(2)}
                                    </span>
                                    {totalProdStock <= 0 && (
                                      <span className="ml-1.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[9.5px] font-extrabold">
                                        អស់ស្តុក
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                    {p.variants.map(v => `${v.color}-${v.size}(${v.stock})`).join(', ')}
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-col gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => openEditProductModal(p)}
                                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] cursor-pointer"
                                >
                                  កែប្រែ
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleQuickRestockProduct(p.id, p.code)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-extrabold text-[10.5px] cursor-pointer"
                                  title="បន្ថែមស្តុក +3 គ្រប់ Size ភ្លាមៗ"
                                >
                                  +បន្ថែមស្តុក
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteProduct(p.id)}
                                  className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-[11px] cursor-pointer"
                                >
                                  លុប
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: ORDERS MANAGER (KHQR & COD) */}
                  {adminTab === 'orders' && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(['ALL', 'NEW', 'KHQR', 'COD'] as const).map(flt => (
                          <button
                            key={flt}
                            type="button"
                            onClick={() => setAdminOrderFilter(flt)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer ${
                              adminOrderFilter === flt
                                ? 'bg-slate-900 text-white'
                                : 'bg-white border border-slate-200 text-slate-700'
                            }`}
                          >
                            {flt === 'ALL'
                              ? 'ទាំងអស់'
                              : flt === 'NEW'
                              ? 'ថ្មី (NEW)'
                              : flt === 'KHQR'
                              ? '💳 បង់តាម KHQR'
                              : '🚚 បង់ពេលដឹកដល់ (COD)'}
                          </button>
                        ))}
                      </div>

                      {adminOrders.length === 0 ? (
                        <div className="bg-white p-8 rounded-2xl text-center text-xs text-slate-500 border border-slate-200">
                          មិនទាន់មានអর্ডারពីភ្ញៀវនៅឡើយទេ
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {adminOrders
                            .filter(o => {
                              if (adminOrderFilter === 'NEW') return o.status === 'NEW';
                              if (adminOrderFilter === 'KHQR') return o.paymentMethod === 'KHQR';
                              if (adminOrderFilter === 'COD') return o.paymentMethod === 'COD';
                              return true;
                            })
                            .map(ord => (
                              <div
                                key={ord.id}
                                className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-2 text-xs"
                              >
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-black text-sm text-[#DB1D43]">#{ord.id}</span>
                                    <span
                                      className={`px-2 py-0.5 rounded-md font-extrabold text-[10.5px] ${
                                        ord.channel === 'FACEBOOK' || ord.id.startsWith('FB-')
                                          ? 'bg-blue-100 text-blue-800'
                                          : 'bg-sky-100 text-sky-800'
                                      }`}
                                    >
                                      {ord.channel === 'FACEBOOK' || ord.id.startsWith('FB-')
                                        ? '📘 Facebook Page'
                                        : '✈️ Telegram'}
                                    </span>
                                    <span
                                      className={`px-2 py-0.5 rounded-md font-extrabold text-[10.5px] ${
                                        ord.paymentMethod === 'KHQR'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {ord.paymentMethod === 'KHQR' ? '💳 KHQR' : '🚚 COD'}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md bg-slate-100 font-bold text-slate-700 text-[10.5px]">
                                      {ord.status}
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-slate-400">
                                    {new Date(ord.createdAt).toLocaleString('km-KH')}
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <div>
                                      👤 អតិថិជន: <b>{ord.customerName}</b>{' '}
                                      {ord.telegramUsername && (
                                        <a
                                          href={`https://t.me/${ord.telegramUsername}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-blue-600 underline"
                                        >
                                          @{ord.telegramUsername}
                                        </a>
                                      )}
                                    </div>
                                    <div>
                                      📞 ទូរស័ព្ទ: <b className="text-slate-900">{ord.phone}</b>
                                    </div>
                                    <div>
                                      📍 ទីតាំង: <b>{ord.address}</b> ({ord.deliveryCompany})
                                    </div>
                                  </div>

                                  <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                                    {ord.items.map((it, idx) => (
                                      <div key={idx} className="flex justify-between text-[11px]">
                                        <span>
                                          [{it.code}] {it.color}-{it.size} x{it.qty}
                                        </span>
                                        <span className="font-bold">${(it.price * it.qty).toFixed(2)}</span>
                                      </div>
                                    ))}
                                    <div className="flex justify-between font-extrabold text-slate-900 border-t border-slate-200 mt-1 pt-1">
                                      <span>សរុប (ដឹក ${ord.shippingFee.toFixed(2)}):</span>
                                      <span className="text-[#DB1D43]">${ord.totalAmount.toFixed(2)}</span>
                                    </div>
                                  </div>
                                </div>

                                {ord.paymentSlipUrl && (
                                  <div className="flex items-center gap-2 pt-1">
                                    <a
                                      href={ord.paymentSlipUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-xs border border-emerald-200"
                                    >
                                      🖼️ មើលរូបស្លីបបង់លុយ (Slip)
                                    </a>
                                  </div>
                                )}

                                {/* Tracking Info Input for Auto-Notify on Shipped */}
                                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                  <input
                                    type="text"
                                    value={trackingInputs[ord.id] ?? ord.trackingInfo ?? ''}
                                    onChange={e =>
                                      setTrackingInputs(prev => ({
                                        ...prev,
                                        [ord.id]: e.target.value
                                      }))
                                    }
                                    placeholder="🔖 លេខកូដផ្ញើ J&T / VET ឬលេខតៃកុងឡាន (បើមាន)..."
                                    className="flex-1 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-medium focus:outline-none focus:border-blue-500"
                                  />
                                  <span className="text-[10px] text-slate-400">
                                    (នឹងផ្ញើចូលឆាតភ្ញៀវពេលចុច «🚚 បានផ្ញើចេញ»)
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateOrderStatus(ord.id, 'CONFIRMED')}
                                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer shadow-2xs"
                                    >
                                      ✅ ទទួលអর্ডার (ជូនដំណឹងភ្ញៀវ)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateOrderStatus(ord.id, 'SHIPPED')}
                                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] cursor-pointer shadow-2xs"
                                    >
                                      🚚 បានផ្ញើចេញ (ជូនដំណឹងភ្ញៀវ)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateOrderStatus(ord.id, 'CANCELLED')}
                                      className="px-3 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-[11px] cursor-pointer"
                                    >
                                      ❌ បោះបង់ (បង្វិលស្តុក)
                                    </button>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => setDeliverySlipOrder(ord)}
                                    className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-[11px] flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                  >
                                    <span>🖨️</span>
                                    <span>ព្រីនស្លាកដឹកជញ្ជូន (Slip)</span>
                                  </button>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: STORE SETTINGS & TELEGRAM BOT LINK */}
                  {adminTab === 'settings' && (
                    <form onSubmit={handleSaveConfig} className="space-y-4">
                      {/* TOP CARD: STORE LOGO PHOTO, STORE NAME & SUBTITLE */}
                      <div className="bg-white p-4 rounded-2xl border-2 border-rose-200 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                            <span>🏪</span>
                            <span>រូបឡូហ្គោហាង និងឈ្មោះហាង (បង្ហាញនៅក្បាលខាងលើ)</span>
                          </div>
                          <button
                            type="submit"
                            className="px-3 py-1.5 rounded-xl bg-[#DB1D43] text-white font-extrabold text-[11px] shadow-sm cursor-pointer"
                          >
                            💾 រក្សាទុកភ្លាម
                          </button>
                        </div>

                        {/* Logo Upload Row */}
                        <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-slate-50 border border-slate-200">
                          <div className="w-16 h-16 rounded-full bg-[#DB1D43] text-white font-black text-2xl flex items-center justify-center shadow-md shrink-0 overflow-hidden border-2 border-white">
                            {config.storeLogoUrl ? (
                              <img
                                src={config.storeLogoUrl}
                                alt={config.storeName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              config.storeLogoLetter || 'K'
                            )}
                          </div>

                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="text-xs font-extrabold text-slate-800">
                              រូបឡូហ្គោហាង (Logo រង្វង់ខាងលើ)
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-[11px] cursor-pointer shadow-sm">
                                <span>📷 {isUploadingProductImg ? 'កំពុងបង្ហោះ...' : 'ដាក់រូបឡូហ្គោហាង'}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) handleUploadFile(file, 'logo');
                                  }}
                                />
                              </label>
                              {config.storeLogoUrl && (
                                <button
                                  type="button"
                                  onClick={() => setConfig({ ...config, storeLogoUrl: '' })}
                                  className="px-2.5 py-1.5 rounded-xl bg-rose-100 text-rose-700 font-bold text-[11px] cursor-pointer"
                                >
                                  🗑️ លុបរូប (ប្រើអក្សរវិញ)
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              ឈ្មោះហាង (Store Name)
                            </label>
                            <input
                              type="text"
                              value={config.storeName}
                              onChange={e => setConfig({ ...config, storeName: e.target.value })}
                              placeholder="ឧ. ហាងខោអាវ Kari Around"
                              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-extrabold text-slate-900 focus:border-[#DB1D43] focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              អក្សរឡូហ្គោ (បើមិនដាក់រូប)
                            </label>
                            <input
                              type="text"
                              maxLength={2}
                              value={config.storeLogoLetter}
                              onChange={e => setConfig({ ...config, storeLogoLetter: e.target.value })}
                              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-center"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              អក្សរពិពណ៌នាខាងក្រោមឈ្មោះហាង
                            </label>
                            <input
                              type="text"
                              value={config.storeSubtitle}
                              onChange={e => setConfig({ ...config, storeSubtitle: e.target.value })}
                              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              អក្សររបារប្រូម៉ូសិនពណ៌ក្រហម
                            </label>
                            <input
                              type="text"
                              value={config.promoBannerText}
                              onChange={e => setConfig({ ...config, promoBannerText: e.target.value })}
                              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                            />
                          </div>
                        </div>
                      </div>

                      {/* 1-Click Automatic Telegram Bot Menu Button & WebApp Setup */}
                      <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-extrabold text-xs text-blue-950 flex items-center gap-1.5">
                            <span>🤖</span>
                            <span>ភ្ជាប់ Mini App ទៅ Telegram Bot ស្វ័យប្រវត្តិ (1-Click Setup)</span>
                          </div>
                          {config.botUsername && (
                            <a
                              href={`https://t.me/${config.botUsername}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[11px] border border-emerald-300"
                            >
                              ✅ @{config.botUsername}
                            </a>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div>
                            <label className="block text-[11px] font-bold text-blue-900 mb-1">
                              1. Link ហាង Mini App (ត្រូវតែជា https:// ឧ. https://chatbotkh.com/miniapp)
                            </label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={config.miniAppUrl || miniAppPublicUrl}
                                onChange={e => setConfig({ ...config, miniAppUrl: e.target.value })}
                                placeholder="https://chatbotkh.com/miniapp"
                                className="flex-1 px-3 py-2 rounded-xl bg-white border border-blue-300 text-xs font-mono text-slate-800"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(config.miniAppUrl || miniAppPublicUrl);
                                  showToast('បានចម្លង Link ហាង Mini App!');
                                }}
                                className="px-3 py-2 rounded-xl bg-slate-800 text-white font-extrabold text-xs shrink-0 cursor-pointer"
                              >
                                ចម្លង
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] font-bold text-blue-900 mb-1">
                                2. ឈ្មោះប៊ូតុង Menu ក្នុង Telegram
                              </label>
                              <input
                                type="text"
                                value={config.menuButtonText || '🛍️ ទិញទំនិញ'}
                                onChange={e => setConfig({ ...config, menuButtonText: e.target.value })}
                                placeholder="🛍️ ទិញទំនិញ"
                                className="w-full px-3 py-2 rounded-xl bg-white border border-blue-300 text-xs font-bold text-slate-800"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-blue-900 mb-1">
                                3. Bot Token សម្រាប់ Mini App (ដាច់ដោយឡែកពី Live POS)
                              </label>
                              <input
                                type="password"
                                value={botTokenInput || config.telegramBotToken || ''}
                                onChange={e => {
                                  setBotTokenInput(e.target.value);
                                  setConfig({ ...config, telegramBotToken: e.target.value });
                                }}
                                placeholder="បញ្ចូល Bot Token សម្រាប់តែហាង Mini App..."
                                className="w-full px-3 py-2 rounded-xl bg-white border border-blue-300 text-xs font-mono text-slate-800"
                              />
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2 pt-1">
                            <button
                              type="button"
                              disabled={isSettingUpBot}
                              onClick={handleSetupTelegramBot}
                              className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-extrabold text-xs shadow-sm cursor-pointer"
                            >
                              {isSettingUpBot
                                ? '⏳ កំពុងភ្ជាប់ទៅ Telegram Bot...'
                                : '🚀 ភ្ជាប់ប៊ូតុងហាងទៅ Telegram Bot ឥឡូវនេះ (1-Click)'}
                            </button>

                            <button
                              type="button"
                              disabled={isSendingShopCard}
                              onClick={handleSendShopCardToGroup}
                              className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-extrabold text-xs shadow-sm cursor-pointer"
                            >
                              {isSendingShopCard ? '⏳ កំពុងផ្ញើ...' : '📢 ផ្ញើប៊ូតុងហាងចូល Group'}
                            </button>
                          </div>

                          {config.botUsername && (
                            <div className="p-2.5 rounded-xl bg-white/90 border border-blue-200 flex items-center justify-between gap-2">
                              <div className="text-[11px] text-slate-700 truncate">
                                🔗 Link ផ្ញើឱ្យភ្ញៀវចុចបើក Bot៖{' '}
                                <b className="text-blue-700 font-mono">https://t.me/{config.botUsername}?start=shop</b>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(`https://t.me/${config.botUsername}?start=shop`);
                                  showToast('បានចម្លង Link សម្រាប់ផ្ញើឱ្យភ្ញៀវ!');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 font-bold text-[11px] shrink-0 cursor-pointer"
                              >
                                ចម្លង Link ភ្ញៀវ
                              </button>
                            </div>
                          )}

                          <p className="text-[11px] text-blue-900 leading-relaxed">
                            💡 គ្រាន់តែចុចប៊ូតុង <b>«🚀 ភ្ជាប់ប៊ូតុងហាងទៅ Telegram Bot ឥឡូវនេះ»</b> ប្រព័ន្ធនឹងបង្កើតប៊ូតុងពណ៌ខៀវ <b>«🛍️ ទិញទំនិញ»</b> នៅជ្រុងខាងក្រោមនៃ Telegram Bot របស់អ្នកដោយស្វ័យប្រវត្តិ និងឆ្លើយតបប៊ូតុងហាងភ្លាមៗរាល់ពេលភ្ញៀវចុច <b>START</b> ឬវាយ <b>/shop</b>!
                          </p>
                        </div>
                      </div>

                      {/* FACEBOOK PAGE MESSENGER SHOP INTEGRATION (BOTH METHOD 1 & METHOD 2) */}
                      <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50 via-blue-50 to-sky-50 border-2 border-indigo-200 space-y-4">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="font-extrabold text-xs text-indigo-950 flex items-center gap-1.5">
                            <span>📘</span>
                            <span>ប៊ូតុងហាងទំនិញក្នុង Facebook Page Messenger (ទាំង ២ របៀប)</span>
                          </div>
                          {config.fbPageName && (
                            <a
                              href={config.fbPageId ? `https://m.me/${config.fbPageId}` : '#'}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1 rounded-full bg-blue-600 text-white font-extrabold text-[11px] shadow-sm"
                            >
                              ✅ Page: {config.fbPageName}
                            </a>
                          )}
                        </div>

                        {/* METHOD 1: NO-CODE META BUSINESS SUITE INSTANT REPLY & BUTTON LINK */}
                        <div className="p-3.5 rounded-xl bg-white border border-indigo-200 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-xs text-indigo-900">
                              ✨ របៀបទី ១៖ ដាក់ក្នុង Meta Business Suite (សារស្វាគមន៍ & ប៊ូតុងហាង - មិនបាច់ប្រើ Token)
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                              ស្រួលបំផុត ១០០%
                            </span>
                          </div>

                          <div className="space-y-2">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                🔗 Link ហាងសម្រាប់ដាក់ក្នុងប៊ូតុង Facebook Page / សារស្វាគមន៍ (បើកហាងក្នុង Messenger ផ្ទាល់)៖
                              </label>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  readOnly
                                  value={`${(config.miniAppUrl || miniAppPublicUrl).replace(/\/$/, '')}?source=fb`}
                                  className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono text-indigo-900"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const fbUrl = `${(config.miniAppUrl || miniAppPublicUrl).replace(/\/$/, '')}?source=fb`;
                                    navigator.clipboard.writeText(fbUrl);
                                    showToast('បានចម្លង Link ហាងសម្រាប់ Facebook Page!');
                                  }}
                                  className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shrink-0 cursor-pointer"
                                >
                                  ចម្លង Link ហាង
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-100">
                              <div className="text-[11px] text-slate-700">
                                💬 ចម្លង <b>«សារស្វាគមន៍ + Link បើកហាង»</b> យកទៅដាក់ក្នុង <b>Meta Business Suite {'->'} Automations {'->'} Instant Reply</b>៖
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const fbUrl = `${(config.miniAppUrl || miniAppPublicUrl).replace(/\/$/, '')}?source=fb`;
                                  const instantReplyText = [
                                    `សួស្តីបង! 🙏✨ សូមស្វាគមន៍មកកាន់ ${config.storeName}`,
                                    `${config.storeSubtitle}`,
                                    `🔥 ${config.promoBannerText}`,
                                    `👇 សូមចុចលីងខាងក្រោមដើម្បីមើលម៉ូត រើសពណ៌ រើស Size និងកម្ម៉ង់ទិញដោយខ្លួនឯងភ្លាមៗ៖`,
                                    `🛍️ ចុចបើកហាងទិញទំនិញ៖ ${fbUrl}`
                                  ].join('\n');
                                  navigator.clipboard.writeText(instantReplyText);
                                  showToast('បានចម្លងសារស្វាគមន៍សម្រាប់ដាក់ក្នុង Meta Business Suite!');
                                }}
                                className="px-3 py-1.5 rounded-xl bg-slate-900 text-white font-extrabold text-[11px] cursor-pointer shrink-0"
                              >
                                📋 ចម្លងសារស្វាគមន៍ទាំងមូល
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* METHOD 2: 1-CLICK FACEBOOK PAGE API AUTO-REPLY BUTTON CARD & PERSISTENT MENU */}
                        <div className="p-3.5 rounded-xl bg-white border border-blue-200 space-y-3">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <span className="font-extrabold text-xs text-blue-900">
                              🤖 របៀបទី ២៖ ភ្ជាប់ Facebook Page Token (លោតប៊ូតុងចុចទិញក្នុងឆាតស្វ័យប្រវត្តិ + ផ្ញើវិក្កយបត្រចូលឆាតភ្ញៀវ)
                            </span>
                            <label className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={config.fbAutoReplyEnabled ?? true}
                                onChange={e => setConfig({ ...config, fbAutoReplyEnabled: e.target.checked })}
                                className="accent-emerald-600"
                              />
                              <span>ឆ្លើយតបប៊ូតុងហាងស្វ័យប្រវត្តិ</span>
                            </label>
                          </div>

                          {/* If Live POS already has connected Facebook Pages, allow 1-click selection */}
                          {connectedFbPages.length > 0 && (
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                ⚡ ជ្រើសរើស Facebook Page ដែលមានស្រាប់ក្នុងប្រព័ន្ធ (ឬបញ្ចូល Token ថ្មីខាងក្រោម)៖
                              </label>
                              <div className="flex flex-wrap gap-1.5">
                                {connectedFbPages.map(pg => (
                                  <button
                                    key={pg.id}
                                    type="button"
                                    onClick={() => {
                                      setFbTokenInput(pg.access_token);
                                      setConfig({
                                        ...config,
                                        fbPageId: pg.id,
                                        fbPageName: pg.name,
                                        fbPageAccessToken: pg.access_token
                                      });
                                      showToast(`បានជ្រើសរើស Page "${pg.name}"! សូមចុចប៊ូតុង 🚀 ភ្ជាប់ខាងក្រោមដើម្បីដំណើរការ`);
                                    }}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                                      config.fbPageId === pg.id
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                        : 'bg-blue-50 text-blue-900 border-blue-200 hover:bg-blue-100'
                                    }`}
                                  >
                                    📘 {pg.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div className="sm:col-span-1">
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                ឈ្មោះប៊ូតុងទិញក្នុង Messenger
                              </label>
                              <input
                                type="text"
                                maxLength={20}
                                value={config.fbButtonText || '🛍️ ចុចទិញទំនិញ'}
                                onChange={e => setConfig({ ...config, fbButtonText: e.target.value })}
                                placeholder="🛍️ ចុចទិញទំនិញ"
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Facebook Page Access Token (សម្រាប់បង្កើតប៊ូតុងហាងក្នុងឆាត)
                              </label>
                              <input
                                type="password"
                                value={fbTokenInput || config.fbPageAccessToken || ''}
                                onChange={e => {
                                  setFbTokenInput(e.target.value);
                                  setConfig({ ...config, fbPageAccessToken: e.target.value });
                                }}
                                placeholder="បិទភ្ជាប់ Page Access Token (EAAR...) នៅទីនេះ..."
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono text-slate-800"
                              />
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2 pt-1">
                            <button
                              type="button"
                              disabled={isSettingUpFbPage}
                              onClick={handleSetupFacebookPage}
                              className="flex-1 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-extrabold text-xs shadow-sm cursor-pointer"
                            >
                              {isSettingUpFbPage
                                ? '⏳ កំពុងភ្ជាប់ទៅ Facebook Page...'
                                : '🚀 ភ្ជាប់ប៊ូតុងហាងទៅ Facebook Page ឥឡូវនេះ (1-Click)'}
                            </button>

                            <button
                              type="button"
                              disabled={isSendingFbTestCard}
                              onClick={handleSendFbTestCard}
                              className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-extrabold text-xs shadow-sm cursor-pointer"
                            >
                              {isSendingFbTestCard
                                ? '⏳ កំពុងផ្ញើសាកល្បង...'
                                : '📢 សាកល្បងផ្ញើប៊ូតុងហាងទៅភ្ញៀវឆាតចុងក្រោយ'}
                            </button>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                            <div>
                              🔗 Webhook URL (បើប្រើ Meta Developer App)៖{' '}
                              <code className="font-mono text-indigo-700 font-bold">
                                {(config.miniAppUrl || miniAppPublicUrl).replace(/\/miniapp.*$/, '')}/api/miniapp/fb-webhook
                              </code>{' '}
                              | Verify Token: <b className="text-slate-900">{config.fbVerifyToken || '1688'}</b>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const whUrl = `${(config.miniAppUrl || miniAppPublicUrl).replace(/\/miniapp.*$/, '')}/api/miniapp/fb-webhook`;
                                navigator.clipboard.writeText(whUrl);
                                showToast('បានចម្លង Webhook URL!');
                              }}
                              className="px-2 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-[10.5px] cursor-pointer"
                            >
                              ចម្លង Webhook
                            </button>
                          </div>

                          <p className="text-[11px] text-indigo-950 leading-relaxed">
                            💡 នៅពេលភ្ជាប់រួច រាល់ពេលភ្ញៀវឆាតចូល Page (ដូចជាវាយ <b>សួស្តី, ទិញ, ម៉ូត, តម្លៃ</b> ឬចុចសំណួរស្វ័យប្រវត្តិ) ប្រព័ន្ធនឹងផ្ញើ <b>កាតប៊ូតុង «🛍️ ចុចទិញទំនិញ»</b> ចូលក្នុងឆាត Messenger របស់ភ្ញៀវដោយស្វ័យប្រវត្តិ ហើយពេលភ្ញៀវកម្ម៉ង់រួច វិក្កយបត្រនឹងលោតចូលទាំង <b>ឆាត Messenger របស់ភ្ញៀវ</b> និង <b>Telegram Group របស់ហាង</b>!
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-4 rounded-2xl border border-slate-200">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">ថ្លៃដឹកភ្នំពេញ ($)</label>
                          <input
                            type="number"
                            step="0.25"
                            value={config.shippingFeePP}
                            onChange={e => setConfig({ ...config, shippingFeePP: parseFloat(e.target.value) || 0 })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">ថ្លៃដឹកខេត្ត ($)</label>
                          <input
                            type="number"
                            step="0.25"
                            value={config.shippingFeeProvince}
                            onChange={e => setConfig({ ...config, shippingFeeProvince: parseFloat(e.target.value) || 0 })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Free ដឹកពេលទិញគ្រប់ ($)</label>
                          <input
                            type="number"
                            step="1"
                            value={config.freeShippingThreshold}
                            onChange={e => setConfig({ ...config, freeShippingThreshold: parseFloat(e.target.value) || 0 })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-extrabold text-[#DB1D43]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">ឈ្មោះគណនី KHQR / ABA</label>
                          <input
                            type="text"
                            value={config.khqrMerchantName}
                            onChange={e => setConfig({ ...config, khqrMerchantName: e.target.value })}
                            placeholder="ឧ. KARI ARNETT SHOP"
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">លេខគណនី ABA (បង្កើត QR ពិត)</label>
                          <input
                            type="text"
                            value={config.khqrAccountNumber || ''}
                            onChange={e =>
                              setConfig({
                                ...config,
                                khqrAccountNumber: e.target.value.replace(/\s+/g, '')
                              })
                            }
                            placeholder="ឧ. 000474559"
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-extrabold font-mono text-[#003D5B]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">ព័ត៌មានបង្ហាញលើកាត QR</label>
                          <input
                            type="text"
                            value={config.khqrAccountInfo}
                            onChange={e => setConfig({ ...config, khqrAccountInfo: e.target.value })}
                            placeholder="ឧ. 000 474 559 (ABA USD)"
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            🔗 លីងបើក ABA Mobile ផ្ទាល់ (ABA Payment Link - បើមិនដាក់ក៏ប្រព័ន្ធបើក ABA ស្វ័យប្រវត្តិដែរ)
                          </label>
                          <input
                            type="text"
                            value={config.abaPaymentLink || ''}
                            onChange={e => setConfig({ ...config, abaPaymentLink: e.target.value })}
                            placeholder="ឧ. https://link.payway.com.kh/aba?id=... (ទុកទទេក៏បាន ប្រព័ន្ធនឹងបើក ABA Mobile ដោយស្វ័យប្រវត្តិ)"
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                          />
                        </div>

                        {/* Upload Custom Bank KHQR Image */}
                        <div className="sm:col-span-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-3">
                            {config.khqrImageUrl ? (
                              <img
                                src={config.khqrImageUrl}
                                alt="KHQR"
                                className="w-14 h-14 rounded-xl object-contain border border-slate-200 bg-slate-50 p-1"
                              />
                            ) : (
                              <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-lg">
                                💳
                              </div>
                            )}
                            <div>
                              <div className="text-xs font-extrabold text-slate-800">
                                រូបភាព QR ធនាគារផ្ទាល់របស់ហាង (ABA / ACLEDA KHQR)
                              </div>
                              <div className="text-[10.5px] text-slate-500">
                                ពេលបង្ហោះរូប QR ប្រព័ន្ធនឹងអានលេខគណនី ABA ក្នុង QR ដោយស្វ័យប្រវត្តិ ដើម្បីបង្កើតកូដ KHQR ពិតដែលស្កេនចេញតម្លៃទឹកប្រាក់ភ្លាមៗ!
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-[11px] cursor-pointer">
                              <span>📷 បង្ហោះរូប KHQR</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={e => {
                                  const f = e.target.files?.[0];
                                  if (f) handleUploadFile(f, 'khqr');
                                }}
                              />
                            </label>
                            {config.khqrImageUrl && (
                              <button
                                type="button"
                                onClick={() => setConfig({ ...config, khqrImageUrl: '' })}
                                className="px-2.5 py-1.5 rounded-xl bg-rose-100 text-rose-700 font-bold text-[11px] cursor-pointer"
                              >
                                លុប
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* SIZE GUIDE EDITOR IN ADMIN SETTINGS */}
                      <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                            <span>📏</span>
                            <span>តារាងទំហំខោអាវតាមគីឡូ (Size Guide សម្រាប់ភ្ញៀវមើល)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setConfig({ ...config, sizeGuide: DEFAULT_SIZE_GUIDE })}
                            className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                          >
                            កំណត់ដើមវិញ
                          </button>
                        </div>

                        <div className="space-y-2">
                          {activeSizeGuide.map((row, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                              <input
                                type="text"
                                value={row.size}
                                onChange={e => {
                                  const next = [...activeSizeGuide];
                                  next[idx] = { ...row, size: e.target.value };
                                  setConfig({ ...config, sizeGuide: next });
                                }}
                                placeholder="Size M"
                                className="col-span-3 px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-extrabold text-slate-900"
                              />
                              <input
                                type="text"
                                value={row.weightRange}
                                onChange={e => {
                                  const next = [...activeSizeGuide];
                                  next[idx] = { ...row, weightRange: e.target.value };
                                  setConfig({ ...config, sizeGuide: next });
                                }}
                                placeholder="48kg – 54kg"
                                className="col-span-3 px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-[#DB1D43]"
                              />
                              <input
                                type="text"
                                value={row.bustRange}
                                onChange={e => {
                                  const next = [...activeSizeGuide];
                                  next[idx] = { ...row, bustRange: e.target.value };
                                  setConfig({ ...config, sizeGuide: next });
                                }}
                                placeholder='34" – 36"'
                                className="col-span-3 px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-medium"
                              />
                              <input
                                type="text"
                                value={row.note || ''}
                                onChange={e => {
                                  const next = [...activeSizeGuide];
                                  next[idx] = { ...row, note: e.target.value };
                                  setConfig({ ...config, sizeGuide: next });
                                }}
                                placeholder="សម្គាល់..."
                                className="col-span-3 px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-600"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3 rounded-2xl bg-[#DB1D43] text-white font-extrabold text-xs cursor-pointer"
                      >
                        💾 រក្សាទុកការកំណត់ហាង
                      </button>
                    </form>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 7: SIZE GUIDE BY WEIGHT (តារាងទំហំខោអាវតាមគីឡូ kg)
         ===================================================================== */}
      {isSizeGuideOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsSizeGuideOpen(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-3.5 bg-gradient-to-r from-[#E11D48] to-[#BE123C] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">📏</span>
                <div>
                  <h3 className="font-extrabold text-sm">តារាងទំហំខោអាវតាមគីឡូ (Size Guide)</h3>
                  <p className="text-[10.5px] text-rose-100">ចុចលើទំហំដើម្បីបង្ហាញម៉ូតដែលត្រូវនឹងគីឡូរបស់អ្នក</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSizeGuideOpen(false)}
                className="w-7 h-7 rounded-full bg-white/20 text-white font-bold text-xs flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-2.5">
              <div className="grid grid-cols-12 text-[11px] font-extrabold text-slate-500 px-2.5 pb-1 border-b border-slate-100">
                <div className="col-span-3">ទំហំ (Size)</div>
                <div className="col-span-4">ទម្ងន់ (គីឡូ)</div>
                <div className="col-span-3">ទំហំទ្រូង</div>
                <div className="col-span-2 text-right">ជ្រើសរើស</div>
              </div>

              {activeSizeGuide.map((row, idx) => {
                const isSelected = activeSize === row.size;
                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (SIZE_OPTIONS.includes(row.size as any)) {
                        setActiveSize(row.size);
                      }
                      setIsSizeGuideOpen(false);
                      showToast(`កំពុងបង្ហាញម៉ូតសម្រាប់ ${row.size} (${row.weightRange})`);
                    }}
                    className={`grid grid-cols-12 items-center p-2.5 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#FFF1F2] border-[#DB1D43] ring-1 ring-[#DB1D43]/30'
                        : 'bg-slate-50 hover:bg-rose-50/50 border-slate-200/90'
                    }`}
                  >
                    <div className="col-span-3">
                      <span className="font-extrabold text-xs text-slate-900">{row.size}</span>
                      {row.note && (
                        <div className="text-[9.5px] text-slate-500 truncate">{row.note}</div>
                      )}
                    </div>
                    <div className="col-span-4 font-extrabold text-xs text-[#DB1D43]">
                      ⚖️ {row.weightRange}
                    </div>
                    <div className="col-span-3 text-xs font-bold text-slate-700">
                      {row.bustRange}
                    </div>
                    <div className="col-span-2 text-right">
                      <span className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-extrabold text-[#DB1D43]">
                        មើលម៉ូត
                      </span>
                    </div>
                  </div>
                );
              })}

              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200/80 text-[11px] text-amber-900 leading-relaxed">
                💡 <b>គន្លឹះ៖</b> បើបងចូលចិត្តពាក់រលុងស្រួលខ្លួន ឬសាច់ក្រណាត់មិនយឺត សូមជ្រើសរើសធំជាងគីឡូធម្មតា ១ លេខ។
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 8: 1-CLICK PRINTABLE DELIVERY SLIP (ស្លាកដឹកជញ្ជូនបិទលើកញ្ចប់អីវ៉ាន់)
         ===================================================================== */}
      {deliverySlipOrder && (
        <div
          className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-xs flex items-center justify-center p-3"
          onClick={() => setDeliverySlipOrder(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header (Hidden when printing) */}
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2">
                <span>🖨️</span>
                <h3 className="font-extrabold text-xs">
                  ស្លាកដឹកជញ្ជូនបិទលើកញ្ចប់អីវ៉ាន់ (#{deliverySlipOrder.id})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDeliverySlipOrder(null)}
                className="w-7 h-7 rounded-full bg-slate-800 text-white font-bold text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Printable Shipping Label Area */}
            <div className="p-4 overflow-y-auto flex-1 bg-slate-100 print:bg-white print:p-0">
              <div
                id="printable-delivery-slip"
                className="bg-white border-2 border-slate-900 rounded-2xl p-4 space-y-3 text-slate-900 shadow-xs print:shadow-none print:rounded-none"
              >
                {/* Store Header & Order ID */}
                <div className="flex items-start justify-between border-b-2 border-slate-900 pb-2.5">
                  <div>
                    <div className="font-black text-base text-slate-900">{config.storeName}</div>
                    <div className="text-[11px] font-bold text-slate-600">
                      កាលបរិច្ឆេទ៖ {new Date(deliverySlipOrder.createdAt).toLocaleString('km-KH')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-extrabold uppercase text-slate-500">លេខវិក្កយបត្រ</div>
                    <div className="font-black text-lg text-[#DB1D43]">#{deliverySlipOrder.id}</div>
                  </div>
                </div>

                {/* Big Recipient Phone & Address Box */}
                <div className="p-3 rounded-xl bg-slate-50 border-2 border-slate-900 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-slate-500 uppercase">ព័ត៌មានអ្នកទទួលអីវ៉ាន់៖</span>
                    <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white font-extrabold text-xs">
                      🚚 {deliverySlipOrder.deliveryCompany} ({deliverySlipOrder.zone === 'PP' ? 'ភ្នំពេញ' : 'ខេត្ត'})
                    </span>
                  </div>

                  <div className="text-2xl font-black tracking-wide text-slate-900 tabular-nums">
                    📞 {deliverySlipOrder.phone}
                  </div>
                  <div className="text-sm font-extrabold text-slate-900">
                    👤 អតិថិជន៖ {deliverySlipOrder.customerName}
                  </div>
                  <div className="text-sm font-bold text-slate-800 leading-snug pt-0.5 border-t border-slate-200">
                    📍 ទីតាំង៖ {deliverySlipOrder.address}
                  </div>
                  {(trackingInputs[deliverySlipOrder.id] || deliverySlipOrder.trackingInfo) && (
                    <div className="text-xs font-extrabold text-blue-800 pt-0.5">
                      🔖 លេខកូដដឹកជញ្ជូន / តៃកុង៖ {trackingInputs[deliverySlipOrder.id] || deliverySlipOrder.trackingInfo}
                    </div>
                  )}
                </div>

                {/* Big COD vs PAID Banner */}
                <div
                  className={`p-3 rounded-xl border-2 text-center ${
                    deliverySlipOrder.paymentMethod === 'COD'
                      ? 'bg-amber-50 border-slate-900 text-slate-900'
                      : 'bg-emerald-50 border-emerald-700 text-emerald-950'
                  }`}
                >
                  {deliverySlipOrder.paymentMethod === 'COD' ? (
                    <>
                      <div className="text-xs font-extrabold uppercase">🚚 ទឹកប្រាក់ត្រូវប្រមូលពីភ្ញៀវ (COD)</div>
                      <div className="text-2xl font-black text-[#DB1D43] tabular-nums mt-0.5">
                        ${deliverySlipOrder.totalAmount.toFixed(2)}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-black text-emerald-800">
                        ✅ បង់ប្រាក់រួចហើយ (PAID តាម KHQR)
                      </div>
                      <div className="text-xs font-bold text-emerald-700 mt-0.5">
                        សូមកុំប្រមូលលុយថែមពីភ្ញៀវ! (ត្រូវប្រមូល៖ $0.00)
                      </div>
                    </>
                  )}
                </div>

                {/* Items Packing Checklist */}
                <div className="space-y-1.5">
                  <div className="text-xs font-extrabold text-slate-700">
                    📦 បញ្ជីម៉ូតខោអាវក្នុងកញ្ចប់ ({deliverySlipOrder.items.reduce((s, i) => s + i.qty, 0)} ឈុត)៖
                  </div>
                  <div className="divide-y divide-slate-200 border border-slate-300 rounded-xl overflow-hidden">
                    {deliverySlipOrder.items.map((it, idx) => (
                      <div key={idx} className="p-2 bg-white flex items-center justify-between text-xs">
                        <div className="font-bold text-slate-900">
                          ☐ <span className="font-black">[{it.code}]</span> {it.name} ({it.color} · {it.size})
                        </div>
                        <div className="font-black text-slate-900 shrink-0 ml-2">
                          x{it.qty} (${(it.price * it.qty).toFixed(2)})
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs font-bold text-slate-600 pt-1">
                    <span>ថ្លៃដឹកជញ្ជូន៖ ${deliverySlipOrder.shippingFee.toFixed(2)}</span>
                    <span>សរុបរួម៖ ${deliverySlipOrder.totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions (Print & Copy Text for Driver) */}
            <div className="p-3.5 border-t border-slate-200 bg-white flex items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 px-3 rounded-xl bg-[#DB1D43] hover:bg-[#BE123C] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <span>🖨️</span>
                <span>បោះពុម្ពស្លាកនេះ (Print)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const slipText = [
                    `📦 ស្លាកដឹកជញ្ជូន — ${config.storeName} (#${deliverySlipOrder.id})`,
                    `📞 ទូរស័ព្ទភ្ញៀវ៖ ${deliverySlipOrder.phone}`,
                    `👤 អតិថិជន៖ ${deliverySlipOrder.customerName}`,
                    `📍 ទីតាំង៖ ${deliverySlipOrder.address} (${deliverySlipOrder.deliveryCompany})`,
                    deliverySlipOrder.paymentMethod === 'COD'
                      ? `💵 ត្រូវប្រមូលលុយ (COD)៖ $${deliverySlipOrder.totalAmount.toFixed(2)}`
                      : `✅ បង់ប្រាក់រួចហើយ (PAID តាម KHQR) — កុំយកលុយថែម!`,
                    `👗 មុខទំនិញ៖ ${deliverySlipOrder.items.map(i => `[${i.code}] ${i.color}-${i.size} x${i.qty}`).join(', ')}`
                  ].join('\n');
                  navigator.clipboard.writeText(slipText);
                  showToast('📋 បានចម្លងព័ត៌មានដឹកជញ្ជូនសម្រាប់ផ្ញើឱ្យអ្នកដឹក!');
                }}
                className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>📋</span>
                <span>ចម្លងផ្ញើឱ្យអ្នកដឹក</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 6: ADD / EDIT PRODUCT FORM (ADMIN)
         ===================================================================== */}
      {isProductFormOpen && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-3">
          <form
            onSubmit={handleSaveProduct}
            className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto p-4 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <h3 className="font-extrabold text-sm text-slate-900">
                {editingProduct ? `កែប្រែម៉ូតកូដ ${editingProduct.code}` : 'បន្ថែមម៉ូតខោអាវថ្មី'}
              </h3>
              <button
                type="button"
                onClick={() => setIsProductFormOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">កូដម៉ូត *</label>
                <input
                  type="text"
                  required
                  value={formCode}
                  onChange={e => setFormCode(e.target.value)}
                  placeholder="A01"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-extrabold uppercase"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">ឈ្មោះម៉ូតខោអាវ *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="ឧ. រ៉ូបនារីម៉ូតកូរ៉េ..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">តម្លៃលក់ ($)</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={formPrice}
                  onChange={e => setFormPrice(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-extrabold text-[#DB1D43]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">តម្លៃដើមឆូត ($)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formOrigPrice}
                  onChange={e => setFormOrigPrice(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">ប្រភេទ</label>
                <select
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value as 'women' | 'men' | 'kids' | 'unisex')}
                  className="w-full px-2 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                >
                  <option value="women">👗 ខោអាវនារី</option>
                  <option value="men">👕 ខោអាវបុរស</option>
                  <option value="kids">🧸 ខោអាវក្មេង</option>
                  <option value="unisex">✨ ទាំងពីរ (Unisex)</option>
                </select>
              </div>
            </div>

            {/* Upload Multiple Product Images (Gallery) */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-extrabold text-slate-700">
                  រូបភាពម៉ូតខោអាវ ({formImages.length} សន្លឹក) — អាចដាក់ច្រើនសន្លឹក៖
                </label>
                {formImages.length > 1 && (
                  <span className="text-[10px] text-slate-500">ចុចលើរូបដើម្បីដាក់ជារូបមេ</span>
                )}
              </div>

              {formImages.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {formImages.map((imgUrl, idx) => (
                    <div
                      key={`${idx}-${imgUrl.slice(-12)}`}
                      className={`relative w-16 h-20 rounded-xl overflow-hidden border-2 shrink-0 group ${
                        idx === 0 ? 'border-[#DB1D43] ring-2 ring-rose-100' : 'border-slate-200'
                      }`}
                    >
                      <img
                        src={imgUrl}
                        alt={`រូបទី ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        onClick={() => {
                          if (idx === 0) return;
                          const reordered = [imgUrl, ...formImages.filter((_, i) => i !== idx)];
                          setFormImages(reordered);
                          setFormImageUrl(reordered[0]);
                          showToast('បានប្តូរជារូបមេ (រូបទី ១)!');
                        }}
                        className="w-full h-full object-cover cursor-pointer"
                        title={idx === 0 ? 'រូបមេ (បង្ហាញមុនគេ)' : 'ចុចដើម្បីដាក់ជារូបមេ'}
                      />
                      <span
                        className={`absolute bottom-0.5 left-0.5 right-0.5 text-center text-[9px] font-extrabold py-0.2 rounded ${
                          idx === 0 ? 'bg-[#DB1D43] text-white' : 'bg-black/60 text-white'
                        }`}
                      >
                        {idx === 0 ? '⭐ រូបមេ' : `រូបទី ${idx + 1}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = formImages.filter((_, i) => i !== idx);
                          setFormImages(next);
                          setFormImageUrl(next[0] || '');
                        }}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white text-[10px] font-bold flex items-center justify-center cursor-pointer"
                        title="លុបរូបនេះ"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <label className="block w-full py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-dashed border-rose-300 text-[#BE123C] text-xs font-extrabold text-center cursor-pointer transition-colors">
                📷 {isUploadingProductImg ? 'កំពុងបង្ហោះរូបភាព...' : '+ បន្ថែមរូបភាពម៉ូត (រើសម្ដងច្រើនសន្លឹកក៏បាន)'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleUploadMultipleProductFiles(e.target.files);
                      e.target.value = '';
                    }
                  }}
                />
              </label>
            </div>

            {/* Variants List (Color, Size, Stock) */}
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-extrabold text-slate-700">ពណ៌ & ទំហំ (Size) និងចំនួនស្តុក៖</label>
                <button
                  type="button"
                  onClick={() =>
                    setFormVariants([
                      ...formVariants,
                      { id: `v-${Date.now()}`, color: 'ស', size: 'Size M', stock: 1 }
                    ])
                  }
                  className="text-xs font-extrabold text-[#DB1D43] cursor-pointer"
                >
                  + បន្ថែមពណ៌/Size
                </button>
              </div>

              {formVariants.map((v, idx) => (
                <div key={v.id} className="grid grid-cols-12 gap-1.5 items-center">
                  <input
                    type="text"
                    value={v.color}
                    onChange={e => {
                      const next = [...formVariants];
                      next[idx] = { ...v, color: e.target.value };
                      setFormVariants(next);
                    }}
                    placeholder="ពណ៌ (ឧ. ស, ខ្មៅ)"
                    className="col-span-4 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold"
                  />
                  <select
                    value={v.size}
                    onChange={e => {
                      const next = [...formVariants];
                      next[idx] = { ...v, size: e.target.value as MiniAppVariant['size'] };
                      setFormVariants(next);
                    }}
                    className="col-span-4 px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-bold"
                  >
                    <option value="Size S">Size S</option>
                    <option value="Size M">Size M</option>
                    <option value="Size L">Size L</option>
                    <option value="Size XL">Size XL</option>
                    <option value="Free Size">Free Size</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    value={v.stock}
                    onChange={e => {
                      const next = [...formVariants];
                      next[idx] = { ...v, stock: parseInt(e.target.value, 10) || 0 };
                      setFormVariants(next);
                    }}
                    className="col-span-3 px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-extrabold text-center"
                  />
                  <button
                    type="button"
                    onClick={() => setFormVariants(formVariants.filter((_, i) => i !== idx))}
                    className="col-span-1 text-rose-500 font-bold text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={isUploadingProductImg || isSavingProduct}
              className={`w-full py-3 rounded-2xl text-white font-extrabold text-xs mt-2 transition-opacity ${
                isUploadingProductImg || isSavingProduct
                  ? 'bg-slate-400 cursor-not-allowed opacity-80'
                  : 'bg-[#DB1D43] hover:bg-[#BE123C] cursor-pointer'
              }`}
            >
              {isUploadingProductImg
                ? '⏳ កំពុងបង្ហោះរូបភាព សូមរង់ចាំបន្តិច...'
                : isSavingProduct
                ? '⏳ កំពុងរក្សាទុកម៉ូតខោអាវ...'
                : 'រក្សាទុកម៉ូតខោអាវ'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default TelegramMiniApp;
