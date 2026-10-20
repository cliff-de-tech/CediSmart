import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Clipboard,
  Image,
  Linking,
  PermissionsAndroid,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Send,
  Bot,
  User,
  Sparkles,
  AlertCircle,
  Plus,
  Camera,
  Key,
  ExternalLink,
  RefreshCw,
  Stethoscope,
  Zap,
  CheckCircle2,
  BookOpen,
  ArrowUpRight,
  PieChart,
  MessageSquare,
  RotateCcw,
  History,
  Clock,
  Trash2,
  Headphones,
  Mic,
  AudioLines,
  Landmark,
} from 'lucide-react-native';
import apiClient from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import { useOfflineStore } from '../../stores/offlineStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GlassSurface } from '../glass/GlassSurface';
import { CoinBackground } from './CoinBackground';
import { VoiceSupportModal } from '../voice/VoiceSupportModal';

// Height of one quick-action row; the list shows exactly two rows and scrolls for the rest.
const QUICK_ACTION_ROW_HEIGHT = 44;

export type ActionTag =
  | 'GENERATE_MOMO_KEY'
  | 'OPEN_SHORTCUTS'
  | 'SYNC_OFFLINE_QUEUE'
  | 'HEAL_APP'
  | 'NAV_ADD_EXPENSE'
  | 'NAV_BUDGETS'
  | 'NAV_TRANSACTIONS'
  | 'REPORT_PROBLEM'
  | 'PROBLEM_RESOLVED';

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  imageUri?: string;
  image_base64?: string;
  image_mime_type?: string;
  actions?: ActionTag[];
  status?: 'sending' | 'sent' | 'failed';
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

interface TicketStatusData {
  issue_number: number;
  state: string;
  title: string;
  issue_url: string;
  labels: string[];
  user_status?: string;
  status_label?: string;
  status_description?: string;
  stage_step?: number;
}

export interface SupportModalProps {
  visible: boolean;
  onClose: () => void;
  phone?: string;
  userName?: string;
  supportType?: 'auth' | 'general';
  screenContext?: 'dashboard' | 'budgets' | 'transactions' | 'settings' | 'auth';
  navigation?: any;
  startNewChatOnOpen?: boolean;
}

export const OFFLINE_HELP_GUIDES = [
  {
    title: 'How to Record an Expense',
    summary: 'Tap "+ Add Expense" from Home. Enter the amount, choose Cash, MoMo, or Bank, and select a category.',
  },
  {
    title: 'Understanding Tracked Balance',
    summary: 'Your Tracked Balance reflects your starting balance plus income minus recorded expenses across all active accounts.',
  },
  {
    title: 'Mobile Money Auto-Sync',
    summary: 'On Android, grant SMS reading permission in Accounts. On iPhone, configure an Apple Shortcuts message automation.',
  },
  {
    title: 'Offline Mode & Queue',
    summary: 'Transactions recorded without internet are stored safely on your phone and automatically upload when reconnected.',
  },
  {
    title: 'Reconciling Cash Balances',
    summary: 'Count your physical cash, go to Settings > Accounts, and enter your exact cash on hand to reconcile.',
  },
];

export const getScreenQuickPrompts = (ctx?: string, type?: string) => {
  if (type === 'auth') {
    return [
      'My verification code did not arrive',
      'I forgot my 6-digit PIN',
      'How does phone verification work?',
      'Check for problems',
    ];
  }
  switch (ctx) {
    case 'budgets':
      return [
        'How to set a monthly budget',
        'My spending looks wrong',
        'Check for problems',
        'Help Guides (Offline)',
      ];
    case 'transactions':
      return [
        'Find a missing transaction',
        'How to edit or delete a transaction',
        'What are pending uploads?',
        'Check for problems',
        'Help Guides (Offline)',
      ];
    case 'settings':
      return [
        'How to setup MoMo Auto-Sync',
        'Reconcile my cash balance',
        'Check for problems',
        'Help Guides (Offline)',
      ];
    case 'dashboard':
    default:
      return [
        'Paste MoMo SMS to Auto-Log',
        'Explain my tracked balance',
        'Record an expense',
        'Check for problems',
        'Help Guides (Offline)',
      ];
  }
};

const ACTION_TAG_REGEX = /\[ACTION:(GENERATE_MOMO_KEY|OPEN_SHORTCUTS|SYNC_OFFLINE_QUEUE|HEAL_APP|NAV_ADD_EXPENSE|NAV_BUDGETS|NAV_TRANSACTIONS|REPORT_PROBLEM|PROBLEM_RESOLVED)\]/g;

const extractActionsAndCleanText = (rawText: string): { cleanText: string; actions: ActionTag[] } => {
  const found = new Set<ActionTag>();
  let match: RegExpExecArray | null;
  const regex = new RegExp(ACTION_TAG_REGEX.source, 'g');
  while ((match = regex.exec(rawText)) !== null) {
    found.add(match[1] as ActionTag);
  }
  const cleanText = rawText.replace(ACTION_TAG_REGEX, '').trim();
  return { cleanText, actions: Array.from(found) };
};

const parseInlineStyles = (text: string) => {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Text key={index} className="font-bold">
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <Text key={index} className="italic">
          {part.slice(1, -1)}
        </Text>
      );
    }
    return part;
  });
};

const parseMarkdown = (text: string, isDark: boolean) => {
  const lines = text.split('\n');
  return lines.map((line, lineIndex) => {
    if (line.trim() === '') {
      return <View key={lineIndex} style={{ height: 6 }} />;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const fontSize = level === 1 ? 20 : level === 2 ? 17 : 15;
      return (
        <Text
          key={lineIndex}
          selectable={true}
          style={{ fontSize, fontWeight: 'bold', marginVertical: 4 }}
          className={isDark ? 'text-dark-on-surface' : 'text-on-surface'}
        >
          {parseInlineStyles(content)}
        </Text>
      );
    }

    const listMatch = line.match(/^(\s*)([*\-•])\s+(.*)$/);
    if (listMatch) {
      const indent = listMatch[1].length * 10;
      const content = listMatch[3];
      return (
        <View key={lineIndex} className="flex-row items-start mb-1" style={{ marginLeft: indent + 6 }}>
          <Text selectable={true} className={`mr-2 ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>•</Text>
          <Text selectable={true} className={`flex-1 font-body text-sm ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} leading-relaxed`}>
            {parseInlineStyles(content)}
          </Text>
        </View>
      );
    }

    const numListMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (numListMatch) {
      const indent = numListMatch[1].length * 10;
      const index = numListMatch[2];
      const content = numListMatch[3];
      return (
        <View key={lineIndex} className="flex-row items-start mb-1" style={{ marginLeft: indent + 6 }}>
          <Text selectable={true} className={`mr-2 font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>{index}.</Text>
          <Text selectable={true} className={`flex-1 font-body text-sm ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} leading-relaxed`}>
            {parseInlineStyles(content)}
          </Text>
        </View>
      );
    }

    return (
      <Text
        key={lineIndex}
        selectable={true}
        className={`font-body text-sm ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} leading-relaxed mb-1`}
      >
        {parseInlineStyles(line)}
      </Text>
    );
  });
};

