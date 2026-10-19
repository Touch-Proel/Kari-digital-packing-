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
  category: 'women' | 'men' | 'unisex';
  imageUrl: string;
  variants: MiniAppVariant[];
  createdAt: string;
}

export interface MiniAppConfig {
  storeName: string;
  storeLogoLetter: string;
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
  adminPin?: string;
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
    khqrImageUrl: ''
  });

  const [products, setProducts] = useState<MiniAppProduct[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'last1' | 'women' | 'men'>('all');
  const [activeSize, setActiveSize] = useState<string>('ទាំងអស់');

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
  const [zoomProduct, setZoomProduct] = useState<MiniAppProduct | null>(null);
  const [completedOrder, setCompletedOrder] = useState<MiniAppOrder | null>(null);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Customer Checkout Form
  const [customerName, setCustomerName] = useState<string>(() => localStorage.getItem('tg_cust_name') || '');
  const [telegramUsername, setTelegramUsername] = useState<string>('');
  const [telegramUserId, setTelegramUserId] = useState<string>('');
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
  const [formCategory, setFormCategory] = useState<'women' | 'men' | 'unisex'>('women');
  const [formImageUrl, setFormImageUrl] = useState<string>('');
  const [formVariants, setFormVariants] = useState<MiniAppVariant[]>([
    { id: 'v-1', color: 'ស', size: 'Size M', stock: 1 }
  ]);
  const [isUploadingProductImg, setIsUploadingProductImg] = useState<boolean>(false);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => {
      setToast(prev => (prev?.text === text ? null : prev));
    }, 2600);
  };

  // Initialize Telegram WebApp SDK & load catalog
  useEffect(() => {
    try {
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
        setConfig(data.config);
        setProducts(data.products || []);
        setAdminOrders(data.orders || []);
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

  // Filter products based on search, category, and size
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const totalStock = p.variants.reduce((acc, v) => acc + v.stock, 0);

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = p.code.toLowerCase().includes(q);
        const matchName = p.name.toLowerCase().includes(q);
        const matchColor = p.variants.some(v => v.color.toLowerCase().includes(q));
        if (!matchCode && !matchName && !matchColor) return false;
      }

      // Category filter
      if (activeCategory === 'last1') {
        if (totalStock !== 1) return false;
      } else if (activeCategory === 'women') {
        if (p.category !== 'women' && p.category !== 'unisex') return false;
      } else if (activeCategory === 'men') {
        if (p.category !== 'men' && p.category !== 'unisex') return false;
      }

      // Size filter
      if (activeSize !== 'ទាំងអស់') {
        const hasSizeInStock = p.variants.some(v => v.size === activeSize && v.stock > 0);
        if (!hasSizeInStock) return false;
      }

      return true;
    });
  }, [products, searchQuery, activeCategory, activeSize]);

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

  const handleUploadFile = async (file: File, target: 'slip' | 'product') => {
    if (target === 'slip') setIsUploadingSlip(true);
    else setIsUploadingProductImg(true);

    const compressImageOnClient = (rawFile: File): Promise<string> => {
      return new Promise((resolve, reject) => {
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
            const maxDim = 750;
            let w = img.width || 600;
            let h = img.height || 600;
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
              ctx.drawImage(img, 0, 0, w, h);
              resolve(canvas.toDataURL('image/jpeg', 0.84));
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

    try {
      const compressedBase64 = await compressImageOnClient(file);

      // Immediately preview the compressed image so user sees it right away
      if (target === 'slip') {
        setPaymentSlipUrl(compressedBase64);
      } else {
        setFormImageUrl(compressedBase64);
      }

      const res = await fetch('/api/miniapp/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: compressedBase64 })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.url) {
          if (target === 'slip') {
            setPaymentSlipUrl(data.url);
          } else {
            setFormImageUrl(data.url);
          }
        }
      }

      if (target === 'slip') {
        showToast('✅ បានភ្ជាប់រូបស្លីបបង់ប្រាក់រួចរាល់!');
      } else {
        showToast('✅ បានបង្ហោះរូបម៉ូតខោអាវរួចរាល់!');
      }
    } catch {
      showToast('មិនអាចអានរូបភាពបានទេ សូមជ្រើសរើសរូបផ្សេង', 'error');
    } finally {
      setIsUploadingSlip(false);
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
          customerName: customerName.trim() || 'អតិថិជន Telegram',
          telegramUsername,
          telegramUserId,
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
      setEditingProduct(prod);
      setFormCode(prod.code);
      setFormName(prod.name);
      setFormPrice(String(prod.price));
      setFormOrigPrice(String(prod.originalPrice));
      setFormCategory(prod.category);
      setFormImageUrl(prod.imageUrl);
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
      setFormVariants([
        { id: `v-${Date.now()}-1`, color: 'ស', size: 'Size M', stock: 1 },
        { id: `v-${Date.now()}-2`, color: 'ខ្មៅ', size: 'Size L', stock: 1 }
      ]);
    }
    setIsProductFormOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
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
          imageUrl: formImageUrl,
          variants: formVariants
        })
      });
      const data = await res.json();
      if (data.success) {
        setProducts(data.products);
        setIsProductFormOpen(false);
        showToast('រក្សាទុកម៉ូតខោអាវដោយជោគជ័យ!');
      } else {
        showToast(data.error || 'មិនអាចរក្សាទុកបានទេ', 'error');
      }
    } catch {
      showToast('កំហុសបណ្តាញពេលរក្សាទុកម៉ូតខោអាវ', 'error');
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

  const handleUpdateOrderStatus = async (orderId: string, status: MiniAppOrder['status']) => {
    try {
      const res = await fetch(`/api/miniapp/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.success) {
        setAdminOrders(data.orders);
        setProducts(data.products);
        showToast(`បានប្តូរស្ថានភាពអর্ডার #${orderId} ទៅជា ${status}`);
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

  const miniAppPublicUrl = typeof window !== 'undefined' ? `${window.location.origin}/miniapp` : '';

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
      <div className="w-full max-w-[480px] bg-white min-h-screen shadow-sm flex flex-col pb-28 relative">
        {/* 1. TOP HEADER (Matches reference screenshot 100%) */}
        <header className="px-3.5 pt-3.5 pb-2.5 flex items-center justify-between gap-2 bg-white sticky top-0 z-30 border-b border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0">
            {onBackToPos && (
              <button
                type="button"
                onClick={onBackToPos}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 text-xs font-bold shrink-0 cursor-pointer"
                title="ត្រឡប់ទៅផ្ទាំង POS"
              >
                ←
              </button>
            )}
            {/* Red Circular Brand Avatar */}
            <button
              type="button"
              onClick={() => setIsAdminOpen(true)}
              className="w-11 h-11 rounded-full bg-[#DB1D43] text-white font-black text-lg flex items-center justify-center shadow-sm shrink-0 cursor-pointer active:scale-95 transition-transform"
              title="ចុចដើម្បីបើកផ្ទាំងគ្រប់គ្រងហាង (Admin)"
            >
              {config.storeLogoLetter || 'K'}
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="font-extrabold text-[17px] leading-tight text-[#0F172A] truncate">
                  {config.storeName}
                </h1>
                <button
                  type="button"
                  onClick={() => setIsAdminOpen(true)}
                  className="text-[11px] text-slate-400 hover:text-slate-700 px-1.5 py-0.5 rounded bg-slate-100 font-semibold shrink-0 cursor-pointer"
                  title="គ្រប់គ្រងហាង (Admin)"
                >
                  ⚙️ Admin
                </button>
              </div>
              <p className="text-[12px] font-bold text-[#D97706] truncate mt-0.5">
                {config.storeSubtitle}
              </p>
            </div>
          </div>

          {/* Right Cart Circle Button + History */}
          <div className="flex items-center gap-1.5 shrink-0">
            {myOrders.length > 0 && (
              <button
                type="button"
                onClick={() => setIsMyOrdersOpen(true)}
                className="w-10 h-10 rounded-full bg-[#F1F5F9] hover:bg-slate-200 flex items-center justify-center text-slate-700 text-sm font-bold cursor-pointer relative"
                title="វិក្កយបត្ររបស់ខ្ញុំ"
              >
                📋
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsCheckoutOpen(true)}
              className="relative w-12 h-12 rounded-full bg-[#F1F5F9] hover:bg-slate-200 flex items-center justify-center text-[#475569] cursor-pointer active:scale-95 transition-transform"
              aria-label="មើលកន្ត្រកទំនិញ"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 5h12m-9 3a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z" />
              </svg>
              <span className="absolute -top-0.5 -right-0.5 min-w-[22px] h-[22px] px-1 rounded-full bg-[#DB1D43] text-white font-extrabold text-[11px] flex items-center justify-center shadow-sm tabular-nums">
                {totalCartItems}
              </span>
            </button>
          </div>
        </header>

        {/* 2. SEARCH BAR */}
        <div className="px-3.5 pb-3 pt-1 bg-white">
          <div className="relative flex items-center">
            <span className="absolute left-4 text-slate-400 text-sm pointer-events-none">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="ស្វែងរកកូដ ឬឈ្មោះម៉ូត (ឧ. A01, រ៉ូប, អាវយឺត)..."
              className="w-full pl-10 pr-9 py-2.5 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] text-xs font-medium text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#DB1D43] focus:bg-white transition-colors"
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
        </div>

        {/* 3. FULL-WIDTH ORANGE-RED URGENCY PROMO BANNER */}
        <div className="bg-gradient-to-r from-[#EA8D1B] via-[#E3462F] to-[#DB1D43] px-3.5 py-2.5 flex items-center justify-between gap-2 text-white shadow-inner">
          <div className="text-[12.5px] font-extrabold truncate">
            {config.promoBannerText}
          </div>
          <span className="bg-white/25 backdrop-blur-sm text-white text-[11px] font-extrabold px-2.5 py-1 rounded-lg shrink-0 whitespace-nowrap">
            {config.promoBadgeText}
          </span>
        </div>

        {/* 4. CATEGORY FILTER TABS */}
        <div className="px-3.5 pt-3 pb-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar bg-white border-b border-slate-100">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`px-4 py-2 rounded-full text-xs font-extrabold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeCategory === 'all'
                ? 'bg-[#DB1D43] text-white shadow-sm'
                : 'bg-[#F1F5F9] text-[#1E293B] hover:bg-slate-200'
            }`}
          >
            <span>🛍️</span>
            <span>ម៉ូតសល់ទាំងអស់</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveCategory('last1')}
            className={`px-4 py-2 rounded-full text-xs font-extrabold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeCategory === 'last1'
                ? 'bg-[#DB1D43] text-white shadow-sm'
                : 'bg-[#F1F5F9] text-[#1E293B] hover:bg-slate-200'
            }`}
          >
            <span>⚡</span>
            <span>សល់ 1 ឈុតចុងក្រោយ</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveCategory('women')}
            className={`px-4 py-2 rounded-full text-xs font-extrabold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeCategory === 'women'
                ? 'bg-[#DB1D43] text-white shadow-sm'
                : 'bg-[#F1F5F9] text-[#1E293B] hover:bg-slate-200'
            }`}
          >
            <span>👗</span>
            <span>ខោអាវនារី</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveCategory('men')}
            className={`px-4 py-2 rounded-full text-xs font-extrabold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeCategory === 'men'
                ? 'bg-[#DB1D43] text-white shadow-sm'
                : 'bg-[#F1F5F9] text-[#1E293B] hover:bg-slate-200'
            }`}
          >
            <span>👕</span>
            <span>ខោអាវបុរស</span>
          </button>
        </div>

        {/* 5. SIZE FILTER ROW */}
        <div className="px-3.5 py-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar bg-white border-b border-slate-100">
          <span className="text-xs font-bold text-[#64748B] shrink-0 mr-1">រើសទំហំ:</span>
          {SIZE_OPTIONS.map(sz => (
            <button
              key={sz}
              type="button"
              onClick={() => setActiveSize(sz)}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                activeSize === sz
                  ? 'bg-[#111827] text-white shadow-xs'
                  : 'bg-[#F1F5F9] text-[#334155] hover:bg-slate-200'
              }`}
            >
              {sz}
            </button>
          ))}
        </div>

        {/* 6. 2-COLUMN PRODUCT GRID (Matches screenshot card layout) */}
        <div className="p-3 bg-[#F8FAFC] flex-1">
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
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
              <div className="text-3xl mb-2">👗</div>
              <div className="font-bold text-slate-800 text-sm">មិនមានម៉ូតខោអាវត្រូវនឹងការស្វែងរកទេ</div>
              <p className="text-xs text-slate-500 mt-1">សូមសាកល្បងជ្រើសរើសទំហំ «ទាំងអស់» ឬស្វែងរកកូដផ្សេង</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory('all');
                  setActiveSize('ទាំងអស់');
                }}
                className="mt-3 px-4 py-2 rounded-xl bg-[#DB1D43] text-white text-xs font-bold cursor-pointer"
              >
                បង្ហាញម៉ូតទាំងអស់វិញ
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredProducts.map(product => {
                const totalStock = product.variants.reduce((acc, v) => acc + v.stock, 0);
                const selectedVarId = selectedVariants[product.id] || product.variants[0]?.id;
                const activeVariant = product.variants.find(v => v.id === selectedVarId) || product.variants[0];
                const qtyInCart = cart
                  .filter(c => c.productId === product.id)
                  .reduce((sum, c) => sum + c.qty, 0);

                return (
                  <div
                    key={product.id}
                    className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden shadow-xs flex flex-col justify-between transition-all hover:shadow-md"
                  >
                    <div>
                      {/* Product Photo Container (3:4 Aspect Ratio) */}
                      <div
                        onClick={() => setZoomProduct(product)}
                        className="relative aspect-[3/4] w-full bg-[#F1F5F9] overflow-hidden cursor-pointer group"
                      >
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />

                        {/* Top-Left Code Pill */}
                        <div className="absolute top-2.5 left-2.5 bg-[#0F172A]/85 backdrop-blur-xs text-white px-2.5 py-1 rounded-full text-[11px] font-extrabold tracking-tight shadow-xs">
                          កូដ: {product.code}
                        </div>

                        {/* Top-Right Stock Urgency Pill */}
                        {totalStock <= 0 ? (
                          <div className="absolute top-2.5 right-2.5 bg-slate-900/90 text-white px-2.5 py-1 rounded-full text-[10.5px] font-extrabold">
                            អស់ស្តុក
                          </div>
                        ) : totalStock === 1 ? (
                          <div className="absolute top-2.5 right-2.5 bg-[#E11D48]/85 backdrop-blur-xs text-white px-2.5 py-1 rounded-full text-[10.5px] font-extrabold shadow-xs">
                            ⚡ សល់ 1 ចុងក្រោយ!
                          </div>
                        ) : (
                          <div className="absolute top-2.5 right-2.5 bg-[#F59E0B] text-[#0F172A] px-2.5 py-1 rounded-full text-[10.5px] font-extrabold shadow-xs">
                            🔥 សល់ {totalStock} ឈុត
                          </div>
                        )}
                      </div>

                      {/* Product Info & Interactive Variant Chips */}
                      <div className="p-2.5">
                        <h2 className="font-bold text-[13px] text-[#0F172A] truncate" title={product.name}>
                          {product.name}
                        </h2>

                        {/* Price & Strikethrough Original Price */}
                        <div className="flex items-baseline gap-1.5 mt-1 tabular-nums">
                          <span className="font-extrabold text-[17px] text-[#DB1D43]">
                            ${product.price.toFixed(2)}
                          </span>
                          {product.originalPrice > product.price && (
                            <span className="text-[11.5px] text-[#94A3B8] line-through font-medium">
                              ${product.originalPrice.toFixed(2)}
                            </span>
                          )}
                        </div>

                        {/* Variant Chips (Color - Size (Stock)) */}
                        <div className="mt-2 flex flex-col gap-1.5">
                          {product.variants.map(variant => {
                            const isSelected = activeVariant?.id === variant.id;
                            const isOut = variant.stock <= 0;
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
                                className={`w-fit max-w-full text-left px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all truncate cursor-pointer ${
                                  isOut
                                    ? 'bg-slate-100 text-slate-400 border-slate-200 line-through cursor-not-allowed'
                                    : isSelected
                                    ? 'bg-[#FFF1F2] text-[#BE123C] border-[#FB7185] shadow-2xs'
                                    : 'bg-[#F8FAFC] text-[#1E293B] border-[#E2E8F0] hover:border-slate-300'
                                }`}
                              >
                                {variant.color} - {variant.size} ({variant.stock})
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Add To Cart CTA inside Card */}
                    <div className="px-2.5 pb-2.5 pt-1">
                      <button
                        type="button"
                        disabled={totalStock <= 0}
                        onClick={() => handleAddToCart(product, activeVariant)}
                        className={`w-full py-2 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          totalStock <= 0
                            ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                            : 'bg-[#DB1D43] hover:bg-[#BE123C] text-white shadow-xs active:scale-[0.98]'
                        }`}
                      >
                        <span>{totalStock <= 0 ? 'អស់ស្តុកហើយ' : '🛒 ដាក់ចូលកន្ត្រក'}</span>
                        {qtyInCart > 0 && (
                          <span className="bg-white text-[#DB1D43] px-1.5 py-0.2 rounded-full text-[10px] font-black tabular-nums">
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
        </div>

        {/* 7. STICKY BOTTOM CHECKOUT BAR (Matches reference screenshot 100%) */}
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 w-full max-w-[460px] px-3 z-40">
          <button
            type="button"
            onClick={() => setIsCheckoutOpen(true)}
            className="w-full bg-[#DB1D43] hover:bg-[#BE123C] text-white rounded-2xl px-4 py-3.5 shadow-[0_12px_28px_rgba(219,29,67,0.42)] flex items-center justify-between gap-2 active:scale-[0.99] transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2 font-extrabold text-[15px] whitespace-nowrap">
              <span className="text-lg">🛍️</span>
              <span>មើលកន្ត្រក & កម្ម៉ង់ទិញ</span>
            </div>
            <div className="bg-[#9F1239] px-3.5 py-1.5 rounded-xl font-extrabold text-xs sm:text-sm tabular-nums whitespace-nowrap">
              ${cartSubtotal.toFixed(2)} ({totalCartItems} មុខ)
            </div>
          </button>
        </div>
      </div>

      {/* =====================================================================
          MODAL 1: PRODUCT IMAGE ZOOM & QUICK ADD
         ===================================================================== */}
      {zoomProduct && (
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
                src={zoomProduct.imageUrl}
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
              <div className="absolute bottom-3 left-3 bg-black/75 text-white px-3 py-1 rounded-full text-xs font-extrabold">
                កូដ: {zoomProduct.code} • ${zoomProduct.price.toFixed(2)}
              </div>
            </div>
            <div className="p-4">
              <h3 className="font-extrabold text-base text-slate-900">{zoomProduct.name}</h3>
              <p className="text-xs text-slate-500 mt-1">ចុចជ្រើសរើសពណ៌ និងទំហំខាងក្រោមដើម្បីដាក់ចូលកន្ត្រក៖</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {zoomProduct.variants.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    disabled={v.stock <= 0}
                    onClick={() => {
                      handleAddToCart(zoomProduct, v);
                      setZoomProduct(null);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-extrabold border cursor-pointer ${
                      v.stock <= 0
                        ? 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                        : 'bg-[#FFF1F2] text-[#BE123C] border-[#FB7185] hover:bg-[#DB1D43] hover:text-white'
                    }`}
                  >
                    + {v.color} - {v.size} (សល់ {v.stock})
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

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
          MODAL 4: CUSTOMER ORDER HISTORY
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
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-slate-900">📋 វិក្កយបត្រដែលខ្ញុំបានកម្ម៉ង់</h3>
              <button
                type="button"
                onClick={() => setIsMyOrdersOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3">
              {myOrders.map(ord => (
                <div key={ord.id} className="p-3 rounded-2xl border border-slate-200 bg-slate-50 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between font-extrabold">
                    <span className="text-[#DB1D43]">#{ord.id}</span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white text-[10px]">
                      {ord.paymentMethod === 'KHQR' ? '💳 KHQR' : '🚚 COD'}
                    </span>
                  </div>
                  <div className="text-slate-600">
                    {ord.items.map(i => `[${i.code}] ${i.color}-${i.size} x${i.qty}`).join(', ')}
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-200">
                    <span>{new Date(ord.createdAt).toLocaleString('km-KH')}</span>
                    <span>${ord.totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              ))}
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
                        {products.map(p => (
                          <div
                            key={p.id}
                            className="bg-white p-3 rounded-2xl border border-slate-200 flex gap-3 items-center justify-between"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <img
                                src={p.imageUrl}
                                alt={p.name}
                                referrerPolicy="no-referrer"
                                className="w-14 h-16 rounded-xl object-cover bg-slate-100 shrink-0"
                              />
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
                                </div>
                                <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                  {p.variants.map(v => `${v.color}-${v.size}(${v.stock})`).join(', ')}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => openEditProductModal(p)}
                                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] cursor-pointer"
                              >
                                កែប្រែ
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
                        ))}
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
                                  <div className="flex items-center gap-2">
                                    <span className="font-black text-sm text-[#DB1D43]">#{ord.id}</span>
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

                                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateOrderStatus(ord.id, 'CONFIRMED')}
                                    className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-[11px] cursor-pointer"
                                  >
                                    ✅ ទទួលអর্ডার
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateOrderStatus(ord.id, 'SHIPPED')}
                                    className="px-3 py-1.5 rounded-xl bg-blue-600 text-white font-bold text-[11px] cursor-pointer"
                                  >
                                    🚚 បានផ្ញើចេញ
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateOrderStatus(ord.id, 'CANCELLED')}
                                    className="px-3 py-1.5 rounded-xl bg-rose-100 text-rose-700 font-bold text-[11px] cursor-pointer"
                                  >
                                    ❌ បោះបង់ (បង្វិលស្តុកវិញ)
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
                      {/* Copy Link for Telegram BotFather */}
                      <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 space-y-2">
                        <div className="font-extrabold text-xs text-blue-950">
                          🔗 Link សម្រាប់ដាក់ក្នុង Telegram Mini App (@BotFather)៖
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={miniAppPublicUrl}
                            className="flex-1 px-3 py-2 rounded-xl bg-white border border-blue-300 text-xs font-mono text-slate-800"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(miniAppPublicUrl);
                              showToast('បានចម្លង Link សម្រាប់ Telegram Mini App!');
                            }}
                            className="px-3.5 py-2 rounded-xl bg-blue-600 text-white font-extrabold text-xs shrink-0 cursor-pointer"
                          >
                            ចម្លង Link
                          </button>
                        </div>
                        <p className="text-[11px] text-blue-800">
                          យក Link ខាងលើទៅដាក់ក្នុង Telegram Menu Button ឬផ្ញើឱ្យភ្ញៀវចុចបើកទិញខោអាវបានភ្លាមៗ!
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-4 rounded-2xl border border-slate-200">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">ឈ្មោះហាង</label>
                          <input
                            type="text"
                            value={config.storeName}
                            onChange={e => setConfig({ ...config, storeName: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">អក្សរឡូហ្គោ (1 តួ)</label>
                          <input
                            type="text"
                            maxLength={2}
                            value={config.storeLogoLetter}
                            onChange={e => setConfig({ ...config, storeLogoLetter: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">អក្សរពិពណ៌នាខាងក្រោមឈ្មោះហាង</label>
                          <input
                            type="text"
                            value={config.storeSubtitle}
                            onChange={e => setConfig({ ...config, storeSubtitle: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">អក្សររបារប្រូម៉ូសិនពណ៌ក្រហម</label>
                          <input
                            type="text"
                            value={config.promoBannerText}
                            onChange={e => setConfig({ ...config, promoBannerText: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                          />
                        </div>
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
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">ឈ្មោះគណនី KHQR</label>
                          <input
                            type="text"
                            value={config.khqrMerchantName}
                            onChange={e => setConfig({ ...config, khqrMerchantName: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">ព័ត៌មានលេខគណនីធនាគារ</label>
                          <input
                            type="text"
                            value={config.khqrAccountInfo}
                            onChange={e => setConfig({ ...config, khqrAccountInfo: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                          />
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
                  onChange={e => setFormCategory(e.target.value as 'women' | 'men' | 'unisex')}
                  className="w-full px-2 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                >
                  <option value="women">👗 នារី</option>
                  <option value="men">👕 បុរស</option>
                  <option value="unisex">✨ ទាំងពីរ</option>
                </select>
              </div>
            </div>

            {/* Upload Product Image */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">រូបភាពម៉ូតខោអាវ</label>
              <div className="flex items-center gap-3">
                {formImageUrl && (
                  <img
                    src={formImageUrl}
                    alt="Preview"
                    referrerPolicy="no-referrer"
                    className="w-14 h-16 rounded-xl object-cover border border-slate-200"
                  />
                )}
                <label className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs font-bold text-center cursor-pointer">
                  📷 {isUploadingProductImg ? 'កំពុងបង្ហោះរូប...' : 'ជ្រើសរើសរូបភាពពីទូរស័ព្ទ'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadFile(file, 'product');
                    }}
                  />
                </label>
              </div>
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
              className="w-full py-3 rounded-2xl bg-[#DB1D43] text-white font-extrabold text-xs cursor-pointer mt-2"
            >
              រក្សាទុកម៉ូតខោអាវ
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default TelegramMiniApp;
