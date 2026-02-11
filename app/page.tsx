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

const all169Hands: string[] = [];
for (let i = 0; i < 13; i++) {
  for (let j = 0; j < 13; j++) {
    if (i === j) all169Hands.push(ranks[i] + ranks[j]);
    else if (i < j) all169Hands.push(ranks[i] + ranks[j] + 's');
    else all169Hands.push(ranks[j] + ranks[i] + 'o');
  }
}

const formatSituation = (situation: string): string => {
  if (!situation) return "";
  if (situation === "open") return "OPEN";

  const parts = situation.split('-');
  let formatted = "VS ";
  if (parts[1]) formatted += parts[1].toUpperCase() + " ";
  if (parts[2] === "or") formatted += "OpenRaise ";
  else if (parts[2] === "3b") formatted += "3Bet ";
  if (parts.length >= 4) formatted += parts.slice(3).join('.') + "bb";

  return formatted;
};

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
  const [dataError, setDataError] = useState(false);

  const nextQuestion = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setShowLogic(false);
    setDataError(false);
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
        if (situ === "open") return pos !== "BB";
        const opponentPos = SITUATION_METADATA[situ];
        const myIdx = POSITIONS.indexOf(pos);
        const oppIdx = POSITIONS.indexOf(opponentPos);

        if (situ.includes("3b")) {
          if (situ === "vs-bb-3b-9-8" && pos !== "BB" && pos !== "SB") return true;
          if (situ === "vs-bb-3b-9-0" && pos === "SB") return true;
          return false;
        }
        if (situ.includes("-or-")) return oppIdx < myIdx;
        return false;
      });

      const situation = validSituations.length > 0
        ? validSituations[Math.floor(Math.random() * validSituations.length)]
        : "open"; 

      setCurrentTask({ stack, pos, ante, situation, mode: "range", committed });

      try {
        const path = `/ranges/${ante}/${stack}/${pos.toLowerCase()}/${situation}.json`;
        const res = await fetch(path);
        if (!res.ok) throw new Error("File not found");
        const json = await res.json();
        setData(json.hands);
        let handList = (situation.includes("3b") || situation.includes("-or-"))
          ? Object.keys(json.hands).filter(h => json.hands[h].correct.some((a: string) => a !== "Fold"))
          : all169Hands;
        if (handList.length === 0) handList = all169Hands;
        setCurrentHand(handList[Math.floor(Math.random() * handList.length)]);
      } catch (e) {
        setData(null);
        setDataError(true);
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
      if (!data || !data[currentHand]) {
        setDataError(true);
        return;
      }
      const correctActions = data[currentHand].correct;
      setResult({ isCorrect: correctActions.includes(userAns), correct: correctActions });
    }
    setShowLogic(true);
  };

  const toggleSelection = (list: string[], setFn: Function, val: string) => {
    if (list.includes(val)) { if (list.length > 1) setFn(list.filter(i => i !== val)); }
    else { setFn([...list, val]); }
  };

  const PowerNumberGrid = () => {
    const players = REMAINING_PLAYERS[currentTask.pos] || 1;
    const mValue = currentTask.mValue;
    return (
      <div className="grid grid-cols-13 gap-[2px] bg-gray-300 p-[2px] rounded-lg overflow-hidden text-xs sm:text-sm">
        {ranks.map((r1) =>
          ranks.map((r2) => {
            const rowIdx = ranks.indexOf(r1);
            const colIdx = ranks.indexOf(r2);
            let hand = (rowIdx === colIdx) ? r1 + r2 : (rowIdx < colIdx) ? r1 + r2 + "s" : r2 + r1 + "o";
            const pNum = POWER_NUMBERS[hand] || 0;
            const isPush = (pNum / players) >= mValue;
            const isCurrent = hand === currentHand;
            return (
              <div key={hand} className={`aspect-square flex flex-col items-center justify-center font-bold leading-none ${isPush ? "bg-black text-white" : "bg-white text-gray-600"} ${isCurrent ? "ring-2 ring-orange-500 z-10 scale-110 shadow-lg relative" : ""}`}>
                <span className="text-base sm:text-lg font-bold">{hand}</span>
                <span className="opacity-60 mt-[2px] text-sm sm:text-base">{pNum}</span>
              </div>
            );
          })
        )}
      </div>
    );
  };

  if (!currentTask) return null;

  return (
    <div className="min-h-screen text-gray-900 p-3 font-sans pb-24">
      <div className="max-w-4xl mx-auto space-y-4">
        
        {/* モード切替 */}
        <div className="flex glass p-1.5 rounded-2xl max-w-[320px] mx-auto">
          <button onClick={() => setMode("range")} className={`flex-1 py-3 sm:py-2.5 rounded-xl text-xs sm:text-[10px] font-black tracking-widest transition-all active:scale-95 ${mode === "range" ? "bg-white text-black shadow-lg" : "text-gray-500 hover:text-gray-900"}`}>RANGE</button>
          <button onClick={() => setMode("push-fold")} className={`flex-1 py-3 sm:py-2.5 rounded-xl text-xs sm:text-[10px] font-black tracking-widest transition-all active:scale-95 ${mode === "push-fold" ? "bg-black text-white shadow-lg" : "text-gray-500 hover:text-gray-900"}`}>PUSH/FOLD</button>
        </div>

        {/* セレクター */}
        <div className="glass-light p-5 rounded-[32px] space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`space-y-2 transition-opacity ${mode === "push-fold" ? "opacity-30 pointer-events-none" : "opacity-100"}`}>
              <span className="text-[9px] text-gray-600 font-black ml-2 uppercase italic">Stack (Range Only)</span>
              <div className="flex flex-wrap gap-1.5">
                {RANGE_STACKS.map(s => (
                  <button key={s} onClick={() => toggleSelection(selectedStacks, setSelectedStacks, s)} className={`px-4 py-2 sm:py-1.5 rounded-full text-xs sm:text-[10px] font-bold transition-all active:scale-95 ${selectedStacks.includes(s) ? 'bg-white text-black shadow-md' : 'bg-white/30 text-gray-700 hover:bg-white/50'}`}>{s}BB</button>
                ))}
              </div>
            </div>
            <div className={`space-y-2 transition-opacity ${mode === "push-fold" ? "opacity-30 pointer-events-none" : "opacity-100"}`}>
              <span className="text-[9px] text-gray-600 font-black ml-2 uppercase italic">Ante (Range Only)</span>
              <div className="flex flex-wrap gap-1.5">
                {ANTES.map(a => (
                  <button key={a} onClick={() => toggleSelection(selectedAntes, setSelectedAntes, a)} className={`px-4 py-2 sm:py-1.5 rounded-full text-xs sm:text-[10px] font-bold transition-all active:scale-95 ${selectedAntes.includes(a) ? 'bg-white text-black shadow-md' : 'bg-white/30 text-gray-700 hover:bg-white/50'}`}>{a === "with-ante" ? "BB ANTE" : "NO ANTE"}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <span className="text-[9px] text-gray-600 font-black ml-2 uppercase italic">Position</span>
            <div className="flex flex-wrap gap-1.5">
              {POSITIONS.map(p => (
                <button key={p} onClick={() => toggleSelection(selectedPos, setSelectedPos, p)} className={`px-4 py-2 sm:py-1.5 rounded-full text-xs sm:text-[10px] font-bold transition-all active:scale-95 ${selectedPos.includes(p) ? (mode === "range" ? 'bg-white text-black' : 'bg-black text-white') + ' shadow-md' : 'bg-white/30 text-gray-700 hover:bg-white/50'}`}>{p}</button>
              ))}
            </div>
          </div>
        </div>

        {/* メインカード */}
        <div className="glass rounded-[48px] p-8 max-w-[420px] mx-auto min-h-[550px] flex flex-col justify-between relative overflow-hidden">
          <div className="space-y-6">
            <div>
              <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest">HERO</p>
              <p className="text-3xl font-black text-black leading-tight">{currentTask.pos}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest">{mode === "range" ? "Situation" : ""}</p>
              <p className="text-3xl font-black text-black leading-tight">{mode === "range" ? formatSituation(currentTask.situation) : `M-VALUE: ${currentTask.mValue}`}</p>
            </div>

            {mode === "range" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="glass-light rounded-2xl p-4">
                  <p className="text-[9px] text-gray-600 font-black uppercase tracking-tighter">Stack</p>
                  <p className="text-2xl font-black text-black">{currentTask.stack}<span className="text-xs ml-1">BB</span></p>
                </div>
                <div className="glass-light rounded-2xl p-4">
                  <p className="text-[9px] text-gray-600 font-black uppercase tracking-tighter">Committed</p>
                  <p className={`text-2xl font-black ${currentTask.committed > 0 ? 'text-orange-600' : 'text-gray-400'}`}>{currentTask.committed}<span className="text-xs ml-1">BB</span></p>
                </div>
              </div>
            ) : (
              <div className="glass-light rounded-2xl p-6 text-center">
                <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-1">Players To Act</p>
                <p className="text-3xl font-black text-black">{REMAINING_PLAYERS[currentTask.pos]} <span className="text-sm text-gray-500">left</span></p>
              </div>
            )}

            <div className="relative py-12 glass-light rounded-[40px] flex items-center justify-center min-h-[180px]">
              {loading ? (
                <span className="text-xl font-black text-gray-400 animate-pulse uppercase">Searching...</span>
              ) : dataError ? (
                <div className="text-center">
                  <p className="text-sm font-black text-red-500 uppercase italic">Data Missing</p>
                  <p className="text-4xl font-black text-black leading-none mt-2">{currentHand}</p>
                </div>
              ) : (
                <span className={`font-black tracking-wide italic text-black leading-none ${currentHand.length > 3 ? 'text-5xl' : 'text-[110px]'}`}>
                  {currentHand}
                </span>
              )}
            </div>
          </div>

          {!result ? (
            <div className="grid grid-cols-2 gap-3 mt-8">
              {(mode === "range" ? ACTIONS : ["All-in", "Fold"]).map(a => {
                let buttonClass = a === "Fold" ? "bg-red-500/40 text-red-900" : a === "Call" ? "bg-green-500/40 text-green-900" : a === "Raise" ? "bg-yellow-500/40 text-yellow-900" : "bg-purple-500/40 text-purple-900";
                return (
                  <button key={a} disabled={loading || !currentHand} onClick={() => handleAnswer(a)} className={`py-5 sm:py-6 rounded-2xl font-black text-lg sm:text-xl active:scale-95 transition-all min-h-[56px] backdrop-blur-xl shadow-lg touch-manipulation z-20 ${buttonClass} ${loading ? 'opacity-50' : ''}`}>
                    {a.toUpperCase()}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4 mt-8 animate-in zoom-in duration-300">
              <div className={`py-6 rounded-[30px] text-4xl font-black text-center glass-light ${result.isCorrect ? "text-green-600" : "text-red-600"}`}>
                {result.isCorrect ? "✓ CORRECT" : "✗ WRONG"}
              </div>
              <button onClick={nextQuestion} className="w-full py-5 sm:py-6 rounded-[30px] font-black text-lg sm:text-xl bg-black text-white shadow-xl active:scale-95 transition-all min-h-[56px] hover:bg-gray-900">NEXT HAND</button>
            </div>
          )}
        </div>

        {showLogic && (
          <div className="glass rounded-[40px] p-4 mt-4 animate-in slide-in-from-bottom">
            <div className="space-y-4 text-center">
              <h3 className="text-[10px] font-black italic uppercase tracking-[0.2em] text-gray-500">
                {mode === "range" ? "Strategic Range Map" : `Strategy: M-${currentTask.mValue} / ${currentTask.pos}`}
              </h3>
              <div className="inline-block w-full max-w-2xl">
                {mode === "range" ? (
                  <div className="bg-white/90 rounded-[28px] p-1 shadow-lg">
                    <img
                      src={`/ranges/${currentTask.ante}/${currentTask.stack}/${currentTask.pos.toLowerCase()}/${currentTask.situation}.png`}
                      alt="Range Chart"
                      className="w-full h-auto rounded-[24px]"
                      onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/800x800/f5f5f5/333333?text=Strategy+Chart+Not+Found'; }}
                    />
                  </div>
                ) : (
                  <PowerNumberGrid />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .glass { background: rgba(255, 255, 255, 0.4); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.3); }
        .glass-light { background: rgba(255, 255, 255, 0.2); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.2); }
        .grid-cols-13 { grid-template-columns: repeat(13, minmax(0, 1fr)); }
        @keyframes zoom-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .animate-in { animation: zoom-in 0.25s ease-out forwards; }

        /* 文字のノイズ対策 */
        .italic {
          display: inline-block; /* 描画領域を固定 */
          will-change: transform, opacity;
          backface-visibility: hidden;
          -webkit-font-smoothing: antialiased;
        }

        /* 枠のノイズ対策（クラスを一つに絞るのがコツ） */
        .glass-light {
          overflow: hidden; 
          transform: translateZ(0);
        }
      `}</style>
      
      <div className="fixed bottom-2 right-2 opacity-20 text-[8px] font-sans pointer-events-none select-none">
        V1.0.5-FINAL-LOGIC
      </div>
    </div>
  );
}