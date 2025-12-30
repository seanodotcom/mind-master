import React, { useRef, useEffect } from 'react';
import { 
  CANVAS_WIDTH, CANVAS_HEIGHT, COLORS, BOARD_ROWS, CODE_LENGTH,
  MARGIN_TOP, ROW_HEIGHT, PEG_RADIUS, PEG_SPACING, FEEDBACK_RADIUS, BOARD_LEFT_MARGIN
} from '../constants';
import { PegColor, RowData, GameMode, Particle } from '../types';

interface Props {
  mode: GameMode;
  rows: RowData[];
  currentRow: number;
  onPegClick: (row: number, col: number) => void;
  secret: PegColor[];
  showSecret: boolean;
  isAnimating: boolean;
  gameWon: boolean;
}

const MastermindCanvas: React.FC<Props> = ({ 
  mode, rows, currentRow, onPegClick, secret, showSecret, isAnimating, gameWon 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number>();
  
  // Firework logic
  const launchFirework = () => {
    const x = Math.random() * CANVAS_WIDTH;
    const y = Math.random() * (CANVAS_HEIGHT / 2) + 50; // Top half
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    
    // Explosion particles
    for (let i = 0; i < 50; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = Math.random() * 6 + 2;
      particlesRef.current.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        color: color,
        alpha: 1,
        size: Math.random() * 3 + 2,
        drag: 0.96 // Air resistance
      });
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameCount = 0;

    const render = () => {
      frameCount++;

      // Clear Canvas
      ctx.fillStyle = '#1F2937'; // gray-800
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw Header / Secret Area
      ctx.fillStyle = '#111827'; // gray-900
      ctx.fillRect(0, 0, CANVAS_WIDTH, MARGIN_TOP);
      
      // --- VISUALS: Fireworks Loop ---
      if (gameWon && mode === GameMode.GAME_OVER) {
        // Randomly launch fireworks
        if (Math.random() < 0.05) { // 5% chance per frame
          launchFirework();
        }
      }

      // --- VISUALS: Particle Updates ---
      if (particlesRef.current.length > 0) {
        updateParticles(ctx);
      }

      // Draw Secret Code (Shuffle, Show, or Hide)
      const secretY = MARGIN_TOP / 2;
      const startX = BOARD_LEFT_MARGIN + PEG_SPACING;

      for (let i = 0; i < CODE_LENGTH; i++) {
        const x = startX + i * PEG_SPACING;
        
        if (isAnimating) {
          // SHUFFLE ANIMATION: Pick random color every few frames to reduce seizure effect
          // Using frameCount to slow down the scramble slightly if needed, but per-frame is smoother for "shuffling"
          const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)];
          drawPeg(ctx, x, secretY, randomColor);
        } else if (showSecret || (mode === GameMode.GAME_OVER)) {
          // Delayed reveal animation or just show it
          // Note: App.tsx doesn't pass a "revealProgress" prop, so we show all or nothing based on flag
          // To implement the sequential reveal requested previously, we'd need more state.
          // However, user didn't ask to change reveal logic in this prompt, just the start logic.
          drawPeg(ctx, x, secretY, secret[i] || PegColor.EMPTY);
        } else {
          // Draw '?' Shield
          ctx.fillStyle = '#374151';
          ctx.beginPath();
          ctx.arc(x, secretY, PEG_RADIUS, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#9CA3AF';
          ctx.font = 'bold 20px Inter';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', x, secretY);
        }
      }

      // Draw Rows
      for (let r = 0; r < BOARD_ROWS; r++) {
        const y = MARGIN_TOP + (BOARD_ROWS - 1 - r) * ROW_HEIGHT + ROW_HEIGHT / 2;
        const rowData = rows[r];

        if (!rowData) continue;

        const isActive = r === currentRow && mode === GameMode.PLAYING;
        
        // Row Highlight for active row
        if (isActive) {
          ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
          ctx.fillRect(10, y - ROW_HEIGHT/2 + 2, CANVAS_WIDTH - 20, ROW_HEIGHT - 4);
          ctx.strokeStyle = '#3B82F6';
          ctx.lineWidth = 2;
          ctx.strokeRect(10, y - ROW_HEIGHT/2 + 2, CANVAS_WIDTH - 20, ROW_HEIGHT - 4);
        }

        // Draw Pegs
        for (let c = 0; c < CODE_LENGTH; c++) {
          const x = startX + c * PEG_SPACING;
          const color = rowData.pegs[c];
          
          drawPeg(ctx, x, y, color);
          
          // Draw subtle ring if empty and active to indicate clickable
          if (color === PegColor.EMPTY && isActive) {
            ctx.strokeStyle = '#4B5563';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, PEG_RADIUS, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        // Draw Feedback
        const feedbackX = startX + CODE_LENGTH * PEG_SPACING + 30;
        drawFeedback(ctx, feedbackX, y, rowData.feedback);
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    const drawPeg = (ctx: CanvasRenderingContext2D, x: number, y: number, color: PegColor) => {
      ctx.beginPath();
      ctx.arc(x, y, PEG_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      
      // Specular highlight for 3D effect
      if (color !== PegColor.EMPTY) {
        ctx.beginPath();
        ctx.arc(x - 5, y - 5, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fill();
      }
    };

    const drawFeedback = (ctx: CanvasRenderingContext2D, x: number, y: number, feedback: any) => {
      const positions = [
        { dx: 0, dy: -6 },
        { dx: 14, dy: -6 },
        { dx: 0, dy: 8 },
        { dx: 14, dy: 8 }
      ];

      let blackCount = feedback?.black || 0;
      let whiteCount = feedback?.white || 0;

      for (let i = 0; i < 4; i++) {
        const px = x + positions[i].dx;
        const py = y + positions[i].dy;
        
        ctx.beginPath();
        ctx.arc(px, py, FEEDBACK_RADIUS, 0, Math.PI * 2);
        
        if (blackCount > 0) {
          ctx.fillStyle = '#DC2626'; // Red
          blackCount--;
        } else if (whiteCount > 0) {
          ctx.fillStyle = '#F3F4F6'; // White
          whiteCount--;
        } else {
          ctx.fillStyle = '#374151'; // Empty
        }
        ctx.fill();
      }
    };

    const updateParticles = (ctx: CanvasRenderingContext2D) => {
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        
        // Physics
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= p.drag; // Slow down horizontally
        p.vy *= p.drag; // Slow down vertically
        p.vy += 0.15; // Gravity
        p.alpha -= 0.015; // Fade out

        if (p.alpha <= 0) {
          particles.splice(i, 1);
        } else {
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1.0;
        }
      }
    };

    render();
    
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [rows, currentRow, mode, secret, showSecret, isAnimating, gameWon]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Block clicks during animation
    if (isAnimating) return;
    
    if (mode !== GameMode.PLAYING && mode !== GameMode.SETUP_2P) return;

    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === GameMode.SETUP_2P) {
       const secretY = MARGIN_TOP / 2;
       const startX = BOARD_LEFT_MARGIN + PEG_SPACING;
       for (let i = 0; i < CODE_LENGTH; i++) {
         const pegX = startX + i * PEG_SPACING;
         const dist = Math.sqrt((x - pegX) ** 2 + (y - secretY) ** 2);
         if (dist < PEG_RADIUS + 5) {
           onPegClick(-1, i);
           return;
         }
       }
       return;
    }

    const rowY = MARGIN_TOP + (BOARD_ROWS - 1 - currentRow) * ROW_HEIGHT + ROW_HEIGHT / 2;
    const startX = BOARD_LEFT_MARGIN + PEG_SPACING;

    if (Math.abs(y - rowY) < ROW_HEIGHT / 2) {
      for (let i = 0; i < CODE_LENGTH; i++) {
        const pegX = startX + i * PEG_SPACING;
        const dist = Math.sqrt((x - pegX) ** 2 + (y - rowY) ** 2);
        if (dist < PEG_RADIUS + 5) {
          onPegClick(currentRow, i);
          return;
        }
      }
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      onClick={handleCanvasClick}
      className="rounded-lg shadow-2xl bg-gray-800 cursor-pointer touch-none"
    />
  );
};

export default MastermindCanvas;
