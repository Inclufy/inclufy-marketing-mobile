// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: cmd.icon> | Ionicons name=<dynamic: isRecording ? 'stop' : 'mic'>
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import {
  useAudioRecorder,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from 'expo-audio';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import type { RootStackParamList } from '../types';

import { Microphone, PaperPlaneTilt, Robot } from 'phosphor-react-native';
type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isVoice?: boolean;
}

const QUICK_COMMANDS = [
  { icon: 'flash-outline' as const,     label: 'Maak een post',          prompt: 'Maak een Instagram post voor mijn laatste event.' },
  { icon: 'sparkles-outline' as const,  label: 'Content ideeën',         prompt: 'Geef me 5 content ideeën voor LinkedIn deze week.' },
  { icon: 'analytics-outline' as const, label: 'Marketing advies',       prompt: 'Wat zijn de beste marketing acties die ik nu kan doen?' },
  { icon: 'calendar-outline' as const,  label: 'Plan een campagne',      prompt: 'Help me een campagne plannen voor de komende maand.' },
  { icon: 'people-outline' as const,    label: 'Lead strategie',         prompt: 'Hoe kan ik meer leads genereren op events?' },
  { icon: 'megaphone-outline' as const, label: 'Hashtag suggesties',     prompt: 'Welke hashtags moet ik gebruiken voor mijn branche?' },
];

function TypingDots() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -6, duration: 300, easing: Easing.ease, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, easing: Easing.ease, useNativeDriver: true }),
          Animated.delay(600 - delay),
        ])
      );
    const a1 = anim(dot1, 0);
    const a2 = anim(dot2, 200);
    const a3 = anim(dot3, 400);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 12 }}>
      {[dot1, dot2, dot3].map((d, i) => (
        <Animated.View
          key={i}
          style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#E8317A', transform: [{ translateY: d }] }}
        />
      ))}
    </View>
  );
}

