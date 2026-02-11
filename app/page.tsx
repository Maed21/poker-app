"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { POWER_NUMBERS, REMAINING_PLAYERS } from '../constants/powerNumbers';

// --- 各種定数 ---
const RANGE_STACKS = ["100", "50", "30", "20"];
const POSITIONS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const ANTES = ["with-ante", "no-ante"];
const ACTIONS = ["Fold", "Call", "Raise", "All-in"];

const SITUATION_METADATA: { [key: string]: string } = {
  "open": "ANY",
  "vs-utg-or-2-3": "UTG",
  "vs-hj-or-2-3": "HJ",
  "vs-co-or-2-3": "CO",
  "vs-btn-or-2-3": "BTN",
  "vs-sb-or-3-5": "SB",
  "vs-bb-3b-9-8": "BB",
  "vs-bb-3b-9-0": "BB"
};

const SITUATIONS = Object.keys(SITUATION_METADATA);
const ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// 全169ハンドのリストを生成
const all169Hands: string[] = [];
for (let i = 0; i < 13; i++) {
  for (let j = 0; j < 13; j++) {
    if (i === j) all169Hands.push(ranks[i] + ranks[j]);
    else if (i < j) all169Hands.push(ranks[i] + ranks[j] + 's');
    else all169Hands.push(ranks[j] + ranks[i] + 'o');
  }
}

