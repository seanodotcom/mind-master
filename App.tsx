import React, { useState, useEffect, useRef } from 'react';
import MastermindCanvas from './components/MastermindCanvas';
import { GameMode, PegColor, RowData, GameStats } from './types';
import { COLORS, BOARD_ROWS, CODE_LENGTH } from './constants';
import { calculateFeedback, generateSecret } from './services/gameLogic';
import { soundService } from './services/sound';
import { getGeminiHint } from './services/gemini';
import { RotateCcw, Play, Users, Bot, Sparkles, Volume2, Trophy, Flame } from 'lucide-react';

const createEmptyBoard = (): RowData[] => 
  Array(BOARD_ROWS).fill(null).map(() => ({
    pegs: Array(CODE_LENGTH).fill(PegColor.EMPTY),
    feedback: null
  }));

const App: React.FC = () => {
  const [mode, setMode] = useState<GameMode>(GameMode.MENU);
  const [rows, setRows] = useState<RowData[]>(createEmptyBoard());
  const [currentRow, setCurrentRow] = useState(0);
  const [secret, setSecret] = useState<PegColor[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [hint, setHint] = useState<string>("");
  const [loadingHint, setLoadingHint] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  
  const shuffleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shuffleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stats State
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, streak: 0, bestStreak: 0 });

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
    if (shuffleTimeoutRef.current) clearTimeout(shuffleTimeoutRef.current);
    if (shuffleIntervalRef.current) clearInterval(shuffleIntervalRef.current);
  };

  const start1P = () => {
    initGame();
    // Ensure secret is empty initially to not reveal anything before shuffle
    setSecret(Array(CODE_LENGTH).fill(PegColor.EMPTY)); 
    
    // HIDE MENU IMMEDIATELY so user can see board/shuffle
    setMode(GameMode.PLAYING);
    // Lock interactions immediately
    setIsAnimating(true);

    // Delay before shuffling starts (400ms)
    shuffleTimeoutRef.current = setTimeout(() => {
        // Note: isAnimating is already true, keeping UI locked
        
        let shuffles = 0;
        shuffleIntervalRef.current = setInterval(() => {
          setSecret(generateSecret(COLORS, CODE_LENGTH)); 
          shuffles++;
          if (shuffles > 20) {
            if (shuffleIntervalRef.current) clearInterval(shuffleIntervalRef.current);
            setIsAnimating(false); // Unlock interactions
            soundService.playReady();
          }
        }, 80);
    }, 400);
  };

  const start2P = () => {
    initGame();
    setSecret(Array(CODE_LENGTH).fill(PegColor.EMPTY));
    setMode(GameMode.SETUP_2P);
    setMessage("Player 1: Set the Secret Code!");
  };

  const handleNewGame = () => {
    if (mode === GameMode.PLAYING && currentRow > 0) {
      if (!window.confirm("Abandon current game?")) {
        return;
      }
    }
    // Only reset state here to prevent double-init issues, 
    // real init happens in start1P/start2P or here if just going to menu
    setMode(GameMode.MENU);
  };

  const handlePaletteClick = (color: PegColor) => {
    if (isAnimating) return; // Lock input during animation
    
    if (mode === GameMode.PLAYING) {
      const currentPegs = [...rows[currentRow].pegs];
      const nextEmpty = currentPegs.indexOf(PegColor.EMPTY);
      
      if (nextEmpty !== -1) {
        // Deep copy needed for safety, though 1 level is enough here
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
    if (isAnimating) return; // Lock input during animation

    if (mode === GameMode.PLAYING) {
      if (rowIndex !== currentRow) return;
      
      if (rows[rowIndex].pegs[colIndex] !== PegColor.EMPTY) {
        // Use immutable update pattern to ensure React/Effects detect change
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

    if (feedback.black === CODE_LENGTH) {
      setMode(GameMode.GAME_OVER);
      setGameWon(true);
      setMessage("CODE CRACKED!");
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
    const hintText = await getGeminiHint(secret, rows, currentRow);
    setHint(hintText);
    setLoadingHint(false);
  };

  // Derived state for UI Controls
  const isRowFull = !rows[currentRow].pegs.includes(PegColor.EMPTY);
  const canAskHint = currentRow >= 4;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      
      {/* Game Title */}
      <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600 mb-6 tracking-tight">
        MIND MASTER
      </h1>

      <div className="flex flex-col md:flex-row gap-8 items-center">
        
        {/* Main Canvas Area */}
        <div className="relative">
           <MastermindCanvas
             mode={mode}
             rows={rows}
             currentRow={currentRow}
             onPegClick={handlePegClick}
             secret={secret}
             showSecret={mode === GameMode.GAME_OVER || mode === GameMode.SETUP_2P}
             isAnimating={isAnimating}
             gameWon={gameWon}
           />
           
           {/* Overlays */}
           {mode === GameMode.MENU && (
             <div className="absolute inset-0 bg-gray-900/90 rounded-lg flex flex-col items-center justify-center gap-6 p-6 z-10">
                <button onClick={start1P} className="w-full max-w-xs flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all transform hover:scale-105 shadow-lg shadow-blue-500/30">
                  <Bot size={24} /> 1 Player (vs AI)
                </button>
                <button onClick={start2P} className="w-full max-w-xs flex items-center justify-center gap-3 bg-purple-600 hover:bg-purple-500 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all transform hover:scale-105 shadow-lg shadow-purple-500/30">
                  <Users size={24} /> 2 Players
                </button>
             </div>
           )}

            {/* Message Toast */}
            {message && (
              <div className="absolute top-32 left-0 right-0 mx-auto w-max max-w-[90%] bg-black/80 backdrop-blur text-white px-4 py-2 rounded-full border border-gray-700 shadow-xl text-center font-semibold animate-fade-in-down z-20">
                {message}
              </div>
            )}
        </div>

        {/* Controls & Tools */}
        <div className="w-full md:w-64 flex flex-col gap-4">
          
          {/* Status Panel / Stats */}
          <div className="bg-gray-800 rounded-xl p-4 shadow-lg border border-gray-700">
             <div className="text-gray-400 text-sm mb-2 uppercase tracking-wider font-bold border-b border-gray-700 pb-1">Stats</div>
             <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-300">Wins:</div>
                <div className="text-right font-bold text-green-400">{stats.wins}</div>
                <div className="text-gray-300">Losses:</div>
                <div className="text-right font-bold text-red-400">{stats.losses}</div>
                <div className="text-gray-300 flex items-center gap-1"><Flame size={12} /> Streak:</div>
                <div className="text-right font-bold text-orange-400">{stats.streak}</div>
                <div className="text-gray-300 flex items-center gap-1"><Trophy size={12} /> Best:</div>
                <div className="text-right font-bold text-yellow-400">{stats.bestStreak}</div>
             </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 shadow-lg border border-gray-700">
             <div className="text-gray-400 text-sm mb-1 uppercase tracking-wider font-bold">Status</div>
             <div className="text-white text-xl font-bold">
               {mode === GameMode.MENU && "Ready"}
               {mode === GameMode.SETUP_2P && "Secret Setup"}
               {mode === GameMode.PLAYING && `Turn ${currentRow + 1}/${BOARD_ROWS}`}
               {mode === GameMode.GAME_OVER && (gameWon ? "Victory!" : "Defeat")}
             </div>
          </div>

          {/* Color Palette */}
          {(mode === GameMode.PLAYING || mode === GameMode.SETUP_2P) && (
            <div className="bg-gray-800 rounded-xl p-4 shadow-lg border border-gray-700 grid grid-cols-3 gap-3">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => handlePaletteClick(color)}
                  disabled={isAnimating}
                  className={`w-12 h-12 rounded-full shadow-lg transform transition-transform hover:scale-105 active:scale-95 border-2 border-transparent hover:border-white/20 ${isAnimating ? 'opacity-50 cursor-not-allowed' : ''}`}
                  style={{ 
                    backgroundColor: color,
                    filter: 'brightness(0.85)' // Match 3D lighting
                  }}
                  aria-label="Select color"
                />
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-3">
            {mode === GameMode.PLAYING && (
              <>
                <button 
                  onClick={submitGuess}
                  disabled={!isRowFull || isAnimating}
                  className={`w-full font-bold py-3 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2 ${
                    isRowFull && !isAnimating
                      ? "bg-green-600 hover:bg-green-500 text-white" 
                      : "bg-gray-700 text-gray-500 cursor-not-allowed opacity-50"
                  }`}
                >
                  <Play size={20} fill="currentColor" /> Submit Guess
                </button>

                <button 
                  onClick={getHint}
                  disabled={loadingHint || !!hint || !canAskHint || isAnimating}
                  title={!canAskHint ? "Available after 4 guesses" : ""}
                  className={`w-full font-bold py-3 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2 ${
                    (!loadingHint && !hint && canAskHint && !isAnimating)
                      ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                      : "bg-gray-700 text-gray-500 cursor-not-allowed opacity-50"
                  }`}
                >
                   {loadingHint ? (
                     <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                   ) : (
                     <><Sparkles size={20} /> Ask AI Hint</>
                   )}
                </button>
                
                {hint && (
                  <div className="bg-indigo-900/50 border border-indigo-500/50 p-3 rounded-lg text-sm text-indigo-100">
                    <span className="font-bold block mb-1">AI Assistant:</span>
                    "{hint}"
                  </div>
                )}
              </>
            )}

            {mode === GameMode.SETUP_2P && (
              <button 
                onClick={submit2PSecret}
                className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
              >
                 <Volume2 size={20} /> Lock In & Play
              </button>
            )}

            {(mode === GameMode.GAME_OVER || mode === GameMode.PLAYING) && (
               <button 
               onClick={handleNewGame}
               className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2 mt-4"
             >
                <RotateCcw size={20} /> New Game
             </button>
            )}
          </div>

          {/* Tutorial / Legend */}
          <div className="bg-gray-800 rounded-xl p-4 shadow-lg border border-gray-700 text-xs text-gray-400 mt-auto">
             <div className="font-bold mb-2 text-gray-300">How to Play</div>
             <div className="mb-2">Click a color to fill next slot. Click a slot to clear it.</div>
             <div className="flex items-center gap-2 mb-1">
               <span className="w-3 h-3 rounded-full bg-red-600 inline-block"></span>
               <span>Right Color, Right Place</span>
             </div>
             <div className="flex items-center gap-2">
               <span className="w-3 h-3 rounded-full bg-gray-100 inline-block"></span>
               <span>Right Color, Wrong Place</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;