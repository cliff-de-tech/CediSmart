import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Delete } from 'lucide-react-native';

interface PINPadProps {
  onPress: (digit: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
}

const PINPad: React.FC<PINPadProps> = ({ onPress, onBackspace, disabled = false }) => {
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
            return <View key={`empty-${index}`} className="w-[30%] aspect-square m-1" />;
          }

          if (key.digit === 'backspace') {
            return (
              <TouchableOpacity
                key="backspace"
                onPress={onBackspace}
                disabled={disabled}
                className="w-[30%] aspect-square m-1 items-center justify-center rounded-2xl active:bg-surface-container-low transition-all"
                accessibilityLabel="Backspace"
              >
                <Delete color="#1c1b1f" size={28} />
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={key.digit}
              onPress={() => onPress(key.digit!)}
              disabled={disabled}
              className="w-[30%] aspect-square m-1 items-center justify-center rounded-2xl active:bg-surface-container-low transition-all"
              accessibilityLabel={key.digit}
            >
              <View className="items-center">
                <Text className="text-3xl font-headline font-bold text-on-surface">{key.digit}</Text>
                {key.letters ? (
                  <Text className="text-[10px] font-bold text-outline-variant uppercase tracking-widest mt-1">
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
