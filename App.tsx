import React, { useState, useEffect, useRef } from 'react';
import MastermindCanvas from './components/MastermindCanvas';
import { GameMode, PegColor, RowData, GameStats } from './types';
import { COLORS, BOARD_ROWS, CODE_LENGTH } from './constants';
import { calculateFeedback, generateSecret } from './services/gameLogic';
import { soundService } from './services/sound';
import { getGeminiHint } from './services/gemini';
import { requestDeviceOrientationPermission } from './services/device';

import { RotateCcw, Play, Users, Bot, Sparkles, Volume2, Trophy, Flame, Menu, X, Check, AlertTriangle } from 'lucide-react';

const GEMINI_ERROR = "My circuits are fuzzy... try again later.";

const createEmptyBoard = (): RowData[] =>
  Array(BOARD_ROWS).fill(null).map(() => ({
    pegs: Array(CODE_LENGTH).fill(PegColor.EMPTY),
    feedback: null
  }));

// Component: Stats Display
const StatsDisplay = ({ stats }: { stats: GameStats }) => (
  <div className="bg-gray-800 rounded-lg p-3 shadow-lg border border-gray-700 w-full">
    <div className="text-gray-400 text-xs mb-1 uppercase tracking-wider font-bold border-b border-gray-700 pb-1">Stats</div>
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      <div className="flex justify-between items-center"><span className="text-gray-400">Wins</span> <span className="font-bold text-green-400">{stats.wins}</span></div>
      <div className="flex justify-between items-center"><span className="text-gray-400 flex items-center gap-1"><Trophy size={10} />Best</span> <span className="font-bold text-yellow-400">{stats.bestStreak}</span></div>
      <div className="flex justify-between items-center"><span className="text-gray-400">Losses</span> <span className="font-bold text-red-400">{stats.losses}</span></div>
      <div className="flex justify-between items-center"><span className="text-gray-400 flex items-center gap-1"><Flame size={10} />Streak</span> <span className="font-bold text-orange-400">{stats.streak}</span></div>
    </div>
  </div>
);

// Component: Legend
const Legend = ({ className = "bg-gray-800" }: { className?: string }) => (
  <div className={`${className} rounded-lg p-4 shadow-lg border border-gray-700 text-xs text-gray-400 w-full`}>
    <h3 className="font-bold text-white mb-2 flex items-center gap-2 text-sm"><Sparkles size={14} className="text-yellow-400" /> How to Play</h3>
    <ul className="list-disc pl-4 space-y-1">
      <li>Tap on the colors to place pegs and guess the secret color code.</li>
      <li>Tap on a peg to change its color.</li>
      <li><span className="text-red-500 font-bold">Red peg</span> = Correct Color & Place.</li>
      <li><span className="text-white font-bold">White peg</span> = Correct Color, Wrong Place.</li>
      <li>Use logic to crack the code within 10 turns!</li>
      <li>If you're stuck after a few guesses, AI may be able to help 😉</li>
    </ul>
  </div>
);

