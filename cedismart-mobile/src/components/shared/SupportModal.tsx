import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { X, Send, Bot, User, Sparkles, Github, AlertCircle, CheckCircle, Trash2, Plus } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import apiClient from '../../api/client';
import { useThemeStore } from '../../stores/themeStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Message {
  role: 'user' | 'model';
  content: string;
}

interface SupportModalProps {
  visible: boolean;
  onClose: () => void;
  phone?: string;
}

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
          <Text className={`mr-2 ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>•</Text>
          <Text className={`flex-1 font-body text-sm ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} leading-relaxed`}>
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
          <Text className={`mr-2 font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>{index}.</Text>
          <Text className={`flex-1 font-body text-sm ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} leading-relaxed`}>
            {parseInlineStyles(content)}
          </Text>
        </View>
      );
    }

    return (
      <Text
        key={lineIndex}
        className={`font-body text-sm ${isDark ? 'text-dark-on-surface' : 'text-on-surface'} leading-relaxed mb-1`}
      >
        {parseInlineStyles(line)}
      </Text>
    );
  });
};

export const SupportModal: React.FC<SupportModalProps> = ({ visible, onClose, phone = 'Anonymous' }) => {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const [showEscalate, setShowEscalate] = useState(false);
  const [escalatedTicket, setEscalatedTicket] = useState<{ number: number; url: string } | null>(null);

  const storageKey = `cedismart_chat_history_${phone.replace(/[^\d+]/g, '') || 'anonymous'}`;

  const defaultGreeting: Message = {
    role: 'model',
    content: "Hi! I'm your CediSmart AI Support Assistant. How can I help you today? (e.g., issues with OTP, registering, or PIN setup)."
  };

  // Load chat history when modal becomes visible or phone changes
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const stored = await AsyncStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as Message[];
          if (parsed && parsed.length > 0) {
            setMessages(parsed);
            setIsHistoryLoaded(true);
            return;
          }
        }
        setMessages([defaultGreeting]);
        setIsHistoryLoaded(true);
      } catch (err) {
        console.warn('[AI Support] Error loading chat history:', err);
        setMessages([defaultGreeting]);
        setIsHistoryLoaded(true);
      }
    };

    if (visible) {
      setIsHistoryLoaded(false);
      loadHistory();
    }
  }, [visible, phone]);

  // Save chat history when messages state changes
  useEffect(() => {
    const saveHistory = async () => {
      if (!isHistoryLoaded || messages.length === 0) return;
      try {
        await AsyncStorage.setItem(storageKey, JSON.stringify(messages));
      } catch (err) {
        console.warn('[AI Support] Error saving chat history:', err);
      }
    };
    saveHistory();
  }, [messages, isHistoryLoaded]);

  const handleClearChat = () => {
    Alert.alert(
      'New Chat',
      'Are you sure you want to start a new chat? This will clear your current conversation history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'New Chat',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem(storageKey);
              setMessages([defaultGreeting]);
              setShowEscalate(false);
              setEscalatedTicket(null);
            } catch (err) {
              console.warn('[AI Support] Error clearing chat history:', err);
            }
          }
        }
      ]
    );
  };

  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible) {
      // Scroll to bottom when modal opens
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [visible]);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // Chat Mutation
  const chatMutation = useMutation({
    mutationFn: async (chatHistory: Message[]) => {
      const diagnostics = {
        os: Platform.OS,
        os_version: String(Platform.Version),
        app_version: '1.0.0',
      };
      const response = await apiClient.post('/support/chat', {
        messages: chatHistory,
        device_diagnostics: diagnostics
      });
      return response.data.response;
    },
    onSuccess: (data: string) => {
      let cleanResponse = data;
      let needsEscalation = false;

      if (data.includes('[ESCALATE_REQUIRED]')) {
        cleanResponse = data.replace('[ESCALATE_REQUIRED]', '').trim();
        needsEscalation = true;
      }

      setMessages((prev) => [...prev, { role: 'model', content: cleanResponse }]);
      if (needsEscalation && !escalatedTicket) {
        setShowEscalate(true);
      }
    },
    onError: (err: any) => {
      console.warn('[AI Support] Chat error:', err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          content: "Sorry, I am having trouble connecting to my brain right now. Please try again or tap Escalate to notify our developers."
        }
      ]);
      setShowEscalate(true);
    }
  });

  // Escalation Mutation
  const escalateMutation = useMutation({
    mutationFn: async () => {
      const userQueries = messages.filter((m) => m.role === 'user');
      const primaryQuery = userQueries.length > 0 ? userQueries[userQueries.length - 1].content : 'General inquiry';

      const diagnostics = {
        os: Platform.OS,
        os_version: String(Platform.Version),
        app_version: '1.0.0',
      };

      const response = await apiClient.post('/support/escalate', {
        phone: phone,
        user_query: primaryQuery,
        chat_history: messages,
        device_diagnostics: diagnostics
      });
      return response.data;
    },
    onSuccess: (data) => {
      setEscalatedTicket({
          number: data.issue_number,
          url: data.issue_url
      });
      setShowEscalate(false);

      const successMsg = data.issue_number > 0
        ? `I've opened a support ticket (#${data.issue_number}) on GitHub directly for our developer and logged it in our secure database. They've been notified!`
        : `I've logged a support ticket (ID: ${data.ticket_id.substring(0, 8)}...) directly in our secure database. Our developer has been notified!`;

      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          content: successMsg
        }
      ]);
    },
    onError: (err: any) => {
      console.warn('[AI Support] Escalation error:', err);
    }
  });

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput('');
    chatMutation.mutate(updatedMessages);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View className={`flex-1 ${isDark ? 'bg-dark-background' : 'bg-surface'}`}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1"
        >
          {/* Premium Gradient Header */}
          <LinearGradient
            colors={isDark ? ['#143d1a', '#081c0e'] : ['#2e7d32', '#0d631b']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ paddingTop: Math.max(insets.top, 16) }}
            className="px-6 pb-5 flex-row items-center justify-between shadow-md"
          >
            <View className="flex-row items-center space-x-3">
              <View className="w-10 h-10 rounded-full bg-white/20 items-center justify-center border border-white/10">
                <Sparkles size={20} color="#ffb703" />
              </View>
              <View>
                <Text className="font-headline font-bold text-lg text-white">CediSmart AI Support</Text>
                <Text className="font-body text-[10px] text-emerald-200/80">Ghana's Premium Finance Assistant</Text>
              </View>
            </View>
            <View className="flex-row items-center space-x-2">
              {messages.length > 1 && (
                <TouchableOpacity 
                  onPress={handleClearChat} 
                  className="w-9 h-9 rounded-full bg-white/10 items-center justify-center active:bg-white/20"
                  accessibilityLabel="New Chat"
                >
                  <Plus size={20} color="white" />
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                onPress={onClose} 
                className="w-9 h-9 rounded-full bg-white/10 items-center justify-center active:bg-white/20"
              >
                <X size={20} color="white" />
              </TouchableOpacity>
            </View>
          </LinearGradient>

          {/* Chat Messages */}
          <ScrollView
            ref={scrollViewRef}
            className="flex-1 p-6"
            contentContainerStyle={{ paddingBottom: 32 }}
          >
            {messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              return (
                <View
                  key={index}
                  className={`flex-row mb-5 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center mr-2 self-end">
                      <Bot size={16} color={isDark ? '#2e7d32' : '#0d631b'} />
                    </View>
                  )}
                  <View className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                    isUser
                      ? 'bg-primary rounded-tr-none'
                      : `${isDark ? 'bg-dark-surface-container-low border border-dark-outline-variant/10' : 'bg-surface-container-low border border-outline-variant/5'} rounded-tl-none`
                  }`}>
                    {isUser ? (
                      <Text className="font-body text-sm text-white leading-relaxed">
                        {msg.content}
                      </Text>
                    ) : (
                      <View className="space-y-1">
                        {parseMarkdown(msg.content, isDark)}
                      </View>
                    )}
                  </View>
                  {isUser && (
                    <View className="w-8 h-8 rounded-full bg-primary/20 items-center justify-center ml-2 self-end">
                      <User size={16} color={isDark ? '#2e7d32' : '#0d631b'} />
                    </View>
                  )}
                </View>
              );
            })}

            {/* AI thinking state */}
            {chatMutation.isPending && (
              <View className="flex-row mb-5 justify-start items-center">
                <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center mr-2">
                  <Bot size={16} color={isDark ? '#2e7d32' : '#0d631b'} />
                </View>
                <View className={`rounded-2xl px-4 py-3 ${isDark ? 'bg-dark-surface-container-low border border-dark-outline-variant/10' : 'bg-surface-container-low border border-outline-variant/5'} rounded-tl-none flex-row items-center space-x-2`}>
                  <ActivityIndicator size="small" color={isDark ? '#2e7d32' : '#0d631b'} />
                  <Text className={`font-body text-xs ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'}`}>Assistant thinking...</Text>
                </View>
              </View>
            )}

            {/* Escalation CTA */}
            {showEscalate && !escalatedTicket && (
              <View className={`p-5 rounded-2xl border ${isDark ? 'bg-dark-surface-container-low border-error/20' : 'bg-error/5 border-error/10'} mb-4 items-center`}>
                <AlertCircle size={24} color="#BA1A1A" className="mb-2" />
                <Text className={`font-headline font-bold text-sm text-center mb-1 ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>Needs Developer Review</Text>
                <Text className={`font-body text-xs text-center mb-4 ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'}`}>
                  It looks like this issue needs a developer. Tap below to create a bug report ticket on GitHub.
                </Text>
                <TouchableOpacity
                  onPress={() => escalateMutation.mutate()}
                  disabled={escalateMutation.isPending}
                  className="bg-error px-5 py-2.5 rounded-xl flex-row items-center space-x-2 shadow-sm active:opacity-90"
                >
                  {escalateMutation.isPending ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <Github size={16} color="white" />
                      <Text className="text-white font-headline font-bold text-xs">Create Support Ticket</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {/* Styled Chat Input Bar */}
          <View 
            style={{ paddingBottom: Math.max(insets.bottom, 12) }}
            className={`px-4 pt-3 border-t ${isDark ? 'bg-dark-surface-container-lowest border-dark-outline-variant/20' : 'bg-white border-outline-variant/10'} flex-row items-center space-x-3`}
          >
            <TextInput
              className={`flex-1 h-12 px-4 rounded-xl font-body text-sm ${
                isDark ? 'bg-dark-surface-container-low text-dark-on-surface' : 'bg-surface-container-low text-on-surface'
              } border ${isDark ? 'border-dark-outline-variant/10' : 'border-outline-variant/5'}`}
              placeholder="Ask CediSmart AI..."
              placeholderTextColor={isDark ? '#434942' : '#9CA3AF'}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
              editable={!chatMutation.isPending}
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={!input.trim() || chatMutation.isPending}
              className={`w-12 h-12 rounded-xl items-center justify-center ${
                !input.trim() || chatMutation.isPending ? 'bg-gray-500/10' : 'bg-primary'
              } shadow-sm`}
            >
              <Send size={18} color={!input.trim() || chatMutation.isPending ? '#9CA3AF' : 'white'} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};
