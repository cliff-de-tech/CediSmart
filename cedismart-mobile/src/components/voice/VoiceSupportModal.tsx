import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TextInputInstance,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Dimensions,
  ScrollView,
  ScrollViewInstance,
  Platform,
  KeyboardAvoidingView,
  Alert,
  Image,
  AppState,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { BlurView } from 'expo-blur';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import {
  Mic,
  MicOff,
  X,
  Plus,
  Send,
  CheckCircle2,
  Camera,
  ImageIcon,
  Paperclip,
  MessageSquare,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Volume2,
} from 'lucide-react-native';
import {
  useAudioStream,
  AudioStreamBuffer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { VoiceOrb, VoiceState } from './VoiceOrb';
import { voiceService, VoicePlaybackFeedback } from '../../services/voiceService';
import {
  recognitionError,
  VOICE_RECOGNITION_TIMEOUT_MS,
  VOICE_SYNTHESIS_TIMEOUT_MS,
} from '../../services/voiceSession';
import { VoiceCapture } from '../../services/voiceCapture';
import { GlassSurface } from '../glass/GlassSurface';
import { useThemeStore } from '../../stores/themeStore';
import { useAuthStore } from '../../stores/authStore';
import apiClient from '../../api/client';
import { formatGHS } from '../../utils/currency';
import { Message } from '../shared/SupportModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
import {
  PRECACHED_BRIDGES,
  VoiceBridgeType,
} from '../../assets/audio/precachedBridges';

let lastBridgeIndex = -1;
const getPrecachedBridge = (type: VoiceBridgeType, persona: VoicePersona) => {
  const personaPool = PRECACHED_BRIDGES[persona] || PRECACHED_BRIDGES.akosua;
  const pool = personaPool[type] || personaPool.balance;
  if (!pool || pool.length === 0) return null;
  let nextIdx = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && nextIdx === lastBridgeIndex) {
    nextIdx = (nextIdx + 1) % pool.length;
  }
  lastBridgeIndex = nextIdx;
  return pool[nextIdx];
};

// Helper to filter out silence artifacts, background noise, or model timestamp hallucinations (e.g. "00:00")
const isInvalidTranscript = (text: string) => {
  if (!text) return true;
  const cleaned = text.trim();
  if (cleaned === 'Voice note received') return true;
  if (/^\[?\(?\d{1,2}:\d{2}(\.\d+)?\)?\]?$/.test(cleaned)) return true;
  if (/^<[^>]+>$/.test(cleaned) || /^\([^)]+\)$/.test(cleaned) || /^\[[^\]]+\]$/.test(cleaned)) return true;
  if (/^[\s.,!?;:-]+$/.test(cleaned)) return true;
  return false;
};

export type VoicePersona = 'akosua' | 'kwame' | 'esi';

export const VOICE_PERSONAS: Record<
  VoicePersona,
  { name: string; label: string; gender: 'female' | 'male'; desc: string }
> = {
  akosua: { name: 'Akosua', label: '👩 Akosua', gender: 'female', desc: 'Warm Female' },
  kwame: { name: 'Kwame', label: '👨 Kwame', gender: 'male', desc: 'Confident Male' },
  esi: { name: 'Esi', label: '👩 Esi', gender: 'female', desc: 'Energetic Female' },
};

export interface VoiceSupportModalProps {
  visible: boolean;
  onClose: () => void;
  messages: Message[];
  onAddMessage: (msg: Message) => void;
  userName?: string;
  phone?: string;
  initialContext?: string;
  navigation?: any;
}

const { width } = Dimensions.get('window');

