import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Delete } from 'lucide-react-native';

interface PINPadProps {
  onPress: (digit: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
}

const PINPad: React.FC<PINPadProps> = ({ onPress, onBackspace, disabled = false }) => {
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace'];

  return (
    <View className="w-full px-8 py-4">
      <View className="flex-row flex-wrap justify-between">
        {digits.map((item, index) => {
          if (item === '') {
            return <View key={`empty-${index}`} className="w-[28%] aspect-square m-2" />;
          }

          if (item === 'backspace') {
            return (
              <TouchableOpacity
                key="backspace"
                onPress={onBackspace}
                disabled={disabled}
                className="w-[28%] aspect-square m-2 items-center justify-center rounded-full active:bg-gray-200"
                accessibilityLabel="Backspace"
              >
                <Delete color="#1C1C2E" size={32} />
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={item}
              onPress={() => onPress(item)}
              disabled={disabled}
              className="w-[28%] aspect-square m-2 items-center justify-center rounded-full active:bg-gray-200"
              accessibilityLabel={item}
            >
              <Text className="text-3xl font-semibold text-charcoal">{item}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export default PINPad;