export const SupportModal: React.FC<SupportModalProps> = ({
  visible,
  onClose,
  phone = 'Anonymous',
  userName,
  supportType = 'general',
  screenContext = 'dashboard',
  navigation,
  startNewChatOnOpen = false,
}) => {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const navProp = useNavigation<any>();
  const nav = navigation || navProp;
  const offlineQueue = useOfflineStore((state) => state.queue);
  const removeOfflineTransactions = useOfflineStore((state) => state.removeTransactions);
  const { user } = useAuthStore();

  // Clean and resolve user's actual first name (e.g. "Mr. Cliff" -> "Cliff")
  const rawDisplayName = userName || user?.full_name || '';
  const firstName = useMemo(() => {
    if (!rawDisplayName) return '';
    const titles = new Set(['mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'miss', 'dr', 'dr.', 'prof', 'prof.', 'rev', 'rev.', 'pastor']);
    const parts = rawDisplayName.trim().split(/\s+/).filter((p) => !titles.has(p.toLowerCase()));
    if (parts.length > 0) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
    }
    return '';
  }, [userName, user?.full_name, rawDisplayName]);

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const [showEscalate, setShowEscalate] = useState(false);
  const [escalatedTicket, setEscalatedTicket] = useState<{ number: number; url: string } | null>(null);
  const [ticketStatus, setTicketStatus] = useState<TicketStatusData | null>(null);
  const [isCheckingTicket, setIsCheckingTicket] = useState(false);
  const [isRunningDoctor, setIsRunningDoctor] = useState(false);
  const [showOfflineGuides, setShowOfflineGuides] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  // Screenshot / Receipt Vision attachment state
  const [attachedImage, setAttachedImage] = useState<{
    uri: string;
    base64: string;
    mimeType: string;
  } | null>(null);

  const textInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const sessionsStorageKey = `cedismart_chat_sessions_${phone.replace(/[^\d+]/g, '') || 'anonymous'}_${supportType}`;
  const legacyStorageKey = `cedismart_chat_history_${phone.replace(/[^\d+]/g, '') || 'anonymous'}_${supportType}`;

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const defaultGreeting: Message = {
    id: 'default_greeting',
    role: 'model',
    content:
      supportType === 'auth'
        ? (firstName
            ? `Hello ${firstName}! I am your CediSmart Onboarding Assistant. How can I help you with your account, SMS code, or login PIN today?`
            : "Hello! I am your CediSmart Onboarding Assistant. How can I help you with your account, SMS code, or login PIN today?")
        : (firstName
            ? `Hello ${firstName}! I am your CediSmart Assistant. How can I help you with your accounts, budgets, or Mobile Money today?`
            : "Hello! I am your CediSmart Assistant. How can I help you with your accounts, budgets, or Mobile Money today?"),
    actions: [],
    status: 'sent',
  };

  const buildClientDiagnostics = async () => {
    let hasSyncToken = false;
    try {
      const tok = await SecureStore.getItemAsync('access_token');
      hasSyncToken = !!tok;
    } catch {}
    const appVer = Constants.expoConfig?.version || '1.0.0';
    return {
      os: Platform.OS,
      os_version: String(Platform.Version),
      app_version: appVer,
      offline_queue_count: offlineQueue.length,
      has_momo_sync_token: hasSyncToken,
    };
  };

  // Load chat sessions when modal becomes visible or profile changes
  useEffect(() => {
    const loadSessions = async () => {
      try {
        let savedSessions: ChatSession[] = [];
        const storedSessions = await AsyncStorage.getItem(sessionsStorageKey);
        if (storedSessions) {
          try {
            const parsed = JSON.parse(storedSessions) as ChatSession[];
            if (Array.isArray(parsed)) {
              // Only keep past sessions that had actual user interactions
              savedSessions = parsed.filter((s) => (s.messages || []).some((m) => m.role === 'user'));
            }
          } catch {}
        }

        // Migrate from legacy single-session storage if present
        if (savedSessions.length === 0) {
          try {
            const legacyStored = await AsyncStorage.getItem(legacyStorageKey);
            if (legacyStored) {
              const legacyMsgs = JSON.parse(legacyStored) as Message[];
              if (legacyMsgs && legacyMsgs.some((m) => m.role === 'user')) {
                const firstUserMsg = legacyMsgs.find((m) => m.role === 'user');
                const migratedSession: ChatSession = {
                  id: `sess_${Date.now() - 1000}`,
                  title: firstUserMsg
                    ? firstUserMsg.content.slice(0, 32) + (firstUserMsg.content.length > 32 ? '...' : '')
                    : 'Previous Conversation',
                  createdAt: Date.now() - 1000,
                  updatedAt: Date.now() - 1000,
                  messages: legacyMsgs,
                };
                savedSessions = [migratedSession];
                AsyncStorage.setItem(sessionsStorageKey, JSON.stringify([migratedSession])).catch(() => {});
              }
            }
          } catch {}
        }

        // ALWAYS open with a clean, fresh new chat session!
        const freshSession: ChatSession = {
          id: `sess_${Date.now()}`,
          title: 'New Conversation',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [defaultGreeting],
        };

        const allSessions = [freshSession, ...savedSessions];
        setSessions(allSessions);
        setActiveSessionId(freshSession.id);
        setMessages([defaultGreeting]);
        setIsHistoryLoaded(true);
      } catch (err) {
        console.warn('[AI Support] Error loading sessions:', err);
        const fallbackSession: ChatSession = {
          id: `sess_${Date.now()}`,
          title: 'New Conversation',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [defaultGreeting],
        };
        setSessions([fallbackSession]);
        setActiveSessionId(fallbackSession.id);
        setMessages([defaultGreeting]);
        setIsHistoryLoaded(true);
      }
    };

    if (visible) {
      setIsHistoryLoaded(false);
      loadSessions();
    }
  }, [visible, phone, supportType, startNewChatOnOpen]);

  // Save active session & messages
  useEffect(() => {
    if (!isHistoryLoaded || !activeSessionId || messages.length === 0) return;
    setSessions((prevSessions) => {
      const updated = prevSessions.map((s) => {
        if (s.id !== activeSessionId) return s;
        const firstUserMsg = messages.find((m) => m.role === 'user');
        const title =
          s.title === 'New Conversation' && firstUserMsg
            ? firstUserMsg.content.slice(0, 32) + (firstUserMsg.content.length > 32 ? '...' : '')
            : s.title;
        return {
          ...s,
          title,
          updatedAt: Date.now(),
          messages,
        };
      });

      // Only save conversations with actual user interactions to history storage
      const persistable = updated
        .filter((s) => (s.messages || []).some((m) => m.role === 'user'))
        .map((s) => ({
          ...s,
          messages: s.messages.map(({ image_base64, ...rest }) => rest),
        }));
      AsyncStorage.setItem(sessionsStorageKey, JSON.stringify(persistable)).catch(() => {});
      return updated;
    });
  }, [messages, isHistoryLoaded, activeSessionId]);

  useEffect(() => {
    if (visible) {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [visible]);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const handleMessagePress = (msg: Message) => {
    const isUser = msg.role === 'user';
    const actions: { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[] = [
      {
        text: '📋 Copy Text',
        onPress: () => {
          Clipboard.setString(msg.content);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        },
      },
    ];

    if (isUser) {
      actions.push({
        text: '✏️ Edit Message',
        onPress: () => {
          setInput(msg.content);
          textInputRef.current?.focus();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        },
      });
    }

    actions.push({
      text: 'Cancel',
      style: 'cancel' as const,
    });

    Alert.alert(
      isUser ? 'Message Options' : 'AI Assistant Options',
      'Choose an action for this message:',
      actions
    );
  };

  const handleSelectSession = (session: ChatSession) => {
    setActiveSessionId(session.id);
    setMessages(session.messages && session.messages.length > 0 ? session.messages : [defaultGreeting]);
    setShowHistoryModal(false);
    setAttachedImage(null);
    setShowEscalate(false);
    setEscalatedTicket(null);
    Haptics.selectionAsync().catch(() => {});
  };

  const handleNewChat = () => {
    const newSession: ChatSession = {
      id: `sess_${Date.now()}`,
      title: 'New Conversation',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [defaultGreeting],
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setMessages([defaultGreeting]);
    setShowHistoryModal(false);
    setAttachedImage(null);
    setShowEscalate(false);
    setEscalatedTicket(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const handleDeleteSession = (sessionId: string) => {
    Alert.alert(
      'Delete Conversation',
      'Are you sure you want to delete this conversation? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setSessions((prev) => {
              const filtered = prev.filter((s) => s.id !== sessionId);
              const remaining =
                filtered.length > 0
                  ? filtered
                  : [
                      {
                        id: `sess_${Date.now()}`,
                        title: 'New Conversation',
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        messages: [defaultGreeting],
                      },
                    ];
              if (activeSessionId === sessionId) {
                setActiveSessionId(remaining[0].id);
                setMessages(remaining[0].messages);
              }
              const lightweight = remaining.map((s) => ({
                ...s,
                messages: s.messages.map(({ image_base64, ...rest }) => rest),
              }));
              AsyncStorage.setItem(sessionsStorageKey, JSON.stringify(lightweight)).catch(() => {});
              return remaining;
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          },
        },
      ]
    );
  };

  // Screenshot & Receipt Vision Picker (Expo SDK 57 ImagePicker API)
  const handlePickImage = () => {
    Haptics.selectionAsync().catch(() => {});
    Alert.alert(
      'Attach Screenshot or Receipt',
      'Send a screenshot of an error, a MoMo SMS, or a receipt photo for visual AI diagnosis.',
      [
        {
          text: '🖼️ Choose from Library',
          onPress: async () => {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
              Alert.alert('Permission Required', 'Please allow photo library access to attach screenshots.');
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
              });
            }
          },
        },
        {
          text: '📷 Take Photo',
          onPress: async () => {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
              Alert.alert('Permission Required', 'Please allow camera access to snap a receipt or screen photo.');
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
              });
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  // Check for Problems Routine (Plain-Language Outcomes)
  const runSelfHealDoctor = async () => {
    if (isRunningDoctor) return;
    setIsRunningDoctor(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      // 1. Refetch and synchronize data
      const refreshResults = await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['budgets'] }),
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ]);
      const anyRefreshSuccess = refreshResults.some((r) => r.status === 'fulfilled');

      // 2. Offline queue reconciliation: only remove succeeded items
      let queueReport = '• No transactions are waiting to upload.';
      if (offlineQueue.length > 0) {
        try {
          const bulkRes = await apiClient.post('/transactions/bulk', {
            transactions: offlineQueue,
          });
          const failedIds = new Set((bulkRes.data?.errors || []).map((e: any) => e.client_id));
          const succeededIds = offlineQueue.filter((t) => !failedIds.has(t.client_id)).map((t) => t.client_id);
          if (succeededIds.length > 0) {
            removeOfflineTransactions(succeededIds);
          }
          if (failedIds.size === 0) {
            queueReport = `• Uploaded ${succeededIds.length} pending transaction(s) successfully.`;
          } else {
            queueReport = `• ${failedIds.size} transaction(s) are still waiting for a stronger connection.`;
          }
        } catch {
          queueReport = `• ${offlineQueue.length} transaction(s) are waiting to upload when your internet reconnects.`;
        }
      }

      const reportContent = anyRefreshSuccess
        ? `✅ **Check complete**\n\n• Your transactions and balances have been refreshed.\n${queueReport}\n\n**Did this solve your problem?**`
        : `⚠️ **Couldn't refresh your transactions**\n\nPlease check your internet connection and try again.\n\n${queueReport}\n\n**Did this solve your problem?**`;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setMessages((prev) => [
        ...prev,
        {
          id: `diag_${Date.now()}`,
          role: 'model',
          content: reportContent,
          actions: anyRefreshSuccess ? ['PROBLEM_RESOLVED', 'REPORT_PROBLEM'] : ['HEAL_APP', 'REPORT_PROBLEM'],
          status: 'sent',
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `diag_err_${Date.now()}`,
          role: 'model',
          content: '⚠️ **Check unavailable**\n\nCould not complete the system check right now. Please check your network and try again.',
          actions: ['HEAL_APP', 'REPORT_PROBLEM'],
          status: 'sent',
        },
      ]);
    } finally {
      setIsRunningDoctor(false);
    }
  };

  // Execute 1-Tap Action Cards & Navigation Shortcuts
  const handleActionCardPress = async (action: ActionTag) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (action === 'PROBLEM_RESOLVED') {
      setMessages((prev) => [
        ...prev,
        {
          id: `resolved_${Date.now()}`,
          role: 'model',
          content: 'Glad to hear that solved your issue! Please let us know whenever you need help with CediSmart.',
          status: 'sent',
        },
      ]);
      return;
    }

    if (action === 'HEAL_APP') {
      await runSelfHealDoctor();
      return;
    }

    if (action === 'NAV_ADD_EXPENSE') {
      onClose();
      try {
        nav.navigate('AddTransaction');
      } catch {}
      return;
    }

    if (action === 'NAV_BUDGETS') {
      onClose();
      try {
        nav.navigate('MainTabs', { screen: 'BudgetsTab' });
      } catch {
        try {
          nav.navigate('BudgetsTab');
        } catch {}
      }
      return;
    }

    if (action === 'NAV_TRANSACTIONS') {
      void Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ['accounts'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['transactions'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['budgets'], refetchType: 'all' }),
        queryClient.refetchQueries({ queryKey: ['accounts'], type: 'all' }),
        queryClient.refetchQueries({ queryKey: ['transactions'], type: 'all' }),
        queryClient.refetchQueries({ queryKey: ['transactions', 'summary'], type: 'all' }),
        queryClient.refetchQueries({ queryKey: ['budgets'], type: 'all' }),
      ]);
      onClose();
      try {
        nav.navigate('MainTabs', { screen: 'DashboardTab' });
      } catch {
        try {
          nav.navigate('DashboardTab');
        } catch {}
      }
      return;
    }

    if (action === 'REPORT_PROBLEM') {
      setShowEscalate(true);
      return;
    }

    if (action === 'OPEN_SHORTCUTS') {
      Linking.openURL('shortcuts://').catch(() => {
        Alert.alert(
          'Shortcuts App',
          'Could not open Apple Shortcuts automatically. Please open the built-in Shortcuts app from your Home Screen.'
        );
      });
      return;
    }

    if (action === 'SYNC_OFFLINE_QUEUE') {
      if (offlineQueue.length === 0) {
        Alert.alert('All Synced!', 'Your offline transaction queue is already empty and up to date.');
        return;
      }
      await runSelfHealDoctor();
      return;
    }

    if (action === 'GENERATE_MOMO_KEY') {
      const webhookUrl = 'https://api.cedismart.com/api/v1/transactions/sms-webhook';
      if (Platform.OS === 'android') {
        Alert.alert(
          '⚡ Configure MoMo Auto-Sync',
          'Would you like to grant Android background SMS permissions now, or copy your Webhook Auth Key?',
          [
            {
              text: '🤖 Grant Android SMS Permission',
              onPress: async () => {
                try {
                  const granted = await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
                    PermissionsAndroid.PERMISSIONS.READ_SMS,
                  ]);
                  if (
                    granted['android.permission.RECEIVE_SMS'] === PermissionsAndroid.RESULTS.GRANTED &&
                    granted['android.permission.READ_SMS'] === PermissionsAndroid.RESULTS.GRANTED
                  ) {
                    Alert.alert('Success!', 'Background MoMo SMS Auto-Sync is now active on your Android device.');
                  }
                } catch {}
              },
            },
            {
              text: '🔑 Copy Auth Key',
              onPress: async () => {
                const token = await SecureStore.getItemAsync('access_token');
                if (token) {
                  Clipboard.setString(`Bearer ${token}`);
                  Alert.alert('Copied!', 'Your Bearer Auth Key is copied to your clipboard.');
                } else {
                  Clipboard.setString(webhookUrl);
                  Alert.alert('Copied!', 'Webhook URL copied to clipboard.');
                }
              },
            },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      } else {
        Alert.alert(
          '🍎 iOS MoMo Auto-Sync Helper',
          'Copy your Webhook URL or Bearer Auth Key for Apple Shortcuts:',
          [
            {
              text: '🔗 Copy Webhook URL',
              onPress: () => {
                Clipboard.setString(webhookUrl);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                Alert.alert('Copied!', 'Webhook URL copied to clipboard.');
              },
            },
            {
              text: '🔑 Copy Bearer Auth Key',
              onPress: async () => {
                const token = await SecureStore.getItemAsync('access_token');
                if (token) {
                  Clipboard.setString(`Bearer ${token}`);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  Alert.alert('Copied!', 'Your Bearer <token> header value has been copied to your clipboard.');
                } else {
                  Alert.alert('Sign In Required', 'Please log in first so we can generate your secure Auth Key.');
                }
              },
            },
            {
              text: '📲 Open Shortcuts App',
              onPress: () => {
                Linking.openURL('shortcuts://').catch(() => {});
              },
            },
            { text: 'Close', style: 'cancel' },
          ]
        );
      }
    }
  };

  // Check Live GitHub Ticket & Autonomous ChatGPT PR Status
  const checkLiveTicketStatus = async (issueNum?: number) => {
    const targetIssue = issueNum || escalatedTicket?.number;
    if (!targetIssue || targetIssue <= 0) return;
    setIsCheckingTicket(true);
    try {
      const res = await apiClient.get<TicketStatusData>(`/support/ticket-status/${targetIssue}`);
      setTicketStatus(res.data);
      Haptics.selectionAsync().catch(() => {});
    } catch (err) {
      console.warn('[AI Support] Failed to fetch ticket status:', err);
    } finally {
      setIsCheckingTicket(false);
    }
  };

  // Retry failed user message
  const handleRetryMessage = (failedMsg: Message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setMessages((prev) =>
      prev.map((m) => (m.id === failedMsg.id ? { ...m, status: 'sending' } : m))
    );
    const msgIdx = messages.findIndex((m) => m.id === failedMsg.id);
    const historyToSend = msgIdx >= 0 ? messages.slice(0, msgIdx + 1) : messages;
    chatMutation.mutate({
      chatHistory: historyToSend,
      imageBase64: failedMsg.image_base64,
      imageMimeType: failedMsg.image_mime_type,
      targetMessageId: failedMsg.id,
    });
  };

  // Chat Mutation
  const chatMutation = useMutation({
    mutationFn: async (payload: {
      chatHistory: Message[];
      imageBase64?: string;
      imageMimeType?: string;
      targetMessageId?: string;
    }) => {
      const diagnostics = await buildClientDiagnostics();
      const apiMessages = payload.chatHistory.map((m) => ({
        role: m.role,
        content: m.content,
        image_base64: m.image_base64,
        image_mime_type: m.image_mime_type,
      }));
      const response = await apiClient.post('/support/chat', {
        messages: apiMessages,
        support_type: supportType,
        device_diagnostics: diagnostics,
        user_name: firstName || userName || user?.full_name || 'Friend',
        phone: phone,
        image_base64: payload.imageBase64,
        image_mime_type: payload.imageMimeType,
      });
      return {
        responseText: response.data.response as string,
        targetMessageId: payload.targetMessageId,
      };
    },
    onSuccess: ({ responseText, targetMessageId }) => {
      let workingText = responseText;
      let needsEscalation = false;

      if (workingText.includes('[ESCALATE_REQUIRED]')) {
        workingText = workingText.replace('[ESCALATE_REQUIRED]', '').trim();
        needsEscalation = true;
      }

      const { cleanText, actions } = extractActionsAndCleanText(workingText);

      // If the backend performed an Instant MoMo SMS Rescue or actions involve transactions, refresh all caches immediately!
      const isTxRescueOrAction =
        cleanText.includes('Instant MoMo SMS Rescue') ||
        cleanText.includes('Already Synced:') ||
        cleanText.includes('Already Recorded') ||
        cleanText.toLowerCase().includes('successfully logged') ||
        cleanText.toLowerCase().includes('logged this transaction') ||
        (cleanText.toLowerCase().includes('ledger') && cleanText.toLowerCase().includes('logged')) ||
        actions.includes('NAV_TRANSACTIONS') ||
        actions.includes('NAV_ADD_EXPENSE');

      if (isTxRescueOrAction) {
        void Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: ['accounts'], refetchType: 'all' }),
          queryClient.invalidateQueries({ queryKey: ['transactions'], refetchType: 'all' }),
          queryClient.invalidateQueries({ queryKey: ['budgets'], refetchType: 'all' }),
          queryClient.refetchQueries({ queryKey: ['accounts'], type: 'all' }),
          queryClient.refetchQueries({ queryKey: ['transactions'], type: 'all' }),
          queryClient.refetchQueries({ queryKey: ['transactions', 'summary'], type: 'all' }),
          queryClient.refetchQueries({ queryKey: ['budgets'], type: 'all' }),
        ]);
      }

      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === targetMessageId || (m.role === 'user' && m.status === 'sending')
            ? { ...m, status: 'sent' as const }
            : m
        );
        return [
          ...updated,
          {
            id: `msg_${Date.now()}`,
            role: 'model',
            content: cleanText,
            actions: actions.length > 0 ? actions : undefined,
            status: 'sent',
          },
        ];
      });
      if (needsEscalation && !escalatedTicket) {
        setShowEscalate(true);
      }
    },
    onError: (err: any, variables) => {
      console.warn('[AI Support] Chat error:', err);
      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === variables.targetMessageId || (m.role === 'user' && m.status === 'sending')
            ? { ...m, status: 'failed' as const }
            : m
        );
        return [
          ...updated,
          {
            id: `err_${Date.now()}`,
            role: 'model',
            content:
              'Could not reach the support server. Please check your internet connection or tap Retry above.',
            actions: ['HEAL_APP'],
            status: 'sent',
          },
        ];
      });
    },
  });

  // Problem Reporting Escalation Mutation
  const escalateMutation = useMutation({
    mutationFn: async () => {
      const userQueries = messages.filter((m) => m.role === 'user');
      const primaryQuery =
        userQueries.length > 0 ? userQueries[userQueries.length - 1].content : 'General inquiry';

      const diagnostics = await buildClientDiagnostics();

      const response = await apiClient.post('/support/escalate', {
        phone: phone,
        user_query: primaryQuery,
        chat_history: messages.map((m) => ({ role: m.role, content: m.content })),
        device_diagnostics: diagnostics,
      });
      return response.data;
    },
    onSuccess: (data) => {
      setEscalatedTicket({
        number: data.issue_number,
        url: data.issue_url,
      });
      setShowEscalate(false);

      const refNumber = data.issue_number > 0 ? `#${data.issue_number}` : `#${(data.ticket_id || '').substring(0, 8)}`;
      const successMsg = `✅ **Problem Report Submitted**\n\nThank you! Your report has been delivered to CediSmart Support (Reference: ${refNumber}).\n\nOur team has received your message and diagnostics and will assist you.`;

      setMessages((prev) => [
        ...prev,
        {
          id: `esc_${Date.now()}`,
          role: 'model',
          content: successMsg,
          status: 'sent',
        },
      ]);
    },
    onError: (err: any) => {
      console.warn('[AI Support] Escalation error:', err);
      Alert.alert(
        'Submission Failed',
        'Could not submit your report right now. Please check your internet connection and try again.'
      );
    },
  });

  const handleSend = () => {
    if ((!input.trim() && !attachedImage) || chatMutation.isPending) return;

    const textContent =
      input.trim() || 'Please analyze this attached screenshot / receipt and help me resolve or log it.';

    const newMsgId = `user_${Date.now()}`;
    const userMessage: Message = {
      id: newMsgId,
      role: 'user',
      content: textContent,
      imageUri: attachedImage?.uri,
      image_base64: attachedImage?.base64,
      image_mime_type: attachedImage?.mimeType,
      status: 'sending',
    };
    const updatedMessages = [...messages, userMessage];

    const imgBase64 = attachedImage?.base64;
    const imgMime = attachedImage?.mimeType;

    setMessages(updatedMessages);
    setInput('');
    setAttachedImage(null);
    chatMutation.mutate({
      chatHistory: updatedMessages,
      imageBase64: imgBase64,
      imageMimeType: imgMime,
      targetMessageId: newMsgId,
    });
  };

  const renderActionBadgeLabel = (action: ActionTag) => {
    switch (action) {
      case 'PROBLEM_RESOLVED':
        return { label: 'Yes, Problem Solved', icon: CheckCircle2 };
      case 'NAV_ADD_EXPENSE':
        return { label: 'Record an Expense', icon: Plus };
      case 'NAV_BUDGETS':
        return { label: 'Open Budgets', icon: PieChart };
      case 'NAV_TRANSACTIONS':
        return { label: 'View Transactions', icon: ArrowUpRight };
      case 'REPORT_PROBLEM':
        return { label: 'Report a Problem', icon: MessageSquare };
      case 'GENERATE_MOMO_KEY':
        return { label: 'Setup MoMo Auto-Sync', icon: Key };
      case 'OPEN_SHORTCUTS':
        return { label: 'Open Shortcuts App', icon: ExternalLink };
      case 'SYNC_OFFLINE_QUEUE':
        return { label: `Upload Pending (${offlineQueue.length})`, icon: RefreshCw };
      case 'HEAL_APP':
        return { label: 'Check for Problems', icon: Stethoscope };
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-surface'}`}>
        <CoinBackground />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1"
        >
          {/* Liquid Glass Header */}
          <GlassSurface
            tint="emerald"
            variant="thick"
            elevated
            radius={28}
            style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
          >
            <View
              style={{ paddingTop: Math.max(insets.top, 16) }}
              className="px-4 pb-4 flex-row items-center justify-between"
            >
              {/* Left Identity: Emerald Headphones Avatar + Live Green Indicator + Title */}
              <View className="flex-row items-center flex-1 min-w-0 mr-3">
                <View className="relative flex-shrink-0 mr-3">
                  <View
                    className={`w-10 h-10 rounded-2xl items-center justify-center border ${
                      isDark
                        ? 'bg-emerald-500/15 border-emerald-500/30'
                        : 'bg-emerald-600/10 border-emerald-600/25'
                    }`}
                  >
                    <Headphones size={20} color={isDark ? '#4ade80' : '#0d631b'} />
                  </View>
                  {/* Glowing live status dot */}
                  <View
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 ${
                      isDark ? 'border-[#0a180e]' : 'border-white'
                    }`}
                  />
                </View>

                <View className="flex-1 min-w-0 justify-center pr-1">
                  <Text
                    className={`font-headline font-bold text-base leading-tight ${
                      isDark ? 'text-white' : 'text-charcoal'
                    }`}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.8}
                  >
                    CediSmart Support
                  </Text>
                  <View className="flex-row items-center mt-1">
                    <Text
                      className={`font-body text-[11px] font-medium leading-none ${
                        isDark ? 'text-emerald-300' : 'text-emerald-700'
                      }`}
                      numberOfLines={1}
                      adjustsFontSizeToFit={true}
                      minimumFontScale={0.8}
                    >
                      Active • Finance & MoMo Assistant
                    </Text>
                  </View>
                </View>
              </View>

              {/* Right Action Suite: History, New Chat, Close */}
              <View className="flex-row items-center flex-shrink-0" style={{ gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setShowHistoryModal(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  className={`w-9 h-9 rounded-full ${
                    isDark ? 'bg-white/10 border border-white/10' : 'bg-black/5 border border-black/5'
                  } items-center justify-center`}
                  accessibilityLabel="Past conversations"
                >
                  <History size={17} color={isDark ? 'white' : '#1C1C2E'} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleNewChat}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  className={`w-9 h-9 rounded-full ${
                    isDark
                      ? 'bg-primary/25 border border-primary/40'
                      : 'bg-primary/10 border border-primary/25'
                  } items-center justify-center`}
                  accessibilityLabel="New Conversation"
                >
                  <Plus size={18} color={isDark ? '#4ade80' : '#0d631b'} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={onClose}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  className={`w-9 h-9 rounded-full ${
                    isDark ? 'bg-white/10 border border-white/10' : 'bg-black/5 border border-black/5'
                  } items-center justify-center`}
                  accessibilityLabel="Close support"
                >
                  <X size={18} color={isDark ? 'white' : '#1C1C2E'} />
                </TouchableOpacity>
              </View>
            </View>
          </GlassSurface>

          {/* Chat Messages */}
          <ScrollView
            ref={scrollViewRef}
            className="flex-1 px-4"
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 28 }}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              return (
                <View key={msg.id || index} className="mb-5">
                  <View className={`flex-row ${isUser ? 'justify-end' : 'justify-start'}`}>
                    {!isUser && (
                      <View className="w-8 h-8 rounded-full bg-primary/15 items-center justify-center mr-2 self-end">
                        <Bot size={16} color={isDark ? '#4ade80' : '#0d631b'} />
                      </View>
                    )}
                    {isUser ? (
                      <View className="max-w-[82%] items-end">
                        <TouchableOpacity
                          onLongPress={() => handleMessagePress(msg)}
                          delayLongPress={300}
                          activeOpacity={0.85}
                          className={`rounded-2xl rounded-tr-none px-4 py-3 shadow-sm ${
                            msg.status === 'failed' ? 'bg-error/90' : 'bg-primary'
                          }`}
                        >
                          {msg.imageUri && (
                            <Image
                              source={{ uri: msg.imageUri }}
                              style={{ width: 190, height: 130, borderRadius: 12, marginBottom: 8 }}
                              resizeMode="cover"
                            />
                          )}
                          <Text selectable={true} className="font-body text-sm text-white leading-relaxed">
                            {msg.content}
                          </Text>
                        </TouchableOpacity>

                        {/* Message Delivery Status / 1-Tap Retry */}
                        {msg.status === 'failed' && (
                          <TouchableOpacity
                            onPress={() => handleRetryMessage(msg)}
                            className="flex-row items-center mt-1.5 bg-error/15 px-3 py-1.5 rounded-full border border-error/30"
                          >
                            <RotateCcw size={12} color="#ef4444" />
                            <Text className="text-error font-headline font-bold text-[11px] ml-1.5">
                              Couldn't send. Tap to retry
                            </Text>
                          </TouchableOpacity>
                        )}
                        {msg.status === 'sending' && (
                          <Text className={`text-[10px] mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            Sending...
                          </Text>
                        )}
                      </View>
                    ) : (
                      <GlassSurface radius={20} style={{ maxWidth: '84%' }}>
                        <TouchableOpacity
                          onLongPress={() => handleMessagePress(msg)}
                          delayLongPress={300}
                          activeOpacity={0.85}
                          className="px-4 py-3"
                        >
                          <View className="space-y-1">
                            {parseMarkdown(msg.content, isDark)}
                          </View>
                        </TouchableOpacity>
                      </GlassSurface>
                    )}
                    {isUser && (
                      <View className="w-8 h-8 rounded-full bg-primary/20 items-center justify-center ml-2 self-end">
                        <User size={16} color={isDark ? '#4ade80' : '#0d631b'} />
                      </View>
                    )}
                  </View>

                  {/* 1-Tap Action Cards & Navigation Shortcuts */}
                  {!isUser && msg.actions && msg.actions.length > 0 && (
                    <View className="ml-10 mt-2.5 flex-row flex-wrap" style={{ gap: 8 }}>
                      {msg.actions.map((act) => {
                        const { label, icon: IconComp } = renderActionBadgeLabel(act);
                        return (
                          <TouchableOpacity
                            key={act}
                            onPress={() => handleActionCardPress(act)}
                            activeOpacity={0.85}
                            className={`flex-row items-center px-3.5 py-2 rounded-xl border ${
                              isDark
                                ? 'bg-primary/25 border-primary/40'
                                : 'bg-primary/10 border-primary/25'
                            }`}
                          >
                            <IconComp size={14} color={isDark ? '#4ade80' : '#0d631b'} />
                            <Text
                              className={`font-headline font-bold text-xs ml-2 ${
                                isDark ? 'text-[#4ade80]' : 'text-primary'
                              }`}
                            >
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}

            {/* AI thinking state */}
            {chatMutation.isPending && (
              <View className="flex-row mb-5 justify-start items-center">
                <View className="w-8 h-8 rounded-full bg-primary/15 items-center justify-center mr-2">
                  <Bot size={16} color={isDark ? '#4ade80' : '#0d631b'} />
                </View>
                <GlassSurface radius={20}>
                  <View className="px-4 py-3 flex-row items-center">
                    <ActivityIndicator size="small" color={isDark ? '#4ade80' : '#0d631b'} />
                    <Text className={`font-body text-xs ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} ml-2`}>
                      Checking...
                    </Text>
                  </View>
                </GlassSurface>
              </View>
            )}

            {/* Problem Reporting Card */}
            {showEscalate && !escalatedTicket && (
              <GlassSurface radius={22} style={{ marginBottom: 16 }}>
                <View className="p-5 items-center">
                  <View className="w-10 h-10 rounded-full bg-primary/15 items-center justify-center mb-2">
                    <MessageSquare size={20} color={isDark ? '#4ade80' : '#0d631b'} />
                  </View>
                  <Text className={`font-headline font-bold text-sm text-center mb-1 ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>
                    Report a Problem
                  </Text>
                  <Text className={`font-body text-xs text-center mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Need assistance from our team? Send your question and device diagnostics directly to CediSmart customer support.
                  </Text>
                  <View className="flex-row space-x-3 w-full">
                    <TouchableOpacity
                      onPress={() => setShowEscalate(false)}
                      className={`flex-1 py-3 rounded-xl items-center justify-center border ${isDark ? 'border-white/10' : 'border-gray-200'}`}
                    >
                      <Text className={`font-headline font-bold text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                        Cancel
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => escalateMutation.mutate()}
                      disabled={escalateMutation.isPending}
                      className="flex-1 bg-primary py-3 rounded-xl flex-row items-center justify-center shadow-sm"
                    >
                      {escalateMutation.isPending ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <Text className="text-white font-headline font-bold text-xs">
                          Send Report
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </GlassSurface>
            )}

            {/* User-Facing Problem Report Status Tracker */}
            {escalatedTicket && (
              <GlassSurface radius={22} style={{ marginBottom: 16 }}>
                <View className="p-5">
                  <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-row items-center">
                      <MessageSquare size={18} color={isDark ? '#4ade80' : '#0d631b'} />
                      <Text className={`font-headline font-bold text-sm ml-2 ${isDark ? 'text-white' : 'text-charcoal'}`}>
                        Report #{escalatedTicket.number}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => checkLiveTicketStatus()}
                      disabled={isCheckingTicket}
                      className="flex-row items-center px-3 py-1.5 rounded-full bg-primary/10"
                    >
                      {isCheckingTicket ? (
                        <ActivityIndicator size="small" color={isDark ? '#4ade80' : '#0d631b'} />
                      ) : (
                        <>
                          <RefreshCw size={12} color={isDark ? '#4ade80' : '#0d631b'} />
                          <Text className={`font-headline font-bold text-[10px] ml-1.5 ${isDark ? 'text-[#4ade80]' : 'text-primary'}`}>
                            Check Status
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* 4-Step Progress Indicator: Report received → Investigating → Fix being tested → Update available */}
                  <View className="flex-row items-center justify-between mb-4 mt-2 px-1">
                    {[
                      { step: 1, label: 'Received' },
                      { step: 2, label: 'Investigating' },
                      { step: 3, label: 'Fix in QA' },
                      { step: 4, label: 'Update Ready' },
                    ].map((st) => {
                      const currentStage = ticketStatus?.stage_step || 1;
                      const isDone = currentStage > st.step;
                      const isCurrent = currentStage === st.step;
                      return (
                        <View key={st.step} className="items-center flex-1">
                          <View
                            className={`w-7 h-7 rounded-full items-center justify-center mb-1 ${
                              isDone
                                ? 'bg-success'
                                : isCurrent
                                  ? 'bg-primary'
                                  : isDark
                                    ? 'bg-white/10'
                                    : 'bg-black/10'
                            }`}
                          >
                            {isDone ? (
                              <CheckCircle2 size={14} color="white" />
                            ) : isCurrent ? (
                              <ActivityIndicator size="small" color="white" />
                            ) : (
                              <Text className={`font-bold text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                {st.step}
                              </Text>
                            )}
                          </View>
                          <Text
                            className={`text-[9px] font-headline text-center ${
                              isCurrent || isDone
                                ? isDark
                                  ? 'text-white font-bold'
                                  : 'text-charcoal font-bold'
                                : isDark
                                  ? 'text-gray-400'
                                  : 'text-gray-500'
                            }`}
                            numberOfLines={1}
                          >
                            {st.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  <Text className={`font-body text-xs leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    {ticketStatus?.status_description ||
                      'Your report and device diagnostics have been logged with CediSmart Support. Our team is working on it.'}
                  </Text>
                </View>
              </GlassSurface>
            )}
          </ScrollView>

          {/* Chat Input Bar + Quick Actions (no surrounding container, ChatGPT-style) */}
          <View>
            {/* Attached Screenshot / Receipt Preview */}
            {attachedImage && (
              <View className="px-4 pt-3 flex-row items-center">
                <View className="relative">
                  <Image
                    source={{ uri: attachedImage.uri }}
                    style={{ width: 56, height: 56, borderRadius: 12 }}
                  />
                  <TouchableOpacity
                    onPress={() => setAttachedImage(null)}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-error items-center justify-center"
                  >
                    <X size={12} color="white" />
                  </TouchableOpacity>
                </View>
                <Text
                  className={`font-body text-xs ml-3 flex-1 ${
                    isDark ? 'text-emerald-300' : 'text-emerald-800'
                  }`}
                >
                  Screenshot / Receipt attached for visual analysis
                </Text>
              </View>
            )}

            {/* Quick Helper Actions: Vertically stacked matching /tmp/131462D0-8DA4-4413-833D-B2F502B60D29.jpeg */}
            {/* Auto-disappears immediately when the user starts typing */}
            {supportType !== 'auth' && !attachedImage && !input.trim() && (
              <View className="px-5" style={{ height: QUICK_ACTION_ROW_HEIGHT * 2 }}>
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  snapToInterval={QUICK_ACTION_ROW_HEIGHT}
                  decelerationRate="fast"
                  keyboardShouldPersistTaps="handled"
                >
                  {getScreenQuickPrompts(screenContext, supportType).map((promptText, idx) => {
                    let IconComponent = Sparkles;
                    if (promptText === 'Paste MoMo SMS to Auto-Log') IconComponent = Zap;
                    else if (promptText === 'Check for problems') IconComponent = Stethoscope;
                    else if (promptText === 'Help Guides (Offline)') IconComponent = BookOpen;
                    else if (promptText.includes('budget') || promptText.includes('Budget')) IconComponent = PieChart;
                    else if (promptText.includes('balance') || promptText.includes('account')) IconComponent = Landmark;

                    return (
                      <TouchableOpacity
                        key={idx}
                        activeOpacity={0.7}
                        onPress={async () => {
                          Haptics.selectionAsync().catch(() => {});
                          if (promptText === 'Paste MoMo SMS to Auto-Log') {
                            const clip = await Clipboard.getString();
                            if (clip && clip.trim().length > 0) {
                              setInput(clip.trim());
                              textInputRef.current?.focus();
                            } else {
                              Alert.alert('Paste MoMo SMS', 'Copy any MTN, Telecel, or AT Money SMS to your clipboard first, then tap here.');
                            }
                          } else if (promptText === 'Check for problems') {
                            runSelfHealDoctor();
                          } else if (promptText === 'Help Guides (Offline)') {
                            setShowOfflineGuides(true);
                          } else {
                            setInput(promptText);
                            textInputRef.current?.focus();
                          }
                        }}
                        style={{ height: QUICK_ACTION_ROW_HEIGHT }}
                        className="flex-row items-center"
                      >
                        <View className="w-7 items-center justify-center mr-3">
                          <IconComponent size={20} color={isDark ? '#4ade80' : '#0d631b'} />
                        </View>
                        <Text
                          numberOfLines={1}
                          className={`flex-1 font-body text-base font-medium ${
                            isDark ? 'text-gray-200' : 'text-charcoal'
                          }`}
                        >
                          {promptText}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Unified ChatGPT-Style Composer Capsule matching /tmp/131462D0-8DA4-4413-833D-B2F502B60D29.jpeg */}
            <View
              style={{ paddingBottom: Math.max(insets.bottom, 12) }}
              className="px-4 pt-1.5"
            >
              <View
                className={`flex-row items-center h-14 pl-2 pr-1.5 rounded-full ${
                  isDark ? 'bg-[#222222]' : 'bg-[#efefef]'
                }`}
              >
                {/* Plus Attach Button matching ChatGPT */}
                <TouchableOpacity
                  onPress={handlePickImage}
                  disabled={chatMutation.isPending}
                  className="w-10 h-10 rounded-full items-center justify-center"
                  accessibilityLabel="Attach Screenshot or Receipt"
                >
                  <Plus size={22} color={isDark ? '#F3F4F6' : '#1F2937'} />
                </TouchableOpacity>

                {/* Main Text Input: Ask CediSmart... */}
                <TextInput
                  ref={textInputRef}
                  className={`flex-1 h-full px-2 font-body text-base ${
                    isDark ? 'text-dark-on-surface' : 'text-on-surface'
                  }`}
                  placeholder={
                    attachedImage
                      ? 'Add a note for this image...'
                      : 'Ask CediSmart...'
                  }
                  placeholderTextColor={isDark ? '#9CA3AF' : '#6B7280'}
                  value={input}
                  onChangeText={setInput}
                  onSubmitEditing={handleSend}
                  blurOnSubmit={false}
                  editable={!chatMutation.isPending}
                />

                {/* Right Action: Voice Waveform (when empty) ➔ Send (when typed) */}
                {!input.trim() && !attachedImage ? (
                  <TouchableOpacity
                    onPress={() => setShowVoiceModal(true)}
                    className="w-10 h-10 rounded-full items-center justify-center bg-primary shadow-sm active:scale-95 ml-1"
                    accessibilityLabel="Open Live Voice Mode"
                  >
                    <AudioLines size={19} color="white" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={handleSend}
                    disabled={chatMutation.isPending}
                    className="w-10 h-10 rounded-full items-center justify-center bg-primary shadow-sm active:scale-95 ml-1"
                    accessibilityLabel="Send message"
                  >
                    {chatMutation.isPending ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Send size={17} color="white" />
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>

        {/* Past Conversations History Modal */}
        <Modal
          visible={showHistoryModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowHistoryModal(false)}
        >
          <View className="flex-1 justify-end bg-black/60">
            <GlassSurface
              variant="thick"
              elevated
              radius={32}
              style={{ width: '100%', maxHeight: 480, padding: 24, paddingBottom: Math.max(insets.bottom, 24) }}
            >
              <View className="flex-row justify-between items-center mb-4">
                <View className="flex-row items-center">
                  <History size={20} color={isDark ? '#4ade80' : '#0d631b'} />
                  <Text className={`font-headline font-bold text-lg ml-2 ${isDark ? 'text-white' : 'text-charcoal'}`}>
                    Past Conversations
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowHistoryModal(false)} className="p-1">
                  <X size={20} color={isDark ? '#9ca3af' : '#6b7280'} />
                </TouchableOpacity>
              </View>

              <View className="flex-row items-center mb-4" style={{ gap: 8 }}>
                <TouchableOpacity
                  onPress={handleNewChat}
                  className="flex-1 bg-primary py-3 rounded-2xl flex-row items-center justify-center shadow-sm"
                >
                  <Plus size={18} color="white" />
                  <Text className="text-white font-headline font-bold text-xs ml-2">
                    New Chat
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setShowHistoryModal(false);
                    runSelfHealDoctor();
                  }}
                  disabled={isRunningDoctor}
                  className={`px-4 py-3 rounded-2xl flex-row items-center justify-center border ${
                    isDark
                      ? 'bg-primary/20 border-primary/40'
                      : 'bg-primary/10 border-primary/25'
                  }`}
                  accessibilityLabel="Run Diagnostics"
                >
                  {isRunningDoctor ? (
                    <ActivityIndicator size="small" color={isDark ? '#4ade80' : '#0d631b'} />
                  ) : (
                    <>
                      <Stethoscope size={16} color={isDark ? '#4ade80' : '#0d631b'} />
                      <Text
                        className={`font-headline font-bold text-xs ml-1.5 ${
                          isDark ? 'text-[#4ade80]' : 'text-primary'
                        }`}
                      >
                        Diagnostics
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {sessions.filter((sess) => (sess.messages || []).some((m) => m.role === 'user')).length === 0 ? (
                  <View className="py-8 items-center justify-center">
                    <Text className={`font-body text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      No past conversations yet.
                    </Text>
                  </View>
                ) : (
                  sessions
                    .filter((sess) => (sess.messages || []).some((m) => m.role === 'user'))
                    .map((sess) => {
                      const isActive = sess.id === activeSessionId;
                      const msgCount = (sess.messages || []).filter((m) => m.role === 'user').length;
                      const dateStr = new Date(sess.updatedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      return (
                        <View
                          key={sess.id}
                          className={`p-3.5 rounded-2xl mb-2.5 border flex-row items-center justify-between ${
                            isActive
                              ? isDark
                                ? 'bg-primary/20 border-primary/50'
                                : 'bg-primary/10 border-primary/30'
                              : isDark
                                ? 'bg-white/5 border-white/10'
                                : 'bg-black/5 border-black/5'
                          }`}
                        >
                          <TouchableOpacity
                            onPress={() => handleSelectSession(sess)}
                            className="flex-1 mr-3"
                          >
                            <Text
                              numberOfLines={1}
                              className={`font-headline font-bold text-sm mb-1 ${
                                isActive
                                  ? isDark
                                    ? 'text-white'
                                    : 'text-primary'
                                  : isDark
                                    ? 'text-gray-200'
                                    : 'text-charcoal'
                              }`}
                            >
                              {sess.title || 'Conversation'}
                            </Text>
                            <Text className={`font-body text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                              {dateStr} • {msgCount} {msgCount === 1 ? 'question' : 'questions'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => handleDeleteSession(sess.id)}
                            className="p-2 rounded-xl"
                            accessibilityLabel="Delete conversation"
                          >
                            <Trash2 size={16} color={isDark ? '#ef4444' : '#dc2626'} />
                          </TouchableOpacity>
                        </View>
                      );
                    })
                )}
              </ScrollView>
            </GlassSurface>
          </View>
        </Modal>

        {/* Offline Help Guides Modal */}
        <Modal
          visible={showOfflineGuides}
          transparent
          animationType="slide"
          onRequestClose={() => setShowOfflineGuides(false)}
        >
          <View className="flex-1 justify-end bg-black/60">
            <GlassSurface
              variant="thick"
              elevated
              radius={32}
              style={{ width: '100%', padding: 24, paddingBottom: Math.max(insets.bottom, 24) }}
            >
              <View className="flex-row justify-between items-center mb-4">
                <View className="flex-row items-center">
                  <BookOpen size={20} color={isDark ? '#4ade80' : '#0d631b'} />
                  <Text className={`font-headline font-bold text-lg ml-2 ${isDark ? 'text-white' : 'text-charcoal'}`}>
                    CediSmart Quick Guides
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowOfflineGuides(false)} className="p-1">
                  <X size={20} color={isDark ? '#9ca3af' : '#6b7280'} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {OFFLINE_HELP_GUIDES.map((guide, idx) => (
                  <View
                    key={idx}
                    className={`p-4 rounded-2xl mb-3 border ${
                      isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/5'
                    }`}
                  >
                    <Text className={`font-headline font-bold text-sm mb-1 ${isDark ? 'text-white' : 'text-charcoal'}`}>
                      {guide.title}
                    </Text>
                    <Text className={`font-body text-xs leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      {guide.summary}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </GlassSurface>
          </View>
        </Modal>

        {/* Full-Screen ChatGPT Live Voice Mode */}
        <VoiceSupportModal
          visible={showVoiceModal}
          onClose={() => setShowVoiceModal(false)}
          onSwitchToText={() => {
            setShowVoiceModal(false);
            setTimeout(() => {
              textInputRef.current?.focus();
            }, 350);
          }}
          userName={userName}
          phone={phone}
          initialContext={screenContext}
          navigation={navigation || nav}
        />
      </View>
    </Modal>
  );
};