export const VoiceSupportModal: React.FC<VoiceSupportModalProps> = ({
  visible,
  onClose,
  messages,
  onAddMessage,
  userName,
  phone,
  initialContext = 'dashboard',
  navigation,
}) => {
  const theme = useThemeStore((state) => state.theme);
  const user = useAuthStore((state) => state.user);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const scrollViewRef = useRef<ScrollViewInstance>(null);
  const voiceInputRef = useRef<TextInputInstance>(null);

  const { stream } = useAudioStream({
    sampleRate: 16000,
    channels: 1,
    encoding: 'float32',
    onBuffer: (buffer) => handleMicrophoneBuffer(buffer),
  });

  // Voice Interaction States
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [isCompactView, setIsCompactView] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [dynamicStatus, setDynamicStatus] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showVoiceSubmenu, setShowVoiceSubmenu] = useState(false);
  const [attachedImage, setAttachedImage] = useState<{
    uri: string;
    base64: string;
    mimeType: string;
    name?: string;
  } | null>(null);

  // In-Voice Typing States (allows typing inside voice mode without closing)
  const [isTypingInVoice, setIsTypingInVoice] = useState(false);
  const [voiceInputText, setVoiceInputText] = useState('');

  // CFO Intelligence, Dialect & Voice Persona Preferences
  const [language, setLanguage] = useState<'en' | 'pidgin' | 'twi'>('en');
  const [voicePersona, setVoicePersona] = useState<VoicePersona>('akosua');
  const [autoPilot, setAutoPilot] = useState<boolean>(false);
  const [deepAudit, setDeepAudit] = useState<boolean>(false);

  useEffect(() => {
    if (!visible) return;
    const loadPreferences = async () => {
      try {
        const [savedLang, savedAutoPilot, savedDeepAudit, savedVoicePersona] = await Promise.all([
          AsyncStorage.getItem('cedismart_ai_language'),
          AsyncStorage.getItem('cedismart_ai_autopilot'),
          AsyncStorage.getItem('cedismart_ai_deep_audit'),
          AsyncStorage.getItem('cedismart_voice_persona'),
        ]);
        if (savedLang === 'en' || savedLang === 'pidgin' || savedLang === 'twi') {
          setLanguage(savedLang);
        }
        if (
          savedVoicePersona === 'akosua' ||
          savedVoicePersona === 'kwame' ||
          savedVoicePersona === 'esi'
        ) {
          setVoicePersona(savedVoicePersona);
        }
        if (savedAutoPilot !== null) setAutoPilot(savedAutoPilot === 'true');
        if (savedDeepAudit !== null) setDeepAudit(savedDeepAudit === 'true');
      } catch {}
    };
    void loadPreferences();
  }, [visible]);

  const handleCycleVoicePersona = async () => {
    const nextPersona: VoicePersona =
      voicePersona === 'akosua' ? 'kwame' : voicePersona === 'kwame' ? 'esi' : 'akosua';
    setVoicePersona(nextPersona);
    Haptics.selectionAsync().catch(() => {});
    try {
      await AsyncStorage.setItem('cedismart_voice_persona', nextPersona);
    } catch {}
  };

  // Attachment Handlers for ChatGPT-style '+' Menu inside Voice Mode
  const handleLaunchCamera = async () => {
    setShowAttachMenu(false);
    Haptics.selectionAsync().catch(() => {});
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Please allow camera access in your device settings.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.65,
        base64: true,
      });
      if (!res.canceled && res.assets[0]?.base64) {
        setAttachedImage({
          uri: res.assets[0].uri,
          base64: res.assets[0].base64,
          mimeType: res.assets[0].mimeType || 'image/jpeg',
          name: 'Camera Photo',
        });
        setIsTypingInVoice(true);
        setIsCompactView(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (e) {
      console.warn('[VoiceSupport] Camera error:', e);
    }
  };

  const handlePickPhotos = async () => {
    setShowAttachMenu(false);
    Haptics.selectionAsync().catch(() => {});
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Please allow photo library access in your device settings.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.65,
        base64: true,
      });
      if (!res.canceled && res.assets[0]?.base64) {
        setAttachedImage({
          uri: res.assets[0].uri,
          base64: res.assets[0].base64,
          mimeType: res.assets[0].mimeType || 'image/jpeg',
          name: res.assets[0].fileName || 'Photo',
        });
        setIsTypingInVoice(true);
        setIsCompactView(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (e) {
      console.warn('[VoiceSupport] Photo picker error:', e);
    }
  };

  const handlePickDocument = async () => {
    setShowAttachMenu(false);
    Haptics.selectionAsync().catch(() => {});
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf', 'text/plain'],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        const file = res.assets[0];
        const b64 = await FileSystem.readAsStringAsync(file.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        setAttachedImage({
          uri: file.uri,
          base64: b64,
          mimeType: file.mimeType || 'application/octet-stream',
          name: file.name,
        });
        setIsTypingInVoice(true);
        setIsCompactView(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (e) {
      console.warn('[VoiceSupport] Document picker error:', e);
    }
  };

  // Playback-driven captions and session guards; no synthetic typewriter timer.
  const [streamingAiText, setStreamingAiText] = useState('');
  const captureRef = useRef(new VoiceCapture());
  const captureActiveRef = useRef(false);
  const lastBufferAtRef = useRef(0);
  const microphoneRestartsRef = useRef(0);
  const retryReplyRef = useRef<string | null>(null);
  const isProcessingRef = useRef(false);
  const activeRef = useRef(false);
  const turnRef = useRef(0);
  const requestRef = useRef<AbortController | null>(null);
  const microphoneStartingRef = useRef<Promise<void> | null>(null);
  const microphonePermissionRef = useRef(false);
  const mutedRef = useRef(isMuted);
  const typingRef = useRef(isTypingInVoice);
  const messagesRef = useRef(messages);
  const voiceStateRef = useRef(voiceState);
  const retryAudioRef = useRef<string | null>(null);
  const microphoneStopRef = useRef<Promise<void> | null>(null);
  mutedRef.current = isMuted;
  typingRef.current = isTypingInVoice || showAttachMenu;
  messagesRef.current = messages;
  voiceStateRef.current = voiceState;

  const isCurrentTurn = (turn: number) => activeRef.current && turnRef.current === turn;
  const canListen = () => activeRef.current && !mutedRef.current && !typingRef.current && !isProcessingRef.current;

  // Fetch accounts & categories for intelligent ledger actions
  const { data: accounts } = useQuery<any[]>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await apiClient.get('/accounts/');
      return res.data;
    },
    enabled: visible,
  });

  const { data: categories } = useQuery<any[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await apiClient.get('/categories/');
      return res.data;
    },
    enabled: visible,
  });

  const stopMicrophone = () => {
    captureActiveRef.current = false;
    if (microphoneStopRef.current) return microphoneStopRef.current;
    const stopping = (async () => {
      try {
        await microphoneStartingRef.current;
        stream.stop();
      } catch {}
      setAudioLevel(0);
    })();
    microphoneStopRef.current = stopping;
    void stopping.finally(() => {
      if (microphoneStopRef.current === stopping) microphoneStopRef.current = null;
    });
    return stopping;
  };

  const cleanupVoiceSession = async () => {
    activeRef.current = false;
    ++turnRef.current;
    requestRef.current?.abort();
    requestRef.current = null;
    isProcessingRef.current = false;
    setDynamicStatus(null);
    captureRef.current = new VoiceCapture();
    retryAudioRef.current = null;
    retryReplyRef.current = null;
    void voiceService.stop();
    await stopMicrophone();
  };

  const startListeningLoop = async () => {
    if (!canListen()) return;
    await microphoneStopRef.current;
    if (!canListen() || microphoneStartingRef.current || stream.isStreaming) return;
    const turn = turnRef.current;
    const start = async () => {
      try {
        if (!microphonePermissionRef.current) {
          const permission = await requestRecordingPermissionsAsync();
          if (!isCurrentTurn(turn) || !canListen()) return;
          microphonePermissionRef.current = permission.granted;
          setPermissionDenied(!permission.granted);
          if (!permission.granted) {
            setVoiceError('Microphone access is off. Enable it in settings, or type your message.');
            setVoiceState('idle');
            return;
          }
        }
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: true,
          shouldRouteThroughEarpiece: false,
          interruptionMode: 'mixWithOthers',
        });
        if (!isCurrentTurn(turn) || !canListen()) return;
        captureRef.current = new VoiceCapture();
        captureActiveRef.current = true;
        lastBufferAtRef.current = Date.now();
        await stream.start();
        if (!isCurrentTurn(turn) || !canListen()) {
          captureActiveRef.current = false;
          stream.stop();
          return;
        }
        setVoiceError(null);
        setVoiceState('listening');
      } catch (error: any) {
        if (!isCurrentTurn(turn)) return;
        captureActiveRef.current = false;
        console.warn('[VoiceSupport] Microphone start failed', { code: error.code });
        setVoiceState('idle');
        setVoiceError('The microphone could not start. Try again, or type your message.');
      }
    };
    const pending = start();
    microphoneStartingRef.current = pending;
    try { await pending; } finally {
      if (microphoneStartingRef.current === pending) microphoneStartingRef.current = null;
    }
  };

  // Opening voice is ready-to-listen, without a network round trip for a greeting.
  useEffect(() => {
    if (!visible) return;
    activeRef.current = true;
    mutedRef.current = false;
    typingRef.current = false;
    isProcessingRef.current = false;
    setIsMuted(false);
    microphoneRestartsRef.current = 0;
    setIsTypingInVoice(false);
    setIsCompactView(false);
    setVoiceError(null);
    setActionToast(null);
    retryAudioRef.current = null;
    retryReplyRef.current = null;
    setStreamingAiText('');
    setVoiceState('idle');
    void startListeningLoop();
    return () => { void cleanupVoiceSession(); };
  }, [visible]);

  // Do not leave a microphone or a delayed response running when the app is backgrounded.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'background' || !activeRef.current) return;
      mutedRef.current = true;
      setIsMuted(true);
      ++turnRef.current;
      requestRef.current?.abort();
      isProcessingRef.current = false;
      void voiceService.stop();
      void stopMicrophone();
      setVoiceState('idle');
    });
    return () => subscription.remove();
  }, []);

  // Typing/attachments and microphone capture are mutually exclusive.
  useEffect(() => {
    if (isTypingInVoice || showAttachMenu) {
      typingRef.current = true;
      void stopMicrophone();
    } else {
      typingRef.current = false;
      void startListeningLoop();
    }
  }, [isTypingInVoice, showAttachMenu]);

  // Process real PCM samples directly: React renders cannot consume microphone levels.
  const handleMicrophoneBuffer = (buffer: AudioStreamBuffer) => {
    if (!captureActiveRef.current || !canListen()) return;
    lastBufferAtRef.current = Date.now();
    try {
      const detection = captureRef.current.append(buffer);
      setAudioLevel(detection.level);
      if (detection.shouldSend) {
        console.info('[VoiceSupport] Automatic speech submission', {
          durationMs: Math.round(detection.durationMillis), sampleRate: buffer.sampleRate,
        });
        void stopAndProcessAudio();
      } else if (detection.timedOut) {
        // Stay hands-free through silence. Bound memory without turning off listening.
        captureRef.current = new VoiceCapture();
      }
    } catch {
      void stopMicrophone();
      setVoiceState('idle');
      setVoiceError('The microphone audio could not be read. Please reopen voice mode.');
    }
  };

  useEffect(() => {
    if (!visible) return;
    const watchdog = setInterval(() => {
      if (!captureActiveRef.current || !canListen() || microphoneStartingRef.current ||
          Date.now() - lastBufferAtRef.current < 4000) return;
      captureActiveRef.current = false;
      console.warn('[VoiceSupport] Microphone stopped delivering audio');
      void stopMicrophone().then(() => {
        if (!canListen()) return;
        if (microphoneRestartsRef.current++ < 2) {
          void startListeningLoop();
        } else {
          setVoiceState('idle');
          setVoiceError('The microphone is not delivering audio. Check microphone access and close other apps using it.');
        }
      });
    }, 1000);
    return () => clearInterval(watchdog);
  }, [visible]);

  const synthesizeReply = async (reply: string, signal: AbortSignal): Promise<string | null> => {
    const startedAt = Date.now();
    try {
      const response = await apiClient.post('/support/voice/synthesize', {
        text: reply,
        voice_name: 'Kore',
        voice_persona: voicePersona,
      }, { timeout: VOICE_SYNTHESIS_TIMEOUT_MS, signal });
      if (!response.data?.audio_base64) throw new Error('missing_audio');
      return response.data.audio_base64;
    } catch (error: any) {
      if (!signal.aborted) console.warn('[VoiceSupport] Synthesis failed', {
        status: error.response?.status, code: error.code, elapsedMs: Date.now() - startedAt,
      });
      return null;
    }
  };

  const playBridgePhrase = (text: string, audioB64: string, turn: number): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (!isCurrentTurn(turn)) { resolve(); return; }
      setVoiceState('speaking');
      setDynamicStatus('Speaking…');
      setStreamingAiText(text);
      void voiceService.speakNeural(
        audioB64,
        () => {
          if (isCurrentTurn(turn)) {
            setVoiceState('speaking');
            setDynamicStatus('Speaking…');
          }
        },
        () => { resolve(); },
        () => { resolve(); }
      );
    });
  };

  const playResponse = async (reply: string, neuralAudio: string | null, turn: number) => {
    if (!isCurrentTurn(turn)) return;
    const feedback: VoicePlaybackFeedback = {
      onProgress: (fraction) => {
        if (!isCurrentTurn(turn)) return;
        const words = reply.split(/\s+/);
        setStreamingAiText(words.slice(0, Math.max(1, Math.ceil(words.length * fraction))).join(' '));
      },
      onAudioLevel: (level) => { if (isCurrentTurn(turn)) setAudioLevel(level); },
    };
    const started = () => {
      if (isCurrentTurn(turn)) {
        setVoiceState('speaking');
        setDynamicStatus('Speaking…');
      }
    };
    const done = () => {
      if (!isCurrentTurn(turn)) return;
      retryReplyRef.current = null;
      setStreamingAiText(reply);
      isProcessingRef.current = false;
      setDynamicStatus(null);
      setAudioLevel(0);
      setVoiceState('idle');
      void startListeningLoop();
    };
    const failed = () => {
      if (!isCurrentTurn(turn)) return;
      isProcessingRef.current = false;
      setDynamicStatus(null);
      setVoiceState('idle');
      retryReplyRef.current = reply;
      setStreamingAiText(reply);
      setVoiceError('Natural voice is unavailable. Your answer is below. Tap Retry voice to try again.');
      setIsCompactView(true);
    };
    setStreamingAiText('');
    if (neuralAudio) void voiceService.speakNeural(neuralAudio, started, done, failed, feedback);
    else failed();
  };

  const retryNaturalVoice = async () => {
    const reply = retryReplyRef.current;
    if (!reply || !activeRef.current || isProcessingRef.current) return;
    isProcessingRef.current = true;
    const turn = ++turnRef.current;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setVoiceError(null);
    setVoiceState('thinking');
    setDynamicStatus('Getting voice ready…');
    await stopMicrophone();
    if (!isCurrentTurn(turn)) return;
    const audio = await synthesizeReply(reply, controller.signal);
    if (isCurrentTurn(turn)) await playResponse(reply, audio, turn);
  };

  /**
   * Stop recording and send audio to backend for transcription and action execution
   */
  const stopAndProcessAudio = async (retryAudio?: string) => {
    if (!activeRef.current || isProcessingRef.current) return;
    isProcessingRef.current = true;
    const turn = ++turnRef.current;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setVoiceError(null);
    retryReplyRef.current = null;
    const requestStartedAt = Date.now();

    setVoiceState('thinking');
    setDynamicStatus('Understanding…');
    setAudioLevel(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    try {
      await stopMicrophone();
      if (!isCurrentTurn(turn)) return;
      const base64Audio = retryAudio || captureRef.current.toWavBase64();
      captureRef.current = new VoiceCapture();
      if (!isCurrentTurn(turn)) return;
      retryAudioRef.current = base64Audio;

      // Send to backend /support/voice endpoint
      const cleanName = (userName || '').replace(/^(mr|mrs|ms|dr|rev|prof)\.?\s+/i, '').trim().split(' ')[0];
      const res = await apiClient.post('/support/voice', {
        audio_base64: base64Audio,
        audio_mime_type: 'audio/wav',
        user_name: cleanName || userName,
        phone: phone || 'Anonymous',
        initial_context: initialContext,
        synthesize_audio: true,
        messages: messagesRef.current.slice(-12).map(({ role, content }) => ({ role, content })),
        language,
        voice_persona: voicePersona,
        auto_pilot: autoPilot,
        deep_audit: deepAudit,
      }, { signal: controller.signal, timeout: VOICE_RECOGNITION_TIMEOUT_MS });
      if (!isCurrentTurn(turn)) return;

      const recognitionFailure = recognitionError(res.data);
      if (recognitionFailure) {
        isProcessingRef.current = false;
        setDynamicStatus(null);
        setVoiceState('idle');
        setVoiceError(recognitionFailure);
        return;
      }
      // Clear the retry buffer before executing any action; never replay financial actions.
      retryAudioRef.current = null;
      const transcript = res.data?.transcript || '';
      let reply = res.data?.response || "I'm listening, go ahead.";
      let neuralAudioB64: string | null = res.data?.audio_base64 || null;
      const action = res.data?.action;

      // Filter out empty background noise or timestamp hallucinations (e.g. "00:00")
      const hasValidSpeech = !isInvalidTranscript(transcript);

      if (!hasValidSpeech) {
        // Do not mistake an empty transcript for a successful conversation.
        isProcessingRef.current = false;
        setDynamicStatus(null);
        setVoiceState('idle');
        // A noise-only turn should not require the user to touch the screen.
        void startListeningLoop();
        return;
      }

      // Append user transcription directly to shared conversation thread
      if (hasValidSpeech) {
        const userMsg: Message = {
          id: 'msg-' + Date.now(),
          role: 'user',
          content: transcript,
          status: 'sent',
          actions: [],
        };
        onAddMessage(userMsg);
      }

      // Execute detected voice action with parallel verbal bridge playback
      if (action && action.type === 'create_transaction' && action.payload) {
        setDynamicStatus('Recording expense…');
        const bridge = neuralAudioB64
          ? { text: reply, base64: neuralAudioB64 }
          : getPrecachedBridge('expense', voicePersona);
        const bridgePromise = bridge
          ? playBridgePhrase(bridge.text, bridge.base64, turn)
          : Promise.resolve();
        const actionPromise = handleExecuteVoiceTransaction(action.payload, turn);
        const [_, outcomeText] = await Promise.all([bridgePromise, actionPromise]);
        if (!isCurrentTurn(turn)) return;
        reply = outcomeText;
        neuralAudioB64 = null;
      } else if (action && action.type === 'check_balance') {
        setDynamicStatus('Checking your balances…');
        const bridge = neuralAudioB64
          ? { text: reply, base64: neuralAudioB64 }
          : getPrecachedBridge('balance', voicePersona);
        const bridgePromise = bridge
          ? playBridgePhrase(bridge.text, bridge.base64, turn)
          : Promise.resolve();
        const fetchPromise = (async () => {
          setActionToast(null);
          try {
            const latestAccounts = await queryClient.fetchQuery<any[]>({
              queryKey: ['accounts'],
              queryFn: async () => {
                const accountResponse = await apiClient.get('/accounts/');
                return accountResponse.data;
              },
              staleTime: 0,
              retry: false,
            });
            if (!Array.isArray(latestAccounts)) throw new Error('Invalid accounts response');
            const activeAccounts = latestAccounts.filter((account) => account.is_active !== false);
            const totalBalance = activeAccounts.reduce((sum, account) => {
              const rawBalance = account.balance;
              const balance = Number(rawBalance);
              if (
                (typeof rawBalance !== 'number' && typeof rawBalance !== 'string') ||
                (typeof rawBalance === 'string' && !rawBalance.trim()) ||
                !Number.isFinite(balance)
              ) throw new Error('Invalid account balance');
              return sum + balance;
            }, 0);
            if (!Number.isFinite(totalBalance)) throw new Error('Invalid total balance');

            const walletCount = activeAccounts.length;
            const walletLabel = walletCount === 1 ? 'wallet' : 'wallets';
            const formattedBalance = formatGHS(totalBalance);
            // Spell out the currency so speech engines don't read the cedi symbol as cents.
            const spokenAmount = formattedBalance.replace(/[₵\s]/g, '').replace(/^-/, 'minus ');
            return walletCount === 0
              ? "You don't have any active wallets set up yet."
              : `Your total tracked balance is ${spokenAmount} Ghana cedis across ${walletCount} active ${walletLabel}.`;
          } catch {
            return "I couldn't retrieve your balance right now. Please check your connection and try again.";
          }
        })();
        const [_, balanceText] = await Promise.all([bridgePromise, fetchPromise]);
        if (!isCurrentTurn(turn)) return;
        reply = balanceText;
        neuralAudioB64 = null;
      } else if (action && action.type === 'check_budget') {
        setDynamicStatus('Checking your budgets…');
        const bridge = neuralAudioB64
          ? { text: reply, base64: neuralAudioB64 }
          : getPrecachedBridge('budget', voicePersona);
        const bridgePromise = bridge
          ? playBridgePhrase(bridge.text, bridge.base64, turn)
          : Promise.resolve();
        const budgetPromise = (async () => {
          setActionToast(null);
          try {
            const latestBudgets = await queryClient.fetchQuery<any[]>({
              queryKey: ['budgets', user?.id],
              queryFn: async () => {
                const res = await apiClient.get('/budgets/');
                return res.data;
              },
              staleTime: 0,
              retry: false,
            });
            if (!Array.isArray(latestBudgets) || latestBudgets.length === 0) {
              return "You don't have any budgets set for this month yet. You can set one up in the Budgets tab.";
            }
            // Field names match BudgetResponse in cedismart-api/app/modules/budgets/schemas.py.
            const totals = latestBudgets.reduce(
              (acc, curr) => {
                const budgeted = Number(curr.budgeted_amount);
                const spent = Number(curr.spent_amount);
                if (!Number.isFinite(budgeted) || !Number.isFinite(spent)) throw new Error('Invalid budget amounts');
                return { budgeted: acc.budgeted + budgeted, spent: acc.spent + spent };
              },
              { budgeted: 0, spent: 0 }
            );
            const pct = totals.budgeted > 0 ? Math.round((totals.spent / totals.budgeted) * 100) : 0;
            const toSpoken = (value: number) => formatGHS(value).replace(/[₵\s]/g, '');
            const spentSpoken = toSpoken(totals.spent);
            const budgetedSpoken = toSpoken(totals.budgeted);
            if (totals.spent > totals.budgeted) {
              return `You have spent ${spentSpoken} Ghana cedis against a ${budgetedSpoken} cedi budget this month. That is ${toSpoken(totals.spent - totals.budgeted)} cedis over.`;
            } else {
              return `You have spent ${spentSpoken} Ghana cedis of your ${budgetedSpoken} cedi budget this month, about ${pct} percent. ${toSpoken(totals.budgeted - totals.spent)} cedis remain.`;
            }
          } catch {
            return "I couldn't retrieve your budget right now. Please check your connection and try again.";
          }
        })();
        const [_, budgetText] = await Promise.all([bridgePromise, budgetPromise]);
        if (!isCurrentTurn(turn)) return;
        reply = budgetText;
        neuralAudioB64 = null;
      } else if (action && action.type === 'check_reports') {
        setDynamicStatus('Checking your financial report…');
        const bridge = neuralAudioB64
          ? { text: reply, base64: neuralAudioB64 }
          : getPrecachedBridge('report', voicePersona);
        const bridgePromise = bridge
          ? playBridgePhrase(bridge.text, bridge.base64, turn)
          : Promise.resolve();
        const reportPromise = (async () => {
          setActionToast(null);
          try {
            const now = new Date();
            const res = await apiClient.get('/reports/monthly', {
              params: { year: now.getFullYear(), month: now.getMonth() + 1 },
            });
            const data = res.data;
            if (!data) return "You don't have any recorded transactions for this month's report yet.";
            const inc = Number(data.total_income || 0);
            const exp = Number(data.total_expense || 0);
            const topCat = data.top_expense_category?.name;
            const topCatAmt = data.top_expense_category?.amount ? Number(data.top_expense_category.amount) : 0;
            const topCatStr = topCat ? `, with ${topCat} being your top expense at ${topCatAmt.toFixed(0)} Cedis` : '';
            return `This month, your total income is ${inc.toFixed(0)} Ghana Cedis and total spending is ${exp.toFixed(0)} Cedis${topCatStr}.`;
          } catch {
            return "I couldn't pull up your report right now. Please check your connection and try again.";
          }
        })();
        const [_, reportText] = await Promise.all([bridgePromise, reportPromise]);
        if (!isCurrentTurn(turn)) return;
        reply = reportText;
        neuralAudioB64 = null;
      }

      if (!isCurrentTurn(turn)) return;
      // Append AI response to shared conversation thread
      const aiMsg: Message = {
        id: 'ai-' + Date.now(),
        role: 'model',
        content: reply,
        status: 'sent',
        actions: [],
      };
      onAddMessage(aiMsg);
      // Generate speech only after any action result is known.
      if (!isCurrentTurn(turn)) return;
      if (!neuralAudioB64) {
        setDynamicStatus('Getting voice ready…');
        neuralAudioB64 = await synthesizeReply(reply, controller.signal);
      }

      if (!isCurrentTurn(turn)) return;
      await playResponse(reply, neuralAudioB64, turn);
    } catch (error: any) {
      if (!isCurrentTurn(turn) || controller.signal.aborted) return;
      console.warn('[VoiceSupport] Recognition failed', {
        status: error.response?.status, code: error.code, elapsedMs: Date.now() - requestStartedAt,
      });
      isProcessingRef.current = false;
      setDynamicStatus(null);
      setVoiceState('idle');
      setVoiceError(retryAudioRef.current
        ? 'Connection interrupted. Your recording is ready to retry.'
        : 'The voice request could not finish. Try again or type your message.');
      setIsCompactView(true);
    }
  };

  /**
   * Handle user typing in Voice Mode (remains in Voice Mode and receives vocal response!)
   */
  const handleSendTypedInVoice = async () => {
    const text = voiceInputText.trim() || (attachedImage ? 'Please help me with this attachment.' : '');
    if (!text || isProcessingRef.current) return;

    isProcessingRef.current = true;
    const turn = ++turnRef.current;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setVoiceError(null);
    retryReplyRef.current = null;
    retryAudioRef.current = null;
    await voiceService.stop();
    await stopMicrophone();
    if (!isCurrentTurn(turn)) return;
    setVoiceInputText('');
    setIsTypingInVoice(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    const currentAttachment = attachedImage;
    setAttachedImage(null);

    // 1. Add user message to shared conversation thread
    const userMsg: Message = {
      id: 'msg-' + Date.now(),
      role: 'user',
      content: currentAttachment ? `[Attached: ${currentAttachment.name || 'File'}]\n${text}` : text,
      status: 'sent',
      actions: [],
      image_base64: currentAttachment?.base64,
    };
    onAddMessage(userMsg);
    setVoiceState('thinking');

    try {
      // 2. Query chat response
      const cleanName = (userName || '').replace(/^(mr|mrs|ms|dr|rev|prof)\.?\s+/i, '').trim().split(' ')[0];
      const chatPayload: any = {
        messages: [...messagesRef.current.slice(-12).map(({ role, content }) => ({ role, content })), { role: 'user', content: `[VOICE_MODE: Speak concisely in 1-2 short sentences] ${text}` }],
        phone: phone || 'Anonymous',
        user_name: cleanName || userName,
        support_type: 'general',
        language: language,
        auto_pilot: autoPilot,
        deep_audit: deepAudit,
      };
      if (currentAttachment) {
        chatPayload.image_base64 = currentAttachment.base64;
        chatPayload.image_mime_type = currentAttachment.mimeType;
      }
      const chatRes = await apiClient.post('/support/chat', chatPayload, { signal: controller.signal });
      if (!isCurrentTurn(turn)) return;

      const reply = chatRes.data?.response || "I'm listening, go ahead.";

      // 4. Add AI response to shared conversation thread
      const aiMsg: Message = {
        id: 'ai-' + Date.now(),
        role: 'model',
        content: reply,
        status: 'sent',
        actions: [],
      };
      onAddMessage(aiMsg);
      setDynamicStatus('Getting voice ready…');
      const neuralAudioB64 = await synthesizeReply(reply, controller.signal);
      if (!isCurrentTurn(turn)) return;
      await playResponse(reply, neuralAudioB64, turn);
    } catch {
      if (!isCurrentTurn(turn) || controller.signal.aborted) return;
      isProcessingRef.current = false;
      setDynamicStatus(null);
      setVoiceState('idle');
      setVoiceInputText(text);
      setAttachedImage(currentAttachment);
      typingRef.current = true;
      setIsTypingInVoice(true);
      setVoiceError('Your message could not be sent. It is ready to retry.');
    }
  };

  /**
   * Execute voice-parsed transaction against backend
   */
  const handleExecuteVoiceTransaction = async (payload: any, turn: number): Promise<string> => {
    try {
      const numericAmount = typeof payload.amount === 'number' ? payload.amount : parseFloat(payload.amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return 'What amount would you like me to record? Please say the amount in cedis.';
      }

      // Ensure accounts are loaded
      let accList = accounts;
      if (!accList || accList.length === 0) {
        try {
          const res = await apiClient.get('/accounts/');
          accList = res.data;
        } catch {}
      }

      if (!isCurrentTurn(turn)) return '';
      const matchingAccounts = (accList || []).filter((account: any) => account.is_active !== false && account.account_type === payload.account_type);
      if (matchingAccounts.length !== 1) {
        return 'I need one specific wallet to record this. Please use the expense form to choose your wallet.';
      }
      const targetAccountId = matchingAccounts[0].id;

      // Ensure categories are loaded
      let catList = categories;
      if (!catList || catList.length === 0) {
        try {
          const res = await apiClient.get('/categories/');
          catList = res.data;
        } catch {}
      }

      if (!isCurrentTurn(turn)) return '';
      let targetCategoryId: string | undefined;
      if (catList && catList.length > 0) {
        const payloadCat = (payload.category || '').toLowerCase();
        const matchedCategories = catList.filter((c: any) => {
          const cName = (c.name || '').toLowerCase();
          return !!payloadCat && !!cName && (cName === payloadCat || cName.includes(payloadCat) || payloadCat.includes(cName));
        });
        if (matchedCategories.length === 1) targetCategoryId = matchedCategories[0].id;
      }

      if (!targetAccountId || !targetCategoryId) {
        console.warn('[VoiceSupport] Missing targetAccountId or targetCategoryId:', { targetAccountId, targetCategoryId });
        setActionToast({
          title: 'Could not record expense',
          description: 'No active wallet or category found.',
        });
        return 'I could not identify the wallet or category. Please use the expense form to choose them.';
      }

      const txDateStr = new Date().toISOString().split('T')[0];
      const txType = payload.type === 'income' ? 'income' : 'expense';
      const txDesc = (payload.description || payload.category || 'Voice expense').trim();

      const txPayload = {
        account_id: targetAccountId,
        category_id: targetCategoryId,
        amount: numericAmount,
        transaction_type: txType,
        description: txDesc,
        transaction_date: txDateStr,
        client_id: uuid.v4().toString(),
        notes: JSON.stringify({ source: 'voice_assistant' }),
      };

      if (!isCurrentTurn(turn)) return '';
      await apiClient.post('/transactions/', txPayload);

      // Invalidate all related caches across the app so changes reflect immediately!
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });

      if (!isCurrentTurn(turn)) return '';
      const formatted = formatGHS(numericAmount);
      setActionToast({
        title: `Recorded ${formatted} ${txType === 'income' ? 'Received' : 'Spent'}`,
        description: `${txDesc} • ${payload.category || 'General'}`,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return `Recorded ${formatted.replace(/[₵\s]/g, '')} Ghana cedis as ${txType} for ${txDesc}.`;
    } catch (e: any) {
      if (!isCurrentTurn(turn)) return '';
      console.warn('[VoiceSupport] Voice transaction could not be confirmed');
      setActionToast({
        title: 'Could not record expense',
        description: 'Check your transactions before trying again.',
      });
      return 'I could not confirm that the transaction was saved. Please check your transactions before trying again.';
    }
  };

  const interruptResponse = async () => {
    ++turnRef.current;
    requestRef.current?.abort();
    requestRef.current = null;
    isProcessingRef.current = false;
    setDynamicStatus(null);
    await voiceService.stop();
    setAudioLevel(0);
    setVoiceState('idle');
    if (canListen()) void startListeningLoop();
  };

  const handleOrbPress = () => {
    Haptics.selectionAsync().catch(() => {});
    if (voiceState === 'speaking' || voiceState === 'thinking') {
      void interruptResponse();
    } else if (voiceState === 'idle' && !isMuted) {
      void startListeningLoop();
    }
  };

  const handleClose = () => {
    setShowAttachMenu(false);
    setShowVoiceSubmenu(false);
    void cleanupVoiceSession();
    onClose();
  };

  const handleToggleMute = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setIsMuted(next);
    if (next) {
      void stopMicrophone();
      if (voiceStateRef.current === 'listening') setVoiceState('idle');
    } else {
      void startListeningLoop();
    }
  };

  const enterTyping = () => {
    typingRef.current = true;
    setIsTypingInVoice(true);
    setIsCompactView(true);
    void stopMicrophone();
    if (isProcessingRef.current) void interruptResponse();
  };

  const statusLabel = voiceError ? 'Voice paused'
    : isTypingInVoice ? 'Type your message'
    : voiceState === 'speaking' ? 'Speaking · tap the orb to interrupt'
    : dynamicStatus ? `${dynamicStatus} · tap to cancel`
    : voiceState === 'thinking' ? 'Understanding · tap the orb to cancel'
    : isMuted ? 'Microphone muted'
    : voiceState === 'listening' ? 'Listening · speak naturally'
    : 'Getting ready…';

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={handleClose}
    >
      {/* Pure, immersive OpenAI ChatGPT Voice background */}
      <View style={[styles.container, { backgroundColor: theme === 'dark' ? '#080a08' : '#f5f8f5' }]}>
        <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
          <View style={[styles.topBar, { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 20) + 8 }]}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={[styles.voiceTitle, { color: theme === 'dark' ? '#e1e3e0' : '#1c1b1f' }]}>CediSmart Voice</Text>
              <Text accessibilityLiveRegion="polite" style={[styles.voiceStatus, { color: theme === 'dark' ? '#b2b6b1' : '#40493d' }]}>{statusLabel}</Text>
            </View>
            <TouchableOpacity onPress={() => setIsCompactView((value) => !value)} style={styles.transcriptToggle} accessibilityRole="button" accessibilityLabel={isCompactView ? 'Hide transcript' : 'Show transcript'} accessibilityState={{ selected: isCompactView }}>
              <MessageSquare size={21} color={theme === 'dark' ? '#4ade80' : '#0d631b'} />
            </TouchableOpacity>
          </View>
          {voiceError && (
            <View style={styles.errorPanel}>
              <Text style={{ color: theme === 'dark' ? '#e1e3e0' : '#1c1b1f', flex: 1, fontSize: 13, lineHeight: 20 }}>{voiceError}</Text>
              <TouchableOpacity onPress={() => {
                if (permissionDenied) { void Linking.openSettings(); return; }
                if (retryReplyRef.current) { void retryNaturalVoice(); return; }
                if (retryAudioRef.current) { void stopAndProcessAudio(retryAudioRef.current); return; }
                setVoiceError(null);
                mutedRef.current = false;
                setIsMuted(false);
                void startListeningLoop();
              }} style={[styles.transcriptToggle, retryReplyRef.current ? { width: 76, height: 52 } : undefined]} accessibilityRole="button" accessibilityLabel={permissionDenied ? 'Open microphone settings' : retryReplyRef.current ? 'Retry voice' : retryAudioRef.current ? 'Retry voice request' : 'Retry microphone'}>
                <RefreshCw size={20} color={theme === 'dark' ? '#4ade80' : '#0d631b'} />
                {retryReplyRef.current && <Text style={{ color: theme === 'dark' ? '#4ade80' : '#0d631b', fontSize: 12 }}>Retry voice</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* MAIN CONTENT AREA */}
          {!isCompactView ? (
            /* Mode 1: Full-Screen Large Voice Orb Mode */
            <View style={styles.centerOrbWrapper}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={handleOrbPress}
                accessibilityRole="button"
                accessibilityLabel={voiceState === 'speaking' ? 'Interrupt response' : voiceState === 'thinking' ? 'Cancel response' : 'Listening automatically'}
              >
                <VoiceOrb state={voiceState} audioLevel={audioLevel} size={210} />
              </TouchableOpacity>
            </View>
          ) : (
            /* Mode 2: Live Speech-Synced Transcript Screen with Mini-Orb sharing exact same conversation history */
            <View style={styles.transcriptContainer}>
              <ScrollView
                ref={scrollViewRef}
                style={styles.transcriptScroll}
                contentContainerStyle={styles.transcriptContent}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
              >
                {messages.map((msg, idx) => {
                  const displayText = msg.content;

                  if (msg.role === 'user') {
                    return (
                      <View key={msg.id || idx} style={styles.userBubbleWrapper}>
                        <View style={styles.userBubble}>
                          <Text style={styles.userBubbleText}>{displayText}</Text>
                        </View>
                      </View>
                    );
                  }

                  return (
                    <View key={msg.id || idx} style={styles.aiMessageWrapper}>
                      <Text style={[styles.aiMessageText, { color: theme === 'dark' ? '#e1e3e0' : '#1c1b1f' }]}>{displayText}</Text>
                    </View>
                  );
                })}
              </ScrollView>

              {/* Anchored Mini Voice Orb right above bottom controls */}
              <View style={styles.miniOrbWrapper}>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={handleOrbPress}
                  accessibilityRole="button"
                  accessibilityLabel={voiceState === 'speaking' ? 'Interrupt response' : voiceState === 'thinking' ? 'Cancel response' : 'Listening automatically'}
                >
                  <VoiceOrb state={voiceState} audioLevel={audioLevel} size={64} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* OpenAI-Style '+' Attachment & Voice Selection Popup Menu */}
          {showAttachMenu && (
            <>
              <TouchableWithoutFeedback
                onPress={() => {
                  setShowAttachMenu(false);
                  setShowVoiceSubmenu(false);
                }}
              >
                <View style={StyleSheet.absoluteFill} />
              </TouchableWithoutFeedback>

              <View style={styles.attachMenuContainer}>
                <BlurView
                  intensity={Platform.OS === 'ios' ? 85 : 100}
                  tint="dark"
                  style={styles.attachMenuBlur}
                >
                  {!showVoiceSubmenu ? (
                    <>
                      {/* Camera Option */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={handleLaunchCamera}
                        style={styles.attachMenuItem}
                      >
                        <View style={styles.attachMenuIconBadge}>
                          <Camera size={19} color="#F3F4F6" />
                        </View>
                        <Text style={styles.attachMenuText}>Camera</Text>
                      </TouchableOpacity>

                      {/* Photos Option */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={handlePickPhotos}
                        style={styles.attachMenuItem}
                      >
                        <View style={styles.attachMenuIconBadge}>
                          <ImageIcon size={19} color="#F3F4F6" />
                        </View>
                        <Text style={styles.attachMenuText}>Photos</Text>
                      </TouchableOpacity>

                      {/* Files Option */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={handlePickDocument}
                        style={styles.attachMenuItem}
                      >
                        <View style={styles.attachMenuIconBadge}>
                          <Paperclip size={19} color="#F3F4F6" />
                        </View>
                        <Text style={styles.attachMenuText}>Files</Text>
                      </TouchableOpacity>

                      <View
                        style={{
                          height: StyleSheet.hairlineWidth,
                          backgroundColor: 'rgba(255, 255, 255, 0.18)',
                          marginVertical: 4,
                          marginHorizontal: 8,
                        }}
                      />

                      {/* Select Voice > Option */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setShowVoiceSubmenu(true);
                        }}
                        style={styles.attachMenuItem}
                      >
                        <View style={styles.attachMenuIconBadge}>
                          <Volume2 size={19} color="#F3F4F6" />
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.attachMenuText}>Select Voice</Text>
                          <ChevronRight size={16} color="#9CA3AF" />
                        </View>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      {/* Back Header to Main Menu */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setShowVoiceSubmenu(false);
                        }}
                        style={[
                          styles.attachMenuItem,
                          {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: 'rgba(255, 255, 255, 0.18)',
                            paddingBottom: 8,
                            marginBottom: 4,
                          },
                        ]}
                      >
                        <ChevronLeft size={18} color="#9CA3AF" style={{ marginRight: 6 }} />
                        <Text style={[styles.attachMenuText, { fontWeight: '700', flex: 1 }]}>
                          Select Voice
                        </Text>
                      </TouchableOpacity>

                      {/* 3 Voice Options with Radio Button Selectors */}
                      {(['akosua', 'kwame', 'esi'] as VoicePersona[]).map((key) => {
                        const p = VOICE_PERSONAS[key];
                        const isSelected = voicePersona === key;
                        return (
                          <TouchableOpacity
                            key={key}
                            activeOpacity={0.7}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                              setVoicePersona(key);
                              AsyncStorage.setItem('cedismart_voice_persona', key).catch(() => {});
                            }}
                            style={[
                              styles.attachMenuItem,
                              isSelected && {
                                backgroundColor: 'rgba(74, 222, 128, 0.14)',
                                borderRadius: 12,
                              },
                            ]}
                          >
                            {/* Radio Button Circle */}
                            <View
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: 9,
                                borderWidth: 2,
                                borderColor: isSelected ? '#4ade80' : '#6B7280',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginRight: 10,
                              }}
                            >
                              {isSelected && (
                                <View
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: 4,
                                    backgroundColor: '#4ade80',
                                  }}
                                />
                              )}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[
                                  styles.attachMenuText,
                                  isSelected && { color: '#4ade80', fontWeight: '700' },
                                ]}
                              >
                                {p.label}
                              </Text>
                              <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
                                {p.desc}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </>
                  )}
                </BlurView>
              </View>
            </>
          )}

          {/* ChatGPT Voice Bottom Bar */}
          {isTypingInVoice ? (
            /* In-Voice Mode Text Input Bar (Keyboard does NOT exit voice mode) */
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
            >
              <View style={[styles.inlineTypeBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                {attachedImage && (
                  <View style={styles.attachPreviewRow}>
                    <View style={styles.attachPreviewChip}>
                      <Paperclip size={13} color="#10B981" />
                      <Text style={styles.attachPreviewText} numberOfLines={1}>
                        {attachedImage.name || 'Attached Media'}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setAttachedImage(null)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <X size={13} color="#9CA3AF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <View style={styles.inlineTypeCapsule}>
                  <TouchableOpacity
                    onPress={() => {
                      setIsTypingInVoice(false);
                      setVoiceInputText('');
                    }}
                    style={styles.inlineCancelBtn}
                    accessibilityLabel="Cancel typing"
                  >
                    <X size={18} color="#9CA3AF" />
                  </TouchableOpacity>

                  <TextInput
                    ref={voiceInputRef}
                    style={styles.inlineTextInput}
                    placeholder="Ask CediSmart..."
                    placeholderTextColor="#9CA3AF"
                    value={voiceInputText}
                    onChangeText={setVoiceInputText}
                    onSubmitEditing={handleSendTypedInVoice}
                    returnKeyType="send"
                    autoFocus
                  />

                  <TouchableOpacity
                    onPress={handleSendTypedInVoice}
                    disabled={!voiceInputText.trim() && !attachedImage}
                    style={[styles.inlineSendBtn, !voiceInputText.trim() && !attachedImage && { opacity: 0.5 }]}
                    accessibilityLabel="Send query"
                  >
                    <Send size={16} color="white" />
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          ) : (
            /* Standard ChatGPT Voice Bottom Bar (Ask CediSmart pill, Mute, White X close) */
            <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              {/* Ask CediSmart pill (tapping opens in-voice keyboard, does NOT exit voice mode) */}
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  enterTyping();
                }}
                activeOpacity={0.8}
                style={styles.askPill}
                accessibilityLabel="Type in voice mode"
              >
                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setShowAttachMenu((prev) => !prev);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Plus size={18} color="#9CA3AF" />
                </TouchableOpacity>
                <Text style={styles.askPillText}>Ask CediSmart...</Text>
              </TouchableOpacity>

              {/* Mute / Unmute Button */}
              <TouchableOpacity
                onPress={handleToggleMute}
                activeOpacity={0.8}
                style={[styles.muteBtn, isMuted && styles.mutedActive]}
                accessibilityLabel={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? (
                  <MicOff size={22} color="#f43f5e" />
                ) : (
                  <Mic size={22} color="#FFFFFF" />
                )}
              </TouchableOpacity>

              {/* White Circular Close Button: ONLY this button closes voice mode */}
              <TouchableOpacity
                onPress={handleClose}
                activeOpacity={0.85}
                style={styles.closeBtn}
                accessibilityLabel="Close voice mode"
              >
                <X size={22} color="#000000" />
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  voiceTitle: { fontSize: 17, fontWeight: '600' },
  voiceStatus: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  transcriptToggle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  errorPanel: { marginHorizontal: 20, padding: 12, borderRadius: 16, backgroundColor: 'rgba(16,185,129,0.12)', flexDirection: 'row', alignItems: 'center', gap: 8 },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  personaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  personaPillText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  topIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topDash: {
    width: 14,
    height: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 2,
    marginRight: 6,
  },
  topDot: {
    width: 7,
    height: 7,
    backgroundColor: '#10B981',
    borderRadius: 3.5,
  },
  centerOrbWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transcriptContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  transcriptScroll: {
    flex: 1,
    paddingHorizontal: 24,
  },
  transcriptContent: {
    paddingTop: 24,
    paddingBottom: 24,
  },
  userBubbleWrapper: {
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  userBubble: {
    backgroundColor: '#064e3b', // CediSmart signature deep emerald
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 22,
    maxWidth: '82%',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  userBubbleText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
  aiMessageWrapper: {
    alignItems: 'flex-start',
    marginBottom: 20,
    maxWidth: '92%',
  },
  aiMessageText: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 28,
    fontFamily: 'Inter_400Regular',
  },
  miniOrbWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  toastContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  toastCard: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toastIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  toastTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: '#FFFFFF',
  },
  toastDesc: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  attachMenuContainer: {
    position: 'absolute',
    bottom: 84,
    left: 20,
    zIndex: 999,
    width: 232,
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 16,
  },
  attachMenuBlur: {
    padding: 8,
    backgroundColor: 'rgba(30, 30, 30, 0.76)',
  },
  attachMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  attachMenuIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  attachMenuText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  attachPreviewRow: {
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  attachPreviewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: '80%',
    gap: 6,
  },
  attachPreviewText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    flexShrink: 1,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  askPill: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginRight: 12,
  },
  askPillText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginLeft: 8,
    fontFamily: 'Inter_400Regular',
  },
  muteBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginRight: 12,
  },
  mutedActive: {
    backgroundColor: 'rgba(244, 63, 94, 0.2)',
    borderColor: 'rgba(244, 63, 94, 0.4)',
  },
  closeBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineTypeBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    width: '100%',
  },
  inlineTypeCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 12,
    borderRadius: 26,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  inlineCancelBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  inlineTextInput: {
    flex: 1,
    height: '100%',
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    paddingHorizontal: 4,
  },
  inlineSendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0d631b',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
});
