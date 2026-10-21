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

export interface VoicePlaybackFeedback {
  onProgress?: (fraction: number) => void;
  onAudioLevel?: (level: number) => void;
}

class VoiceService {
  private isSpeaking = false;
  private generation = 0;
  private activePlayer: AudioPlayer | null = null;
  private activeFile: string | null = null;
  private subscriptions: { remove(): void }[] = [];
  private loadTimer: ReturnType<typeof setTimeout> | null = null;

  private releasePlayer() {
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.loadTimer = null;
    this.subscriptions.forEach((subscription) => subscription.remove());
    this.subscriptions = [];
    const player = this.activePlayer;
    this.activePlayer = null;
    try { player?.remove(); } catch {}
    const file = this.activeFile;
    this.activeFile = null;
    if (file) void FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {});
  }

  private async clearPlayback() {
    this.isSpeaking = false;
    this.releasePlayer();
    try { await Speech.stop(); } catch {}
  }

  /** Play neural audio; cancellation invalidates pending file writes and stale callbacks. */
  async speakNeural(
    audioBase64: string,
    onStart?: () => void,
    onDone?: () => void,
    onError?: (error: any) => void,
    feedback?: VoicePlaybackFeedback
  ): Promise<void> {
    const generation = ++this.generation;
    await this.clearPlayback();
    if (generation !== this.generation) return;
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled || generation !== this.generation) return;
      settled = true;
      this.isSpeaking = false;
      this.releasePlayer();
      feedback?.onAudioLevel?.(0);
      if (error) onError?.(error);
      else { feedback?.onProgress?.(1); onDone?.(); }
    };
    try {
      const tempUri = `${FileSystem.cacheDirectory}neural_${Date.now()}_${generation}.wav`;
      this.activeFile = tempUri;
      await FileSystem.writeAsStringAsync(tempUri, audioBase64, { encoding: FileSystem.EncodingType.Base64 });
      if (generation !== this.generation) {
        void FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
        return;
      }
      const player = createAudioPlayer({ uri: tempUri }, { updateInterval: 100, keepAudioSessionActive: true });
      this.activePlayer = player;
      let started = false;
      this.subscriptions.push(player.addListener('playbackStatusUpdate', (status) => {
        if (generation !== this.generation || settled) return;
        if (status.error) { finish(new Error(status.error)); return; }
        if ((status.playing || status.currentTime > 0) && !started) {
          started = true;
          if (this.loadTimer) clearTimeout(this.loadTimer);
          this.loadTimer = null;
          this.isSpeaking = true;
          onStart?.();
        }
        if (status.duration > 0) feedback?.onProgress?.(Math.min(1, status.currentTime / status.duration));
        if (
          status.didJustFinish ||
          (status.duration > 0 && status.currentTime >= status.duration && !status.playing)
        ) {
          finish();
        }
      }));
      this.loadTimer = setTimeout(() => {
        if (!started) finish(new Error('Audio playback could not start'));
      }, 6000);
      player.play();
    } catch (error) {
      finish(error);
    }
  }

  /** Device speech fallback shares cancellation and playback feedback with neural audio. */
  async speak(
    text: string,
    onStart?: () => void,
    onDone?: () => void,
    onError?: (error: any) => void,
    feedback?: VoicePlaybackFeedback
  ): Promise<void> {
    const generation = ++this.generation;
    await this.clearPlayback();
    if (generation !== this.generation) return;
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled || generation !== this.generation) return;
      settled = true;
      this.isSpeaking = false;
      feedback?.onAudioLevel?.(0);
      if (error) onError?.(error);
      else { feedback?.onProgress?.(1); onDone?.(); }
    };
    try {
      const cleanText = text
        .replace(/\[ACTION:[^\]]+\]/g, '')
        .replace(/\[VOICE_ACTION:[^\]]+\]/g, '')
        .replace(/[*#_`]/g, '')
        .trim();
      if (!cleanText) { finish(); return; }
      Speech.speak(cleanText, {
        language: 'en-US', pitch: 1, rate: 0.98,
        onStart: () => {
          if (generation !== this.generation || settled) return;
          this.isSpeaking = true;
          onStart?.();
        },
        onBoundary: (event: { charIndex: number; charLength?: number }) => {
          if (generation !== this.generation || settled) return;
          feedback?.onProgress?.(Math.min(1, (event.charIndex + (event.charLength || 0)) / cleanText.length));
        },
        onDone: () => finish(),
        onStopped: () => finish(),
        onError: (error) => finish(error),
      });
    } catch (error) { finish(error); }
  }

  /** Stop without firing callbacks from the interrupted response. */
  async stop(): Promise<void> {
    ++this.generation;
    await this.clearPlayback();
  }

  async isCurrentlySpeaking(): Promise<boolean> {
    return this.isSpeaking;
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
