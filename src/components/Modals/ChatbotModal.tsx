import React, { useState, useEffect, useRef } from 'react';
import { playSuccessFanfare, playWarningBuzzer, playPureTone } from '../../utils/audio';

interface ChatbotConfig {
  enabled: boolean;
  enableSlipAutoVerify: boolean;
  enableAddressAutoExtract: boolean;
  enablePaymentReminders: boolean;
  paymentReminderHours: number;
  enableShippingNotifications: boolean;
  enableAiFaq: boolean;
  shopName: string;
  shopLocation: string;
  workingHours: string;
  deliveryTimePP: string;
  deliveryTimeProvince: string;
  shippingRatePP: number;
  shippingRateProvince: number;
  exchangePolicy: string;
  customFaqPrompt: string;
  webhookVerifyToken: string;
  pageAccessToken: string;
}

interface ChatbotLogItem {
  id: string;
  timestamp: string;
  type: 'SLIP_VERIFIED' | 'ADDRESS_EXTRACTED' | 'PAYMENT_REMINDER' | 'SHIPPING_NOTIFIED' | 'AI_FAQ';
  customer_name: string;
  customer_id?: string;
  basket_no?: number | string;
  incoming_message?: string;
  bot_reply: string;
  status: 'SUCCESS' | 'WARNING' | 'FAILED';
  meta?: any;
}

interface ChatbotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'warning') => void;
  onDataChanged?: () => void;
}

