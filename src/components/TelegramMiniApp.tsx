import React, { useState, useEffect, useMemo } from 'react';

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
  khqrAccountInfo: string;
  khqrImageUrl: string;
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
  const [cardImageIdx, setCardImageIdx] = useState<Record<string, number>>({});
  const [completedOrder, setCompletedOrder] = useState<MiniAppOrder | null>(null);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Customer Checkout Form
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
      const ua = navigator.userAgent || '';
      const isFbUa = /FBAN|FBAV|Messenger/i.test(ua);

      if (sourceParam === 'fb' || psidParam || isFbUa) {
        setIsFbMessenger(true);
      }
      if (psidParam) {
        setFbPsid(psidParam);
        try {
          localStorage.setItem('fb_cust_psid', psidParam);
        } catch {}
      }
      if (cnameParam && !customerName) {
        setCustomerName(cnameParam);
        try {
          localStorage.setItem('tg_cust_name', cnameParam);
        } catch {}
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
      // Keep original file untouched if <= 800KB for maximum crystal-clear sharpness
      if (rawFile.size <= 800 * 1024 && ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(rawFile.type)) {
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
          // Full HD 1800px resolution at 0.92 quality so clothing details & textures stay 100% sharp when zoomed
          const maxDim = target === 'logo' ? 1000 : target === 'khqr' ? 1400 : target === 'slip' ? 1600 : 1800;
          let w = img.naturalWidth || img.width || 1600;
          let h = img.naturalHeight || img.height || 1600;
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
            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
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
      const compressedBase64 = await compressImageOnClient(file, target);

      // Immediately preview the compressed image so user sees it right away
      if (target === 'slip') {
        setPaymentSlipUrl(compressedBase64);
      } else if (target === 'logo') {
        setConfig(prev => ({ ...prev, storeLogoUrl: compressedBase64 }));
      } else if (target === 'khqr') {
        setConfig(prev => ({ ...prev, khqrImageUrl: compressedBase64 }));
      }

      const finalUploadedUrl = await uploadBase64ToServer(compressedBase64);

      if (target === 'slip') {
        setPaymentSlipUrl(finalUploadedUrl);
      } else if (target === 'logo') {
        setConfig(prev => ({ ...prev, storeLogoUrl: finalUploadedUrl }));
      } else if (target === 'khqr') {
        setConfig(prev => ({ ...prev, khqrImageUrl: finalUploadedUrl }));
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
        const updatedCfg = { ...config, khqrImageUrl: finalUploadedUrl };
        await fetch('/api/miniapp/admin/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedCfg)
        }).catch(() => null);
        showToast('✅ បានដាក់រូប KHQR ធនាគាររបស់ហាងរួចរាល់!');
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

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      showToast('កន្ត្រកទំនិញទទេ!', 'error');
      return;
    }
    if (!phone.trim()) {
      showToast('សូមបញ្ចូលលេខទូរស័ព្ទរបស់អ្នក!', 'error');
      return;
    }
    if (!address.trim()) {
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
          paymentMethod,
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
      setCart([]);
      setPaymentSlipUrl('');
      setOrderNote('');
      setIsCheckoutOpen(false);
      setCompletedOrder(data.order);

      const updatedHistory = [data.order, ...myOrders].slice(0, 20);
      setMyOrders(updatedHistory);
      try {
        localStorage.setItem('tg_miniapp_my_orders', JSON.stringify(updatedHistory));
      } catch {}

      showToast('🎉 កម្ម៉ង់ជោគជ័យ! អរគុណសម្រាប់ការគាំទ្រ');
    } catch {
      showToast('មានបញ្ហាបណ្តាញ សូមព្យាយាមម្តងទៀត', 'error');
    } finally {
      setIsSubmittingOrder(false);
    }
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
              onClick={() => setIsCheckoutOpen(true)}
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
                          referrerPolicy="no-referrer"
                          className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${
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

                        {/* Bottom-Right Wishlist Heart & Zoom Hint */}
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
                                : 'bg-white/85 text-slate-700 hover:text-[#DB1D43]'
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

                          <div className="w-6 h-6 rounded-full bg-black/45 backdrop-blur-xs text-white flex items-center justify-center pointer-events-none">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                            </svg>
                          </div>
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
              onClick={() => setIsCheckoutOpen(true)}
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
          MODAL 1: PRODUCT IMAGE ZOOM & MULTI-PHOTO GALLERY
         ===================================================================== */}
      {zoomProduct && (() => {
        const zoomImages = getProductImages(zoomProduct);
        const safeZoomIdx = Math.min(zoomImageIdx, Math.max(0, zoomImages.length - 1));
        const activeZoomImg = zoomImages[safeZoomIdx] || zoomProduct.imageUrl;

        return (
          <div
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setZoomProduct(null)}
          >
            <div
              className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="relative aspect-[3/4] bg-slate-100">
                <img
                  src={activeZoomImg}
                  alt={zoomProduct.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setZoomProduct(null)}
                  className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 text-white font-bold flex items-center justify-center cursor-pointer"
                >
                  ✕
                </button>

                {zoomImages.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setZoomImageIdx((safeZoomIdx - 1 + zoomImages.length) % zoomImages.length)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/55 hover:bg-black/80 text-white text-lg font-bold flex items-center justify-center cursor-pointer"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoomImageIdx((safeZoomIdx + 1) % zoomImages.length)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/55 hover:bg-black/80 text-white text-lg font-bold flex items-center justify-center cursor-pointer"
                    >
                      ›
                    </button>
                  </>
                )}

                <div className="absolute bottom-3 left-3 bg-black/75 text-white px-3 py-1 rounded-full text-xs font-extrabold">
                  កូដ: {zoomProduct.code} • ${zoomProduct.price.toFixed(2)}
                  {zoomImages.length > 1 ? ` • រូប ${safeZoomIdx + 1}/${zoomImages.length}` : ''}
                </div>
              </div>

              {/* Thumbnail Strip when product has multiple photos */}
              {zoomImages.length > 1 && (
                <div className="px-4 pt-3 flex items-center gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {zoomImages.map((imgUrl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setZoomImageIdx(idx)}
                      className={`w-12 h-14 rounded-xl overflow-hidden border-2 shrink-0 cursor-pointer transition-all ${
                        safeZoomIdx === idx ? 'border-[#DB1D43] scale-105 shadow-xs' : 'border-slate-200 opacity-70'
                      }`}
                    >
                      <img src={imgUrl} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900">{zoomProduct.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      ចុចជ្រើសរើសពណ៌ និងទំហំខាងក្រោមដើម្បីដាក់ចូលកន្ត្រក៖
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setZoomProduct(null);
                      setIsSizeGuideOpen(true);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-rose-50 text-[#BE123C] border border-rose-200 text-[10.5px] font-extrabold shrink-0 cursor-pointer"
                  >
                    📏 តារាងគីឡូ
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {zoomProduct.variants.map(v => {
                    const weightHint = getWeightHintForSize(v.size);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        disabled={v.stock <= 0}
                        onClick={() => {
                          handleAddToCart(zoomProduct, v);
                          setZoomProduct(null);
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-extrabold border cursor-pointer text-left ${
                          v.stock <= 0
                            ? 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                            : 'bg-[#FFF1F2] text-[#BE123C] border-[#FB7185] hover:bg-[#DB1D43] hover:text-white'
                        }`}
                      >
                        <div>+ {v.color} - {v.size} (សល់ {v.stock})</div>
                        {weightHint && (
                          <div className="text-[10px] opacity-85 font-bold">⚖️ {weightHint}</div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Direct Chat Inquiry & Wishlist Actions */}
                <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isInquiring}
                    onClick={() => handleAskAboutProduct(zoomProduct)}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 transition-transform"
                  >
                    <span>💬</span>
                    <span>
                      {isInquiring
                        ? 'កំពុងបើកឆាត...'
                        : `ឆាតសួរម្ចាស់ហាងពីកូដ ${zoomProduct.code}`}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleWishlist(zoomProduct.id, zoomProduct.code)}
                    className={`py-2.5 px-3 rounded-xl font-extrabold text-xs border flex items-center justify-center gap-1 cursor-pointer ${
                      wishlistIds.includes(zoomProduct.id)
                        ? 'bg-[#FFF1F2] text-[#DB1D43] border-rose-300'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    <span>{wishlistIds.includes(zoomProduct.id) ? '❤️ រក្សាទុកហើយ' : '🤍 រក្សាទុក'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =====================================================================
          MODAL 2: CHECKOUT DRAWER (KHQR SCAN OR COD)
         ===================================================================== */}
      {isCheckoutOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center"
          onClick={() => setIsCheckoutOpen(false)}
        >
          <div
            className="bg-white w-full max-w-[480px] max-h-[92vh] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="text-lg">🛍️</span>
                <h2 className="font-extrabold text-base text-slate-900">
                  កន្ត្រកទំនិញ & ការទូទាត់ ({totalCartItems} មុខ)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {cart.length === 0 ? (
                <div className="text-center py-10">
                  <div className="text-4xl mb-2">🛒</div>
                  <div className="font-bold text-slate-800 text-sm">មិនទាន់មានម៉ូតខោអាវក្នុងកន្ត្រកទេ</div>
                  <p className="text-xs text-slate-500 mt-1">សូមជ្រើសរើសម៉ូតខោអាវដែលអ្នកពេញចិត្តជាមុនសិន</p>
                </div>
              ) : (
                <form id="miniapp-checkout-form" onSubmit={handleSubmitOrder} className="space-y-4">
                  {/* 1. Cart Items List */}
                  <div className="space-y-2">
                    <div className="text-xs font-extrabold text-slate-700">១. មុខទំនិញដែលបានជ្រើសរើស៖</div>
                    {cart.map(item => (
                      <div
                        key={`${item.productId}-${item.variantId}`}
                        className="flex items-center justify-between gap-2.5 p-2.5 rounded-2xl bg-slate-50 border border-slate-200"
                      >
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="w-14 h-16 rounded-xl object-cover bg-white border border-slate-200 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="bg-slate-900 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md">
                              {item.code}
                            </span>
                            <span className="font-bold text-xs text-slate-900 truncate">{item.name}</span>
                          </div>
                          <div className="text-[11px] font-bold text-[#BE123C] mt-0.5">
                            {item.color} - {item.size}
                          </div>
                          <div className="text-xs font-extrabold text-slate-900 mt-0.5 tabular-nums">
                            ${item.price.toFixed(2)} x {item.qty} = ${(item.price * item.qty).toFixed(2)}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleUpdateCartQty(item.productId, item.variantId, -1)}
                            className="w-7 h-7 rounded-lg bg-white border border-slate-300 font-bold text-slate-700 flex items-center justify-center cursor-pointer"
                          >
                            -
                          </button>
                          <span className="text-xs font-extrabold w-5 text-center tabular-nums">{item.qty}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateCartQty(item.productId, item.variantId, 1)}
                            className="w-7 h-7 rounded-lg bg-white border border-slate-300 font-bold text-slate-700 flex items-center justify-center cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 2. Customer Shipping Info */}
                  <div className="space-y-2.5 pt-2 border-t border-slate-200">
                    <div className="text-xs font-extrabold text-slate-700">២. ព័ត៌មានដឹកជញ្ជូន៖</div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">ឈ្មោះរបស់អ្នក</label>
                        <input
                          type="text"
                          value={customerName}
                          onChange={e => setCustomerName(e.target.value)}
                          placeholder="ឈ្មោះភ្ញៀវ..."
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:border-[#DB1D43]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">លេខទូរស័ព្ទ *</label>
                        <input
                          type="tel"
                          required
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                          placeholder="012 / 096 / 070..."
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold focus:outline-none focus:border-[#DB1D43]"
                        />
                      </div>
                    </div>

                    {/* Zone Selection */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setZone('PP');
                          setDeliveryCompany('ដឹកក្នុងក្រុងភ្នំពេញ');
                        }}
                        className={`p-2.5 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${
                          zone === 'PP'
                            ? 'bg-[#FFF1F2] border-[#DB1D43] text-[#BE123C]'
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        <span>🛵 ភ្នំពេញ (${config.shippingFeePP.toFixed(2)})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setZone('PROVINCE');
                          setDeliveryCompany('J&T Express');
                        }}
                        className={`p-2.5 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${
                          zone === 'PROVINCE'
                            ? 'bg-[#FFF1F2] border-[#DB1D43] text-[#BE123C]'
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        <span>🚚 ខេត្ត (${config.shippingFeeProvince.toFixed(2)})</span>
                      </button>
                    </div>

                    {zone === 'PROVINCE' && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {['J&T Express', 'វីរៈប៊ុនថាំ (VET)', 'Capitol'].map(comp => (
                          <button
                            key={comp}
                            type="button"
                            onClick={() => setDeliveryCompany(comp)}
                            className={`px-3 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                              deliveryCompany === comp
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-600 border-slate-300'
                            }`}
                          >
                            {comp}
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
                        placeholder="ឧ. ផ្ទះលេខ... ផ្លូវ... សង្កាត់/ខេត្ត..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:border-[#DB1D43]"
                      />
                    </div>

                    {/* Customer Note / Delivery Instructions */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        ចំណាំបន្ថែមសម្រាប់អ្នកដឹក (មិនបាច់បំពេញក៏បាន)
                      </label>
                      <input
                        type="text"
                        value={orderNote}
                        onChange={e => setOrderNote(e.target.value)}
                        placeholder="ឧ. សូមតេមុនដឹក ១៥ នាទី, ផ្ញើពេលរសៀល..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:border-[#DB1D43]"
                      />
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {['📞 សូមតេមុនដឹក', '🌅 ដឹកពេលព្រឹក', '🌇 ដឹកពេលរសៀល', '🏠 ដាក់មុខផ្ទះ'].map(chip => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() =>
                              setOrderNote(prev =>
                                prev.includes(chip) ? prev : prev ? `${prev}, ${chip}` : chip
                              )
                            }
                            className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-[#BE123C] border border-slate-200 text-[10px] font-bold cursor-pointer"
                          >
                            + {chip}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 3. PAYMENT METHOD CHOICE: KHQR OR COD */}
                  <div className="space-y-2.5 pt-2 border-t border-slate-200">
                    <div className="text-xs font-extrabold text-slate-700">
                      ៣. ជ្រើសរើសវិធីបង់ប្រាក់ (ស្កេនបង់លុយ ក៏បាន / COD ក៏បាន)៖
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      {/* Option A: KHQR Scan */}
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('KHQR')}
                        className={`p-3 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                          paymentMethod === 'KHQR'
                            ? 'border-[#DB1D43] bg-[#FFF1F2]'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-base">💳</span>
                          <span
                            className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                              paymentMethod === 'KHQR' ? 'border-[#DB1D43] bg-[#DB1D43] text-white' : 'border-slate-300'
                            }`}
                          >
                            {paymentMethod === 'KHQR' && <span className="text-[9px]">✓</span>}
                          </span>
                        </div>
                        <div className="font-extrabold text-xs text-slate-900 mt-1">ស្កេនបង់លុយ (KHQR)</div>
                        <div className="text-[10.5px] text-slate-500 mt-0.5">ABA / ACLEDA / Wing</div>
                      </button>

                      {/* Option B: Cash on Delivery (COD) */}
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('COD')}
                        className={`p-3 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                          paymentMethod === 'COD'
                            ? 'border-[#DB1D43] bg-[#FFF1F2]'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-base">🚚</span>
                          <span
                            className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                              paymentMethod === 'COD' ? 'border-[#DB1D43] bg-[#DB1D43] text-white' : 'border-slate-300'
                            }`}
                          >
                            {paymentMethod === 'COD' && <span className="text-[9px]">✓</span>}
                          </span>
                        </div>
                        <div className="font-extrabold text-xs text-slate-900 mt-1">បង់ពេលដឹកដល់ (COD)</div>
                        <div className="text-[10.5px] text-slate-500 mt-0.5">ទទួលអីវ៉ាន់ទើបបង់លុយ</div>
                      </button>
                    </div>

                    {/* KHQR Scan Box when KHQR is chosen */}
                    {paymentMethod === 'KHQR' && (
                      <div className="p-3.5 rounded-2xl bg-slate-900 text-white space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                          <div>
                            <div className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">KHQR PAYMENT</div>
                            <div className="font-extrabold text-xs">{config.khqrMerchantName}</div>
                            <div className="text-[11px] text-slate-400">{config.khqrAccountInfo}</div>
                          </div>
                          <div className="text-right tabular-nums">
                            <div className="text-[10px] text-slate-400">ទឹកប្រាក់ត្រូវបង់</div>
                            <div className="text-lg font-black text-emerald-400">${cartTotal.toFixed(2)}</div>
                          </div>
                        </div>

                        <div className="flex flex-col items-center justify-center bg-white p-3 rounded-2xl max-w-[210px] mx-auto">
                          {config.khqrImageUrl ? (
                            <img
                              src={config.khqrImageUrl}
                              alt="Shop KHQR"
                              referrerPolicy="no-referrer"
                              className="w-44 h-44 object-contain"
                            />
                          ) : (
                            <img
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                                `KHQR:${config.khqrMerchantName}|AMOUNT:${cartTotal.toFixed(2)}|USD`
                              )}`}
                              alt="KHQR Code"
                              referrerPolicy="no-referrer"
                              className="w-40 h-40 object-contain"
                            />
                          )}
                          <span className="text-[10px] font-bold text-slate-600 mt-1.5">
                            ស្កេនតាម ABA / ACLEDA / ធនាគារគ្រប់ប្រភេទ
                          </span>
                        </div>

                        {/* Upload Payment Slip */}
                        <div className="pt-1">
                          <label className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer">
                            <span>📸 {isUploadingSlip ? 'កំពុងបង្ហោះរូបស្លីប...' : paymentSlipUrl ? 'ប្តូររូបស្លីបបង់ប្រាក់' : 'ភ្ជាប់រូបស្លីបបង់ប្រាក់ (Slip)'}</span>
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
                          {paymentSlipUrl && (
                            <div className="mt-2 flex items-center gap-2 bg-emerald-950/60 border border-emerald-500/40 p-2 rounded-xl">
                              <img
                                src={paymentSlipUrl}
                                alt="Payment Slip"
                                referrerPolicy="no-referrer"
                                className="w-10 h-12 object-cover rounded-lg"
                              />
                              <div className="text-xs font-bold text-emerald-300">
                                ✅ បានភ្ជាប់រូបស្លីបរួចរាល់!
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* COD Info note when COD is chosen */}
                    {paymentMethod === 'COD' && (
                      <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
                        🚚 អ្នកបានជ្រើសរើស <b>បង់លុយពេលអីវ៉ាន់ទៅដល់ (COD)</b>។ បុគ្គលិកហាងនឹងទាក់ទងទៅលេខទូរស័ព្ទរបស់អ្នកដើម្បីបញ្ជាក់ការដឹកជញ្ជូន!
                      </div>
                    )}
                  </div>

                  {/* Summary Totals */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs tabular-nums">
                    <div className="flex justify-between text-slate-600">
                      <span>សរុបតម្លៃខោអាវ ({totalCartItems} មុខ):</span>
                      <span className="font-bold">${cartSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>ថ្លៃដឹកជញ្ជូន ({zone === 'PP' ? 'ភ្នំពេញ' : 'ខេត្ត'}):</span>
                      <span className="font-bold">
                        {shippingFee === 0 ? 'ឥតគិតថ្លៃ (FREE)' : `$${shippingFee.toFixed(2)}`}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm font-extrabold text-[#0F172A] pt-1.5 border-t border-slate-200">
                      <span>ទឹកប្រាក់សរុបរួម:</span>
                      <span className="text-[#DB1D43] text-base">${cartTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </form>
              )}
            </div>

            {/* Footer Submit Button */}
            {cart.length > 0 && (
              <div className="p-3.5 border-t border-slate-200 bg-white">
                <button
                  type="submit"
                  form="miniapp-checkout-form"
                  disabled={isSubmittingOrder}
                  className="w-full py-3.5 rounded-2xl bg-[#DB1D43] hover:bg-[#BE123C] text-white font-extrabold text-sm shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <span>
                    {isSubmittingOrder
                      ? 'កំពុងបញ្ជូនការកម្ម៉ង់...'
                      : paymentMethod === 'KHQR'
                      ? `✅ បញ្ជាក់ការកម្ម៉ង់តាម KHQR ($${cartTotal.toFixed(2)})`
                      : `✅ បញ្ជាក់ការកម្ម៉ង់ COD ($${cartTotal.toFixed(2)})`}
                  </span>
                </button>
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
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">ឈ្មោះគណនី KHQR</label>
                          <input
                            type="text"
                            value={config.khqrMerchantName}
                            onChange={e => setConfig({ ...config, khqrMerchantName: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">ព័ត៌មានលេខគណនីធនាគារ</label>
                          <input
                            type="text"
                            value={config.khqrAccountInfo}
                            onChange={e => setConfig({ ...config, khqrAccountInfo: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
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
                                បើដាក់រូប QR ផ្ទាល់ ភ្ញៀវនឹងឃើញរូប QR នេះពេលជ្រើសរើសបង់ប្រាក់តាម KHQR
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
