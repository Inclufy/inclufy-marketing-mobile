// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: cat.icon as any> | Ionicons name=<dynamic: item.is_favorite ? 'star' : 'star-outline'>
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { subtleShadow } from '../utils/shadows';
import { useTheme } from '../context/ThemeContext';

import { Lightbulb, Plus, PlusCircle, Star, Trash } from 'phosphor-react-native';
interface FollowedOrganizer {
  id: string;
  organizer_name: string;
  organizer_website: string | null;
  organizer_logo_url: string | null;
  category: string;
  is_favorite: boolean;
  notes: string | null;
  created_at: string;
}

const CATEGORIES = [
  { key: 'tech', label: 'Tech & ICT', icon: 'code-slash', color: '#3B82F6' },
  { key: 'marketing', label: 'Marketing', icon: 'megaphone', color: '#EC4899' },
  { key: 'startup', label: 'Startup', icon: 'rocket', color: '#F59E0B' },
  { key: 'education', label: 'Onderwijs', icon: 'school', color: '#10B981' },
  { key: 'networking', label: 'Networking', icon: 'people', color: '#8B5CF6' },
  { key: 'innovation', label: 'Innovatie', icon: 'bulb', color: '#06B6D4' },
  { key: 'general', label: 'Overig', icon: 'apps', color: '#6B7280' },
];

// Popular organizers as suggestions
const SUGGESTED_ORGANIZERS = [
  // Nederland
  { name: 'ROC', category: 'education', website: 'https://roc.nl', description: 'Regionaal Opleidingen Centrum — digitale vaardigheden en marketing' },
  { name: 'Innovaly', category: 'innovation', website: 'https://innovaly.nl', description: 'Innovatie hub met focus op digitale transformatie' },
  { name: 'KVK (Kamer van Koophandel)', category: 'networking', website: 'https://kvk.nl', description: 'Ondernemersplatform — events, netwerken en bedrijfsinformatie' },
  { name: 'Startup Almere', category: 'startup', website: 'https://startupalmere.nl', description: 'Startup ecosysteem Almere — pitch events en netwerkbijeenkomsten' },
  { name: 'RVO (Rijksdienst voor Ondernemend Nederland)', category: 'innovation', website: 'https://rvo.nl', description: 'Overheidsorganisatie — subsidies, innovatieprogramma\'s, handelsmissies' },
  { name: 'Dutch Digital Agencies', category: 'marketing', website: 'https://dutchdigitalagencies.com', description: 'Branchevereniging voor digitale bureaus in Nederland' },
  { name: 'Amsterdam Economic Board', category: 'networking', website: 'https://amsterdameconomicboard.com', description: 'Innovatieplatform Metropoolregio Amsterdam' },
  { name: 'StartupDelta', category: 'startup', website: 'https://startupdelta.org', description: 'Nederlands startup ecosysteem — verbindt ondernemers' },
  // Internationaal — grote tech & startup events
  { name: 'Web Summit', category: 'tech', website: 'https://websummit.com', description: 'Europa\'s grootste technologie conferentie (Lissabon)' },
  { name: 'GITEX Global', category: 'tech', website: 'https://gitex.com', description: 'Grootste tech event in het Midden-Oosten & Afrika (Dubai)' },
  { name: 'Slush', category: 'startup', website: 'https://slush.org', description: 'Startup event voor founders & investors (Helsinki)' },
  { name: 'Collision', category: 'tech', website: 'https://collisionconf.com', description: 'North America\'s fastest-growing tech conference (Toronto)' },
  { name: 'VivaTech', category: 'tech', website: 'https://vivatechnology.com', description: 'Europese tech conferentie voor innovatie & startups (Parijs)' },
  // Marketing
  { name: 'Emakina', category: 'marketing', website: 'https://emakina.com', description: 'Digital agency met grote marketingconferenties' },
  { name: 'MarTech Alliance', category: 'marketing', website: 'https://martechalliance.com', description: 'Marketing technologie community en events' },
  { name: 'DMEXCO', category: 'marketing', website: 'https://dmexco.com', description: 'Digital Marketing Expo & Conference (Keulen)' },
];

