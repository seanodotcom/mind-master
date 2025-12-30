import { PegColor, Feedback } from '../types';

export const calculateFeedback = (secret: PegColor[], guess: PegColor[]): Feedback => {
  let black = 0;
  let white = 0;
  
  const secretCopy = [...secret];
  const guessCopy = [...guess];

  // First pass: Check for exact matches (Black pegs)
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secret[i]) {
      black++;
      secretCopy[i] = PegColor.EMPTY; // Mark as used
      guessCopy[i] = PegColor.EMPTY;
    }
  }

  // Second pass: Check for color matches in wrong position (White pegs)
  for (let i = 0; i < guess.length; i++) {
    if (guessCopy[i] !== PegColor.EMPTY) {
      const foundIndex = secretCopy.findIndex(c => c === guessCopy[i]);
      if (foundIndex !== -1) {
        white++;
        secretCopy[foundIndex] = PegColor.EMPTY; // Mark as used
      }
    }
  }

  return { black, white };
};

export const generateSecret = (colors: PegColor[], length: number): PegColor[] => {
  const secret: PegColor[] = [];
  for (let i = 0; i < length; i++) {
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    secret.push(randomColor);
  }
  return secret;
};
