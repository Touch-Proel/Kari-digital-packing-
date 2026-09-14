interface GamifiedHudProps {
  topPackerName: string;
  mySessionPacks: number;
  onOpenLeaderboard: () => void;
  onOpenMyHistory: () => void;
}

export function GamifiedHud({
  topPackerName,
  mySessionPacks,
  onOpenLeaderboard,
  onOpenMyHistory
}: GamifiedHudProps) {
  return (
    <div
      onClick={onOpenLeaderboard}
      className="bg-gradient-to-r from-emerald-950/90 via-teal-900/80 to-emerald-900/90 border-[1.5px] border-emerald-500 p-2 rounded-xl flex justify-between items-center cursor-pointer shadow-md active:scale-99 transition-all"
    >
      {/* Top Packer */}
      <div className="flex items-center gap-2">
        <span className="text-xl">🏆</span>
        <div>
          <div className="font-black text-xs text-white truncate max-w-[170px]">{topPackerName}</div>
          <div className="text-[10.5px] text-emerald-300 font-bold">ជើងខ្លាំងច្រកថ្ងៃនេះ (ចុចមើលតារាង)</div>
        </div>
      </div>

      {/* Current Session Packs */}
      <div
        onClick={e => {
          e.stopPropagation();
          onOpenMyHistory();
        }}
        className="flex items-center gap-2 border-l border-white/20 pl-2.5"
      >
        <span className="text-xl">🔥</span>
        <div>
          <div className="font-black text-xs text-white">{mySessionPacks} កន្ត្រក</div>
          <div className="text-[10.5px] text-emerald-300 font-bold">អ្នកច្រកបាន (ចុចមើល)</div>
        </div>
      </div>
    </div>
  );
}