export default function FollowedOrganizersScreen() {
  const navigation = useNavigation();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newWebsite, setNewWebsite] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // ── Fetch followed organizers ────────────────────────────────────────────
  const { data: organizers = [], isLoading, refetch } = useQuery<FollowedOrganizer[]>({
    queryKey: ['followed_organizers'],
    queryFn: async () => {
      const { data: { user } = {} as any } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from('followed_organizers')
        .select('*')
        .eq('user_id', user.id)
        .order('is_favorite', { ascending: false })
        .order('organizer_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as FollowedOrganizer[];
    },
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  const addOrganizer = useMutation({
    mutationFn: async (input: { name: string; website?: string; category: string }) => {
      const { data: { user } = {} as any } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      const { error } = await supabase.from('followed_organizers').insert({
        user_id: user.id,
        organizer_name: input.name,
        organizer_website: input.website || null,
        category: input.category,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['followed_organizers'] });
      setShowAddModal(false);
      setNewName('');
      setNewWebsite('');
      setNewCategory('general');
    },
    onError: (err: any) => {
      if (err?.message?.includes('duplicate')) {
        Alert.alert('Al gevolgd', 'Je volgt deze organisator al.');
      } else {
        Alert.alert('Fout', 'Kon organisator niet toevoegen.');
      }
    },
  });

  const toggleFavorite = useMutation({
    mutationFn: async ({ id, isFav }: { id: string; isFav: boolean }) => {
      await supabase.from('followed_organizers').update({ is_favorite: !isFav }).eq('id', id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['followed_organizers'] }),
  });

  const removeOrganizer = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('followed_organizers').delete().eq('id', id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['followed_organizers'] }),
  });

  const handleRemove = (item: FollowedOrganizer) => {
    Alert.alert(
      'Organisator verwijderen',
      `Wil je "${item.organizer_name}" niet meer volgen?`,
      [
        { text: 'Annuleren', style: 'cancel' },
        { text: 'Verwijderen', style: 'destructive', onPress: () => removeOrganizer.mutate(item.id) },
      ]
    );
  };

  const handleAddSuggested = (s: typeof SUGGESTED_ORGANIZERS[0]) => {
    addOrganizer.mutate({ name: s.name, website: s.website, category: s.category });
  };

  const followedNames = organizers.map(o => o.organizer_name.toLowerCase());
  const availableSuggestions = SUGGESTED_ORGANIZERS.filter(
    s => !followedNames.includes(s.name.toLowerCase())
  );

  // ── Render ───────────────────────────────────────────────────────────────
  const renderOrganizer = ({ item }: { item: FollowedOrganizer }) => {
    const cat = CATEGORIES.find(c => c.key === item.category) ?? CATEGORIES[CATEGORIES.length - 1];
    return (
      <View style={{
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginBottom: spacing.sm,
        ...subtleShadow,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{
            width: 42, height: 42, borderRadius: 12,
            backgroundColor: cat.color + '18',
            justifyContent: 'center', alignItems: 'center',
          }}>
            <Ionicons name={cat.icon as any} size={22} color={cat.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>
              {item.organizer_name}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <View style={{ backgroundColor: cat.color + '15', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, color: cat.color, fontWeight: fontWeight.semibold }}>{cat.label}</Text>
              </View>
              {item.organizer_website && (
                <Text style={{ fontSize: 10, color: colors.textTertiary }}>{item.organizer_website}</Text>
              )}
            </View>
          </View>
          <TouchableOpacity onPress={() => toggleFavorite.mutate({ id: item.id, isFav: item.is_favorite })}>
            <Ionicons
              name={item.is_favorite ? 'star' : 'star-outline'}
              size={22}
              color={item.is_favorite ? '#F59E0B' : colors.textTertiary}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleRemove(item)} style={{ marginLeft: 4 }}>
            <Trash size={18} color={colors.textTertiary} weight="duotone" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        paddingTop: spacing.md,
        paddingBottom: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        gap: spacing.xs,
      }}>
        <Text style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text }}>
          Gevolgde Organisatoren
        </Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
          Volg organisatoren om automatisch hun events te ontdekken
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
          <TouchableOpacity
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: colors.primary, borderRadius: borderRadius.full,
              paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
            }}
            onPress={() => setShowAddModal(true)}
          >
            <Plus size={18} color="#fff" weight="bold" />
            <Text style={{ color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.sm }}>
              Toevoegen
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              borderWidth: 1.5, borderColor: colors.primary + '60',
              borderRadius: borderRadius.full,
              paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
            }}
            onPress={() => setShowSuggestions(!showSuggestions)}
          >
            <Lightbulb size={16} color={colors.primary} weight="duotone" />
            <Text style={{ color: colors.primary, fontWeight: fontWeight.semibold, fontSize: fontSize.sm }}>
              Suggesties
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Suggestions panel */}
      {showSuggestions && availableSuggestions.length > 0 && (
        <View style={{ backgroundColor: colors.primary + '08', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm }}>
            Populaire organisatoren
          </Text>
          {availableSuggestions.map(s => {
            const cat = CATEGORIES.find(c => c.key === s.category) ?? CATEGORIES[CATEGORIES.length - 1];
            return (
              <TouchableOpacity
                key={s.name}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                  backgroundColor: colors.surface, borderRadius: borderRadius.md,
                  padding: spacing.sm, marginBottom: spacing.xs,
                }}
                onPress={() => handleAddSuggested(s)}
              >
                <View style={{
                  width: 36, height: 36, borderRadius: 10,
                  backgroundColor: cat.color + '18',
                  justifyContent: 'center', alignItems: 'center',
                }}>
                  <Ionicons name={cat.icon as any} size={18} color={cat.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>{s.name}</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }} numberOfLines={1}>{s.description}</Text>
                </View>
                <PlusCircle size={22} color={colors.primary} weight="regular" />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* List */}
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : organizers.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.sm, padding: spacing.xl }}>
          <Star size={52} color={colors.textTertiary} weight="duotone" />
          <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>
            Nog geen organisatoren
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' }}>
            Volg organisatoren zoals ROC, Innovaly of RVO om hun events automatisch te ontdekken
          </Text>
          <TouchableOpacity
            style={{
              backgroundColor: colors.primary, borderRadius: borderRadius.full,
              paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginTop: spacing.sm,
            }}
            onPress={() => setShowSuggestions(true)}
          >
            <Text style={{ color: '#fff', fontWeight: fontWeight.bold }}>Bekijk suggesties</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={organizers}
          keyExtractor={item => item.id}
          renderItem={renderOrganizer}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}
        />
      )}

      {/* Add Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={{
          flex: 1, justifyContent: 'flex-end',
          backgroundColor: 'rgba(0,0,0,0.4)',
        }}>
          <View style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: spacing.lg,
            paddingBottom: Platform.OS === 'ios' ? 40 : spacing.lg,
          }}>
            <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.md }}>
              Organisator toevoegen
            </Text>

            <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginBottom: 4 }}>Naam *</Text>
            <TextInput
              style={{
                borderWidth: 1.5, borderColor: colors.border, borderRadius: borderRadius.md,
                padding: spacing.sm, fontSize: fontSize.sm, color: colors.text,
                marginBottom: spacing.sm,
              }}
              value={newName}
              onChangeText={setNewName}
              placeholder="bijv. RVO"
              placeholderTextColor={colors.textTertiary}
            />

            <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginBottom: 4 }}>Website</Text>
            <TextInput
              style={{
                borderWidth: 1.5, borderColor: colors.border, borderRadius: borderRadius.md,
                padding: spacing.sm, fontSize: fontSize.sm, color: colors.text,
                marginBottom: spacing.sm,
              }}
              value={newWebsite}
              onChangeText={setNewWebsite}
              placeholder="https://..."
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              keyboardType="url"
            />

            <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginBottom: 4 }}>Categorie</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.key}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
                      backgroundColor: newCategory === cat.key ? cat.color : colors.background,
                      borderWidth: 1.5, borderColor: newCategory === cat.key ? cat.color : colors.border,
                    }}
                    onPress={() => setNewCategory(cat.key)}
                  >
                    <Text style={{
                      fontSize: 12, fontWeight: fontWeight.semibold,
                      color: newCategory === cat.key ? '#fff' : colors.textSecondary,
                    }}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TouchableOpacity
                style={{
                  flex: 1, alignItems: 'center', paddingVertical: spacing.sm,
                  borderRadius: borderRadius.lg, borderWidth: 1.5, borderColor: colors.border,
                }}
                onPress={() => { setShowAddModal(false); setNewName(''); setNewWebsite(''); }}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: fontWeight.semibold }}>Annuleren</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1, alignItems: 'center', paddingVertical: spacing.sm,
                  borderRadius: borderRadius.lg, backgroundColor: colors.primary,
                  opacity: !newName.trim() ? 0.5 : 1,
                }}
                onPress={() => {
                  if (!newName.trim()) return;
                  addOrganizer.mutate({ name: newName.trim(), website: newWebsite.trim(), category: newCategory });
                }}
                disabled={!newName.trim() || addOrganizer.isPending}
              >
                {addOrganizer.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: fontWeight.bold }}>Toevoegen</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
