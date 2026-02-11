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

// 状況表示をフォーマットする関数
const formatSituation = (situation: string): string => {
  if (situation === "open") return "OPEN";

  // "vs-utg-or-2-3" -> "VS UTG OpenRaise 2.3bb"
  // "vs-bb-3b-9-8" -> "VS BB 3Bet 9.8bb"

  const parts = situation.split('-');
  let formatted = "";

  if (parts[0] === "vs") {
    formatted = "VS ";

    // ポジション部分 (utg, hj, co, btn, sb, bb)
    formatted += parts[1].toUpperCase() + " ";

    // アクション部分
    if (parts[2] === "or") {
      formatted += "OpenRaise ";
    } else if (parts[2] === "3b") {
      formatted += "3Bet ";
    }

    // 数値部分 (2-3 -> 2.3bb, 9-8 -> 9.8bb)
    if (parts.length >= 4) {
      formatted += parts.slice(3).join('.') + "bb";
    }
  }

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
      <div className="grid grid-cols-13 gap-[2px] bg-gray-300 p-[2px] rounded-lg overflow-hidden text-xs sm:text-sm">
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
                  ${isPush ? "bg-black text-white" : "bg-white text-gray-600"}
                  ${isCurrent ? "ring-2 ring-orange-500 z-10 scale-110 shadow-lg relative" : ""}
                `}
              >
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
          <button onClick={() => setMode("range")} className={`flex-1 py-3 sm:py-2.5 rounded-xl text-xs sm:text-[10px] font-black tracking-widest transition-all ${mode === "range" ? "bg-white text-black shadow-lg" : "text-gray-500 hover:text-gray-900"}`}>RANGE</button>
          <button onClick={() => setMode("push-fold")} className={`flex-1 py-3 sm:py-2.5 rounded-xl text-xs sm:text-[10px] font-black tracking-widest transition-all ${mode === "push-fold" ? "bg-black text-white shadow-lg" : "text-gray-500 hover:text-gray-900"}`}>PUSH/FOLD</button>
        </div>

        {/* セレクター */}
        <div className="glass-light p-5 rounded-[32px] space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`space-y-2 transition-opacity ${mode === "push-fold" ? "opacity-30 pointer-events-none" : "opacity-100"}`}>
              <span className="text-[9px] text-gray-600 font-black ml-2 uppercase italic">Stack (Range Only)</span>
              <div className="flex flex-wrap gap-1.5">
                {RANGE_STACKS.map(s => (
                  <button key={s} onClick={() => toggleSelection(selectedStacks, setSelectedStacks, s)} className={`px-4 py-2 sm:py-1.5 rounded-full text-xs sm:text-[10px] font-bold transition-all ${selectedStacks.includes(s) ? 'bg-white text-black shadow-md' : 'bg-white/30 text-gray-700 hover:bg-white/50'}`}>{s}BB</button>
                ))}
              </div>
            </div>
            <div className={`space-y-2 transition-opacity ${mode === "push-fold" ? "opacity-30 pointer-events-none" : "opacity-100"}`}>
              <span className="text-[9px] text-gray-600 font-black ml-2 uppercase italic">Ante (Range Only)</span>
              <div className="flex flex-wrap gap-1.5">
                {ANTES.map(a => (
                  <button key={a} onClick={() => toggleSelection(selectedAntes, setSelectedAntes, a)} className={`px-4 py-2 sm:py-1.5 rounded-full text-xs sm:text-[10px] font-bold transition-all ${selectedAntes.includes(a) ? 'bg-white text-black shadow-md' : 'bg-white/30 text-gray-700 hover:bg-white/50'}`}>{a === "with-ante" ? "BB ANTE" : "NO ANTE"}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <span className="text-[9px] text-gray-600 font-black ml-2 uppercase italic">Position</span>
            <div className="flex flex-wrap gap-1.5">
              {POSITIONS.map(p => (
                <button key={p} onClick={() => toggleSelection(selectedPos, setSelectedPos, p)} className={`px-4 py-2 sm:py-1.5 rounded-full text-xs sm:text-[10px] font-bold transition-all ${selectedPos.includes(p) ? (mode === "range" ? 'bg-white text-black' : 'bg-black text-white') + ' shadow-md' : 'bg-white/30 text-gray-700 hover:bg-white/50'}`}>{p}</button>
              ))}
            </div>
          </div>
        </div>

        {/* メインカード */}
        <div className="glass rounded-[48px] p-8 max-w-[420px] mx-auto min-h-[550px] flex flex-col justify-between relative overflow-hidden">
          <div className="space-y-6">
            {/* HERO */}
            <div>
              <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest">HERO</p>
              <p className="text-3xl font-black text-black leading-tight">{currentTask.pos}</p>
            </div>

            {/* SITUATION */}
            <div>
              <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest">
                {mode === "range" ? "Situation" : ""}
              </p>
              <p className="text-3xl font-black text-black leading-tight">
                {mode === "range" ? formatSituation(currentTask.situation) : `M-VALUE: ${currentTask.mValue}`}
              </p>
            </div>

            {/* Stack & Committed (Range Mode) / Remaining Players (Push/Fold Mode) */}
            {mode === "range" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="glass-light rounded-2xl p-4">
                  <p className="text-[9px] text-gray-600 font-black uppercase tracking-tighter">Stack</p>
                  <p className="text-2xl font-black text-black">{currentTask.stack}<span className="text-xs ml-1">BB</span></p>
                </div>
                <div className="glass-light rounded-2xl p-4">
                  <p className="text-[9px] text-gray-600 font-black uppercase tracking-tighter">Committed</p>
                  <p className={`text-2xl font-black ${currentTask.committed > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                    {currentTask.committed}<span className="text-xs ml-1">BB</span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="glass-light rounded-2xl p-6 text-center">
                <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-1">TO ACT</p>
                <p className="text-3xl font-black text-black">{REMAINING_PLAYERS[currentTask.pos]} <span className="text-sm text-gray-500">Players</span></p>
              </div>
            )}

            <div className="relative py-12 glass-light rounded-[40px] flex items-center justify-center min-h-[180px]">
              {loading ? (
                <span className="text-xl font-black text-gray-400 animate-pulse uppercase">Searching...</span>
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
                // ボタンの色を決定
                let buttonClass = "";
                if (a === "Fold") {
                  buttonClass = "bg-red-500/40 text-red-900 hover:bg-red-500/50";
                } else if (a === "Call") {
                  buttonClass = "bg-green-500/40 text-green-900 hover:bg-green-500/50";
                } else if (a === "Raise") {
                  buttonClass = "bg-yellow-500/40 text-yellow-900 hover:bg-yellow-500/50";
                } else if (a === "All-in") {
                  buttonClass = "bg-purple-500/40 text-purple-900 hover:bg-purple-500/50";
                }

                return (
                  <button
                    key={a}
                    disabled={loading || !currentHand}
                    onClick={() => handleAnswer(a)}
                    className={`py-5 sm:py-6 rounded-2xl font-black text-lg sm:text-xl active:scale-95 transition-all min-h-[56px] backdrop-blur-xl shadow-lg ${buttonClass}`}
                  >
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
              {mode === "push-fold" && (
                <div className="text-center font-black text-gray-700 text-xs italic tracking-widest glass-light py-2 rounded-xl">
                  POWER NUM: <span className="text-black text-sm">{result.pNum}</span> ÷ {result.players} = <span className="text-orange-600 text-sm">{(result.pNum / result.players).toFixed(1)}</span>
                </div>
              )}
              <button onClick={nextQuestion} className="w-full py-5 sm:py-6 rounded-[30px] font-black text-lg sm:text-xl bg-black text-white shadow-xl active:scale-95 transition-all min-h-[56px] hover:bg-gray-900">NEXT HAND</button>
            </div>
          )}
        </div>

        {/* 解答後の表示セクション */}
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
                  <div className="space-y-4">
                    {/* 自作パワーナンバー表 */}
                    <PowerNumberGrid />
                    <div className="flex justify-center gap-6 text-[9px] font-black tracking-widest uppercase">
                      <div className="flex items-center gap-2 text-black">
                        <div className="w-3 h-3 bg-black rounded-sm"></div>
                        <span>PUSH Range</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-500">
                        <div className="w-3 h-3 bg-gray-300 rounded-sm"></div>
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