import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { PegColor, RowData } from "../types";

const apiKey = process.env.API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const getGeminiHint = async (
  secret: PegColor[],
  history: RowData[],
  currentRow: number
): Promise<string> => {
  if (!ai) {
    console.warn("Gemini API Key is missing. AI hints are disabled.");
    return "I need an API Key to think! Check your .env setup.";
  }

  try {
    const model = 'gemini-2.0-flash-exp';

    // Construct a textual representation of the board state
    const colorMap = (c: PegColor) => {
      switch (c) {
        case PegColor.RED: return 'Red';
        case PegColor.GREEN: return 'Green';
        case PegColor.BLUE: return 'Blue';
        case PegColor.YELLOW: return 'Yellow';
        case PegColor.PURPLE: return 'Purple';
        case PegColor.CYAN: return 'Cyan';
        default: return 'Empty';
      }
    };

    const historyText = history
      .slice(0, currentRow)
      .map((row, i) => {
        const guessStr = row.pegs.map(colorMap).join(', ');
        const feedbackStr = `${row.feedback?.black || 0} Black, ${row.feedback?.white || 0} White`;
        return `Turn ${i + 1}: Guessed [${guessStr}] -> Result: ${feedbackStr}`;
      })
      .join('\n');

    const secretText = secret.map(colorMap).join(', ');

    const prompt = `
      You are a Mastermind game assistant. 
      The secret code is: [${secretText}].
      The player's history is:
      ${historyText || "No guesses yet."}

      Analyze the board. Provide a short, clever, and helpful hint for the player without revealing the code directly. 
      Focus on logic contradictions or a color they might be ignoring.
      Keep it under 20 words. Be witty.
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    return response.text?.trim() || "Trust your instincts!";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "My circuits are fuzzy... try again later.";
  }
};