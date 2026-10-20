import * as Speech from 'expo-speech';
import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

export interface VoiceAction {
  type: 'create_transaction' | 'check_balance' | 'check_budget' | 'navigate' | 'general_reply';
  payload?: any;
}

export interface VoiceParseResult {
  text: string;
  action?: VoiceAction;
}

class VoiceService {
  private isSpeaking = false;
  private activePlayer: AudioPlayer | null = null;

  /**
   * Play high-fidelity neural audio (Gemini Neural TTS) natively via expo-audio.
   */
  async speakNeural(
    audioBase64: string,
    onStart?: () => void,
    onDone?: () => void,
    onError?: (error: any) => void
  ): Promise<void> {
    try {
      await this.stop();
      this.isSpeaking = true;
      onStart?.();

      const tempUri = `${FileSystem.cacheDirectory}neural_${Date.now()}.wav`;
      await FileSystem.writeAsStringAsync(tempUri, audioBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const player = createAudioPlayer({ uri: tempUri });
      this.activePlayer = player;

      player.addListener('playbackStatusUpdate', (status) => {
        if (
          status.didJustFinish ||
          (status.duration > 0 && status.currentTime >= status.duration && !status.playing)
        ) {
          this.isSpeaking = false;
          this.activePlayer = null;
          onDone?.();
        }
      });

      player.play();
    } catch (err) {
      this.isSpeaking = false;
      this.activePlayer = null;
      onError?.(err);
    }
  }

  /**
   * Speak a message out loud to the user via Text-to-Speech (TTS).
   */
  async speak(
    text: string,
    onStart?: () => void,
    onDone?: () => void,
    onError?: (error: any) => void
  ): Promise<void> {
    try {
      // Clean interactive tags or markdown before reading out loud
      const cleanText = text
        .replace(/\[ACTION:[^\]]+\]/g, '')
        .replace(/\[VOICE_ACTION:[^\]]+\]/g, '')
        .replace(/[*#_`]/g, '')
        .trim();

      if (!cleanText) {
        onDone?.();
        return;
      }

      // Stop any active utterance first
      await this.stop();

      this.isSpeaking = true;
      Speech.speak(cleanText, {
        language: 'en-US',
        pitch: 1.0,
        rate: 0.98,
        onStart: () => {
          this.isSpeaking = true;
          onStart?.();
        },
        onDone: () => {
          this.isSpeaking = false;
          onDone?.();
        },
        onStopped: () => {
          this.isSpeaking = false;
          onDone?.();
        },
        onError: (err) => {
          this.isSpeaking = false;
          onError?.(err);
        },
      });
    } catch (e) {
      this.isSpeaking = false;
      onError?.(e);
    }
  }

  /**
   * Stop speech immediately (Barge-in when user speaks).
   */
  async stop(): Promise<void> {
    try {
      this.isSpeaking = false;
      if (this.activePlayer) {
        this.activePlayer.pause();
        this.activePlayer = null;
      }
      await Speech.stop();
    } catch (e) {
      // Ignore if not speaking
    }
  }

  /**
   * Check if the voice synthesizer is currently speaking.
   */
  async isCurrentlySpeaking(): Promise<boolean> {
    try {
      return await Speech.isSpeakingAsync();
    } catch (e) {
      return this.isSpeaking;
    }
  }

  /**
   * Parse spoken text for direct offline/client execution actions.
   * e.g. "log 50 cedis for lunch on momo" -> { type: 'create_transaction', payload: {...} }
   */
  parseSpokenIntent(text: string): VoiceAction {
    const lower = text.toLowerCase();

    // 1. Transaction intent patterns (e.g. "log 50 cedis for fuel", "spent 25 on lunch", "received 200 from kwame")
    const expenseMatch = lower.match(/(?:log|add|spent|pay|paid|record)\s+(?:an?\s+)?(?:expense\s+of\s+)?(?:ghs\s*|gh[¢c]\s*|cedis?\s*)?(\d+(?:\.\d{1,2})?)\s*(?:cedis?|ghs|gh[¢c])?\s*(?:for|on|as)?\s*([a-z0-9\s]+)?/i);
    const incomeMatch = lower.match(/(?:received|got|earned|deposit|deposited|add income of)\s+(?:ghs\s*|gh[¢c]\s*|cedis?\s*)?(\d+(?:\.\d{1,2})?)\s*(?:cedis?|ghs|gh[¢c])?\s*(?:from|for|as)?\s*([a-z0-9\s]+)?/i);

    if (expenseMatch) {
      const amount = parseFloat(expenseMatch[1]);
      const rawTarget = (expenseMatch[2] || '').trim();
      
      let accountType: 'mobile_money' | 'bank' | 'cash' = 'cash';
      if (lower.includes('momo') || lower.includes('mtn') || lower.includes('telecel') || lower.includes('at money')) {
        accountType = 'mobile_money';
      } else if (lower.includes('bank') || lower.includes('ecobank') || lower.includes('gcb') || lower.includes('stanbic')) {
        accountType = 'bank';
      }

      // Simple category classification
      let category = 'Other Expense';
      if (/food|lunch|dinner|breakfast|waakye|fufu|kfc|chop/i.test(rawTarget)) {
        category = 'Food & Dining';
      } else if (/fuel|petrol|diesel|uber|bolt|trotro|taxi|fare/i.test(rawTarget)) {
        category = 'Transportation';
      } else if (/light|water|ecg|gwcl|electricity|bill|utility/i.test(rawTarget)) {
        category = 'Utilities & Bills';
      } else if (/airtime|data|bundle|internet/i.test(rawTarget)) {
        category = 'Airtime & Internet';
      } else if (/family|mom|dad|sister|brother|wife|husband|child/i.test(rawTarget)) {
        category = 'Family & Support';
      }

      return {
        type: 'create_transaction',
        payload: {
          type: 'expense',
          amount,
          description: rawTarget || 'Voice expense',
          categoryName: category,
          accountType,
        },
      };
    }

    if (incomeMatch) {
      const amount = parseFloat(incomeMatch[1]);
      const rawTarget = (incomeMatch[2] || '').trim();
      return {
        type: 'create_transaction',
        payload: {
          type: 'income',
          amount,
          description: rawTarget || 'Voice income',
          categoryName: 'General Income',
          accountType: lower.includes('momo') ? 'mobile_money' : 'cash',
        },
      };
    }

    // 2. Balance & Budget queries
    if (/balance|how much do i have|how much money/i.test(lower)) {
      return { type: 'check_balance' };
    }
    if (/budget|how much left in my budget|spending limit/i.test(lower)) {
      return { type: 'check_budget' };
    }

    // 3. Navigation intents
    if (/take me to budgets|go to budget|open budget/i.test(lower)) {
      return { type: 'navigate', payload: { screen: 'Budgets' } };
    }
    if (/take me to transactions|go to history|open history/i.test(lower)) {
      return { type: 'navigate', payload: { screen: 'Transactions' } };
    }
    if (/add expense screen|open expense/i.test(lower)) {
      return { type: 'navigate', payload: { screen: 'AddTransaction' } };
    }

    return { type: 'general_reply' };
  }
}

export const voiceService = new VoiceService();
