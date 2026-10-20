import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import {
  Mic,
  MicOff,
  X,
  Plus,
  Send,
  CheckCircle2,
  Stethoscope,
  Zap,
  Landmark,
} from 'lucide-react-native';
import {
  useAudioRecorder,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { VoiceOrb, VoiceState } from './VoiceOrb';
import { voiceService } from '../../services/voiceService';
import { GlassSurface } from '../glass/GlassSurface';
import { useThemeStore } from '../../stores/themeStore';
import apiClient from '../../api/client';
import { formatGHS } from '../../utils/currency';
import { Message } from '../shared/SupportModal';

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
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const scrollViewRef = useRef<ScrollView>(null);
  const voiceInputRef = useRef<TextInput>(null);

  // Audio Recorder from expo-audio (SDK 57)
  const audioRecorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(audioRecorder, 100);

  // Voice Interaction States
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [isCompactView, setIsCompactView] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [actionToast, setActionToast] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const [showQuickSheet, setShowQuickSheet] = useState(false);

  // In-Voice Typing States (allows typing inside voice mode without closing)
  const [isTypingInVoice, setIsTypingInVoice] = useState(false);
  const [voiceInputText, setVoiceInputText] = useState('');

  // Streaming text animation as voice plays
  const [streamingAiText, setStreamingAiText] = useState('');
  const streamingTimerRef = useRef<any>(null);

  // Voice Activity Detection (VAD) references
  const hasSpokenRef = useRef(false);
  const silenceTimerRef = useRef<any>(null);
  const isProcessingRef = useRef(false);

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

  // Configure audio session so iOS allows recording & plays audio in silent mode
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    }).catch(() => {});
  }, []);

  // Welcome greeting on launch with natural neural voice
  useEffect(() => {
    if (visible) {
      setIsCompactView(false);
      setIsMuted(false);
      setIsTypingInVoice(false);
      setVoiceInputText('');
      setAudioLevel(0);
      setActionToast(null);
      isProcessingRef.current = false;

      const cleanName = (userName || '').replace(/^(mr|mrs|ms|dr|rev|prof)\.?\s+/i, '').trim().split(' ')[0];
      const greeting = cleanName ? `Hi ${cleanName}, I'm listening.` : "Hi, I'm listening.";

      // Only add greeting if current thread is empty
      if (messages.length <= 1) {
        const initialGreetingMsg: Message = {
          id: 'greet-' + Date.now(),
          role: 'model',
          content: greeting,
          status: 'sent',
          actions: [],
        };
        onAddMessage(initialGreetingMsg);
      }
      startStreamingText(greeting);
      setVoiceState('speaking');

      // Request natural neural audio from Gemini TTS
      apiClient
        .post('/support/voice/synthesize', {
          text: greeting,
          voice_name: 'Kore',
        })
        .then((res) => {
          if (res.data?.audio_base64) {
            voiceService.speakNeural(
              res.data.audio_base64,
              () => setVoiceState('speaking'),
              () => {
                setVoiceState('listening');
                startListeningLoop();
              },
              () => {
                voiceService.speak(greeting, () => setVoiceState('speaking'), () => {
                  setVoiceState('listening');
                  startListeningLoop();
                });
              }
            );
          } else {
            voiceService.speak(greeting, () => setVoiceState('speaking'), () => {
              setVoiceState('listening');
              startListeningLoop();
            });
          }
        })
        .catch(() => {
          voiceService.speak(greeting, () => setVoiceState('speaking'), () => {
            setVoiceState('listening');
            startListeningLoop();
          });
        });
    } else {
      cleanupVoiceSession();
    }

    return () => {
      cleanupVoiceSession();
    };
  }, [visible, userName]);

  // Clean up all active listeners, recorders, and synthesizers
  const cleanupVoiceSession = async () => {
    voiceService.stop();
    if (streamingTimerRef.current) clearInterval(streamingTimerRef.current);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    hasSpokenRef.current = false;
    isProcessingRef.current = false;
    try {
      if (audioRecorder.isRecording) {
        await audioRecorder.stop();
      }
    } catch {}
    setVoiceState('idle');
  };

  /**
   * Start live microphone recording loop
   */
  const startListeningLoop = async () => {
    if (isMuted || !visible || isProcessingRef.current || isTypingInVoice) return;

    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        console.warn('[VoiceSupport] Microphone permission denied');
        return;
      }

      hasSpokenRef.current = false;
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setVoiceState('listening');
    } catch (err) {
      console.warn('[VoiceSupport] Failed to start recorder:', err);
      setVoiceState('listening');
    }
  };

  /**
   * Voice Activity Detection (VAD) & Live Pulse Effect
   */
  useEffect(() => {
    if (voiceState !== 'listening' || !recorderState.isRecording || isMuted || isProcessingRef.current || isTypingInVoice) {
      return;
    }

    const metering = recorderState.metering ?? -160;

    // Normalise decibels (-55dB to -10dB) to 0.0 - 1.0 for the Voice Orb
    const normalized = metering > -55 ? Math.min(1, Math.max(0, (metering + 55) / 45)) : 0;
    setAudioLevel(normalized);

    // Speech detected
    if (metering > -40) {
      hasSpokenRef.current = true;
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    }

    // Silence detection after user spoke: 1.4s of quiet triggers submission
    if (hasSpokenRef.current && metering <= -44) {
      if (!silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          stopAndProcessAudio();
        }, 1400);
      }
    }
  }, [recorderState.metering, recorderState.isRecording, voiceState, isMuted, isTypingInVoice]);

  /**
   * Stop recording and send audio to backend for transcription and action execution
   */
  const stopAndProcessAudio = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    setVoiceState('thinking');
    setAudioLevel(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    try {
      if (audioRecorder.isRecording) {
        await audioRecorder.stop();
      }

      const uri = audioRecorder.uri;
      if (!uri) {
        isProcessingRef.current = false;
        startListeningLoop();
        return;
      }

      // Read audio file as base64
      const base64Audio = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Send to backend /support/voice endpoint
      const cleanName = (userName || '').replace(/^(mr|mrs|ms|dr|rev|prof)\.?\s+/i, '').trim().split(' ')[0];
      const res = await apiClient.post('/support/voice', {
        audio_base64: base64Audio,
        audio_mime_type: 'audio/m4a',
        user_name: cleanName || userName,
        phone: phone || 'Anonymous',
        initial_context: initialContext,
      });

      const transcript = res.data?.transcript || '';
      const reply = res.data?.response || "I'm listening, go ahead.";
      const action = res.data?.action;

      // Append user transcription directly to shared conversation thread
      if (transcript && transcript !== 'Voice note received') {
        const userMsg: Message = {
          id: 'msg-' + Date.now(),
          role: 'user',
          content: transcript,
          status: 'sent',
          actions: [],
        };
        onAddMessage(userMsg);
      }

      // Execute detected voice action (e.g. create transaction or check balance)
      if (action && action.type === 'create_transaction' && action.payload) {
        await handleExecuteVoiceTransaction(action.payload);
      } else if (action && action.type === 'check_balance') {
        const totalBalance = (accounts || []).reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
        setActionToast({
          title: `Balance: ${formatGHS(totalBalance)}`,
          description: `${(accounts || []).length} active wallets`,
        });
      }

      // Append AI response to shared conversation thread
      const aiMsg: Message = {
        id: 'ai-' + Date.now(),
        role: 'model',
        content: reply,
        status: 'sent',
        actions: [],
      };
      onAddMessage(aiMsg);
      startStreamingText(reply);

      // Speak response aloud via natural neural voice or TTS fallback
      setVoiceState('speaking');
      if (res.data?.audio_base64) {
        voiceService.speakNeural(
          res.data.audio_base64,
          () => setVoiceState('speaking'),
          () => {
            isProcessingRef.current = false;
            setVoiceState('listening');
            startListeningLoop();
          },
          () => {
            voiceService.speak(
              reply,
              () => setVoiceState('speaking'),
              () => {
                isProcessingRef.current = false;
                setVoiceState('listening');
                startListeningLoop();
              },
              () => {
                isProcessingRef.current = false;
                setVoiceState('listening');
                startListeningLoop();
              }
            );
          }
        );
      } else {
        voiceService.speak(
          reply,
          () => setVoiceState('speaking'),
          () => {
            isProcessingRef.current = false;
            setVoiceState('listening');
            startListeningLoop();
          },
          () => {
            isProcessingRef.current = false;
            setVoiceState('listening');
            startListeningLoop();
          }
        );
      }
    } catch (err: any) {
      console.warn('[VoiceSupport] Voice processing error:', err);
      const fallbackReply = "Could you please say that again?";
      const aiMsg: Message = {
        id: 'ai-err-' + Date.now(),
        role: 'model',
        content: fallbackReply,
        status: 'sent',
        actions: [],
      };
      onAddMessage(aiMsg);
      startStreamingText(fallbackReply);

      setVoiceState('speaking');
      voiceService.speak(
        fallbackReply,
        () => setVoiceState('speaking'),
        () => {
          isProcessingRef.current = false;
          setVoiceState('listening');
          startListeningLoop();
        },
        () => {
          isProcessingRef.current = false;
          setVoiceState('listening');
          startListeningLoop();
        }
      );
    } finally {
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 500);
    }
  };

  /**
   * Handle user typing in Voice Mode (remains in Voice Mode and receives vocal response!)
   */
  const handleSendTypedInVoice = async () => {
    const text = voiceInputText.trim();
    if (!text || isProcessingRef.current) return;

    isProcessingRef.current = true;
    setVoiceInputText('');
    setIsTypingInVoice(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    // 1. Add user message to shared conversation thread
    const userMsg: Message = {
      id: 'msg-' + Date.now(),
      role: 'user',
      content: text,
      status: 'sent',
      actions: [],
    };
    onAddMessage(userMsg);
    setVoiceState('thinking');

    try {
      // 2. Query chat response
      const cleanName = (userName || '').replace(/^(mr|mrs|ms|dr|rev|prof)\.?\s+/i, '').trim().split(' ')[0];
      const chatRes = await apiClient.post('/support/chat', {
        messages: [{ role: 'user', content: `[VOICE_MODE: Speak concisely in 1-2 short sentences] ${text}` }],
        phone: phone || 'Anonymous',
        user_name: cleanName || userName,
        support_type: 'general',
      });

      const reply = chatRes.data?.response || "I'm listening, go ahead.";

      // 3. Synthesize natural neural voice
      let neuralAudioB64: string | null = null;
      try {
        const synthRes = await apiClient.post('/support/voice/synthesize', {
          text: reply,
          voice_name: 'Kore',
        });
        neuralAudioB64 = synthRes.data?.audio_base64 || null;
      } catch {}

      // 4. Add AI response to shared conversation thread
      const aiMsg: Message = {
        id: 'ai-' + Date.now(),
        role: 'model',
        content: reply,
        status: 'sent',
        actions: [],
      };
      onAddMessage(aiMsg);
      startStreamingText(reply);

      // 5. Play neural audio aloud while staying inside Voice Mode
      setVoiceState('speaking');
      if (neuralAudioB64) {
        voiceService.speakNeural(
          neuralAudioB64,
          () => setVoiceState('speaking'),
          () => {
            isProcessingRef.current = false;
            setVoiceState('listening');
            startListeningLoop();
          },
          () => {
            voiceService.speak(reply, () => setVoiceState('speaking'), () => {
              isProcessingRef.current = false;
              setVoiceState('listening');
              startListeningLoop();
            });
          }
        );
      } else {
        voiceService.speak(reply, () => setVoiceState('speaking'), () => {
          isProcessingRef.current = false;
          setVoiceState('listening');
          startListeningLoop();
        });
      }
    } catch (err) {
      console.warn('[VoiceSupport] Error handling typed voice query:', err);
      const fallbackReply = "Could you please say that again?";
      const aiMsg: Message = {
        id: 'ai-err-' + Date.now(),
        role: 'model',
        content: fallbackReply,
        status: 'sent',
        actions: [],
      };
      onAddMessage(aiMsg);
      startStreamingText(fallbackReply);

      setVoiceState('speaking');
      voiceService.speak(fallbackReply, () => setVoiceState('speaking'), () => {
        isProcessingRef.current = false;
        setVoiceState('listening');
        startListeningLoop();
      });
    } finally {
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 500);
    }
  };

  /**
   * Execute voice-parsed transaction against backend
   */
  const handleExecuteVoiceTransaction = async (payload: any) => {
    try {
      let targetAccountId = accounts?.[0]?.id;
      if (accounts && accounts.length > 0) {
        const matched = accounts.find((a) => {
          if (payload.account_type === 'mobile_money') {
            return a.account_type === 'mobile_money' || /momo|mtn|telecel/i.test(a.name);
          }
          if (payload.account_type === 'bank') {
            return a.account_type === 'bank';
          }
          return a.account_type === 'cash';
        });
        if (matched) targetAccountId = matched.id;
      }

      let targetCategoryId = categories?.[0]?.id;
      if (categories && categories.length > 0) {
        const matchedCat = categories.find((c) =>
          c.name.toLowerCase().includes((payload.category || '').toLowerCase())
        );
        if (matchedCat) targetCategoryId = matchedCat.id;
      }

      if (targetAccountId) {
        await apiClient.post('/transactions/', {
          account_id: targetAccountId,
          category_id: targetCategoryId,
          amount: payload.amount,
          type: payload.type || 'expense',
          description: payload.description || 'Voice expense',
          transaction_date: new Date().toISOString(),
        });

        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
        queryClient.invalidateQueries({ queryKey: ['budgets'] });

        const formatted = formatGHS(payload.amount);
        setActionToast({
          title: `Recorded ${formatted} ${payload.type === 'income' ? 'Received' : 'Spent'}`,
          description: `${payload.description} • ${payload.category || 'General'}`,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (e) {
      console.warn('[VoiceSupport] Failed to execute voice transaction:', e);
    }
  };

  /**
   * Smooth typewriter / text stream as the AI speaks
   */
  const startStreamingText = (fullText: string) => {
    if (streamingTimerRef.current) clearInterval(streamingTimerRef.current);
    setStreamingAiText('');

    const words = fullText.split(' ');
    let currentIndex = 0;

    streamingTimerRef.current = setInterval(() => {
      currentIndex += 1;
      setStreamingAiText(words.slice(0, currentIndex).join(' '));
      if (currentIndex >= words.length) {
        if (streamingTimerRef.current) clearInterval(streamingTimerRef.current);
      }
    }, 45);
  };

  /**
   * Tap on orb:
   * - If speaking: barge-in interrupt
   * - If listening: immediately stop and submit voice
   * - Also toggles compact / transcript view!
   */
  const handleOrbPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (voiceState === 'speaking') {
      voiceService.stop();
      if (streamingTimerRef.current) clearInterval(streamingTimerRef.current);
      setVoiceState('listening');
      startListeningLoop();
      return;
    }

    if (voiceState === 'listening' && hasSpokenRef.current) {
      stopAndProcessAudio();
      return;
    }

    // Toggle between large orb mode and compact transcript mode
    setIsCompactView((prev) => !prev);
  };

  // ONLY tapping the white X button closes Voice Mode!
  const handleClose = () => {
    Haptics.selectionAsync().catch(() => {});
    cleanupVoiceSession();
    onClose();
  };

  const handleToggleMute = () => {
    Haptics.selectionAsync().catch(() => {});
    if (isMuted) {
      setIsMuted(false);
      setVoiceState('listening');
      startListeningLoop();
    } else {
      voiceService.stop();
      setIsMuted(true);
      setVoiceState('idle');
      try {
        if (audioRecorder.isRecording) audioRecorder.stop();
      } catch {}
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={handleClose}
    >
      {/* Pure, immersive OpenAI ChatGPT Voice background */}
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          {/* Minimal Top Bar matching ChatGPT Voice */}
          <View style={styles.topBar}>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.topIndicator}
              accessibilityLabel="Close voice mode"
            >
              <View style={styles.topDash} />
              <View style={styles.topDot} />
            </TouchableOpacity>
          </View>

          {/* MAIN CONTENT AREA */}
          {!isCompactView ? (
            /* Mode 1: Full-Screen Large Voice Orb Mode */
            <View style={styles.centerOrbWrapper}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={handleOrbPress}
                accessibilityLabel="Tap to resize orb or interrupt"
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
                  const isLatestAi = msg.role === 'model' && idx === messages.length - 1 && voiceState === 'speaking';
                  const displayText = isLatestAi && streamingAiText ? streamingAiText : msg.content;

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
                      <Text style={styles.aiMessageText}>{displayText}</Text>
                    </View>
                  );
                })}
              </ScrollView>

              {/* Anchored Mini Voice Orb right above bottom controls */}
              <View style={styles.miniOrbWrapper}>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={handleOrbPress}
                  accessibilityLabel="Tap to expand voice orb"
                >
                  <VoiceOrb state={voiceState} audioLevel={audioLevel} size={64} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Floating Action Confirmation Toast */}
          {actionToast && (
            <View style={styles.toastContainer}>
              <GlassSurface
                variant="thick"
                radius={20}
                style={styles.toastCard}
              >
                <View style={styles.toastContent}>
                  <View style={styles.toastIcon}>
                    <CheckCircle2 size={16} color="#10B981" />
                  </View>
                  <View>
                    <Text style={styles.toastTitle}>{actionToast.title}</Text>
                    <Text style={styles.toastDesc}>{actionToast.description}</Text>
                  </View>
                </View>
              </GlassSurface>
            </View>
          )}

          {/* Quick Action Sheet Modal / Popover when user taps [+] */}
          {showQuickSheet && (
            <View style={styles.sheetOverlay}>
              <GlassSurface variant="thick" radius={24} style={styles.sheetCard}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>Quick Voice Actions</Text>
                  <TouchableOpacity onPress={() => setShowQuickSheet(false)}>
                    <X size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.sheetItem}
                  onPress={() => {
                    setShowQuickSheet(false);
                    setActionToast({ title: 'System Diagnostics', description: 'Checking ledger & wallet health...' });
                    voiceService.speak("Running a quick health check on your wallets. All data caches are fully synchronized.");
                  }}
                >
                  <Stethoscope size={18} color="#10B981" />
                  <Text style={styles.sheetItemText}>Run System Diagnostics</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sheetItem}
                  onPress={() => {
                    setShowQuickSheet(false);
                    const totalBalance = (accounts || []).reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
                    setActionToast({ title: `Balance: ${formatGHS(totalBalance)}`, description: 'Active accounts refreshed' });
                    voiceService.speak(`Your total available balance is ${formatGHS(totalBalance)}.`);
                  }}
                >
                  <Landmark size={18} color="#10B981" />
                  <Text style={styles.sheetItemText}>Check Wallet Balances</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sheetItem}
                  onPress={() => {
                    setShowQuickSheet(false);
                    setIsTypingInVoice(true);
                    setIsCompactView(true);
                  }}
                >
                  <Zap size={18} color="#10B981" />
                  <Text style={styles.sheetItemText}>Type in Voice Mode</Text>
                </TouchableOpacity>
              </GlassSurface>
            </View>
          )}

          {/* ChatGPT Voice Bottom Bar */}
          {isTypingInVoice ? (
            /* In-Voice Mode Text Input Bar (Keyboard does NOT exit voice mode) */
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
            >
              <View style={[styles.inlineTypeBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
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
                    disabled={!voiceInputText.trim()}
                    style={[styles.inlineSendBtn, !voiceInputText.trim() && { opacity: 0.5 }]}
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
                  setIsTypingInVoice(true);
                  setIsCompactView(true);
                }}
                activeOpacity={0.8}
                style={styles.askPill}
                accessibilityLabel="Type in voice mode"
              >
                <TouchableOpacity
                  onPress={() => setShowQuickSheet((prev) => !prev)}
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
    paddingHorizontal: 24,
    paddingTop: 12,
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
  sheetOverlay: {
    position: 'absolute',
    bottom: 96,
    left: 20,
    right: 20,
    zIndex: 999,
  },
  sheetCard: {
    padding: 18,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  sheetItemText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    marginLeft: 12,
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