export function ChatbotModal({
  isOpen,
  onClose,
  onShowToast,
  onDataChanged
}: ChatbotModalProps) {
  const [activeTab, setActiveTab] = useState<'FEATURES' | 'SIMULATOR' | 'LOGS' | 'META'>('FEATURES');
  const [config, setConfig] = useState<ChatbotConfig | null>(null);
  const [logs, setLogs] = useState<ChatbotLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingReminders, setIsSendingReminders] = useState(false);

  // Simulator State
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'bot'; text: string; time: string; type?: string }>>([
    {
      sender: 'bot',
      text: 'សួស្តីបង! ខ្ញុំជា KARI AI Chatbot 🤖 សូមសាកល្បងផ្ញើសារអាសយដ្ឋាន សួរព័ត៌មានទូទៅ (FAQ) ឬផ្ញើរូបភាព Slip ទីនេះ!',
      time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simCustomerName, setSimCustomerName] = useState('Dany Ka');
  const [simCustomerId, setSimCustomerId] = useState('1255089173446765');
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const slipInputRef = useRef<HTMLInputElement | null>(null);

  const [activeBaskets, setActiveBaskets] = useState<Array<{ basket_no: string | number; facebook_name: string; facebook_user_id?: string; total_amount: number; status: string }>>([]);

  // Fetch initial config & logs
  const fetchChatbotData = async () => {
    setIsLoading(true);
    try {
      const [confRes, logsRes, invRes] = await Promise.all([
        fetch('/api/chatbot/config'),
        fetch('/api/chatbot/logs'),
        fetch('/api/invoices')
      ]);

      if (confRes.ok) {
        const confJson = await confRes.json();
        if (confJson.config) setConfig(confJson.config);
      }
      if (logsRes.ok) {
        const logsJson = await logsRes.json();
        if (logsJson.logs) setLogs(logsJson.logs);
      }
      if (invRes.ok) {
        const invJson = await invRes.json();
        const active = (invJson.data || []).filter((i: any) => i.status !== 'Cancelled');
        setActiveBaskets(active);
        if (active.length > 0) {
          setSimCustomerName(active[0].facebook_name || 'អតិថិជន');
          setSimCustomerId(active[0].facebook_user_id || `TEST_${active[0].invoice_id}`);
        }
      }
    } catch (err) {
      console.error('Failed to fetch chatbot data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchChatbotData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (activeTab === 'SIMULATOR') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);

  if (!isOpen) return null;

  // Save Settings
  const handleSaveConfig = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/chatbot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (data.success) {
        playSuccessFanfare();
        onShowToast('✅ បានរក្សាទុកការកំណត់ KARI AI Chatbot រួចរាល់!', 'success');
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      playWarningBuzzer();
      onShowToast(`❌ មិនអាចរក្សាទុកបានទេ៖ ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Trigger Payment Reminders
  const handleTriggerReminders = async () => {
    setIsSendingReminders(true);
    playPureTone(700, 0.05);
    try {
      const res = await fetch('/api/chatbot/send_payment_reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        playSuccessFanfare();
        onShowToast(`🎉 ${data.message}`, 'success');
        fetchChatbotData();
      }
    } catch {
      onShowToast('⚠️ មានបញ្ហាក្នុងការផ្ញើសាររំលឹក', 'error');
    } finally {
      setIsSendingReminders(false);
    }
  };

  // Send Simulator Message
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isSimulating) return;

    const userText = inputMessage.trim();
    setInputMessage('');
    const nowTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

    setChatMessages(prev => [...prev, { sender: 'user', text: userText, time: nowTime }]);
    setIsSimulating(true);

    try {
      const res = await fetch('/api/chatbot/test_message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: simCustomerId,
          sender_name: simCustomerName,
          message: userText
        })
      });

      const data = await res.json();
      const replyTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

      if (data.success && data.reply) {
        playSuccessFanfare();
        setChatMessages(prev => [
          ...prev,
          { sender: 'bot', text: data.reply, time: replyTime, type: data.type }
        ]);
        if (data.type === 'ADDRESS_EXTRACTED' && onDataChanged) {
          onDataChanged();
        }
      } else {
        setChatMessages(prev => [
          ...prev,
          { sender: 'bot', text: 'សួស្តីបង! ហាងបានទទួលសារហើយ បុគ្គលិកនឹងឆ្លើយតបជូនបង។', time: replyTime }
        ]);
      }
    } catch {
      setChatMessages(prev => [
        ...prev,
        { sender: 'bot', text: '⚠️ មានបញ្ហាក្នុងការតភ្ជាប់ Bot', time: nowTime }
      ]);
    } finally {
      setIsSimulating(false);
    }
  };

  // Test Upload Slip in Simulator
  const handleUploadTestSlip = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      if (!base64) return;

      const nowTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      setChatMessages(prev => [...prev, { sender: 'user', text: `[🖼️ បានផ្ញើរូបភាព Slip ${file.name}]`, time: nowTime }]);
      setIsSimulating(true);

      try {
        const res = await fetch('/api/chatbot/test_slip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender_id: simCustomerId,
            sender_name: simCustomerName,
            image_base64: base64,
            mime_type: file.type || 'image/jpeg'
          })
        });

        const data = await res.json();
        const replyTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

        if (data.result?.reply) {
          playSuccessFanfare();
          setChatMessages(prev => [
            ...prev,
            { sender: 'bot', text: data.result.reply, time: replyTime, type: 'SLIP_VERIFIED' }
          ]);
          if (data.result.success && onDataChanged) {
            onDataChanged();
          }
        }
      } catch {
        setChatMessages(prev => [
          ...prev,
          { sender: 'bot', text: '⚠️ មានបញ្ហាក្នុងការផ្ទៀងផ្ទាត់ Slip', time: nowTime }
        ]);
      } finally {
        setIsSimulating(false);
      }
    };
    reader.readAsDataURL(file);

    if (slipInputRef.current) slipInputRef.current.value = '';
  };

  const webhookUrl = `${window.location.origin}/api/webhook`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-[#050C1B] border-2 border-indigo-500/70 rounded-3xl shadow-[0_0_50px_rgba(99,102,241,0.3)] overflow-hidden text-slate-100">
        
        {/* Top Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 border-b border-indigo-500/30 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/50 flex items-center justify-center text-2xl shadow-inner flex-shrink-0">
              🤖
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  <span>KARI AI Chatbot Engine</span>
                  <span className="bg-gradient-to-r from-indigo-500 to-purple-500 text-[10px] text-white px-2 py-0.5 rounded-full font-bold">
                    24/7 Smart Live Commerce
                  </span>
                </h2>
              </div>
              <p className="text-xs text-indigo-300 font-medium">
                ស្វ័យប្រវត្តិកម្ម Messenger ៖ ស្កេន Slip, ស្រង់ទីតាំង, រំលឹកបង់លុយ, ដំណឹងចេញដឹក, និង AI FAQ
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors text-base"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 px-4 pt-3 bg-slate-950/60 border-b border-slate-800 overflow-x-auto no-scrollbar flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('FEATURES')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-black flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'FEATURES'
                ? 'bg-indigo-600 text-white border-t border-x border-indigo-400/50 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span>⚡</span>
            <span>មុខងារស្វ័យប្រវត្តិ (Features)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('SIMULATOR')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-black flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'SIMULATOR'
                ? 'bg-indigo-600 text-white border-t border-x border-indigo-400/50 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span>🧪</span>
            <span>តេស្តសាកល្បង (Live Simulator)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('LOGS')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-black flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'LOGS'
                ? 'bg-indigo-600 text-white border-t border-x border-indigo-400/50 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span>📜</span>
            <span>ប្រវត្តិសកម្មភាព Bot ({logs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('META')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-black flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'META'
                ? 'bg-indigo-600 text-white border-t border-x border-indigo-400/50 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span>⚙️</span>
            <span>Webhook & Meta Settings</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 custom-scroll">
          {isLoading && !config ? (
            <div className="py-16 text-center text-slate-400">
              <span className="text-3xl animate-spin block mb-2">⏳</span>
              <span>កំពុងទាញយកការកំណត់ Chatbot...</span>
            </div>
          ) : activeTab === 'FEATURES' && config ? (
            <div className="space-y-4">
              {/* Feature 1: Slip Auto-Verification (#2) */}
              <div className="p-4 rounded-2xl bg-[#09152C] border border-[#1C335C] flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🧾</span>
                    <h3 className="font-bold text-sm text-white">#2. AI ស្កេន Slip & កាត់បង់រួចស្វ័យប្រវត្តិតាម Chat (Auto-Verify Slips)</h3>
                  </div>
                  <p className="text-xs text-slate-300">
                    ពេលភ្ញៀវផ្ញើរូបភាព Slip (ABA/ACLEDA/KHQR) ចូល Messenger ➔ AI អានចំនួនទឹកប្រាក់ និងកាត់កន្ត្រកទៅជា [បង់រួច] ស្វ័យប្រវត្តិ។
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={config.enableSlipAutoVerify}
                    onChange={e => setConfig({ ...config, enableSlipAutoVerify: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* Feature 2: Address & Phone Auto-Extract (#3) */}
              <div className="p-4 rounded-2xl bg-[#09152C] border border-[#1C335C] flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📍</span>
                    <h3 className="font-bold text-sm text-white">#3. AI ស្រង់លេខទូរស័ព្ទ & ទីតាំងដឹកស្វ័យប្រវត្តិ (Auto-Extract Address & Phone)</h3>
                  </div>
                  <p className="text-xs text-slate-300">
                    ពេលភ្ញៀវវាយអក្សរប្រាប់ទីតាំង និងលេខទូរស័ព្ទ ➔ AI ចាប់យកបញ្ចូលទៅក្នុង Basket Card ក្នុង KARI OS និងគិតថ្លៃសេវាដឹកត្រឹមត្រូវ។
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={config.enableAddressAutoExtract}
                    onChange={e => setConfig({ ...config, enableAddressAutoExtract: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* Feature 3: Payment Reminders (#4) */}
              <div className="p-4 rounded-2xl bg-[#09152C] border border-[#1C335C] space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">⏰</span>
                      <h3 className="font-bold text-sm text-white">#4. ផ្ញើសាររំលឹកបង់ប្រាក់ស្វ័យប្រវត្តិ (Auto-Payment Reminders)</h3>
                    </div>
                    <p className="text-xs text-slate-300">
                      រំលឹកភ្ញៀវដែលបានកក់កន្ត្រកតែមិនទាន់បង់ប្រាក់ មុនពេលប្រព័ន្ធបញ្ចេញស្តុកឱ្យភ្ញៀវបន្ទាប់។
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={config.enablePaymentReminders}
                      onChange={e => setConfig({ ...config, enablePaymentReminders: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {config.enablePaymentReminders && (
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 flex-wrap gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">រំលឹកក្រោយពេលកក់ ៖</span>
                      <select
                        value={config.paymentReminderHours}
                        onChange={e => setConfig({ ...config, paymentReminderHours: Number(e.target.value) })}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-white text-xs font-bold focus:outline-none focus:border-indigo-500"
                      >
                        <option value={2}>2 ម៉ោង</option>
                        <option value={4}>4 ម៉ោង (ណែនាំ)</option>
                        <option value={6}>6 ម៉ោង</option>
                        <option value={12}>12 ម៉ោង</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      disabled={isSendingReminders}
                      onClick={handleTriggerReminders}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1 shadow cursor-pointer active:scale-95 transition-all"
                    >
                      <span>🔔</span>
                      <span>{isSendingReminders ? 'កំពុងផ្ញើសារ...' : 'ផ្ញើសាររំលឹកពេលនេះ (Send Now)'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Feature 4: Shipping Notifications (#5) */}
              <div className="p-4 rounded-2xl bg-[#09152C] border border-[#1C335C] flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🚚</span>
                    <h3 className="font-bold text-sm text-white">#5. ដំណឹងចេញដឹកជញ្ជូនស្វ័យប្រវត្តិ (Auto-Shipping Notifications)</h3>
                  </div>
                  <p className="text-xs text-slate-300">
                    ពេលបុគ្គលិកច្រកចប់ ហើយចុច «ចេញដឹក» ➔ Chatbot ផ្ញើសារជូនដំណឹង + លេខ Tracking ទៅកាន់ Messenger ភ្ញៀវភ្លាមៗ។
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={config.enableShippingNotifications}
                    onChange={e => setConfig({ ...config, enableShippingNotifications: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* Feature 5: AI Smart FAQ 24/7 (#11) */}
              <div className="p-4 rounded-2xl bg-[#09152C] border border-[#1C335C] space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">💬</span>
                      <h3 className="font-bold text-sm text-white">#11. AI Smart FAQ 24/7 (ឆ្លើយសំណួរទូទៅស្វ័យប្រវត្តិ)</h3>
                    </div>
                    <p className="text-xs text-slate-300">
                      ឆ្លើយតបសំណួរភ្ញៀវអំពីទីតាំងហាង, ម៉ោងធ្វើការ, តម្លៃសេវាដឹក, រយៈពេលដឹក, និងគោលការណ៍ប្តូរអីវ៉ាន់។
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={config.enableAiFaq}
                      onChange={e => setConfig({ ...config, enableAiFaq: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {config.enableAiFaq && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80 text-xs">
                    <div>
                      <label className="block text-slate-400 font-bold mb-1">🏠 ទីតាំងហាង</label>
                      <input
                        type="text"
                        value={config.shopLocation}
                        onChange={e => setConfig({ ...config, shopLocation: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-bold mb-1">⏰ ម៉ោងធ្វើការ</label>
                      <input
                        type="text"
                        value={config.workingHours}
                        onChange={e => setConfig({ ...config, workingHours: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-bold mb-1">🚚 សេវាដឹកភ្នំពេញ ($)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={config.shippingRatePP}
                        onChange={e => setConfig({ ...config, shippingRatePP: Number(e.target.value) })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-bold mb-1">🚚 សេវាដឹកតាមខេត្ត ($)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={config.shippingRateProvince}
                        onChange={e => setConfig({ ...config, shippingRateProvince: Number(e.target.value) })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-slate-400 font-bold mb-1">🔄 គោលការណ៍ប្តូរទំនិញ (Exchange Policy)</label>
                      <input
                        type="text"
                        value={config.exchangePolicy}
                        onChange={e => setConfig({ ...config, exchangePolicy: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'SIMULATOR' ? (
            /* Tab 2: Live Simulator */
            <div className="flex flex-col h-[52vh] bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden">
              {/* Simulator Header */}
              <div className="p-3 bg-[#08152E] border-b border-slate-800 flex items-center justify-between text-xs flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                  <span className="font-bold text-white">Simulator Profile ៖</span>
                  {activeBaskets.length > 0 ? (
                    <select
                      value={`${simCustomerId}|${simCustomerName}`}
                      onChange={e => {
                        const [id, name] = e.target.value.split('|');
                        setSimCustomerId(id);
                        setSimCustomerName(name);
                      }}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5 text-xs text-amber-300 font-bold focus:outline-none max-w-[200px]"
                    >
                      {activeBaskets.map((b, bIdx) => (
                        <option key={bIdx} value={`${b.facebook_user_id || `ID_${b.basket_no}`}|${b.facebook_name}`}>
                          #{b.basket_no} - {b.facebook_name} (${b.total_amount.toFixed(2)})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={simCustomerName}
                      onChange={e => setSimCustomerName(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-amber-300 font-bold focus:outline-none"
                      placeholder="ឈ្មោះភ្ញៀវ"
                      title="ឈ្មោះ Facebook ភ្ញៀវសាកល្បង"
                    />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">សាកល្បង៖</span>
                  <button
                    type="button"
                    onClick={() => setInputMessage('0964428567 ចាក់អង្រែលើ ភ្នំពេញ')}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded text-indigo-300 border border-indigo-500/30"
                  >
                    📍 ទីតាំង
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMessage('ហាងនៅម្តុំណា? ហើយផ្ញើតាមខេត្តប៉ុន្មានថ្ងៃដល់?')}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded text-purple-300 border border-purple-500/30"
                  >
                    💬 FAQ
                  </button>
                </div>
              </div>

              {/* Chat Thread */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3 custom-scroll">
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                        msg.sender === 'user'
                          ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-br-none shadow-md'
                          : 'bg-[#0E1E38] text-slate-100 border border-slate-700/80 rounded-bl-none shadow-sm'
                      }`}
                    >
                      {msg.text}
                    </div>
                    <span className="text-[9.5px] text-slate-500 mt-1 px-1">
                      {msg.sender === 'user' ? simCustomerName : 'KARI AI Bot'} • {msg.time}
                    </span>
                  </div>
                ))}
                {isSimulating && (
                  <div className="flex items-center gap-2 text-xs text-indigo-400 animate-pulse p-2">
                    <span>🤖</span>
                    <span>AI Bot កំពុងគិត និងឆ្លើយតប...</span>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Chat Input Bar */}
              <div className="p-2.5 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
                <input
                  type="file"
                  ref={slipInputRef}
                  accept="image/*"
                  onChange={handleUploadTestSlip}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => slipInputRef.current?.click()}
                  className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 flex items-center justify-center text-base border border-slate-700 cursor-pointer"
                  title="ផ្ញើរូបភាព Slip សាកល្បង"
                >
                  🖼️
                </button>

                <input
                  type="text"
                  value={inputMessage}
                  onChange={e => setInputMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                  placeholder="វាយសារសាកល្បង (ឧ. ទីតាំង, លេខទូរស័ព្ទ, ឬសួរសំណួរ)..."
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />

                <button
                  type="button"
                  disabled={!inputMessage.trim() || isSimulating}
                  onClick={handleSendMessage}
                  className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white flex items-center justify-center text-sm font-black shadow cursor-pointer"
                >
                  ➤
                </button>
              </div>
            </div>
          ) : activeTab === 'LOGS' ? (
            /* Tab 3: Logs */
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>ប្រវត្តិសកម្មភាព Bot ({logs.length} ព្រឹត្តិការណ៍)</span>
                <button
                  type="button"
                  onClick={fetchChatbotData}
                  className="text-indigo-400 hover:underline"
                >
                  🔄 Refresh
                </button>
              </div>

              {logs.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-xs">
                  មិនទាន់មានប្រវត្តិសកម្មភាព Bot នៅឡើយទេ។
                </div>
              ) : (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 custom-scroll">
                  {logs.map(log => (
                    <div
                      key={log.id}
                      className="p-3 rounded-xl bg-[#09152C] border border-[#1C335C] text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">👤 {log.customer_name}</span>
                          {log.basket_no && (
                            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold">
                              #{log.basket_no}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {new Date(log.timestamp).toLocaleString('en-US', { hour12: false })}
                        </span>
                      </div>

                      {log.incoming_message && (
                        <div className="text-[11px] text-slate-400 bg-slate-950/60 p-1.5 rounded-lg">
                          📩 ភ្ញៀវផ្ញើ ៖ <span className="text-slate-200">{log.incoming_message}</span>
                        </div>
                      )}

                      <div className="text-[11px] text-emerald-300 bg-emerald-950/40 p-1.5 rounded-lg border border-emerald-500/20">
                        🤖 Bot ឆ្លើយ ៖ <span>{log.bot_reply}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Tab 4: Meta & Webhook Settings */
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-[#09152C] border border-[#1C335C] space-y-3">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <span>🔗</span>
                  <span>Meta Facebook App Webhook URL</span>
                </h3>
                <p className="text-slate-300">
                  សូម Copy តំណរភ្ជាប់ Webhook នេះទៅដាក់ក្នុង Meta Developer Portal (Messenger ➔ Webhooks) ដើម្បីឱ្យ Bot អាចទទួលសារពីភ្ញៀវផ្ទាល់ ៖
                </p>

                <div className="space-y-2">
                  <div>
                    <label className="block text-slate-400 font-bold mb-1">Callback URL</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={webhookUrl}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs select-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(webhookUrl);
                          onShowToast('📋 បានចម្លង Webhook URL រួចរាល់!', 'success');
                        }}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1">Verify Token</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={config?.webhookVerifyToken || 'kari_live_bot_secret_2026'}
                        onChange={e => config && setConfig({ ...config, webhookVerifyToken: e.target.value })}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-amber-300 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(config?.webhookVerifyToken || 'kari_live_bot_secret_2026');
                          onShowToast('📋 បានចម្លង Verify Token រួចរាល់!', 'success');
                        }}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1 flex items-center justify-between">
                      <span>🔑 Facebook Page Access Token (សម្រាប់ផ្ញើសារតបទៅ Messenger)</span>
                      <span className="text-[10px] text-amber-400 font-normal">Meta Developer ➔ Messenger ➔ Generate Token</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="password"
                        placeholder="បិទភ្ជាប់ (Paste) Page Access Token ទីនេះ..."
                        value={config?.pageAccessToken || ''}
                        onChange={e => config && setConfig({ ...config, pageAccessToken: e.target.value })}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-emerald-400 font-mono text-xs focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={handleSaveConfig}
                        className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold whitespace-nowrap shadow"
                      >
                        💾 រក្សាទុក Token
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between flex-shrink-0 flex-wrap gap-2">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Gemini AI 3.8 Flash Engine Active</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
            >
              បិទ
            </button>
            {activeTab === 'FEATURES' && (
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveConfig}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-black shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
              >
                {isSaving ? 'កំពុងរក្សាទុក...' : '💾 រក្សាទុកការកំណត់'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
