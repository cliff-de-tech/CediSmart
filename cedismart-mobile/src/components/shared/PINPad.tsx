import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Delete, Fingerprint, ScanFace } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '../../stores/themeStore';

interface PINPadProps {
  onPress: (digit: string) => void;
  onBackspace: () => void;
  onBiometricPress?: () => void;
  biometricType?: 'fingerprint' | 'face' | null;
  disabled?: boolean;
}

const PINPad: React.FC<PINPadProps> = ({ onPress, onBackspace, onBiometricPress, biometricType, disabled = false }) => {
  const isDark = useThemeStore((state) => state.theme) === 'dark';

  const keys = [
    { digit: '1', letters: '' },
    { digit: '2', letters: 'ABC' },
    { digit: '3', letters: 'DEF' },
    { digit: '4', letters: 'GHI' },
    { digit: '5', letters: 'JKL' },
    { digit: '6', letters: 'MNO' },
    { digit: '7', letters: 'PQRS' },
    { digit: '8', letters: 'TUV' },
    { digit: '9', letters: 'WXYZ' },
    { digit: null, letters: '' },
    { digit: '0', letters: '' },
    { digit: 'backspace', letters: '' },
  ];

  return (
    <View className="w-full max-w-sm self-center px-4">
      <View className="flex-row flex-wrap justify-between">
        {keys.map((key, index) => {
          if (key.digit === null) {
            if (onBiometricPress) {
              return (
                <TouchableOpacity
                  key="biometric"
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    onBiometricPress();
                  }}
                  disabled={disabled}
                  className={`w-[30%] aspect-square m-1 items-center justify-center rounded-2xl ${isDark ? 'active:bg-dark-surface-container-low' : 'active:bg-surface-container-low'} transition-all`}
                  accessibilityLabel="Biometric Authentication"
                >
                  {Platform.OS === 'ios' ? (
                    <ScanFace color={isDark ? '#e1e3e0' : '#1c1b1f'} size={28} />
                  ) : (
                    <Fingerprint color={isDark ? '#e1e3e0' : '#1c1b1f'} size={28} />
                  )}
                </TouchableOpacity>
              );
            }
            return <View key={`empty-${index}`} className="w-[30%] aspect-square m-1" />;
          }

          if (key.digit === 'backspace') {
            return (
              <TouchableOpacity
                key="backspace"
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  onBackspace();
                }}
                disabled={disabled}
                className={`w-[30%] aspect-square m-1 items-center justify-center rounded-2xl ${isDark ? 'active:bg-dark-surface-container-low' : 'active:bg-surface-container-low'} transition-all`}
                accessibilityLabel="Backspace"
              >
                <Delete color={isDark ? '#e1e3e0' : '#1c1b1f'} size={28} />
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={key.digit}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onPress(key.digit!);
              }}
              disabled={disabled}
              className={`w-[30%] aspect-square m-1 items-center justify-center rounded-2xl ${isDark ? 'active:bg-dark-surface-container-low' : 'active:bg-surface-container-low'} transition-all`}
              accessibilityLabel={key.digit}
            >
              <View className="items-center">
                <Text className={`text-3xl font-headline font-bold ${isDark ? 'text-dark-on-surface' : 'text-on-surface'}`}>{key.digit}</Text>
                {key.letters ? (
                  <Text className={`text-[10px] font-bold ${isDark ? 'text-dark-on-surface-variant' : 'text-on-surface-variant'} uppercase tracking-widest mt-1`}>
                    {key.letters}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export default PINPad;
