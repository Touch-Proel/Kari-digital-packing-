import { useState } from 'react';
import { playSuccessFanfare, playWarningBuzzer, playPureTone } from '../utils/audio';

interface LiveCommentStreamProps {
  isOpen: boolean;
  onClose: () => void;
  activeLiveId: string;
  onCommentProcessed: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export function LiveCommentStream({
  isOpen,
  onClose,
  activeLiveId,
  onCommentProcessed,
  onShowToast
}: LiveCommentStreamProps) {
  const [commentText, setCommentText] = useState('');
  const [customerName, setCustomerName] = useState('ម៉ៅ ស្រីពៅ');
  const [submitting, setSubmitting] = useState(false);
  const [recentLogs, setRecentLogs] = useState<string[]>([
    '✅ [A12=2] គីម ហុង ➔ បានកាត់ចូលកន្ត្រក #102 ($33.00)',
    '✅ [30=2, 54x1] សុខ ស្រីម៉ៅ ➔ បានកាត់ចូលកន្ត្រក #101 ($17.00)'
  ]);

  if (!isOpen) return null;

  const handleTestComment = async (customText?: string, customName?: string) => {
    const textToSend = customText || commentText;
    const nameToSend = customName || customerName;

    if (!textToSend.trim()) return;

    setSubmitting(true);
    playPureTone(700, 0.04);

    try {
      const res = await fetch('/api/comments/test_simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToSend.trim(),
          user_name: nameToSend.trim(),
          live_id: activeLiveId
        })
      });
      const data = await res.json();

      if (data.status === 'SUCCESS') {
        playSuccessFanfare();
        onShowToast(data.message);
        setRecentLogs(prev => [data.message, ...prev.slice(0, 8)]);
        if (!customText) setCommentText('');
        onCommentProcessed();
      } else if (data.status === 'CONTACT_SAVED' || data.status === 'QUESTION_SAVED' || data.status === 'UNMATCHED_SAVED') {
        playPureTone(880, 0.08);
        onShowToast(data.message);
        setRecentLogs(prev => [data.message, ...prev.slice(0, 8)]);
        if (!customText) setCommentText('');
        onCommentProcessed();
      } else {
        playWarningBuzzer();
        onShowToast(data.message || 'Comment រក្សាទុកក្នុងបញ្ជី', 'error');
        setRecentLogs(prev => [`⚠️ ${data.message}: "${textToSend}"`, ...prev.slice(0, 8)]);
      }
    } catch (e) {
      playWarningBuzzer();
      onShowToast('Network error processing comment', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const sampleQuickComments = [
    { name: 'សុខ ស្រីម៉ៅ', text: '37គីឡូ54' },
    { name: 'ចាន់ ធី', text: '17_0883784999ទីតាំងផ្សារ115' },
    { name: 'លីណា ភ្នំពេញ', text: '28 យកពីរ 24យកមួយ' },
    { name: 'វណ្ណា', text: '12×L' },
    { name: 'ដារ៉ា', text: 'ថែម57យក1' },
    { name: 'សោភា', text: 'XLមានអត់' }
  ];

  return (
    <div className="bg-gradient-to-br from-[#0B1426] via-slate-900 to-[#070D1B] border-[1.5px] border-sky-500/60 rounded-2xl p-3 flex flex-col gap-2.5 shadow-2xl animate-fadeIn">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
          <span className="font-black text-xs text-rose-400">🔴 LIVE COMMENTS PARSER & BASKET ALLOCATION</span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-xs font-black bg-slate-800 px-2 py-0.5 rounded-md"
        >
          ✕
        </button>
      </div>

      {/* Simulator input */}
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <input
            type="text"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="ឈ្មោះភ្ញៀវ Facebook"
            className="w-1/3 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-sky-300 font-bold outline-none focus:border-cyan-400"
          />
          <input
            type="text"
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleTestComment();
            }}
            placeholder="វាយ Comment ឧ. 30=2 54=1 012888999 ភ្នំពេញ..."
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400 font-medium"
          />
        </div>

        <button
          onClick={() => handleTestComment()}
          disabled={submitting || !commentText.trim()}
          className="w-full py-2 bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-50"
        >
          <span>⚡</span>
          <span>{submitting ? 'កំពុងកាត់...' : 'កាត់ចូលកន្ត្រកភ្លាមៗ (Auto Allocate & Deduct Stock)'}</span>
        </button>
      </div>

      {/* Quick click test buttons */}
      <div>
        <div className="text-[10.5px] text-slate-400 font-bold mb-1">💡 ចុចតេស្តខំមិន Live ពិតជាក់ស្តែង ៖</div>
        <div className="flex flex-wrap gap-1.5">
          {sampleQuickComments.map((sc, i) => (
            <button
              key={i}
              onClick={() => handleTestComment(sc.text, sc.name)}
              className="bg-slate-900 border border-slate-700 hover:border-cyan-400 text-slate-300 text-[11px] px-2 py-1 rounded-lg truncate max-w-full font-medium active:scale-95"
            >
              💬 <strong className="text-sky-400">{sc.name}</strong>: "{sc.text.slice(0, 22)}..."
            </button>
          ))}
        </div>
      </div>

      {/* Real-time event log */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2 max-h-[85px] overflow-y-auto text-[11px] flex flex-col gap-1 font-mono">
        {recentLogs.map((log, i) => (
          <div key={i} className="text-emerald-300 font-sans truncate">
            {log}
          </div>
        ))}
      </div>
    </div>
  );
}
