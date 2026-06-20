import React, { useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useQuery } from '@tanstack/react-query';
import { useThemeStore } from '../../stores/themeStore';
import apiClient from '../../api/client';
import { Tag } from 'lucide-react-native';

interface Category {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
}

interface CategoryPickerProps {
  bottomSheetRef: React.RefObject<BottomSheet | null>;
  type: 'income' | 'expense';
  onSelect: (categoryId: string, categoryName: string) => void;
}

const CategoryPicker: React.FC<CategoryPickerProps> = ({ bottomSheetRef, type, onSelect }) => {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const snapPoints = useMemo(() => ['50%', '100%'], []);

  const { data: categories, isLoading } = useQuery<Category[]>({
    queryKey: ['categories', type],
    queryFn: async () => {
      const response = await apiClient.get(`/categories/?type=${type}`);
      return response.data;
    }
  });

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    []
  );

  const handleSelect = (id: string, name: string) => {
    onSelect(id, name);
    bottomSheetRef.current?.close();
  };

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: isDark ? '#181e19' : '#F8F9FA', borderRadius: 24 }}
      handleIndicatorStyle={{ backgroundColor: theme === 'dark' ? '#374151' : '#D1D5DB', width: 40 }}
    >
      <View className="px-6 pb-4 flex-1">
        <Text className={`text-xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} mb-4`}>
          Select {type === 'income' ? 'Income' : 'Expense'} Category
        </Text>
        
        {isLoading ? (
          <ActivityIndicator size="large" color="#0A6E4A" className="mt-8" />
        ) : (
          <BottomSheetFlatList
            data={categories}
            keyExtractor={(item) => item.id}
            numColumns={4}
            columnWrapperStyle={{ justifyContent: 'space-between', marginBottom: 24 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => handleSelect(item.id, item.name)}
                className="items-center w-[22%]"
              >
                <View 
                  className="w-14 h-14 rounded-full items-center justify-center mb-2"
                  style={{ backgroundColor: item.color ? `${item.color}20` : (theme === 'dark' ? '#1c221e' : '#F3F4F6') }}
                >
                  <Tag size={24} color={item.color || (theme === 'dark' ? '#b2b6b1' : '#9CA3AF')} />
                </View>
                <Text 
                  className={`text-xs ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} text-center`} 
                  numberOfLines={2}
                >
                  {item.name}
                </Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: 40 }}
            ListEmptyComponent={
              <Text className={`text-center ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-8`}>No categories found.</Text>
            }
          />
        )}
      </View>
    </BottomSheet>
  );
};

export default CategoryPicker;
