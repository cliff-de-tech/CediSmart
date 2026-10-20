import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import {
  Mic,
  MicOff,
  PhoneOff,
  X,
  Sparkles,
  CheckCircle2,
  Volume2,
  VolumeX,
  ArrowUpRight,
  ArrowDownRight,
  Bot,
  Zap,
} from 'lucide-react-native';
import { VoiceOrb, VoiceState } from './VoiceOrb';
import { voiceService, VoiceAction } from '../../services/voiceService';
import { GlassSurface } from '../glass/GlassSurface';
import { CoinBackground } from '../shared/CoinBackground';
import { useThemeStore } from '../../stores/themeStore';
import apiClient from '../../api/client';
import { formatGHS } from '../../utils/currency';

interface VoiceSupportModalProps {
  visible: boolean;
  onClose: () => void;
  userName?: string;
  phone?: string;
  initialContext?: string;
  navigation?: any;
}

const { width } = Dimensions.get('window');

export const VoiceSupportModal: React.FC<VoiceSupportModalProps> = ({
  visible,
  onClose,
  userName = 'User',
  phone,
  initialContext = 'dashboard',
  navigation,
}) => {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  // Voice Interaction States
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [userTranscript, setUserTranscript] = useState<string>('');
  const [aiSpokenText, setAiSpokenText] = useState<string>('');
  const [actionToast, setActionToast] = useState<{
    title: string;
    description: string;
    type: 'transaction' | 'budget' | 'navigation' | 'diagnostic';
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch accounts & categories for intelligent voice-to-ledger matching
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

  // Welcome greeting on launch
  useEffect(() => {
    if (visible) {
      setVoiceState('speaking');
      const firstName = (userName || 'there').split(' ')[0];
      const greeting = `Hi ${firstName}! I'm listening. You can speak to log expenses, check your balances, or ask any question.`;
      setAiSpokenText(greeting);

      voiceService.speak(
        greeting,
        () => setVoiceState('speaking'),
        () => {
          setVoiceState('listening');
        },
        () => setVoiceState('idle')
      );
    } else {
      voiceService.stop();
      setVoiceState('idle');
      setUserTranscript('');
      setAiSpokenText('');
      setActionToast(null);
    }

    return () => {
      voiceService.stop();
    };
  }, [visible, userName]);

  /**
   * Execute voice task and reply vocally
   */
  const processSpokenInput = async (spokenText: string) => {
    if (!spokenText.trim() || isProcessing) return;

    setUserTranscript(spokenText);
    setIsProcessing(true);
    setVoiceState('thinking');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    try {
      // 1. Analyze if the spoken text is a direct financial action
      const action: VoiceAction = voiceService.parseSpokenIntent(spokenText);

      if (action.type === 'create_transaction' && action.payload) {
        // Resolve appropriate account
        let targetAccountId = accounts?.[0]?.id;
        if (accounts && accounts.length > 0) {
          const matchedAcc = accounts.find((a) => {
            if (action.payload.accountType === 'mobile_money') {
              return a.account_type === 'mobile_money' || /momo|mtn|telecel/i.test(a.name);
            }
            if (action.payload.accountType === 'bank') {
              return a.account_type === 'bank';
            }
            return a.account_type === 'cash';
          });
          if (matchedAcc) targetAccountId = matchedAcc.id;
        }

        // Resolve appropriate category
        let targetCategoryId = categories?.[0]?.id;
        if (categories && categories.length > 0) {
          const matchedCat = categories.find((c) =>
            c.name.toLowerCase().includes(action.payload.categoryName.toLowerCase())
          );
          if (matchedCat) targetCategoryId = matchedCat.id;
        }

        if (targetAccountId) {
          // Create the real transaction in the ledger
          const txDate = new Date().toISOString();
          await apiClient.post('/transactions/', {
            account_id: targetAccountId,
            category_id: targetCategoryId,
            amount: action.payload.amount,
            type: action.payload.type,
            description: action.payload.description,
            transaction_date: txDate,
          });

          // Invalidate cache so Dashboard and Transactions instantly update
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['accounts'] });
          queryClient.invalidateQueries({ queryKey: ['budgets'] });

          // Show action toast
          const formatted = formatGHS(action.payload.amount);
          setActionToast({
            title: `Recorded ${formatted} ${action.payload.type === 'expense' ? 'Spent' : 'Received'}`,
            description: `${action.payload.description} • ${action.payload.categoryName}`,
            type: 'transaction',
          });

          // Trigger victory state on orb
          setVoiceState('executed');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

          // Vocal Confirmation
          const reply = `Done! I've recorded ${formatted} for ${action.payload.description} under ${action.payload.categoryName}.`;
          setAiSpokenText(reply);

          setTimeout(() => {
            voiceService.speak(
              reply,
              () => setVoiceState('speaking'),
              () => setVoiceState('listening'),
              () => setVoiceState('idle')
            );
          }, 400);

          setIsProcessing(false);
          return;
        }
      }

      // 2. Balance & Budget queries
      if (action.type === 'check_balance') {
        const totalBalance = (accounts || []).reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
        const reply = `Your total available balance is ${formatGHS(totalBalance)} across your tracked accounts.`;
        setAiSpokenText(reply);
        setActionToast({
          title: `Balance: ${formatGHS(totalBalance)}`,
          description: `${(accounts || []).length} active wallets`,
          type: 'diagnostic',
        });
        voiceService.speak(
          reply,
          () => setVoiceState('speaking'),
          () => setVoiceState('listening'),
          () => setVoiceState('idle')
        );
        setIsProcessing(false);
        return;
      }

      if (action.type === 'navigate' && action.payload?.screen) {
        const screenName = action.payload.screen;
        const reply = `Navigating to ${screenName} for you now.`;
        setAiSpokenText(reply);
        voiceService.speak(reply, () => setVoiceState('speaking'), () => {
          onClose();
          try {
            if (navigation) {
              if (screenName === 'Budgets') navigation.navigate('MainTabs', { screen: 'BudgetsTab' });
              else if (screenName === 'Transactions') navigation.navigate('MainTabs', { screen: 'DashboardTab' });
              else navigation.navigate(screenName);
            }
          } catch {}
        });
        setIsProcessing(false);
        return;
      }

      // 3. Fallback: Consult AI Support Assistant for conversational answers
      const res = await apiClient.post('/support/chat', {
        messages: [{ role: 'user', content: `[VOICE_MODE: Speak concisely in 1-2 short sentences] ${spokenText}` }],
        phone: phone || 'Anonymous',
        user_name: userName,
        support_type: 'general',
      });

      const reply = res.data?.response || "I'm here to help. What would you like to log or check?";
      setAiSpokenText(reply);
      voiceService.speak(
        reply,
        () => setVoiceState('speaking'),
        () => setVoiceState('listening'),
        () => setVoiceState('idle')
      );
    } catch (err: any) {
      console.warn('[VoiceSupport] Error:', err);
      const errReply = "I had trouble processing that. Could you please say that again?";
      setAiSpokenText(errReply);
      voiceService.speak(
        errReply,
        () => setVoiceState('speaking'),
        () => setVoiceState('listening'),
        () => setVoiceState('idle')
      );
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * End session and cleanup
   */
  const handleClose = () => {
    Haptics.selectionAsync().catch(() => {});
    voiceService.stop();
    onClose();
  };

  /**
   * Toggle Mute
   */
  const handleToggleMute = () => {
    Haptics.selectionAsync().catch(() => {});
    if (isMuted) {
      setIsMuted(false);
      setVoiceState('listening');
    } else {
      voiceService.stop();
      setIsMuted(true);
      setVoiceState('idle');
    }
  };

  /**
   * Interrupt AI speech (Barge-in tap)
   */
  const handleInterrupt = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    voiceService.stop();
    setVoiceState('listening');
  };

  // State text label for status badge
  const getStatusLabel = () => {
    if (isMuted) return 'Microphone Muted';
    switch (voiceState) {
      case 'listening':
        return 'Listening...';
      case 'thinking':
        return 'Thinking & Executing...';
      case 'speaking':
        return 'Speaking...';
      case 'executed':
        return 'Task Completed ✓';
      case 'idle':
      default:
        return 'Ready';
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={handleClose}
    >
      <View className={`flex-1 ${isDark ? 'bg-[#060D09]' : 'bg-[#F4FBF7]'}`}>
        <CoinBackground />

        <SafeAreaView className="flex-1 justify-between px-6">
          {/* Top Bar */}
          <View className="flex-row items-center justify-between pt-2">
            <View className="flex-row items-center">
              <View className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-2.5" />
              <View>
                <Text
                  className={`font-headline font-bold text-base ${
                    isDark ? 'text-white' : 'text-charcoal'
                  }`}
                >
                  CediSmart Voice
                </Text>
                <Text
                  className={`text-[11px] font-medium tracking-wide ${
                    voiceState === 'listening'
                      ? 'text-emerald-400 font-bold'
                      : isDark
                      ? 'text-gray-400'
                      : 'text-gray-500'
                  }`}
                >
                  {getStatusLabel()}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              className={`w-10 h-10 rounded-full ${
                isDark ? 'bg-white/10' : 'bg-black/5'
              } items-center justify-center`}
              accessibilityLabel="End voice call"
            >
              <X size={20} color={isDark ? 'white' : '#1C1C2E'} />
            </TouchableOpacity>
          </View>

          {/* Center ChatGPT Voice Orb */}
          <View className="items-center justify-center py-6">
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={voiceState === 'speaking' ? handleInterrupt : undefined}
            >
              <VoiceOrb state={voiceState} size={175} />
            </TouchableOpacity>

            {/* Tap to Interrupt hint */}
            {voiceState === 'speaking' && (
              <TouchableOpacity
                onPress={handleInterrupt}
                className="mt-6 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 flex-row items-center"
              >
                <VolumeX size={13} color={isDark ? '#e1e3e0' : '#40493d'} />
                <Text
                  className={`text-[11px] font-medium ml-1.5 ${
                    isDark ? 'text-gray-300' : 'text-gray-600'
                  }`}
                >
                  Tap orb to interrupt
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Action Execution Toast Pill */}
          {actionToast && (
            <View className="items-center mb-3">
              <GlassSurface
                variant="thick"
                radius={20}
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  borderColor: isDark ? '#10B98140' : '#0d631b30',
                }}
              >
                <View className="flex-row items-center">
                  <View className="w-7 h-7 rounded-full bg-emerald-500/20 items-center justify-center mr-2.5">
                    <CheckCircle2 size={16} color="#10B981" />
                  </View>
                  <View>
                    <Text
                      className={`font-headline font-bold text-xs ${
                        isDark ? 'text-white' : 'text-charcoal'
                      }`}
                    >
                      {actionToast.title}
                    </Text>
                    <Text
                      className={`text-[10px] ${
                        isDark ? 'text-gray-400' : 'text-gray-500'
                      }`}
                    >
                      {actionToast.description}
                    </Text>
                  </View>
                </View>
              </GlassSurface>
            </View>
          )}

          {/* Live Subtitles & Conversational Transcript Display */}
          <View className="mb-6 px-2">
            <GlassSurface
              variant="clear"
              radius={24}
              style={{
                paddingHorizontal: 20,
                paddingVertical: 16,
                minHeight: 88,
                justifyContent: 'center',
              }}
            >
              {isProcessing ? (
                <View className="flex-row items-center justify-center">
                  <ActivityIndicator size="small" color="#10B981" />
                  <Text
                    className={`font-body text-xs ml-2.5 ${
                      isDark ? 'text-gray-300' : 'text-gray-600'
                    }`}
                  >
                    Executing your request...
                  </Text>
                </View>
              ) : (
                <Text
                  className={`font-body text-center text-sm leading-relaxed ${
                    isDark ? 'text-gray-200' : 'text-gray-800'
                  }`}
                  numberOfLines={4}
                >
                  {aiSpokenText || 'Say anything like "Log 40 cedis for fuel" or "Check my balance"...'}
                </Text>
              )}

              {userTranscript ? (
                <Text
                  className={`text-center text-[10px] mt-2 font-medium ${
                    isDark ? 'text-emerald-400/80' : 'text-emerald-700/80'
                  }`}
                  numberOfLines={1}
                >
                  You: "{userTranscript}"
                </Text>
              ) : null}
            </GlassSurface>
          </View>

          {/* Quick Voice Demo Phrases for 1-Tap Convenience */}
          <View className="flex-row justify-center flex-wrap mb-4" style={{ gap: 8 }}>
            {[
              'Log 50 cedis for fuel',
              'Spent 25 on lunch',
              'Check balance',
            ].map((phrase) => (
              <TouchableOpacity
                key={phrase}
                onPress={() => processSpokenInput(phrase)}
                disabled={isProcessing}
                className={`px-3 py-1.5 rounded-full border ${
                  isDark
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : 'bg-emerald-50 border-emerald-200'
                }`}
              >
                <Text
                  className={`text-[11px] font-medium ${
                    isDark ? 'text-emerald-400' : 'text-emerald-800'
                  }`}
                >
                  "{phrase}"
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Bottom Call Controls */}
          <View
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
            className="flex-row items-center justify-around px-8"
          >
            {/* Mute Button */}
            <TouchableOpacity
              onPress={handleToggleMute}
              activeOpacity={0.8}
              className={`w-14 h-14 rounded-full items-center justify-center border ${
                isMuted
                  ? 'bg-rose-500/20 border-rose-500/40'
                  : isDark
                  ? 'bg-white/10 border-white/15'
                  : 'bg-black/5 border-black/10'
              }`}
              accessibilityLabel={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? (
                <MicOff size={22} color="#f43f5e" />
              ) : (
                <Mic size={22} color={isDark ? 'white' : '#1C1C2E'} />
              )}
            </TouchableOpacity>

            {/* End Call Button */}
            <TouchableOpacity
              onPress={handleClose}
              activeOpacity={0.8}
              className="w-16 h-16 rounded-full bg-rose-500 items-center justify-center shadow-lg active:scale-95"
              accessibilityLabel="End voice call"
            >
              <PhoneOff size={26} color="white" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};