const App = () => {
  const [mode, setMode] = useState<GameMode>(GameMode.MENU);
  const [rows, setRows] = useState<RowData[]>(createEmptyBoard());
  const [currentRow, setCurrentRow] = useState(0);
  const [secret, setSecret] = useState<PegColor[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [hint, setHint] = useState<string>("");
  const [loadingHint, setLoadingHint] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false); // State to handle reset confirmation

  // Mobile Layout State
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Detect Touch Device for Tilt/Controls
  const [isTouch, setIsTouch] = useState(('ontouchstart' in window) || (navigator.maxTouchPoints > 0));

  const shuffleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shuffleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stats State
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, streak: 0, bestStreak: 0 });

  // Handle Resize
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load stats on mount
  useEffect(() => {
    const saved = localStorage.getItem('mindmaster-stats');
    if (saved) {
      try {
        setStats(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse stats", e);
      }
    }
    return () => {
      if (shuffleTimeoutRef.current) clearTimeout(shuffleTimeoutRef.current);
      if (shuffleIntervalRef.current) clearInterval(shuffleIntervalRef.current);
    };
  }, []);

  const saveStats = (newStats: GameStats) => {
    localStorage.setItem('mindmaster-stats', JSON.stringify(newStats));
  };

  const updateStats = (isWin: boolean) => {
    setStats(prev => {
      const newStats = { ...prev };
      if (isWin) {
        newStats.wins += 1;
        newStats.streak += 1;
        if (newStats.streak > newStats.bestStreak) {
          newStats.bestStreak = newStats.streak;
        }
      } else {
        newStats.losses += 1;
        newStats.streak = 0;
      }
      saveStats(newStats);
      return newStats;
    });
  };

  const initGame = () => {
    setRows(createEmptyBoard());
    setCurrentRow(0);
    setHint("");
    setMessage("");
    setGameWon(false);
    setIsMenuOpen(false);
    setConfirmReset(false);
    if (shuffleTimeoutRef.current) clearTimeout(shuffleTimeoutRef.current);
    if (shuffleIntervalRef.current) clearInterval(shuffleIntervalRef.current);
  };

  const start1P = async () => {
    // Request permission for device orientation (needed for iOS 13+)
    if (isTouch) {
      const granted = await requestDeviceOrientationPermission();
    }
    initGame();
    setSecret(Array(CODE_LENGTH).fill(PegColor.EMPTY));
    setMode(GameMode.PLAYING);
    setIsAnimating(true);
    setIsShuffling(true);
    shuffleTimeoutRef.current = setTimeout(() => {
      let shuffles = 0;
      shuffleIntervalRef.current = setInterval(() => {
        setSecret(generateSecret(COLORS, CODE_LENGTH));
        soundService.playShuffle(); // Shuffling Sound
        shuffles++;
        if (shuffles > 20) {
          if (shuffleIntervalRef.current) clearInterval(shuffleIntervalRef.current);
          setIsShuffling(false);
          // Delay for 400ms before panning down
          setTimeout(() => {
            setIsAnimating(false);
            soundService.playReady();
          }, 400);
        }
      }, 80);
    }, 400);
  };

  const start2P = async () => {
    // Request permission for device orientation (needed for iOS 13+)
    if (isTouch) {
      await requestDeviceOrientationPermission();
    }
    initGame();
    setSecret(Array(CODE_LENGTH).fill(PegColor.EMPTY));
    setMode(GameMode.SETUP_2P);
    setMessage("Player 1: Set the Secret Code!");
  };

  const handleNewGame = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Clear any active animations if user aborts
    if (shuffleTimeoutRef.current) clearTimeout(shuffleTimeoutRef.current);
    if (shuffleIntervalRef.current) clearInterval(shuffleIntervalRef.current);
    setIsAnimating(false);
    setIsShuffling(false);

    // If game is in progress, ask for confirmation via UI state (no window.confirm)
    if (mode === GameMode.PLAYING && currentRow > 0 && !gameWon) {
      if (!confirmReset) {
        setConfirmReset(true);
        // Reset the confirm state after 3 seconds if not clicked again
        setTimeout(() => setConfirmReset(false), 3000);
        return;
      }
    }

    setConfirmReset(false);
    setMode(GameMode.MENU);
    setIsMenuOpen(false);
  };

  const handlePaletteClick = (color: PegColor) => {
    if (isAnimating) return;
    if (mode === GameMode.PLAYING) {
      const currentPegs = [...rows[currentRow].pegs];
      const nextEmpty = currentPegs.indexOf(PegColor.EMPTY);
      if (nextEmpty !== -1) {
        const newRows = rows.map((r, i) => i === currentRow ? { ...r, pegs: [...r.pegs] } : r);
        newRows[currentRow].pegs[nextEmpty] = color;
        setRows(newRows);
        soundService.playPop();
      } else {
        soundService.playError();
      }
    } else if (mode === GameMode.SETUP_2P) {
      const nextEmpty = secret.indexOf(PegColor.EMPTY);
      if (nextEmpty !== -1) {
        const newSecret = [...secret];
        newSecret[nextEmpty] = color;
        setSecret(newSecret);
        soundService.playPop();
      } else {
        soundService.playError();
      }
    }
  };

  const handlePegClick = (rowIndex: number, colIndex: number) => {
    if (isAnimating) return;
    if (mode === GameMode.PLAYING) {
      if (rowIndex !== currentRow) return;
      if (rows[rowIndex].pegs[colIndex] !== PegColor.EMPTY) {
        const newRows = rows.map((row, rIdx) => {
          if (rIdx === rowIndex) {
            const newPegs = [...row.pegs];
            newPegs[colIndex] = PegColor.EMPTY;
            return { ...row, pegs: newPegs };
          }
          return row;
        });
        setRows(newRows);
        soundService.playPop();
      }
    } else if (mode === GameMode.SETUP_2P) {
      if (rowIndex === -1) {
        if (secret[colIndex] !== PegColor.EMPTY) {
          const newSecret = [...secret];
          newSecret[colIndex] = PegColor.EMPTY;
          setSecret(newSecret);
          soundService.playPop();
        }
      }
    }
  };

  const submitGuess = () => {
    if (isAnimating) return;
    const currentPegs = rows[currentRow].pegs;
    if (currentPegs.includes(PegColor.EMPTY)) {
      soundService.playError();
      setMessage("Fill all holes first!");
      setTimeout(() => setMessage(""), 2000);
      return;
    }
    const feedback = calculateFeedback(secret, currentPegs);
    const newRows = [...rows];
    newRows[currentRow].feedback = feedback;
    setRows(newRows);

    // Clear reset confirm state if they submit a guess, as the game state advanced
    setConfirmReset(false);

    if (feedback.black === CODE_LENGTH) {
      setMode(GameMode.GAME_OVER);
      setGameWon(true);
      const guessCount = currentRow + 1;
      setMessage(`CODE CRACKED in ${guessCount} guess${guessCount === 1 ? '' : 'es'}!`);
      soundService.playWin();
      updateStats(true);
    } else if (currentRow === BOARD_ROWS - 1) {
      setMode(GameMode.GAME_OVER);
      setGameWon(false);
      setMessage("GAME OVER");
      soundService.playError();
      updateStats(false);
    } else {
      setCurrentRow(prev => prev + 1);
      soundService.playSuccess();
    }
  };

  const submit2PSecret = () => {
    if (secret.includes(PegColor.EMPTY)) {
      soundService.playError();
      return;
    }
    setMessage("Player 2, LOOK AWAY! Player 1 setting up...");
    setTimeout(() => {
      setMessage("Player 2: turn around in 3...");
      setTimeout(() => {
        setMessage("Player 2: turn around in 2...");
        setTimeout(() => {
          setMessage("Player 2: turn around in 1...");
          setTimeout(() => {
            soundService.playReady();
            setMode(GameMode.PLAYING);
            setMessage("Break the Code!");
          }, 1000);
        }, 1000);
      }, 1000);
    }, 1000);
  };

  const getHint = async () => {
    if (loadingHint || mode !== GameMode.PLAYING || isAnimating) return;
    setLoadingHint(true);
    setHint("");
    const hintText = await getGeminiHint(secret, rows, currentRow);
    setHint(hintText);
    setLoadingHint(false);
  };

  const isRowFull = !rows[currentRow].pegs.includes(PegColor.EMPTY);
  const canAskHint = currentRow >= 4;

  // --- MOBILE LAYOUT ---
  if (isMobile) {
    return (
      <div className="h-[100dvh] w-full flex flex-col bg-gray-900 overflow-hidden">

        {/* Header */}
        <header className="h-12 flex items-center justify-between px-4 bg-gray-900 border-b border-gray-800 shrink-0 z-20 shadow-md">
          <div className="flex items-center gap-2">
            <div className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600">
              MIND MASTER
            </div>
          </div>
          <button onClick={() => setIsMenuOpen(true)} className="p-2 text-gray-300 hover:text-white transition-colors">
            <Menu />
          </button>
        </header>

        {/* Game Canvas Area */}
        <div className="flex-grow relative w-full overflow-hidden bg-gray-900">
          {/* Message Toast */}
          {message && (
            <div className="absolute top-4 left-0 right-0 mx-auto w-max max-w-[90%] bg-black/80 backdrop-blur text-white px-5 py-2 rounded-lg border border-gray-600 shadow-2xl text-center font-bold z-30 pointer-events-none animate-in fade-in slide-in-from-top-4">
              {message}
            </div>
          )}

          <MastermindCanvas
            mode={mode}
            rows={rows}
            currentRow={currentRow}
            onPegClick={handlePegClick}
            secret={secret}
            showSecret={mode === GameMode.GAME_OVER || mode === GameMode.SETUP_2P}
            isAnimating={isAnimating}
            isShuffling={isShuffling}
            gameWon={gameWon}
            isMobile={isMobile}
            isTouch={isTouch}
          />

          {/* In-Game Menu Overlay */}
          {mode === GameMode.MENU && (
            <div className="absolute inset-0 bg-gray-900/95 z-40 flex flex-col items-center justify-center p-6 gap-4 overflow-y-auto">

              <img src="logo.png" alt="MIND MASTER" className="w-48 object-contain mb-4 animate-in slide-in-from-top-8 fade-in duration-700" />

              <div className="flex gap-2 w-full mt-8">
                <button onClick={start1P} className="flex-1 bg-blue-600 py-2 rounded-lg text-white font-bold flex flex-col items-center justify-center gap-1 shadow-lg active:scale-95 transition-transform">
                  <Bot size={20} /> <span>1 Player</span>
                </button>
                <button onClick={start2P} className="flex-1 bg-purple-600 py-2 rounded-lg text-white font-bold flex flex-col items-center justify-center gap-1 shadow-lg active:scale-95 transition-transform">
                  <Users size={20} /> <span>2 Players</span>
                </button>
              </div>

              <Legend className="bg-gray-800/50" />

              <div className="w-full">
                <StatsDisplay stats={stats} />
              </div>
            </div>
          )}
        </div>

        {/* Controls Footer */}
        {mode !== GameMode.MENU && (
          <div className="bg-gray-800 border-t border-gray-700 p-4 shrink-0 z-20 flex flex-col gap-2 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)]">

            {/* Hint Area - Dedicated Row */}
            {hint && (
              <div className="w-full bg-indigo-900/40 border border-indigo-500/30 p-3 rounded-lg text-sm text-indigo-200 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex gap-2 items-start">
                  <Sparkles className="shrink-0 w-4 h-4 mt-0.5 text-indigo-400" />
                  <span className="leading-snug">{hint}</span>
                </div>
              </div>
            )}

            {/* Status Line */}
            <div className="flex justify-between items-center text-xs text-gray-400 px-1 font-medium tracking-wide">
              <span>
                {mode === GameMode.PLAYING && `TURN ${currentRow + 1} / ${BOARD_ROWS}`}
                {mode === GameMode.SETUP_2P && 'SETUP MODE'}
                {mode === GameMode.GAME_OVER && (gameWon ? "VICTORY" : "GAME OVER")}
              </span>
            </div>

            {/* Color Palette - Dedicated Grid, No Scroll */}
            {(mode === GameMode.PLAYING || mode === GameMode.SETUP_2P) && (
              <div className="grid grid-cols-6 gap-2 w-full">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => handlePaletteClick(color)}
                    disabled={isAnimating}
                    className={`aspect-square rounded-full shadow-lg border-2 border-transparent transition-all active:scale-90 ${isAnimating ? 'opacity-50' : ''}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            )}

            {/* Action Buttons - Dedicated Row */}
            <div className="flex gap-2 mt-1">
              {mode === GameMode.PLAYING && (
                <>
                  <button
                    onClick={submitGuess}
                    disabled={!isRowFull || isAnimating}
                    className={`flex-grow h-12 rounded-lg flex items-center justify-center gap-2 shadow-lg transition-all font-bold text-base ${isRowFull ? 'bg-green-600 active:bg-green-700 text-white' : 'bg-gray-700 text-gray-500'}`}
                  >
                    <Check size={28} strokeWidth={3} />
                    <span>GUESS</span>
                  </button>
                  <button
                    onClick={getHint}
                    disabled={loadingHint || (!!hint && hint !== GEMINI_ERROR) || !canAskHint || isAnimating}
                    className={`w-16 h-12 rounded-lg flex items-center justify-center shadow-lg transition-all ${(!loadingHint && (!hint || hint === GEMINI_ERROR) && canAskHint && !isAnimating) ? "bg-indigo-600 hover:bg-indigo-500 text-white" : "bg-gray-700 text-gray-500 cursor-not-allowed opacity-50"}`}
                  >
                    {loadingHint ? <span className="animate-spin h-5 w-5 border-2 border-white rounded-full border-t-transparent" /> : <Sparkles size={24} />}
                  </button>
                </>
              )}

              {mode === GameMode.SETUP_2P && (
                <button
                  onClick={submit2PSecret}
                  className="w-full bg-red-600 active:bg-red-700 text-white h-12 rounded-lg font-bold text-base shadow-lg"
                >
                  LOCK CODE
                </button>
              )}

              {mode === GameMode.GAME_OVER && (
                <button
                  onClick={(e) => handleNewGame(e)}
                  className="w-full bg-blue-600 active:bg-blue-700 text-white h-12 rounded-lg font-bold text-base flex items-center justify-center gap-2 shadow-lg"
                >
                  <RotateCcw size={24} /> NEW GAME
                </button>
              )}
            </div>
          </div>
        )}

        {/* Menu Overlay */}
        {isMenuOpen && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
            <div className="w-4/5 h-full bg-gray-800 p-6 flex flex-col gap-6 shadow-2xl animate-in slide-in-from-right duration-300">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">Menu</h2>
                <button onClick={() => setIsMenuOpen(false)} className="p-2 text-gray-400 hover:text-white"><X /></button>
              </div>

              <button
                onClick={(e) => handleNewGame(e)}
                className={`flex items-center gap-2 w-full p-4 rounded-lg text-white font-semibold transition-colors mt-4 ${confirmReset ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'}`}
              >
                {confirmReset ? <AlertTriangle className="animate-pulse" /> : <RotateCcw />}
                {confirmReset ? "Confirm Quit?" : "New Game"}
              </button>

              <StatsDisplay stats={stats} />
              <Legend />
            </div>
          </div>
        )}

      </div>
    );
  }

  // --- DESKTOP LAYOUT ---
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-start md:justify-center p-4 pb-20 overflow-x-hidden">
      <div className="flex flex-row items-center justify-center gap-4 mb-6">
        <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600 tracking-tight flex-shrink-0">
          MIND MASTER
        </h1>
      </div>

      <div className="flex flex-col md:flex-row gap-8 items-start justify-center w-full max-w-6xl">
        <div className="relative w-full md:w-[450px] md:h-[750px] flex-shrink-0 flex justify-center bg-gray-900 rounded-2xl shadow-2xl border-4 border-gray-800 overflow-hidden">
          <MastermindCanvas
            mode={mode}
            rows={rows}
            currentRow={currentRow}
            onPegClick={handlePegClick}
            secret={secret}
            showSecret={mode === GameMode.GAME_OVER || mode === GameMode.SETUP_2P}
            isAnimating={isAnimating}
            isShuffling={isShuffling}
            gameWon={gameWon}
            isMobile={false}
          />
          {mode === GameMode.MENU && (
            <div className="absolute inset-0 bg-gray-900/90 flex flex-col items-center justify-center gap-6 p-6 z-10">
              <img src="logo.png" alt="MIND MASTER" className="w-56 object-contain mb-2 animate-in slide-in-from-top-8 fade-in duration-700" />
              <button onClick={start1P} className="w-full max-w-xs flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-2 py-2 rounded-lg font-bold text-base transition-all transform hover:scale-105 shadow-lg shadow-blue-500/30">
                <Bot size={20} /> 1 Player
              </button>
              <button onClick={start2P} className="w-full max-w-xs flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-2 py-2 rounded-lg font-bold text-base transition-all transform hover:scale-105 shadow-lg shadow-purple-500/30">
                <Users size={20} /> 2 Players
              </button>
            </div>
          )}
          {message && (
            <div className="absolute top-32 left-0 right-0 mx-auto w-max max-w-[90%] bg-black/80 backdrop-blur text-white px-2 py-2 rounded-full border border-gray-700 shadow-xl text-center font-semibold animate-fade-in-down z-20 pointer-events-none">
              {message}
            </div>
          )}
        </div>

        <div className="w-full md:w-64 flex flex-col gap-4">
          <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700">
            <div className="text-gray-400 text-sm mb-1 uppercase tracking-wider font-bold">Status</div>
            <div className="text-white text-xl font-bold">
              {mode === GameMode.MENU && "Ready"}
              {mode === GameMode.SETUP_2P && "Secret Setup"}
              {mode === GameMode.PLAYING && `Turn ${currentRow + 1}/${BOARD_ROWS}`}
              {mode === GameMode.GAME_OVER && (gameWon ? "Victory!" : "Defeat")}
            </div>
          </div>
          {(mode === GameMode.PLAYING || mode === GameMode.SETUP_2P) && (
            <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700 grid grid-cols-3 gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => handlePaletteClick(color)}
                  disabled={isAnimating}
                  className={`w-12 h-12 rounded-full shadow-lg transform transition-transform hover:scale-105 active:scale-95 border-2 border-transparent hover:border-white/20 ${isAnimating ? 'opacity-50 cursor-not-allowed' : ''}`}
                  style={{ backgroundColor: color, filter: 'brightness(0.85)' }}
                />
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {mode === GameMode.PLAYING && (
              <>
                <button onClick={submitGuess} disabled={!isRowFull || isAnimating} className={`w-full font-bold py-2 rounded-lg shadow-lg transition-colors flex items-center justify-center gap-2 ${isRowFull && !isAnimating ? "bg-green-600 hover:bg-green-500 text-white" : "bg-gray-700 text-gray-500 cursor-not-allowed opacity-50"}`}>
                  <Play size={20} fill="currentColor" /> Submit Guess
                </button>
                <button onClick={getHint} disabled={loadingHint || (!!hint && hint !== GEMINI_ERROR) || !canAskHint || isAnimating} title={!canAskHint ? "Available after 4 guesses" : ""} className={`w-full font-bold py-2 rounded-lg shadow-lg transition-colors flex items-center justify-center gap-2 ${(!loadingHint && (!hint || hint === GEMINI_ERROR) && canAskHint && !isAnimating) ? "bg-indigo-600 hover:bg-indigo-500 text-white" : "bg-gray-700 text-gray-500 cursor-not-allowed opacity-50"}`}>
                  {loadingHint ? (
                    <span className="animate-spin h-5 w-5 border-2 border-white rounded-full border-t-transparent" />
                  ) : (
                    <>
                      <Sparkles size={20} /> Ask AI Hint
                    </>
                  )}
                </button>
                {hint && (
                  <div className="bg-indigo-900/50 border border-indigo-500/50 p-3 rounded-lg text-sm text-indigo-100">
                    <span className="font-bold block mb-1">AI Assistant:</span> "{hint}"
                  </div>
                )}
              </>
            )}
            {mode === GameMode.SETUP_2P && (
              <button onClick={submit2PSecret} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded-lg shadow-lg transition-colors flex items-center justify-center gap-2">
                <Volume2 size={20} /> Lock In & Play
              </button>
            )}
            {(mode === GameMode.GAME_OVER || mode === GameMode.PLAYING) && (
              <button
                onClick={(e) => handleNewGame(e)}
                className={`w-full font-bold py-2 rounded-lg shadow-lg transition-colors flex items-center justify-center gap-2 mt-4 text-white ${confirmReset ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'}`}
              >
                {confirmReset ? <AlertTriangle size={20} /> : <RotateCcw size={20} />}
                {confirmReset ? "Confirm Quit?" : "New Game"}
              </button>
            )}
          </div>
          <StatsDisplay stats={stats} />
          <Legend />
        </div>
      </div>
    </div>
  );
};

export default App;