export default function UltimatePokerQuiz() {
  const [mode, setMode] = useState<"range" | "push-fold">("range");
  const [selectedStacks, setSelectedStacks] = useState(["50"]);
  const [selectedPos, setSelectedPos] = useState(["BTN"]);
  const [selectedAntes, setSelectedAntes] = useState(["with-ante"]);

  const [currentTask, setCurrentTask] = useState<any>(null);
  const [currentHand, setCurrentHand] = useState<string>("");
  const [data, setData] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showLogic, setShowLogic] = useState(false);

  const nextQuestion = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setShowLogic(false);
    setCurrentHand("");

    const pos = selectedPos[Math.floor(Math.random() * selectedPos.length)];
    const ante = selectedAntes[Math.floor(Math.random() * selectedAntes.length)];
    const stack = selectedStacks[Math.floor(Math.random() * selectedStacks.length)];

    let committed = 0;
    if (pos === "BB") {
      committed += 1.0;
      if (ante === "with-ante") committed += 1.0;
    } else if (pos === "SB") {
      committed += 0.5;
    }

    if (mode === "push-fold") {
      const randomM = parseFloat((Math.random() * (6.0 - 1.0) + 1.0).toFixed(1));
      const hand = all169Hands[Math.floor(Math.random() * all169Hands.length)];
      setCurrentTask({ pos, mValue: randomM, mode: "push-fold" });
      setCurrentHand(hand);
      setData(null);
      setLoading(false);
    } else {
      const validSituations = SITUATIONS.filter(situ => {
        if (situ === "open") return true;
        const targetPos = SITUATION_METADATA[situ];
        const myIdx = POSITIONS.indexOf(pos);
        const targetIdx = POSITIONS.indexOf(targetPos);
        if (situ.includes("3b")) {
          if (situ === "vs-bb-3b-9-8" && pos !== "BB" && pos !== "SB") return true;
          if (situ === "vs-bb-3b-9-0" && pos === "SB") return true;
          return false;
        }
        if (situ.includes("-or-")) return targetIdx < myIdx;
        return false;
      });

      const situation = validSituations[Math.floor(Math.random() * validSituations.length)] || "open";
      setCurrentTask({ stack, pos, ante, situation, mode: "range", committed });

      try {
        const path = `/ranges/${ante}/${stack}/${pos.toLowerCase()}/${situation}.json`;
        const res = await fetch(path);
        if (!res.ok) throw new Error("File not found");
        const text = await res.text();
        const json = JSON.parse(text);
        setData(json.hands);
        let handList = (situation.includes("3b") || situation.includes("-or-"))
          ? Object.keys(json.hands).filter(h => json.hands[h].correct.some((a: string) => a !== "Fold"))
          : all169Hands;
        setCurrentHand(handList[Math.floor(Math.random() * handList.length)]);
      } catch (e) {
        setData(null);
        setCurrentHand(all169Hands[Math.floor(Math.random() * all169Hands.length)]);
      } finally {
        setLoading(false);
      }
    }
  }, [mode, selectedPos, selectedStacks, selectedAntes]);

  useEffect(() => { nextQuestion(); }, [nextQuestion]);

  const handleAnswer = (userAns: string) => {
    if (result || loading || !currentHand) return;
    if (mode === "push-fold") {
      const pNum = POWER_NUMBERS[currentHand] || 0;
      const players = REMAINING_PLAYERS[currentTask.pos] || 1;
      const isPushCorrect = (pNum / players) >= currentTask.mValue;
      const correct = isPushCorrect ? "All-in" : "Fold";
      setResult({ isCorrect: userAns === correct, correct: [correct], pNum, players });
    } else {
      if (!data || !data[currentHand]) return;
      const correctActions = data[currentHand].correct;
      setResult({ isCorrect: correctActions.includes(userAns), correct: correctActions });
    }
    setShowLogic(true);
  };

  const toggleSelection = (list: string[], setFn: Function, val: string) => {
    if (list.includes(val)) { if (list.length > 1) setFn(list.filter(i => i !== val)); }
    else { setFn([...list, val]); }
  };

  // --- パワーナンバー表の動的生成コンポーネント ---
  const PowerNumberGrid = () => {
    const players = REMAINING_PLAYERS[currentTask.pos] || 1;
    const mValue = currentTask.mValue;

    return (
      <div className="grid grid-cols-13 gap-[1px] bg-white/10 p-[1px] rounded-lg overflow-hidden border border-white/10 text-[6px] xs:text-[7px] sm:text-[8px]">
        {ranks.map((r1) =>
          ranks.map((r2) => {
            const rowIdx = ranks.indexOf(r1);
            const colIdx = ranks.indexOf(r2);
            let hand = "";
            if (rowIdx === colIdx) hand = r1 + r2;
            else if (rowIdx < colIdx) hand = r1 + r2 + "s";
            else hand = r2 + r1 + "o";

            const pNum = POWER_NUMBERS[hand] || 0;
            const isPush = (pNum / players) >= mValue;
            const isCurrent = hand === currentHand;

            return (
              <div
                key={hand}
                className={`
                  aspect-square flex flex-col items-center justify-center font-bold leading-none
                  ${isPush ? "bg-red-600 text-white" : "bg-gray-800 text-gray-500"}
                  ${isCurrent ? "ring-2 ring-yellow-400 z-10 scale-110 shadow-lg relative" : ""}
                `}
              >
                <span className="text-[6px] xs:text-[7px] sm:text-[8px]">{hand}</span>
                <span className="opacity-60 scale-[0.7] mt-[1px] text-[5px] xs:text-[6px] sm:text-[7px]">{pNum}</span>
              </div>
            );
          })
        )}
      </div>
    );
  };

  if (!currentTask) return null;

  return (
    <div className="min-h-screen bg-black text-white p-3 font-sans pb-24">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* モード切替 */}
        <div className="flex bg-gray-900/80 p-1.5 rounded-2xl border border-white/5 max-w-[320px] mx-auto backdrop-blur-md">
          <button onClick={() => setMode("range")} className={`flex-1 py-3 sm:py-2.5 rounded-xl text-xs sm:text-[10px] font-black tracking-widest transition-all ${mode === "range" ? "bg-blue-600 text-white shadow-lg" : "text-gray-500"}`}>RANGE</button>
          <button onClick={() => setMode("push-fold")} className={`flex-1 py-3 sm:py-2.5 rounded-xl text-xs sm:text-[10px] font-black tracking-widest transition-all ${mode === "push-fold" ? "bg-red-600 text-white shadow-lg" : "text-gray-500"}`}>PUSH/FOLD</button>
        </div>

        {/* セレクター */}
        <div className="bg-gray-900/40 p-5 rounded-[32px] space-y-4 border border-white/5 backdrop-blur-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`space-y-2 transition-opacity ${mode === "push-fold" ? "opacity-20 pointer-events-none" : "opacity-100"}`}>
              <span className="text-[9px] text-gray-500 font-black ml-2 uppercase italic">Stack (Range Only)</span>
              <div className="flex flex-wrap gap-1.5">
                {RANGE_STACKS.map(s => (
                  <button key={s} onClick={() => toggleSelection(selectedStacks, setSelectedStacks, s)} className={`px-4 py-2 sm:py-1.5 rounded-full text-xs sm:text-[10px] font-bold transition-all ${selectedStacks.includes(s) ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-500'}`}>{s}BB</button>
                ))}
              </div>
            </div>
            <div className={`space-y-2 transition-opacity ${mode === "push-fold" ? "opacity-20 pointer-events-none" : "opacity-100"}`}>
              <span className="text-[9px] text-gray-500 font-black ml-2 uppercase italic">Ante (Range Only)</span>
              <div className="flex flex-wrap gap-1.5">
                {ANTES.map(a => (
                  <button key={a} onClick={() => toggleSelection(selectedAntes, setSelectedAntes, a)} className={`px-4 py-2 sm:py-1.5 rounded-full text-xs sm:text-[10px] font-bold transition-all ${selectedAntes.includes(a) ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-500'}`}>{a === "with-ante" ? "BB ANTE" : "NO ANTE"}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <span className="text-[9px] text-gray-500 font-black ml-2 uppercase italic">Position</span>
            <div className="flex flex-wrap gap-1.5">
              {POSITIONS.map(p => (
                <button key={p} onClick={() => toggleSelection(selectedPos, setSelectedPos, p)} className={`px-4 py-2 sm:py-1.5 rounded-full text-xs sm:text-[10px] font-bold transition-all ${selectedPos.includes(p) ? (mode === "range" ? 'bg-blue-600' : 'bg-red-600') + ' text-white' : 'bg-white/5 text-gray-500'}`}>{p}</button>
              ))}
            </div>
          </div>
        </div>

        {/* メインカード */}
        <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-[48px] p-8 border border-white/10 shadow-2xl max-w-[420px] mx-auto min-h-[550px] flex flex-col justify-between relative overflow-hidden">
          <div className="space-y-6">
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                {mode === "range" ? "Situation" : "Push or Fold"}
              </p>
              <p className="text-3xl font-black text-blue-400 leading-tight">
                {mode === "range" ? currentTask.situation?.toUpperCase().replace(/-/g, '.') : `M-VALUE: ${currentTask.mValue}`}
              </p>
            </div>

            {mode === "range" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-black/30 rounded-2xl p-4 border border-white/5 shadow-inner">
                  <p className="text-[9px] text-gray-500 font-black uppercase tracking-tighter">Stack</p>
                  <p className="text-2xl font-black text-white">{currentTask.stack}<span className="text-xs ml-1">BB</span></p>
                </div>
                <div className="bg-black/30 rounded-2xl p-4 border border-white/5 shadow-inner">
                  <p className="text-[9px] text-gray-500 font-black uppercase tracking-tighter">Committed</p>
                  <p className={`text-2xl font-black ${currentTask.committed > 0 ? 'text-yellow-500' : 'text-gray-600'}`}>
                    {currentTask.committed}<span className="text-xs ml-1">BB</span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-red-500/5 rounded-2xl p-6 border border-red-500/10 text-center shadow-inner">
                <p className="text-[10px] text-red-400 font-black uppercase tracking-widest mb-1 opacity-60">Remaining Players</p>
                <p className="text-3xl font-black text-white">{REMAINING_PLAYERS[currentTask.pos]} <span className="text-sm text-gray-500">Left</span></p>
              </div>
            )}

            <div className={`px-4 py-2 rounded-xl border inline-block ${mode === "range" ? "bg-blue-500/10 border-blue-500/20" : "bg-red-500/10 border-red-500/20"}`}>
              <p className={`text-[11px] font-black ${mode === "range" ? "text-blue-400" : "text-red-400"}`}>HERO: <span className="text-white text-base ml-1">{currentTask.pos}</span></p>
            </div>

            <div className="relative py-12 bg-black/50 rounded-[40px] border border-white/5 flex items-center justify-center min-h-[180px] shadow-inner">
              {loading ? (
                <span className="text-xl font-black text-gray-700 animate-pulse uppercase">Searching...</span>
              ) : (
                <span className={`font-black tracking-tighter italic text-white leading-none drop-shadow-2xl ${currentHand.length > 3 ? 'text-5xl' : 'text-[110px]'}`}>
                  {currentHand}
                </span>
              )}
            </div>
          </div>

          {!result ? (
            <div className="grid grid-cols-2 gap-3 mt-8">
              {(mode === "range" ? ACTIONS : ["All-in", "Fold"]).map(a => (
                <button key={a} disabled={loading || !currentHand} onClick={() => handleAnswer(a)} className={`py-5 sm:py-6 rounded-[30px] font-black text-lg sm:text-xl active:scale-95 transition-all border min-h-[56px] ${a === 'Raise' || a === 'All-in' ? 'bg-white text-black border-white shadow-xl' : 'bg-gray-800 text-white border-white/10 hover:bg-gray-700'}`}>
                  {a.toUpperCase()}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4 mt-8 animate-in zoom-in duration-300">
              <div className={`py-6 rounded-[30px] text-4xl font-black text-center border-2 ${result.isCorrect ? "text-green-400 bg-green-400/5 border-green-400/20" : "text-red-400 bg-red-400/5 border-red-400/20"}`}>
                {result.isCorrect ? "CORRECT" : "WRONG"}
              </div>
              {mode === "push-fold" && (
                <div className="text-center font-black text-gray-400 text-xs italic tracking-widest bg-white/5 py-2 rounded-xl">
                  POWER NUM: <span className="text-white text-sm">{result.pNum}</span> ÷ {result.players} = <span className="text-yellow-500 text-sm">{(result.pNum / result.players).toFixed(1)}</span>
                </div>
              )}
              <button onClick={nextQuestion} className="w-full py-5 sm:py-6 rounded-[30px] font-black text-lg sm:text-xl bg-blue-600 text-white shadow-xl active:scale-95 transition-all min-h-[56px]">NEXT HAND</button>
            </div>
          )}
        </div>

        {/* 解答後の表示セクション */}
        {showLogic && (
          <div className="bg-gray-900 rounded-[40px] border border-white/10 p-4 mt-4 animate-in slide-in-from-bottom shadow-2xl">
            <div className="space-y-4 text-center">
              <h3 className="text-[10px] font-black italic uppercase tracking-[0.2em] text-white/40">
                {mode === "range" ? "Strategic Range Map" : `Strategy: M-${currentTask.mValue} / ${currentTask.pos}`}
              </h3>

              <div className="inline-block w-full max-w-2xl">
                {mode === "range" ? (
                  <div className="bg-white rounded-[28px] p-1 border border-white/10">
                    <img
                      src={`/ranges/${currentTask.ante}/${currentTask.stack}/${currentTask.pos.toLowerCase()}/${currentTask.situation}.png`}
                      alt="Range Chart"
                      className="w-full h-auto rounded-[24px]"
                      onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/800x800/1a1a1a/ffffff?text=Strategy+Chart+Not+Found'; }}
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* 自作パワーナンバー表 */}
                    <PowerNumberGrid />
                    <div className="flex justify-center gap-6 text-[9px] font-black tracking-widest uppercase">
                      <div className="flex items-center gap-2 text-red-500">
                        <div className="w-3 h-3 bg-red-600 rounded-sm"></div>
                        <span>PUSH Range</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-500">
                        <div className="w-3 h-3 bg-gray-800 rounded-sm"></div>
                        <span>FOLD Range</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .grid-cols-13 { grid-template-columns: repeat(13, minmax(0, 1fr)); }
        @keyframes zoom-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .animate-in { animation: zoom-in 0.25s ease-out forwards; }
      `}</style>
    </div>
  );
}