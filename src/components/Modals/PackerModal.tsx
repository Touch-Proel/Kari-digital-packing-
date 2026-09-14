import { useState, useEffect } from 'react';

interface PackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'leaderboard' | 'history';
  packerName: string;
  onChangePackerName?: (newName: string) => void;
}

export function PackerModal({
  isOpen,
  onClose,
  mode,
  packerName,
  onChangePackerName
}: PackerModalProps) {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      if (mode === 'leaderboard') {
        fetch('/api/packer_leaderboard')
          .then(res => res.json())
          .then(data => setLeaderboard(data))
          .catch(err => console.error(err))
          .finally(() => setLoading(false));
      } else {
        fetch(`/api/packer_history?name=${encodeURIComponent(packerName)}`)
          .then(res => res.json())
          .then(data => setHistory(data))
          .catch(err => console.error(err))
          .finally(() => setLoading(false));
      }
    }
  }, [isOpen, mode, packerName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[999999] flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-[#0B1426] border-[1.5px] border-slate-700 rounded-2xl w-full max-w-[420px] max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="p-3.5 bg-[#121E38] border-b border-slate-700 flex justify-between items-center">
          <div className="font-black text-sm text-cyan-400">
            {mode === 'leaderboard' ? (
              <span className="text-amber-400">🏆 តារាងជើងខ្លាំងច្រកថ្ងៃនេះ (Leaderboard)</span>
            ) : (
              <span>👤 កន្ត្រកដែលច្រកបានដោយ ៖ {packerName}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-800 text-white font-bold flex items-center justify-center hover:bg-slate-700"
          >
            ✕
          </button>
        </div>

        {mode === 'history' && onChangePackerName && (
          <div className="px-3 pt-3 flex gap-2">
            <button
              onClick={() => {
                const name = prompt('សូមបញ្ចូលឈ្មោះរបស់អ្នក ៖', packerName);
                if (name && name.trim()) onChangePackerName(name.trim());
              }}
              className="w-full py-1.5 rounded-lg bg-blue-900/60 border border-blue-500 text-sky-300 text-xs font-bold"
            >
              ✏️ ប្តូរឈ្មោះអ្នកច្រក (Current: {packerName})
            </button>
          </div>
        )}

        <div className="p-3 overflow-y-auto flex flex-col gap-2 max-h-[60vh] bg-[#070D1B]">
          {loading ? (
            <div className="text-center py-10 text-slate-400 text-sm">⏳ កំពុងទាញទិន្នន័យ...</div>
          ) : mode === 'leaderboard' ? (
            leaderboard.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">មិនទាន់មានទិន្នន័យច្រកថ្ងៃនេះឡើយ</div>
            ) : (
              leaderboard.map((p, idx) => (
                <div
                  key={p.packer_name}
                  className="bg-[#070D1B] border border-slate-800 p-2.5 rounded-xl flex justify-between items-center"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-5 font-bold font-mono text-sm ${idx === 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                      #{idx + 1}
                    </span>
                    <strong className="text-emerald-300 text-sm">👤 {p.packer_name}</strong>
                  </div>
                  <div className="font-mono font-black text-amber-400 text-xs">
                    {p.total_bags} កន្ត្រក ({Math.round(p.avg_duration || 0)}s/bag)
                  </div>
                </div>
              ))
            )
          ) : history.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">មិនទាន់មានប្រវត្តិច្រកនៅឡើយទេ</div>
          ) : (
            history.map(d => (
              <div
                key={d.log_id}
                className="bg-[#070D1B] border border-slate-800 p-2.5 rounded-xl flex justify-between items-center"
              >
                <div>
                  <div className="font-black text-cyan-400 text-xs font-mono">
                    #{d.invoice_id} ‧ <span className="text-white font-sans">{d.facebook_name || 'ភ្ញៀវ'}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-medium">
                    {d.items_count} មុខ ‧ ⏱️ {Math.round(d.duration_seconds)}s ‧ {d.packed_at?.slice(11, 16) || ''}
                  </div>
                </div>
                <div className="text-amber-400 font-mono font-bold text-xs">${Number(d.total_amount || 0).toFixed(2)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
