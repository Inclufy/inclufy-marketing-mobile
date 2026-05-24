// TODO: migrate to Phosphor — unmapped icons: MaterialCommunityIcons name=<dynamic: f.icon as any> | MaterialCommunityIcons name=<dynamic: item.icon as any>
// src/screens/OnboardingScreen.tsx
// Interactive App Tour & Setup Guide

import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, SafeAreaView, TextInput,
  Dimensions, FlatList, Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { supabase } from '../services/supabase';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';

import { CaretRight, Lightbulb, Rocket } from 'phosphor-react-native';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Tour Slides ─────────────────────────────────────────────────────

interface TourSlide {
  id: string;
  icon: string;
  iconColor: string;
  gradient: [string, string];
  title: string;
  subtitle: string;
  features: Array<{ icon: string; text: string }>;
}

const TOUR_SLIDES: TourSlide[] = [
  {
    id: 'welcome',
    icon: 'robot-happy',
    iconColor: '#7C3AED',
    gradient: ['#7C3AED', '#A855F7'],
    title: 'Welkom bij AMOS',
    subtitle: 'Jouw AI Marketing Operating System',
    features: [
      { icon: 'brain', text: 'AI genereert content voor al je kanalen' },
      { icon: 'lightning-bolt', text: 'Automatiseer je complete marketing' },
      { icon: 'chart-line', text: 'Real-time analytics en inzichten' },
    ],
  },
  {
    id: 'capture',
    icon: 'camera-plus',
    iconColor: '#E8317A',
    gradient: ['#E8317A', '#F7941D'],
    title: 'Live Capture',
    subtitle: 'Leg content vast tijdens events',
    features: [
      { icon: 'camera', text: 'Foto, video, audio & quotes vastleggen' },
      { icon: 'auto-fix', text: 'AI maakt direct posts van je captures' },
      { icon: 'share-variant', text: 'Publiceer naar LinkedIn, Instagram & meer' },
    ],
  },
  {
    id: 'campaigns',
    icon: 'bullhorn',
    iconColor: '#3B82F6',
    gradient: ['#3B82F6', '#06B6D4'],
    title: 'Campagnes & Events',
    subtitle: 'Beheer al je marketing activiteiten',
    features: [
      { icon: 'calendar-star', text: 'Plan en beheer events met AI support' },
      { icon: 'rocket-launch', text: 'Maak campagnes met budget tracking' },
      { icon: 'account-group', text: 'Team samenwerking en lead management' },
    ],
  },
  {
    id: 'ai',
    icon: 'head-snowflake',
    iconColor: '#10B981',
    gradient: ['#10B981', '#059669'],
    title: 'AMOS AI Copilot',
    subtitle: 'Je persoonlijke marketing assistent',
    features: [
      { icon: 'message-text', text: 'Chat met AI over je marketing strategie' },
      { icon: 'file-document-edit', text: 'Content voorstellen die je kunt goedkeuren' },
      { icon: 'shield-check', text: 'Vertrouwensniveau bepaalt AI autonomie' },
    ],
  },
];

// ─── Setup Steps ────────────────────────────────────────────────────

interface SetupItem {
  id: string;
  icon: string;
  color: string;
  title: string;
  description: string;
  route: string;
}

const SETUP_ITEMS: SetupItem[] = [
  { id: 'brand', icon: 'palette-swatch-variant', color: '#EC4899', title: 'Brand Kit', description: 'Kleuren, fonts & visuele identiteit', route: 'BrandKit' },
  { id: 'product', icon: 'package-variant-closed', color: '#3B82F6', title: 'Producten & Diensten', description: 'Wat bied je aan?', route: 'Products' },
  { id: 'social', icon: 'link-variant', color: '#8B5CF6', title: 'Social Media koppelen', description: 'LinkedIn, Instagram, Facebook', route: 'Settings' },
  { id: 'strategy', icon: 'target', color: '#10B981', title: 'Marketing Strategie', description: 'Doelen, kanalen & planning', route: 'MarketingStrategy' },
];

