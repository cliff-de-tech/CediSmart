import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { X, Send, Bot, User, Sparkles, Github, AlertCircle, CheckCircle } from 'lucide-react-native';
import apiClient from '../../api/client';
import { useThemeStore } from '../../stores/themeStore';

interface Message {
  role: 'user' | 'model';
  content: string;
}

interface SupportModalProps {
  visible: boolean;
  onClose: () => void;
  phone?: string;
}

export const SupportModal: React.FC<SupportModalProps> = ({ visible, onClose, phone = 'Anonymous' }) => {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      content: "Hi! I'm your CediSmart AI Support Assistant. How can I help you today? (e.g., issues with OTP, registering, or PIN setup)."
    }
  ]);
  const [showEscalate, setShowEscalate] = useState(false);
  const [escalatedTicket, setEscalatedTicket] = useState<{ number: number; url: string } | null>(null);

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
      const response = await apiClient.post('/support/chat', { messages: chatHistory });
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
      // Use the last user message as the primary query
      const userQueries = messages.filter((m) => m.role === 'user');
      const primaryQuery = userQueries.length > 0 ? userQueries[userQueries.length - 1].content : 'General inquiry';

      const response = await apiClient.post('/support/escalate', {
        phone: phone,
        user_query: primaryQuery,
        chat_history: messages
      });
      return response.data;
    },
    onSuccess: (data) => {
      setEscalatedTicket({
        number: data.issue_number,
        url: data.issue_url
      });
      setShowEscalate(false);
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          content: `I've opened a support ticket (#${data.issue_number}) on GitHub directly for our developer. They've been notified and will look into this immediately!`
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
      transparent={true}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/60 justify-end">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className={`h-[80%] w-full ${isDark ? 'bg-dark-background' : 'bg-surface'} rounded-t-3xl overflow-hidden`}
        >
          {/* Header */}
          <View className={`px-6 py-4 flex-row items-center justify-between border-b ${isDark ? 'border-dark-outline-variant/35' : 'border-outline-variant/20'}`}>
            <View className="flex-row items-center space-x-2">
              <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center">
                <Sparkles size={16} color={isDark ? '#2e7d32' : '#0d631b'} />
              </View>
              <View>
                <Text className={`font-headline font-bold text-lg ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>CediSmart AI Support</Text>
                <Text className={`font-body text-[10px] ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'}`}>Ghana's Smart Finance Assistant</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} className="p-1 rounded-full active:bg-gray-500/10">
              <X size={24} color={isDark ? '#e1e3e0' : '#1c1b1f'} />
            </TouchableOpacity>
          </View>

          {/* Chat Messages */}
          <ScrollView
            ref={scrollViewRef}
            className="flex-1 p-6"
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            {messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              return (
                <View
                  key={index}
                  className={`flex-row mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center mr-3 self-end">
                      <Bot size={16} color={isDark ? '#2e7d32' : '#0d631b'} />
                    </View>
                  )}
                  <View className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                    isUser
                      ? 'bg-primary rounded-tr-none'
                      : `${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} rounded-tl-none`
                  }`}>
                    <Text className={`font-body text-sm ${
                      isUser ? 'text-white' : isDark ? 'text-dark-on-surface' : 'text-on-surface'
                    } leading-relaxed`}>
                      {msg.content}
                    </Text>
                  </View>
                  {isUser && (
                    <View className="w-8 h-8 rounded-full bg-primary/20 items-center justify-center ml-3 self-end">
                      <User size={16} color={isDark ? '#2e7d32' : '#0d631b'} />
                    </View>
                  )}
                </View>
              );
            })}

            {/* AI thinking state */}
            {chatMutation.isPending && (
              <View className="flex-row mb-4 justify-start items-center">
                <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center mr-3">
                  <Bot size={16} color={isDark ? '#2e7d32' : '#0d631b'} />
                </View>
                <View className={`rounded-2xl px-4 py-3 ${isDark ? 'bg-dark-surface-container-low' : 'bg-surface-container-low'} rounded-tl-none flex-row items-center space-x-2`}>
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

          {/* Chat Input Bar */}
          <View className={`p-4 border-t ${isDark ? 'border-dark-outline-variant/35' : 'border-outline-variant/20'} flex-row items-center space-x-3`}>
            <TextInput
              className={`flex-1 h-12 px-4 rounded-xl font-body text-sm ${
                isDark ? 'bg-dark-surface-container-low text-dark-on-surface' : 'bg-surface-container-low text-on-surface'
              }`}
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
              }`}
            >
              <Send size={18} color={!input.trim() || chatMutation.isPending ? '#9CA3AF' : 'white'} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};
