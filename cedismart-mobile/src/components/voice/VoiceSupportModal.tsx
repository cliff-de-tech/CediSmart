import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import {
  Mic,
  MicOff,
  X,
  Plus,
  CheckCircle2,
} from 'lucide-react-native';
import { VoiceOrb, VoiceState } from './VoiceOrb';
import { voiceService, VoiceAction } from '../../services/voiceService';
import { GlassSurface } from '../glass/GlassSurface';
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
  userName,
  phone,
  initialContext = 'dashboard',
  navigation,
}) => {
  const theme = useThemeStore((state) => state.theme);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  // Voice Interaction States
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [actionToast, setActionToast] = useState<{
    title: string;
    description: string;
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
      const cleanName = (userName || '').replace(/^(mr|mrs|ms|dr|rev|prof)\.?\s+/i, '').trim().split(' ')[0];
      const greeting = cleanName ? `Hi ${cleanName}, I'm listening.` : "Hi, I'm listening.";

      voiceService.speak(
        greeting,
        () => setVoiceState('speaking'),
        () => setVoiceState('listening'),
        () => setVoiceState('idle')
      );
    } else {
      voiceService.stop();
      setVoiceState('idle');
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

    setIsProcessing(true);
    setVoiceState('thinking');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    try {
      const action: VoiceAction = voiceService.parseSpokenIntent(spokenText);

      if (action.type === 'create_transaction' && action.payload) {
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

        let targetCategoryId = categories?.[0]?.id;
        if (categories && categories.length > 0) {
          const matchedCat = categories.find((c) =>
            c.name.toLowerCase().includes(action.payload.categoryName.toLowerCase())
          );
          if (matchedCat) targetCategoryId = matchedCat.id;
        }

        if (targetAccountId) {
          const txDate = new Date().toISOString();
          await apiClient.post('/transactions/', {
            account_id: targetAccountId,
            category_id: targetCategoryId,
            amount: action.payload.amount,
            type: action.payload.type,
            description: action.payload.description,
            transaction_date: txDate,
          });

          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['accounts'] });
          queryClient.invalidateQueries({ queryKey: ['budgets'] });

          const formatted = formatGHS(action.payload.amount);
          setActionToast({
            title: `Recorded ${formatted} ${action.payload.type === 'expense' ? 'Spent' : 'Received'}`,
            description: `${action.payload.description} • ${action.payload.categoryName}`,
          });

          setVoiceState('executed');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

          const cleanName = (userName || '').replace(/^(mr|mrs|ms|dr|rev|prof)\.?\s+/i, '').trim().split(' ')[0];
          const namePrefix = cleanName ? `${cleanName}, ` : '';
          const reply = `Done ${namePrefix}! Recorded ${formatted} for ${action.payload.description}.`;

          setTimeout(() => {
            voiceService.speak(
              reply,
              () => setVoiceState('speaking'),
              () => setVoiceState('listening'),
              () => setVoiceState('idle')
            );
          }, 300);

          setIsProcessing(false);
          return;
        }
      }

      if (action.type === 'check_balance') {
        const totalBalance = (accounts || []).reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
        const reply = `Your total available balance is ${formatGHS(totalBalance)}.`;
        setActionToast({
          title: `Balance: ${formatGHS(totalBalance)}`,
          description: `${(accounts || []).length} active wallets`,
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
        const reply = `Opening ${screenName}.`;
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

      const cleanName = (userName || '').replace(/^(mr|mrs|ms|dr|rev|prof)\.?\s+/i, '').trim().split(' ')[0];
      const res = await apiClient.post('/support/chat', {
        messages: [{ role: 'user', content: `[VOICE_MODE: Speak concisely in 1-2 short sentences] ${spokenText}` }],
        phone: phone || 'Anonymous',
        user_name: cleanName || userName,
        support_type: 'general',
      });

      const reply = res.data?.response || "I'm listening, go ahead.";
      voiceService.speak(
        reply,
        () => setVoiceState('speaking'),
        () => setVoiceState('listening'),
        () => setVoiceState('idle')
      );
    } catch (err: any) {
      console.warn('[VoiceSupport] Error:', err);
      const errReply = "Could you please say that again?";
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

  const handleClose = () => {
    Haptics.selectionAsync().catch(() => {});
    voiceService.stop();
    onClose();
  };

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

  const handleInterrupt = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    voiceService.stop();
    setVoiceState('listening');
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
          {/* Minimal Top Indicator matching ChatGPT Voice */}
          <View style={styles.topBar}>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.topIndicator}
            >
              <View style={styles.topDash} />
              <View style={styles.topDot} />
            </TouchableOpacity>
          </View>

          {/* Majestic Center Voice Orb */}
          <View style={styles.centerOrbWrapper}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={voiceState === 'speaking' ? handleInterrupt : undefined}
            >
              <VoiceOrb state={voiceState} size={210} />
            </TouchableOpacity>
          </View>

          {/* Floating Action Confirmation Toast (Only appears when task executes) */}
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

          {/* ChatGPT Voice Bottom Bar (Search pill on left, Mute in middle, White Close on right) */}
          <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {/* Ask CediSmart Text Pill */}
            <TouchableOpacity
              onPress={handleClose}
              activeOpacity={0.8}
              style={styles.askPill}
              accessibilityLabel="Switch to text composer"
            >
              <Plus size={18} color="#9CA3AF" />
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

            {/* White Circular Close Button matching OpenAI Voice */}
            <TouchableOpacity
              onPress={handleClose}
              activeOpacity={0.85}
              style={styles.closeBtn}
              accessibilityLabel="Close voice mode"
            >
              <X size={22} color="#000000" />
            </TouchableOpacity>
          </View>
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
  toastContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
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
});
