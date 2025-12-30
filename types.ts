export enum GameMode {
  MENU = 'MENU',
  SETUP_2P = 'SETUP_2P', // Player 1 setting code
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER'
}

export enum PegColor {
  RED = '#EF4444',
  GREEN = '#22C55E',
  BLUE = '#3B82F6',
  YELLOW = '#EAB308',
  PURPLE = '#A855F7',
  CYAN = '#06B6D4',
  EMPTY = '#374151' // Gray-700
}

export interface Feedback {
  black: number; // Correct color and position
  white: number; // Correct color, wrong position
}

export interface RowData {
  pegs: PegColor[];
  feedback: Feedback | null;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  size: number;
  drag: number; // New property for air resistance
}

export interface GameStats {
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
}