// ─── Component ──────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
  }));

  const [phase, setPhase] = useState<'tour' | 'setup'>('tour');
  const [currentSlide, setCurrentSlide] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  // ─── Tour Phase ─────────────────────────────────────────────────

  const goToSlide = (index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
    setCurrentSlide(index);
  };

  const handleNext = () => {
    if (currentSlide < TOUR_SLIDES.length - 1) {
      goToSlide(currentSlide + 1);
    } else {
      setPhase('setup');
    }
  };

  const renderSlide = ({ item }: { item: TourSlide }) => (
    <View style={{ width: SCREEN_WIDTH, paddingHorizontal: spacing.lg }}>
      {/* Hero gradient card */}
      <LinearGradient
        colors={item.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: borderRadius.xl, padding: spacing.xl,
          alignItems: 'center', marginTop: spacing.lg,
        }}
      >
        <View style={{
          width: 80, height: 80, borderRadius: 40,
          backgroundColor: 'rgba(255,255,255,0.2)',
          justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md,
        }}>
          <MaterialCommunityIcons name={item.icon as any} size={42} color="#fff" />
        </View>
        <Text style={{ fontSize: 26, fontWeight: '800', color: '#fff', textAlign: 'center' }}>
          {item.title}
        </Text>
        <Text style={{ fontSize: fontSize.md, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: spacing.xs }}>
          {item.subtitle}
        </Text>
      </LinearGradient>

      {/* Feature list */}
      <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
        {item.features.map((f, i) => (
          <View key={i} style={{
            flexDirection: 'row', alignItems: 'center', gap: spacing.md,
            backgroundColor: colors.surface, borderRadius: borderRadius.lg,
            padding: spacing.md, borderWidth: 1, borderColor: colors.border,
          }}>
            <View style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: item.iconColor + '15',
              justifyContent: 'center', alignItems: 'center',
            }}>
              <MaterialCommunityIcons name={f.icon as any} size={22} color={item.iconColor} />
            </View>
            <Text style={{ flex: 1, fontSize: fontSize.md, color: colors.text, lineHeight: 22 }}>
              {f.text}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );

  // ─── Setup Phase ────────────────────────────────────────────────

  if (phase === 'setup') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
          {/* Header */}
          <View style={{ alignItems: 'center', marginBottom: spacing.xl, marginTop: spacing.md }}>
            <View style={{
              width: 64, height: 64, borderRadius: 32,
              backgroundColor: colors.primary + '15',
              justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md,
            }}>
              <Rocket size={32} color={colors.primary} weight="fill" />
            </View>
            <Text style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold as any, color: colors.text, textAlign: 'center' }}>
              Stel je platform in
            </Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs, lineHeight: 20 }}>
              Vul de stappen hieronder in zodat AMOS{'\n'}gepersonaliseerde content kan genereren
            </Text>
          </View>

          {/* Setup cards */}
          <View style={{ gap: spacing.sm }}>
            {SETUP_ITEMS.map((item, index) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => navigation.navigate(item.route as any)}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                  backgroundColor: colors.surface, borderRadius: borderRadius.lg,
                  padding: spacing.md, borderWidth: 1, borderColor: colors.border,
                }}
              >
                <View style={{
                  width: 28, height: 28, borderRadius: 14,
                  backgroundColor: colors.border,
                  justifyContent: 'center', alignItems: 'center',
                }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary }}>
                    {index + 1}
                  </Text>
                </View>
                <View style={{
                  width: 48, height: 48, borderRadius: 14,
                  backgroundColor: item.color + '12',
                  justifyContent: 'center', alignItems: 'center',
                }}>
                  <MaterialCommunityIcons name={item.icon as any} size={24} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold as any, color: colors.text }}>
                    {item.title}
                  </Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 }}>
                    {item.description}
                  </Text>
                </View>
                <CaretRight size={18} color={colors.textTertiary} weight="bold" />
              </TouchableOpacity>
            ))}
          </View>

          {/* Tip */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
            backgroundColor: colors.primary + '08', borderRadius: borderRadius.lg,
            padding: spacing.md, marginTop: spacing.lg,
            borderWidth: 1, borderColor: colors.primary + '20',
          }}>
            <Lightbulb size={20} color={colors.primary} weight="duotone" />
            <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 }}>
              Je kunt deze stappen altijd later aanpassen via Instellingen. Begin met de stappen die je al weet.
            </Text>
          </View>
        </ScrollView>

        {/* Bottom buttons */}
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: spacing.lg, paddingBottom: spacing.xl + 10,
          backgroundColor: colors.background,
          borderTopWidth: 1, borderTopColor: colors.border,
        }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Main')}
            style={{
              backgroundColor: colors.primary, borderRadius: borderRadius.lg,
              paddingVertical: spacing.md, alignItems: 'center',
            }}
          >
            <Text style={{ color: '#FFF', fontWeight: fontWeight.bold as any, fontSize: fontSize.md }}>
              Naar Dashboard
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPhase('tour')}
            style={{ alignItems: 'center', marginTop: spacing.sm, paddingVertical: spacing.xs }}
          >
            <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
              Terug naar tour
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Tour Phase Render ──────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Skip button */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
        <TouchableOpacity onPress={() => setPhase('setup')}>
          <Text style={{ fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.medium as any }}>
            Overslaan
          </Text>
        </TouchableOpacity>
      </View>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={TOUR_SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setCurrentSlide(index);
        }}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index,
        })}
      />

      {/* Bottom: dots + button */}
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl + 10, paddingTop: spacing.md }}>
        {/* Dots */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: spacing.lg }}>
          {TOUR_SLIDES.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => goToSlide(i)}>
              <View style={{
                width: currentSlide === i ? 24 : 8, height: 8, borderRadius: 4,
                backgroundColor: currentSlide === i ? colors.primary : colors.border,
              }} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Next / Start button */}
        <TouchableOpacity
          onPress={handleNext}
          style={{
            backgroundColor: colors.primary, borderRadius: borderRadius.lg,
            paddingVertical: spacing.md, alignItems: 'center',
          }}
        >
          <Text style={{ color: '#FFF', fontWeight: fontWeight.bold as any, fontSize: fontSize.md }}>
            {currentSlide < TOUR_SLIDES.length - 1 ? 'Volgende' : 'Platform instellen'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
