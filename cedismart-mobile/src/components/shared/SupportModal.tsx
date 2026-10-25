import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TextInputInstance,
  TouchableOpacity,
  ScrollView,
  ScrollViewInstance,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Clipboard,
  Image,
  Linking,
  PermissionsAndroid,
  StyleSheet,
  Keyboard,
  PanResponder,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  ArrowUp,
  ArrowDown,
  PanelLeft,
  Edit3,
  Copy,
  Check,
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
  Search,
  Trash2,
  AudioLines,
  Landmark,
  ImageIcon,
  Paperclip,
} from 'lucide-react-native';
import apiClient from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import { useOfflineStore } from '../../stores/offlineStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GlassSurface } from '../glass/GlassSurface';
import { VoiceSupportModal } from '../voice/VoiceSupportModal';

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
      'How does CediSmart protect my data?',
      'Check for problems',
    ];
  }
  switch (ctx) {
    case 'budgets':
      return [
        'How much budget do I have left?',
        'How to set a monthly budget',
        'Where am I overspending this month?',
        'My spending looks wrong',
        'Check for problems',
        'Help Guides (Offline)',
      ];
    case 'transactions':
      return [
        'What was my biggest expense this week?',
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
        'How to export my transactions',
        'Check for problems',
        'Help Guides (Offline)',
      ];
    case 'dashboard':
    default:
      return [
        'What is my current total balance?',
        'Where did I spend the most this week?',
        'Paste MoMo SMS to Auto-Log',
        'Record an expense',
        'How much can I spend today?',
        'Check for problems',
        'Help Guides (Offline)',
      ];
  }
};

