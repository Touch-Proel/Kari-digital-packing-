import { useState, useEffect } from 'react';

interface DatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDateFilter?: (date: string) => void;
}

interface DateHistoryItem {
  date: string;
  live_ids: string[];
  total_invoices: number;
  total_revenue: number;
  staged_count: number;
  verified_count: number;
  paid_count: number;
}

interface DbStats {
  engine: string;
  db_file: string;
  file_size_bytes: number;
  total_invoices: number;
  total_products: number;
  total_customers: number;
  total_packer_logs: number;
  active_live_id: string;
}

export function DatabaseModal({ isOpen, onClose, onSelectDateFilter }: DatabaseModalProps) {
  const [stats, setStats] = useState<DbStats | null>(null);
  const [dates, setDates] = useState<DateHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const fetchDbInfo = async () => {
    setLoading(true);
    try {
      const [statsRes, datesRes] = await Promise.all([
        fetch('/api/db/stats'),
        fetch('/api/history/dates')
      ]);
      if (statsRes.ok) {
        const sData = await statsRes.json();
        setStats(sData);
      }
      if (datesRes.ok) {
        const dData = await datesRes.json();
        setDates(dData.dates || []);
      }
    } catch (err) {
      console.error('Failed to fetch DB stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDbInfo();
    }
  }, [isOpen]);

  const handleDownloadBackup = () => {
    setDownloading(true);
    window.location.href = '/api/db/backup';
    setTimeout(() => setDownloading(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#0B132B] border border-cyan-500/40 w-full max-w-xl rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-[#0B132B] to-slate-900 border-b border-cyan-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🗄️</span>
            <div>
              <h2 className="text-sm font-black text-white">ប្រព័ន្ធទិន្នន័យ SQLite & ផ្ទៀងផ្ទាត់តាមថ្ងៃ</h2>
              <p className="text-[11px] text-cyan-400">High-Performance Embedded SQLite Storage</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold flex items-center justify-center transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {/* SQLite Engine Status Card */}
          <div className="bg-slate-900/90 border border-cyan-500/30 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-black text-cyan-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>SQLite 3 Engine (Local SSD WAL)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-mono text-[10px] font-bold border border-emerald-500/40">
                ACTIVE
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400">វិក្កយបត្រសរុប</div>
                <div className="text-base font-black text-amber-400 font-mono">
                  {stats ? stats.total_invoices : '...'}
                </div>
              </div>

              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400">មុខទំនិញកូដ</div>
                <div className="text-base font-black text-sky-400 font-mono">
                  {stats ? stats.total_products : '...'}
                </div>
              </div>

              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400">អតិថិជន</div>
                <div className="text-base font-black text-purple-400 font-mono">
                  {stats ? stats.total_customers : '...'}
                </div>
              </div>

              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400">ទំហំ SQLite File</div>
                <div className="text-base font-black text-emerald-400 font-mono">
                  {stats && stats.file_size_bytes ? `${(stats.file_size_bytes / 1024).toFixed(0)} KB` : '...'}
                </div>
              </div>
            </div>

            {/* 1-Click Backup Button */}
            <div className="pt-2 flex gap-2">
              <button
                onClick={handleDownloadBackup}
                disabled={downloading}
                className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black flex items-center justify-center gap-1.5 shadow-md active:scale-98 transition-all cursor-pointer"
              >
                <span>💾</span>
                <span>{downloading ? 'កំពុងទាញយក...' : 'ទាញយក Backup SQLite (.db) 1-Click'}</span>
              </button>
            </div>
          </div>

          {/* Historical Dates List for Verification */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-white flex items-center gap-1.5">
                <span>📅</span>
                <span>ប្រវត្តិ Live & វិក្កយបត្រតាមថ្ងៃនីមួយៗ ({dates.length} ថ្ងៃ)</span>
              </h3>
              <button
                onClick={fetchDbInfo}
                className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
              >
                🔄 Refresh
              </button>
            </div>

            {loading ? (
              <div className="py-6 text-center text-slate-400">កំពុងទាញទិន្នន័យពី SQLite...</div>
            ) : dates.length === 0 ? (
              <div className="py-6 text-center text-slate-500 bg-slate-900/50 rounded-xl border border-slate-800">
                មិនទាន់មានប្រវត្តិកាលបរិច្ឆេទនៅឡើយទេ។
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {dates.map(item => (
                  <div
                    key={item.date}
                    className="p-3 bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 hover:border-cyan-500/40 rounded-xl flex items-center justify-between transition-all"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-white text-xs bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                          📆 {item.date}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          ({item.live_ids.length} វគ្គ Live)
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-300">
                        <span>📦 សរុប: <strong className="text-amber-400">{item.total_invoices}</strong> កន្ត្រក</span>
                        <span>💵 ប្រាក់: <strong className="text-emerald-400">${item.total_revenue.toFixed(2)}</strong></span>
                        <span>✅ ខ្ចប់: <strong className="text-sky-400">{item.staged_count}</strong></span>
                      </div>
                    </div>

                    {onSelectDateFilter && (
                      <button
                        onClick={() => {
                          onSelectDateFilter(item.date);
                          onClose();
                        }}
                        className="px-3 py-1.5 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 font-bold rounded-lg border border-cyan-500/50 text-[11px] active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                      >
                        មើលកន្ត្រកថ្ងៃនេះ 🔍
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
          >
            បិទផ្ទាំង
          </button>
        </div>
      </div>
    </div>
  );
}
