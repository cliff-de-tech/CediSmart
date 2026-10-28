import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { GlassSheetBackground } from '../glass/GlassSheetBackground';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { BottomSheetBackdrop, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import BottomSheet from './AppBottomSheet';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeStore } from '../../stores/themeStore';
import apiClient from '../../api/client';
import {
  Tag,
  Utensils,
  Car,
  Zap,
  ShoppingBag,
  HeartPulse,
  Home,
  GraduationCap,
  Briefcase,
  Gift,
  Film,
  Smartphone,
  Wallet,
  Clock,
} from 'lucide-react-native';
import { useAuthStore } from '../../stores/authStore';
import { useGlassTabBarMetrics } from '../glass/useGlassTabBarMetrics';

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

const getCategoryIconComponent = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('food') || n.includes('grocer') || n.includes('dining') || n.includes('chop') || n.includes('restaurant')) return Utensils;
  if (n.includes('transport') || n.includes('trotro') || n.includes('fuel') || n.includes('ride') || n.includes('car') || n.includes('travel')) return Car;
  if (n.includes('bill') || n.includes('utilit') || n.includes('ecg') || n.includes('water') || n.includes('power') || n.includes('electric')) return Zap;
  if (n.includes('airtime') || n.includes('data') || n.includes('momo') || n.includes('phone') || n.includes('internet')) return Smartphone;
  if (n.includes('shop') || n.includes('cloth') || n.includes('market')) return ShoppingBag;
  if (n.includes('health') || n.includes('medic') || n.includes('hospital') || n.includes('pharmacy')) return HeartPulse;
  if (n.includes('rent') || n.includes('hous') || n.includes('home')) return Home;
  if (n.includes('educat') || n.includes('school') || n.includes('tuition') || n.includes('book')) return GraduationCap;
  if (n.includes('salar') || n.includes('business') || n.includes('work') || n.includes('freelance') || n.includes('job')) return Briefcase;
  if (n.includes('gift') || n.includes('Tithe') || n.includes('church') || n.includes('charity') || n.includes('family') || n.includes('giving')) return Gift;
  if (n.includes('entertain') || n.includes('fun') || n.includes('leisure') || n.includes('sub')) return Film;
  if (n.includes('saving') || n.includes('invest') || n.includes('income')) return Wallet;
  return Tag;
};

const CategoryPicker: React.FC<CategoryPickerProps> = ({ bottomSheetRef, type, onSelect }) => {
  const { clearance: tabBarClearance } = useGlassTabBarMetrics();
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const snapPoints = useMemo(() => ['68%', '100%'], []);
  const user = useAuthStore((state) => state.user);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  const storageKey = `recent_categories_${type}`;

  useEffect(() => {
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (raw) {
          setRecentIds(JSON.parse(raw));
        } else {
          setRecentIds([]);
        }
      })
      .catch(() => setRecentIds([]));
  }, [storageKey]);

  const { data: categories, isLoading } = useQuery<Category[]>({
    queryKey: ['categories', type, user?.id],
    queryFn: async () => {
      const response = await apiClient.get(`/categories/?type=${type}`);
      return response.data;
    },
    enabled: !!user?.id
  });

  const recentCategories = useMemo(() => {
    if (!categories || recentIds.length === 0) return [];
    return recentIds
      .map((id) => categories.find((c) => c.id === id))
      .filter((c): c is Category => !!c)
      .slice(0, 4);
  }, [categories, recentIds]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    []
  );

  const handleSelect = (id: string, name: string) => {
    const updated = [id, ...recentIds.filter((r) => r !== id)].slice(0, 4);
    setRecentIds(updated);
    AsyncStorage.setItem(storageKey, JSON.stringify(updated)).catch(() => {});
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
      backgroundComponent={GlassSheetBackground}
      handleIndicatorStyle={{ backgroundColor: theme === 'dark' ? '#374151' : '#D1D5DB', width: 40 }}
    >
      <View className="px-6 pb-4 flex-1">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ flex: 1, flexShrink: 1, marginRight: 12 }} className={`text-xl font-bold ${isDark ? 'text-dark-charcoal' : 'text-charcoal'}`} numberOfLines={1}>
            Select {type === 'income' ? 'Income' : 'Expense'} Category
          </Text>
          <TouchableOpacity onPress={() => bottomSheetRef.current?.close()} style={{ flexShrink: 0 }}>
            <Text className={`${isDark ? 'text-[#4ade80]' : 'text-primary'} font-bold`}>Close</Text>
          </TouchableOpacity>
        </View>

        {recentCategories.length > 0 && (
          <View className="mb-4">
            <View className="flex-row items-center mb-2">
              <Clock size={12} color={isDark ? '#9ca3af' : '#6b7280'} />
              <Text className={`ml-1.5 text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Recently Used
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {recentCategories.map((cat) => {
                const IconComp = getCategoryIconComponent(cat.name);
                const accent = cat.color || (isDark ? '#4ade80' : '#0A6E4A');
                return (
                  <TouchableOpacity
                    key={`recent-${cat.id}`}
                    onPress={() => handleSelect(cat.id, cat.name)}
                    className={`mr-2.5 px-3.5 py-2 rounded-2xl border flex-row items-center ${
                      isDark ? 'bg-white/10 border-white/15' : 'bg-black/5 border-black/10'
                    }`}
                  >
                    <IconComp size={14} color={accent} />
                    <Text className={`ml-2 text-xs font-bold ${isDark ? 'text-white' : 'text-charcoal'}`}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
        
        {isLoading ? (
          <ActivityIndicator size="large" color={isDark ? '#4ade80' : '#0A6E4A'} className="mt-8" />
        ) : (
          <BottomSheetFlatList
            data={categories}
            keyExtractor={(item) => item.id}
            numColumns={4}
            columnWrapperStyle={{ justifyContent: 'space-between', marginBottom: 20 }}
            renderItem={({ item }) => {
              const IconComp = getCategoryIconComponent(item.name);
              const accent = item.color || (isDark ? '#4ade80' : '#0A6E4A');
              return (
                <TouchableOpacity
                  onPress={() => handleSelect(item.id, item.name)}
                  className="items-center w-[23%]"
                >
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 20,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 8,
                      backgroundColor: `${accent}20`,
                      borderWidth: 1,
                      borderColor: `${accent}35`,
                    }}
                  >
                    <IconComp size={24} color={accent} />
                  </View>
                  <Text 
                    className={`text-xs font-medium ${isDark ? 'text-dark-charcoal' : 'text-charcoal'} text-center`} 
                    numberOfLines={2}
                  >
                    {item.name}
                  </Text>
                </TouchableOpacity>
              );
            }}
            contentContainerStyle={{ paddingBottom: tabBarClearance + 40 }}
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