// Welcome copy stays local to the chat UI and never assumes a user's financial status.
const WELCOME_QUESTIONS = {
  dashboard: [
    'What would you like to do with your money today?',
    'Want to review your balance across all your accounts?',
    'Wondering where most of your money went this week?',
    'Did you make any cash or Mobile Money transactions today?',
    'Want to see how your spending compares to last week?',
    'Ready to log an expense or paste a MoMo SMS?',
    'How is your financial plan holding up this month?',
    'Need a quick breakdown of your available funds?',
    'Want any tips to save on daily expenses?',
    'What can I help you make sense of today?',
  ],
  budgets: [
    'What would you like to plan for?',
    'How can I help with your budget today?',
    'Want to check how much budget you have left for food?',
    'Which spending goal shall we work on?',
    'Want to make a plan for the month ahead?',
    'Looking for categories where you might be overspending?',
    'Need help setting a daily spending target?',
    'Shall we review your progress toward your savings goal?',
    'How are your transport and utility budgets doing?',
    'Want to adjust your budget limits for the rest of the month?',
  ],
  transactions: [
    'What would you like to track today?',
    'Need a hand finding a specific transaction?',
    'Which expense shall we look at together?',
    'Want to see your biggest expense so far this month?',
    'Need help verifying a recent Mobile Money transfer?',
    'Have a receipt or SMS you would like to log?',
    'Looking for a transaction that seems out of place?',
    'Want a summary of your spending by category?',
    'What would you like to understand about your spending?',
    'Need to categorize any uncategorized transactions?',
  ],
  settings: [
    'What can I help you configure today?',
    'Need a hand linking or managing your MoMo accounts?',
    'Want to reconcile your physical cash wallet with your records?',
    'What would you like to fine-tune in your preferences?',
    'Need guidance setting up automated SMS tracking?',
    'Want to back up your data or check your sync status?',
    'Need help updating your profile or currency preferences?',
    'Curious about security, PIN protection, or biometric login?',
    'How can I make CediSmart easier for you?',
  ],
  auth: [
    'How can I help you get started?',
    'Need a hand signing in to your account?',
    'Did not receive your verification SMS or OTP code?',
    'Having trouble remembering your 6-digit PIN?',
    'What can I help with on your onboarding?',
    'Want to know how CediSmart protects your financial data?',
    'Need help recovering or verifying your Ghanaian phone number?',
    'Shall we get you settled in with CediSmart?',
  ],
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
      const fontSize = level === 1 ? 22 : level === 2 ? 19 : 17;
      return (
        <Text
          key={lineIndex}
          selectable={true}
          style={{ fontSize, lineHeight: fontSize + 8, fontWeight: '600', marginTop: 12, marginBottom: 6 }}
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
          <Text selectable={true} style={chatStyles.messageText} className={`mr-2 ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>•</Text>
          <Text selectable={true} style={chatStyles.messageText} className={`flex-1 font-body ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>
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
          <Text selectable={true} style={chatStyles.messageText} className={`mr-2 font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>{index}.</Text>
          <Text selectable={true} style={chatStyles.messageText} className={`flex-1 font-body ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>
            {parseInlineStyles(content)}
          </Text>
        </View>
      );
    }

    return (
      <Text
        key={lineIndex}
        selectable={true}
        style={chatStyles.messageText}
        className={`font-body ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}
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
  const colors = {
    background: isDark ? '#080a08' : '#f5f8f5',
    surface: isDark ? '#181e19' : '#ffffff',
    text: isDark ? '#e1e3e0' : '#1c1b1f',
    muted: isDark ? '#b2b6b1' : '#40493d',
    border: isDark ? '#303a32' : '#dce5d9',
    accent: isDark ? '#4ade80' : '#0d631b',
    userBubble: isDark ? '#193823' : '#e3efdf',
  };
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
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const isNearBottom = useRef(true);
  const isWelcome = messages.every((message) => message.id === 'default_greeting');

  // Screenshot / Receipt Vision attachment state
  const [attachedImage, setAttachedImage] = useState<{
    uri: string;
    base64: string;
    mimeType: string;
  } | null>(null);

  const textInputRef = useRef<TextInputInstance>(null);
  const scrollViewRef = useRef<ScrollViewInstance>(null);

  const sessionsStorageKey = `cedismart_chat_sessions_${phone.replace(/[^\d+]/g, '') || 'anonymous'}_${supportType}`;
  const legacyStorageKey = `cedismart_chat_history_${phone.replace(/[^\d+]/g, '') || 'anonymous'}_${supportType}`;

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [welcomeMoment, setWelcomeMoment] = useState(() => ({
    hour: new Date().getHours(),
    variation: Math.floor(Math.random() * 20),
  }));

  // Refresh on opening or switching chats, never on typing or other UI updates.
  useEffect(() => {
    if (!visible || !activeSessionId) return;
    setWelcomeMoment((previous) => ({
      hour: new Date().getHours(),
      variation: previous.variation + 1 + Math.floor(Math.random() * 3),
    }));
  }, [visible, activeSessionId]);

  const hour = welcomeMoment.hour;
  const timeGreeting = hour >= 4 && hour < 12
    ? 'Good morning'
    : hour >= 12 && hour < 17
      ? 'Good afternoon'
      : 'Good evening';
  const welcomeGreeting = firstName ? `${timeGreeting}, ${firstName}` : timeGreeting;
  const welcomeQuestions = WELCOME_QUESTIONS[supportType === 'auth' ? 'auth' : screenContext];
  const welcomeQuestion = welcomeQuestions[welcomeMoment.variation % welcomeQuestions.length];

  const historySessions = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    return sessions
      .filter((session) => (session.messages || []).some((message) => message.role === 'user'))
      .filter((session) => !query || (session.title || 'Conversation').toLowerCase().includes(query))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [sessions, historySearch]);

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
    isNearBottom.current = true;
    setShowScrollToBottom(false);
    setShowAttachMenu(false);
  }, [activeSessionId, visible]);

  useEffect(() => {
    if (!copiedMessageId) return;
    const timeout = setTimeout(() => setCopiedMessageId(null), 2000);
    return () => clearTimeout(timeout);
  }, [copiedMessageId]);

  const scrollToLatest = () => {
    isNearBottom.current = true;
    setShowScrollToBottom(false);
    scrollViewRef.current?.scrollToEnd({ animated: true });
  };

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
    isNearBottom.current = true;
    setShowScrollToBottom(false);
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

  // Attachment Handlers for ChatGPT-style '+' Menu
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
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (e) {
      console.warn('[AI Support] Camera error:', e);
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
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (e) {
      console.warn('[AI Support] Photo library error:', e);
    }
  };

  const handlePickDocument = async () => {
    setShowAttachMenu(false);
    Haptics.selectionAsync().catch(() => {});
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        const asset = res.assets[0];
        const b64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        setAttachedImage({
          uri: asset.uri,
          base64: b64,
          mimeType: asset.mimeType || 'application/octet-stream',
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (e) {
      console.warn('[AI Support] Document picker error:', e);
    }
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

    isNearBottom.current = true;
    setShowScrollToBottom(false);
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

  const handleQuickPrompt = async (promptText: string) => {
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
  };

  const openHistory = useCallback(() => {
    Keyboard.dismiss();
    setHistorySearch('');
    setShowHistoryModal(true);
  }, []);

  const historySwipe = useMemo(() => PanResponder.create({
    // Claim deliberate, single-finger left swipes without taking vertical scrolling.
    onMoveShouldSetPanResponderCapture: (_, gesture) =>
      !chatMutation.isPending &&
      gesture.numberActiveTouches === 1 &&
      gesture.dx < -24 &&
      Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
    onPanResponderRelease: (_, gesture) => {
      const isHorizontal = Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2;
      const isLeftSwipe = gesture.dx < -72 || (gesture.dx < -24 && gesture.vx < -0.5);
      if (!chatMutation.isPending && isHorizontal && isLeftSwipe) openHistory();
    },
    onPanResponderTerminationRequest: () => true,
  }), [chatMutation.isPending, openHistory]);

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
      <View style={[chatStyles.screen, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={chatStyles.screen}
        >
          <View style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
            <View style={chatStyles.header}>
              <TouchableOpacity
                onPress={openHistory}
                disabled={chatMutation.isPending}
                style={chatStyles.iconButton}
                accessibilityRole="button"
                accessibilityLabel="Open chat history"
                accessibilityState={{ disabled: chatMutation.isPending }}
              >
                <PanelLeft size={22} color={colors.text} strokeWidth={1.7} />
              </TouchableOpacity>
              <View style={chatStyles.headerIdentity}>
                <Text style={[chatStyles.headerTitle, { color: colors.text }]} numberOfLines={1}>CediSmart AI</Text>
                <Text style={[chatStyles.headerSubtitle, { color: colors.muted }]} numberOfLines={1}>
                  {supportType === 'auth' ? 'Account assistant' : 'Your money, made clearer'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleNewChat}
                disabled={chatMutation.isPending}
                style={chatStyles.iconButton}
                accessibilityRole="button"
                accessibilityLabel="Start a new chat"
                accessibilityState={{ disabled: chatMutation.isPending }}
              >
                <Edit3 size={21} color={colors.text} strokeWidth={1.7} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={chatStyles.iconButton} accessibilityRole="button" accessibilityLabel="Close AI chat">
                <X size={22} color={colors.text} strokeWidth={1.7} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={chatStyles.screen} {...historySwipe.panHandlers}>
            <ScrollView
              ref={scrollViewRef}
              style={chatStyles.screen}
              contentContainerStyle={[chatStyles.conversation, isWelcome && chatStyles.welcomeConversation]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={32}
              onScroll={({ nativeEvent }) => {
                const distance = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y;
                isNearBottom.current = distance < 100;
                setShowScrollToBottom(distance >= 100);
              }}
              onLayout={() => {
                if (isNearBottom.current && !isWelcome) scrollViewRef.current?.scrollToEnd({ animated: false });
              }}
              onContentSizeChange={() => {
                if (isNearBottom.current && !isWelcome) scrollViewRef.current?.scrollToEnd({ animated: true });
              }}
            >
              {!isHistoryLoaded ? (
                <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} accessibilityLabel="Loading conversation" />
              ) : isWelcome ? (
                <View style={chatStyles.welcome}>
                  <View style={chatStyles.welcomeMark}>
                    <Image
                      source={require('../../../assets/cedismart_ai_logo.png')}
                      style={chatStyles.welcomeLogo}
                      resizeMode="cover"
                      accessibilityLabel="CediSmart AI"
                    />
                  </View>
                  <Text style={[chatStyles.eyebrow, { color: colors.muted }]}>{welcomeGreeting}</Text>
                  <Text style={[chatStyles.welcomeTitle, { color: colors.text }]}>
                    {welcomeQuestion}
                  </Text>
                  <Text style={[chatStyles.welcomeSubtitle, { color: colors.muted }]}>
                    {supportType === 'auth' ? 'Get help with your account, verification or sign-in.' : 'Make sense of spending, manage MoMo, or ask a question.'}
                  </Text>
                  <ScrollView
                    style={chatStyles.capsuleContainer}
                    contentContainerStyle={chatStyles.capsuleList}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled={true}
                  >
                    {getScreenQuickPrompts(screenContext, supportType).map((promptText) => {
                      const Icon = promptText.includes('budget') ? PieChart
                        : promptText.includes('balance') || promptText.includes('spend today') ? Landmark
                        : promptText.includes('expense') || promptText.includes('spent') || promptText.includes('overspending') ? ArrowUpRight
                        : promptText === 'Check for problems' ? Stethoscope
                        : promptText === 'Help Guides (Offline)' ? BookOpen
                        : promptText.includes('MoMo') ? Zap : MessageSquare;
                      return (
                        <TouchableOpacity
                          key={promptText}
                          onPress={() => handleQuickPrompt(promptText)}
                          activeOpacity={0.7}
                          style={[chatStyles.capsulePill, { backgroundColor: colors.surface, borderColor: colors.border }]}
                          accessibilityRole="button"
                        >
                          <Icon size={16} color={colors.accent} strokeWidth={1.8} />
                          <Text numberOfLines={1} style={[chatStyles.capsuleText, { color: colors.text }]}>{promptText}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : messages.filter((msg) => msg.id !== 'default_greeting').map((msg, index) => {
                const isUser = msg.role === 'user';
                return (
                  <View key={msg.id || index} style={chatStyles.messageGroup}>
                    {isUser ? (
                      <View style={chatStyles.userMessage}>
                        <TouchableOpacity
                          onLongPress={() => handleMessagePress(msg)}
                          delayLongPress={300}
                          activeOpacity={0.85}
                          style={[chatStyles.userBubble, { backgroundColor: colors.userBubble }]}
                          accessibilityHint="Long press to copy or edit your message"
                        >
                          {msg.imageUri && (
                            <Image source={{ uri: msg.imageUri }} style={chatStyles.messageImage} resizeMode="cover" accessibilityLabel="Attached image" />
                          )}
                          <Text selectable style={[chatStyles.messageText, { color: colors.text }]}>{msg.content}</Text>
                        </TouchableOpacity>
                        {msg.status === 'failed' && (
                          <TouchableOpacity onPress={() => handleRetryMessage(msg)} style={chatStyles.retryButton} accessibilityRole="button">
                            <RotateCcw size={14} color={isDark ? '#fca5a5' : '#ba1a1a'} />
                            <Text style={{ color: isDark ? '#fca5a5' : '#ba1a1a', fontSize: 12 }}>Couldn't send. Tap to retry</Text>
                          </TouchableOpacity>
                        )}
                        {msg.status === 'sending' && <Text style={[chatStyles.deliveryStatus, { color: colors.muted }]}>Sending…</Text>}
                      </View>
                    ) : (
                      <View>
                        <TouchableOpacity onLongPress={() => handleMessagePress(msg)} delayLongPress={300} activeOpacity={0.9}>
                          {parseMarkdown(msg.content, isDark)}
                        </TouchableOpacity>
                        {msg.actions && msg.actions.length > 0 && (
                          <View style={chatStyles.actionRow}>
                            {msg.actions.map((act) => {
                              const { label, icon: IconComp } = renderActionBadgeLabel(act);
                              return (
                                <TouchableOpacity
                                  key={act}
                                  onPress={() => handleActionCardPress(act)}
                                  style={[chatStyles.actionChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                  accessibilityRole="button"
                                >
                                  <IconComp size={16} color={colors.accent} />
                                  <Text style={{ color: colors.text, fontSize: 13, flexShrink: 1 }}>{label}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}
                        <TouchableOpacity
                          onPress={() => {
                            Clipboard.setString(msg.content);
                            setCopiedMessageId(msg.id);
                            Haptics.selectionAsync().catch(() => {});
                          }}
                          style={chatStyles.copyButton}
                          accessibilityRole="button"
                          accessibilityLabel={copiedMessageId === msg.id ? 'Response copied' : 'Copy response'}
                        >
                          {copiedMessageId === msg.id ? <Check size={16} color={colors.accent} /> : <Copy size={16} color={colors.muted} strokeWidth={1.6} />}
                          {copiedMessageId === msg.id && <Text style={{ color: colors.muted, fontSize: 12 }}>Copied</Text>}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}

              {chatMutation.isPending && (
                <View style={chatStyles.thinking} accessibilityLiveRegion="polite">
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={{ color: colors.muted, fontSize: 14 }}>Thinking…</Text>
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
            {showScrollToBottom && !isWelcome && (
              <TouchableOpacity
                onPress={scrollToLatest}
                style={[chatStyles.scrollButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="Scroll to latest message"
              >
                <ArrowDown size={20} color={colors.text} />
              </TouchableOpacity>
            )}
          </View>

          <View style={[chatStyles.composerArea, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: colors.background }]}>
            <View style={[chatStyles.composer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {attachedImage && (
                <View style={chatStyles.attachmentPreview}>
                  <Image source={{ uri: attachedImage.uri }} style={chatStyles.attachmentThumbnail} accessibilityLabel="Image ready to send" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }}>Image attached</Text>
                    <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>Add a message or send to analyse</Text>
                  </View>
                  <TouchableOpacity onPress={() => setAttachedImage(null)} style={chatStyles.iconButton} accessibilityRole="button" accessibilityLabel="Remove attachment">
                    <X size={18} color={colors.muted} />
                  </TouchableOpacity>
                </View>
              )}
              <TextInput
                ref={textInputRef}
                style={[chatStyles.input, { color: colors.text }]}
                placeholder={attachedImage ? 'Ask about this image…' : 'Message CediSmart…'}
                placeholderTextColor={colors.muted}
                value={input}
                onChangeText={setInput}
                multiline
                textAlignVertical="top"
                editable={!chatMutation.isPending}
                accessibilityLabel="Message CediSmart AI"
              />
              <View style={chatStyles.composerToolbar}>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setShowAttachMenu(true);
                  }}
                  disabled={chatMutation.isPending}
                  style={chatStyles.iconButton}
                  accessibilityRole="button"
                  accessibilityLabel="Attachments and chat tools"
                  accessibilityState={{ disabled: chatMutation.isPending }}
                >
                  <Plus size={23} color={colors.text} strokeWidth={1.7} />
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                  onPress={input.trim() || attachedImage ? handleSend : () => setShowVoiceModal(true)}
                  disabled={chatMutation.isPending}
                  style={[chatStyles.sendButton, { opacity: chatMutation.isPending ? 0.55 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={chatMutation.isPending ? 'Waiting for response' : input.trim() || attachedImage ? 'Send message' : 'Open voice chat'}
                  accessibilityState={{ disabled: chatMutation.isPending }}
                >
                  {chatMutation.isPending ? <ActivityIndicator size="small" color="white" />
                    : input.trim() || attachedImage ? <ArrowUp size={22} color="white" />
                    : <AudioLines size={22} color="white" />}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>

        <Modal visible={showAttachMenu} transparent animationType="fade" onRequestClose={() => setShowAttachMenu(false)}>
          <View style={chatStyles.sheetBackdrop}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowAttachMenu(false)} accessibilityRole="button" accessibilityLabel="Dismiss chat tools" />
            <View style={[chatStyles.sheet, { backgroundColor: colors.surface, maxHeight: '85%', paddingBottom: Math.max(insets.bottom, 20) }]}>
              <View style={chatStyles.sheetHeader}>
                <Text style={[chatStyles.sheetTitle, { color: colors.text }]}>Add to your chat</Text>
                <TouchableOpacity onPress={() => setShowAttachMenu(false)} style={chatStyles.iconButton} accessibilityRole="button" accessibilityLabel="Close chat tools">
                  <X size={20} color={colors.muted} />
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled">
                <View style={chatStyles.attachmentOptions}>
                  {[
                    { label: 'Camera', icon: Camera, onPress: handleLaunchCamera },
                    { label: 'Photos', icon: ImageIcon, onPress: handlePickPhotos },
                    { label: 'Files', icon: Paperclip, onPress: handlePickDocument },
                  ].map(({ label, icon: Icon, onPress }) => (
                    <TouchableOpacity key={label} onPress={onPress} style={[chatStyles.attachmentOption, { borderColor: colors.border }]} accessibilityRole="button">
                      <Icon size={23} color={colors.accent} strokeWidth={1.7} />
                      <Text style={{ color: colors.text, fontSize: 14 }}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {supportType !== 'auth' && (
                  <View style={{ marginTop: 12 }}>
                    {['Paste MoMo SMS to Auto-Log', 'Check for problems', 'Help Guides (Offline)'].map((prompt) => (
                      <TouchableOpacity key={prompt} onPress={() => { setShowAttachMenu(false); handleQuickPrompt(prompt); }} style={chatStyles.toolRow} accessibilityRole="button">
                        <Text style={{ color: colors.text, fontSize: 15, flexShrink: 1 }}>{prompt}</Text>
                        <ArrowUpRight size={17} color={colors.muted} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Chat history sidebar */}
        <Modal
          visible={showHistoryModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowHistoryModal(false)}
        >
          <View style={chatStyles.historyBackdrop}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setShowHistoryModal(false)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss chat history"
            />
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={[chatStyles.historySidebar, {
                backgroundColor: colors.surface,
                paddingTop: Math.max(insets.top, 12),
                paddingBottom: Math.max(insets.bottom, 16),
              }]}
            >
              <View style={chatStyles.historyHeader}>
                <Text style={[chatStyles.headerTitle, { color: colors.text, flex: 1 }]} numberOfLines={1}>CediSmart AI</Text>
                <TouchableOpacity
                  onPress={() => setShowHistoryModal(false)}
                  style={chatStyles.iconButton}
                  accessibilityRole="button"
                  accessibilityLabel="Close chat history"
                >
                  <PanelLeft size={21} color={colors.muted} strokeWidth={1.7} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={handleNewChat}
                style={[chatStyles.historyNewChat, { backgroundColor: colors.userBubble }]}
                accessibilityRole="button"
                accessibilityLabel="Start a new chat from history"
              >
                <Edit3 size={19} color={colors.accent} strokeWidth={1.7} />
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>New chat</Text>
              </TouchableOpacity>

              <View style={[chatStyles.historySearch, { borderColor: colors.border }]}>
                <Search size={17} color={colors.muted} />
                <TextInput
                  value={historySearch}
                  onChangeText={setHistorySearch}
                  placeholder="Search chats"
                  placeholderTextColor={colors.muted}
                  style={[chatStyles.historySearchInput, { color: colors.text }]}
                  accessibilityLabel="Search chat history"
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {!!historySearch && (
                  <TouchableOpacity onPress={() => setHistorySearch('')} style={chatStyles.iconButton} accessibilityRole="button" accessibilityLabel="Clear chat search">
                    <X size={16} color={colors.muted} />
                  </TouchableOpacity>
                )}
              </View>

              <Text style={[chatStyles.historyLabel, { color: colors.muted }]}>Your chats</Text>
              <ScrollView
                style={chatStyles.screen}
                contentContainerStyle={{ paddingBottom: 16 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                {historySessions.length === 0 ? (
                  <View style={chatStyles.historyEmpty}>
                    <MessageSquare size={24} color={colors.muted} strokeWidth={1.5} />
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500', textAlign: 'center' }}>
                      {historySearch.trim() ? 'No matching chats' : 'No conversations yet'}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' }}>
                      {historySearch.trim() ? 'Try a different chat title.' : 'Start a chat and find it here later.'}
                    </Text>
                  </View>
                ) : historySessions.map((session) => {
                  const isActive = session.id === activeSessionId;
                  return (
                    <View key={session.id} style={[chatStyles.historyRow, { backgroundColor: isActive ? colors.userBubble : 'transparent' }]}>
                      <TouchableOpacity
                        onPress={() => handleSelectSession(session)}
                        style={chatStyles.historyConversation}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                        accessibilityLabel={session.title || 'Conversation'}
                      >
                        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14, fontWeight: isActive ? '600' : '400' }}>
                          {session.title || 'Conversation'}
                        </Text>
                        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 5 }}>
                          {new Date(session.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDeleteSession(session.id)}
                        style={chatStyles.iconButton}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete conversation: ${session.title || 'Conversation'}`}
                      >
                        <Trash2 size={15} color={colors.muted} strokeWidth={1.6} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                onPress={() => {
                  setShowHistoryModal(false);
                  runSelfHealDoctor();
                }}
                disabled={isRunningDoctor}
                style={[chatStyles.historyFooter, { borderTopColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="Run Diagnostics"
                accessibilityState={{ disabled: isRunningDoctor }}
              >
                {isRunningDoctor ? <ActivityIndicator size="small" color={colors.accent} /> : <Stethoscope size={18} color={colors.accent} />}
                <Text style={{ color: colors.text, fontSize: 14 }}>Diagnostics</Text>
              </TouchableOpacity>
            </KeyboardAvoidingView>
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
            <View style={[chatStyles.sheet, { backgroundColor: colors.surface, maxHeight: '85%', paddingBottom: Math.max(insets.bottom, 24) }]}>

              <View className="flex-row justify-between items-center mb-4">
                <View className="flex-row items-center">
                  <BookOpen size={20} color={isDark ? '#4ade80' : '#0d631b'} />
                  <Text className={`font-headline font-bold text-lg ml-2 ${isDark ? 'text-white' : 'text-charcoal'}`}>
                    CediSmart Quick Guides
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowOfflineGuides(false)} style={chatStyles.iconButton} accessibilityRole="button" accessibilityLabel="Close help guides">
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
            </View>
          </View>
        </Modal>

        {/* Full-Screen ChatGPT Live Voice Mode sharing the exact same conversation thread */}
        <VoiceSupportModal
          visible={showVoiceModal}
          onClose={() => setShowVoiceModal(false)}
          messages={messages}
          onAddMessage={(newMsg) => {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
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


const chatStyles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, minHeight: 64, paddingVertical: 6 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerIdentity: { flex: 1, paddingLeft: 6, paddingRight: 4 },
  headerTitle: { fontSize: 18, fontWeight: '600', letterSpacing: -0.4 },
  headerSubtitle: { fontSize: 11, marginTop: 3 },
  conversation: { flexGrow: 1, width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 },
  welcomeConversation: { justifyContent: 'center' },
  welcome: { paddingVertical: 24, alignItems: 'center' },
  welcomeMark: { width: 68, height: 68, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  welcomeLogo: { width: 68, height: 68, borderRadius: 22 },
  eyebrow: { fontSize: 14, marginBottom: 10 },
  welcomeTitle: { fontSize: 28, lineHeight: 35, fontWeight: '600', letterSpacing: -0.8, textAlign: 'center', maxWidth: 340 },
  welcomeSubtitle: { fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 300, marginTop: 12 },
  capsuleContainer: { width: '100%', maxWidth: 380, maxHeight: 148, marginTop: 20 },
  capsuleList: { gap: 8 },
  capsulePill: { flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, gap: 10 },
  capsuleText: { fontSize: 13, fontWeight: '500', flexShrink: 1 },
  messageGroup: { marginBottom: 24 },
  messageText: { fontSize: 16, lineHeight: 25 },
  userMessage: { alignSelf: 'flex-end', maxWidth: '86%', alignItems: 'flex-end' },
  userBubble: { borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12 },
  messageImage: { width: 190, maxWidth: '100%', height: 140, borderRadius: 14, marginBottom: 10 },
  deliveryStatus: { fontSize: 11, marginTop: 6, marginRight: 4 },
  retryButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionChip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, maxWidth: '100%' },
  copyButton: { minWidth: 44, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginLeft: -12, paddingHorizontal: 12 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, marginBottom: 16 },
  scrollButton: { position: 'absolute', bottom: 12, alignSelf: 'center', width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  composerArea: { paddingHorizontal: 12, paddingTop: 8 },
  composer: { width: '100%', maxWidth: 736, alignSelf: 'center', borderWidth: 1, borderRadius: 28, padding: 6 },
  input: { fontSize: 16, lineHeight: 23, minHeight: 46, maxHeight: 140, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  composerToolbar: { flexDirection: 'row', alignItems: 'center', paddingRight: 2 },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#0d631b', alignItems: 'center', justifyContent: 'center' },
  attachmentPreview: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 10, paddingTop: 8 },
  attachmentThumbnail: { width: 52, height: 52, borderRadius: 12 },
  historyBackdrop: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.45)' },
  historySidebar: { width: '86%', maxWidth: 360, height: '100%', paddingHorizontal: 16, borderTopRightRadius: 24, borderBottomRightRadius: 24 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingLeft: 8 },
  historyNewChat: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderRadius: 14, marginBottom: 16 },
  historySearch: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingLeft: 14, minHeight: 46 },
  historySearchInput: { flex: 1, fontSize: 14, paddingHorizontal: 10, paddingVertical: 12 },
  historyLabel: { fontSize: 12, fontWeight: '500', marginTop: 26, marginBottom: 12, paddingHorizontal: 12 },
  historyEmpty: { paddingHorizontal: 12, paddingVertical: 32, alignItems: 'center', gap: 10 },
  historyRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, marginBottom: 4 },
  historyConversation: { flex: 1, paddingHorizontal: 12, paddingVertical: 13, minHeight: 56 },
  historyFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderTopWidth: 1, paddingHorizontal: 12, marginTop: 8 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { padding: 20, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '600', flexShrink: 1 },
  attachmentOptions: { flexDirection: 'row', gap: 12 },
  attachmentOption: { flex: 1, borderWidth: 1, borderRadius: 18, alignItems: 'center', paddingVertical: 18, gap: 10 },
  toolRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