export default function CopilotScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: '👋 Hoi! Ik ben AMOS, jouw AI marketing copiloot. Stel me een vraag, geef me een opdracht of gebruik de snelle acties hieronder. Je kunt ook op de microfoon tikken om te spreken! 🎙️',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [micPermission, setMicPermission] = useState<boolean | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // expo-audio recorder
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  // Pulse animation for mic button while recording
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  // Auto scroll to bottom
  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages]);

  // ── Send text message ──────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const resp = await api.post('/api/amos/chat', {
        message: text.trim(),
        history: messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
      });
      const reply = resp.data?.reply ?? resp.data?.message ?? 'Ik begreep je niet helemaal. Kun je het anders verwoorden?';
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
      }]);
    } catch {
      // Fallback: local AI-like responses when backend is unreachable
      const fallbacks: Record<string, string> = {
        post: '💡 **Post idee:**\n\nDeel een behind-the-scenes moment van jouw event. Toon de energie, de mensen en de sfeer. Gebruik de LiveCapture functie om snel een foto te schieten en laat AMOS de tekst genereren!',
        content: '🎯 **5 Content ideeën:**\n\n1. Case study van een recent event\n2. Behind-the-scenes voorbereiding\n3. Quote van een spreker of gast\n4. Poll: wat vond jouw publiek het interessantst?\n5. Teaser voor je volgende event',
        hashtag: '📌 **Top hashtags:**\n\n#Marketing #B2B #Events #Networking #ContentCreation #AMOS #Benelux #BusinessGrowth',
        lead: '🎯 **Lead tips:**\n\n• Zet een QR-code neer bij registratie\n• Gebruik LiveCapture om contacten te scannen\n• Follow-up binnen 24 uur na het event\n• Verbind LinkedIn direct via de AMOS koppeling',
      };
      const key = Object.keys(fallbacks).find(k => text.toLowerCase().includes(k)) ?? 'post';
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: fallbacks[key],
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages]);

  // ── Voice recording ────────────────────────────────────────────────────────
  const handleMicPress = useCallback(async () => {
    if (isRecording) {
      // Stop recording and process
      setIsRecording(false);
      try {
        await recorder.stop();
        // Restore audio session to playback mode
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
        const uri = recorder.uri;
        if (!uri) return;

        setLoading(true);
        // Send audio to backend for transcription
        const formData = new FormData();
        formData.append('audio', { uri, type: 'audio/m4a', name: 'voice.m4a' } as any);

        try {
          const resp = await api.post('/api/amos/transcribe', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          const transcript = resp.data?.transcript ?? '';
          if (transcript.trim()) {
            const userMsg: Message = {
              id: Date.now().toString(),
              role: 'user',
              content: transcript.trim(),
              timestamp: new Date(),
              isVoice: true,
            };
            setMessages(prev => [...prev, userMsg]);
            setLoading(false);
            await sendMessage(transcript.trim());
          } else {
            setLoading(false);
            Alert.alert('Niet verstaan', 'Ik kon je niet verstaan. Probeer opnieuw of typ je vraag.');
          }
        } catch {
          setLoading(false);
          Alert.alert('Transcriptie mislukt', 'Kon spraak niet verwerken. Typ je vraag in het tekstvak.');
        }
      } catch (err) {
        setIsRecording(false);
        setLoading(false);
      }
    } else {
      // Request permission and start recording
      if (micPermission === null || !micPermission) {
        const { granted } = await requestRecordingPermissionsAsync();
        setMicPermission(granted);
        if (!granted) {
          Alert.alert(
            'Microfoon toegang vereist',
            'Sta microfoon toegang toe in Instellingen → AMOS → Microfoon om spraakcommando\'s te gebruiken.',
            [
              { text: 'Open Instellingen', onPress: () => { const { Linking } = require('react-native'); Linking.openURL('app-settings:'); } },
              { text: 'Annuleren', style: 'cancel' },
            ]
          );
          return;
        }
      }
      try {
        // Required on iOS: set audio session to allow recording
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        // prepareToRecordAsync MUST be called before record()
        await recorder.prepareToRecordAsync();
        recorder.record();
        setIsRecording(true);
      } catch (err: any) {
        console.error('Recording start error:', err);
        Alert.alert('Fout', 'Opname starten mislukt. Controleer microfoon toegang in Instellingen.');
      }
    }
  }, [isRecording, micPermission, recorder, sendMessage]);

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {/* ── Header ── */}
      <LinearGradient
        colors={['#C01D60', '#E8317A', '#F7941D']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          paddingTop: Platform.OS === 'ios' ? 56 : 36,
          paddingBottom: 16,
          paddingHorizontal: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
          <Robot size={22} color="#fff" weight="fill" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.lg, letterSpacing: 0.5 }}>
            AMOS Copilot
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>
            AI Marketing Assistent · 24/7 actief
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ADE80' }} />
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: fontWeight.medium }}>Online</Text>
        </View>
      </LinearGradient>

      {/* ── Messages ── */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.md, gap: 12, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((msg) => (
          <View
            key={msg.id}
            style={{
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
              alignItems: 'flex-end',
              gap: 8,
            }}
          >
            {/* Avatar */}
            {msg.role === 'assistant' && (
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#E8317A' + '20', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E8317A' + '40', flexShrink: 0 }}>
                <Robot size={16} color="#E8317A" weight="fill" />
              </View>
            )}

            {/* Bubble */}
            <View style={{ maxWidth: '80%' }}>
              <View style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 18,
                borderBottomRightRadius: msg.role === 'user' ? 4 : 18,
                borderBottomLeftRadius: msg.role === 'assistant' ? 4 : 18,
                backgroundColor: msg.role === 'user' ? '#E8317A' : colors.surface,
                borderWidth: msg.role === 'assistant' ? 1 : 0,
                borderColor: colors.border,
              }}>
                {msg.isVoice && msg.role === 'user' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <Microphone size={11} color="rgba(255,255,255,0.7)" weight="duotone" />
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>Spraakbericht</Text>
                  </View>
                )}
                <Text style={{
                  color: msg.role === 'user' ? '#fff' : colors.text,
                  fontSize: fontSize.sm,
                  lineHeight: 20,
                }}>
                  {msg.content}
                </Text>
              </View>
              <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 3, textAlign: msg.role === 'user' ? 'right' : 'left', paddingHorizontal: 4 }}>
                {formatTime(msg.timestamp)}
              </Text>
            </View>
          </View>
        ))}

        {/* Typing indicator */}
        {loading && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#E8317A' + '20', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E8317A' + '40' }}>
              <Robot size={16} color="#E8317A" weight="fill" />
            </View>
            <View style={{ backgroundColor: colors.surface, borderRadius: 18, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border }}>
              <TypingDots />
            </View>
          </View>
        )}

        {/* Quick commands (shown only at start) */}
        {messages.length <= 1 && (
          <View style={{ gap: 8, marginTop: 8 }}>
            <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: fontWeight.medium, textAlign: 'center' }}>
              Snelle acties
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {QUICK_COMMANDS.map((cmd) => (
                <TouchableOpacity
                  key={cmd.label}
                  onPress={() => sendMessage(cmd.prompt)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: colors.surface,
                    borderRadius: borderRadius.full,
                    paddingHorizontal: 14, paddingVertical: 8,
                    borderWidth: 1.5, borderColor: colors.border,
                  }}
                >
                  <Ionicons name={cmd.icon} size={14} color={colors.primary} />
                  <Text style={{ fontSize: 12, color: colors.text, fontWeight: fontWeight.medium }}>
                    {cmd.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Input bar ── */}
      <View style={{
        flexDirection: 'row', alignItems: 'flex-end', gap: 10,
        paddingHorizontal: spacing.md, paddingVertical: 12,
        paddingBottom: Platform.OS === 'ios' ? 24 : 12,
        backgroundColor: colors.surface,
        borderTopWidth: 1, borderTopColor: colors.border,
      }}>
        {/* Text input */}
        <View style={{
          flex: 1, flexDirection: 'row', alignItems: 'flex-end',
          backgroundColor: colors.background,
          borderRadius: 22, borderWidth: 1.5,
          borderColor: input ? colors.primary + '60' : colors.border,
          paddingHorizontal: 14, paddingVertical: 8,
          minHeight: 44,
        }}>
          <TextInput
            style={{ flex: 1, fontSize: fontSize.sm, color: colors.text, maxHeight: 120, lineHeight: 20 }}
            value={input}
            onChangeText={setInput}
            placeholder="Vraag AMOS iets..."
            placeholderTextColor={colors.textTertiary}
            multiline
            returnKeyType="send"
            onSubmitEditing={() => sendMessage(input)}
            blurOnSubmit
          />
        </View>

        {/* Mic button */}
        <TouchableOpacity onPress={handleMicPress} disabled={loading}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <LinearGradient
              colors={isRecording ? ['#EF4444', '#DC2626'] : ['#E8317A', '#F7941D']}
              style={{
                width: 44, height: 44, borderRadius: 22,
                justifyContent: 'center', alignItems: 'center',
              }}
            >
              <Ionicons name={isRecording ? 'stop' : 'mic'} size={20} color="#fff" />
            </LinearGradient>
          </Animated.View>
        </TouchableOpacity>

        {/* Send button */}
        {input.trim() ? (
          <TouchableOpacity
            onPress={() => sendMessage(input)}
            disabled={loading}
          >
            <LinearGradient
              colors={['#E8317A', '#F7941D']}
              style={{ width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' }}
            >
              <PaperPlaneTilt size={18} color="#fff" weight="duotone" />
            </LinearGradient>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Recording indicator */}
      {isRecording && (
        <View style={{
          position: 'absolute', top: Platform.OS === 'ios' ? 120 : 100, left: 16, right: 16,
          backgroundColor: '#EF4444', borderRadius: 12,
          paddingHorizontal: 16, paddingVertical: 10,
          flexDirection: 'row', alignItems: 'center', gap: 10,
        }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' }} />
          <Text style={{ color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.sm, flex: 1 }}>
            Opname actief — tik op Stop om te verzenden
          </Text>
          <TouchableOpacity onPress={handleMicPress}>
            <Text style={{ color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.sm, textDecorationLine: 'underline' }}>
              Stop
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
