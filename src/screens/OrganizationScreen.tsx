// TODO: migrate to Phosphor — unmapped icons: MaterialCommunityIcons name=<dynamic: editMode ? 'close' : 'pencil'> | MaterialCommunityIcons name=<dynamic: icon as any> | MaterialCommunityIcons name=<dynamic: sp.icon>
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Linking,
  KeyboardAvoidingView,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { subtleShadow } from '../utils/shadows';
import { useOrganization, useUpdateOrganization, OrganizationProfile } from '../hooks/useOrganization';
import * as Clipboard from 'expo-clipboard';

import { ArrowLeft, ArrowSquareOut, Buildings, Calendar, Copy, File, FloppyDisk, Lightning, MapPin, SealCheck, ShareNetwork, UsersThree, X, XCircle } from 'phosphor-react-native';
// ─── Social Platform Config ─────────────────────────────────────────
const SOCIAL_PLATFORMS = [
  { key: 'linkedin', label: 'LinkedIn', icon: 'linkedin' as const, color: '#0A66C2', placeholder: 'https://linkedin.com/company/jouwbedrijf' },
  { key: 'instagram', label: 'Instagram', icon: 'instagram' as const, color: '#E1306C', placeholder: '@jouwbedrijf' },
  { key: 'facebook', label: 'Facebook', icon: 'facebook' as const, color: '#1877F2', placeholder: 'https://facebook.com/jouwbedrijf' },
  { key: 'x', label: 'X', icon: 'twitter' as const, color: '#1DA1F2', placeholder: '@jouwbedrijf' },
  { key: 'tiktok', label: 'TikTok', icon: 'music-note' as const, color: '#000000', placeholder: '@jouwbedrijf' },
];

type Nav = NativeStackNavigationProp<RootStackParamList>;

function openSocialUrl(key: string, value: string) {
  let url = value;
  if (key === 'instagram') url = `https://instagram.com/${value.replace('@', '')}`;
  else if (key === 'x') url = `https://x.com/${value.replace('@', '')}`;
  else if (key === 'tiktok') url = `https://tiktok.com/@${value.replace('@', '')}`;
  else if (!value.startsWith('http')) url = `https://${value}`;
  Linking.openURL(url).catch(() => {});
}

export default function OrganizationScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();

  const { data: org, isLoading, refetch, isRefetching } = useOrganization();
  const updateOrg = useUpdateOrganization();

  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Partial<OrganizationProfile>>({});
  const [originalForm, setOriginalForm] = useState<Partial<OrganizationProfile>>({});

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingHorizontal: spacing.md,
      paddingTop: Platform.OS === 'ios' ? 60 : 40,
      paddingBottom: spacing.md,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerLeft: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
    headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: c.text },
    editBtn: {
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
      paddingHorizontal: spacing.sm, paddingVertical: 6,
      borderRadius: borderRadius.full, borderWidth: 1,
    },
    sectionCard: {
      backgroundColor: c.surface, borderRadius: borderRadius.lg,
      padding: spacing.md, marginBottom: spacing.md, ...subtleShadow,
    },
    sectionHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: spacing.sm },
    sectionTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: c.text },
    fieldLabel: { fontSize: 11, color: c.textSecondary, marginBottom: 4, fontWeight: fontWeight.medium },
    fieldValue: { fontSize: fontSize.sm, color: c.text },
    input: {
      backgroundColor: c.surface, borderRadius: borderRadius.md,
      borderWidth: 1, borderColor: c.border,
      paddingHorizontal: spacing.sm, paddingVertical: 8,
      fontSize: fontSize.sm, color: c.text,
    },
    viewRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: spacing.sm },
    copyBtn: {
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4,
      paddingHorizontal: spacing.sm, paddingVertical: 4,
      backgroundColor: c.primary + '18', borderRadius: borderRadius.full,
    },
    saveBtn: {
      backgroundColor: c.primary, borderRadius: borderRadius.full,
      paddingVertical: spacing.sm + 4, alignItems: 'center' as const,
      flexDirection: 'row' as const, justifyContent: 'center' as const, gap: 8,
    },
    cancelBtn: {
      backgroundColor: c.surface, borderRadius: borderRadius.full,
      paddingVertical: spacing.sm + 4, alignItems: 'center' as const,
      borderWidth: 1, borderColor: c.border,
      flexDirection: 'row' as const, justifyContent: 'center' as const, gap: 8,
    },
    certBadge: {
      backgroundColor: c.primary + '18', borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm, paddingVertical: 6,
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
    },
    statBox: {
      backgroundColor: c.primary + '12', borderRadius: borderRadius.md,
      paddingHorizontal: spacing.sm, paddingVertical: 8, alignItems: 'center' as const, minWidth: 90,
    },
  }));

  useEffect(() => {
    if (org) {
      const snapshot: Partial<OrganizationProfile> = {
        company_name: org.company_name ?? '', tagline: org.tagline ?? '',
        description: org.description ?? '', elevator_pitch: org.elevator_pitch ?? '',
        industry: org.industry ?? '', location: org.location ?? '',
        email: org.email ?? '', phone: org.phone ?? '',
        website: org.website ?? '', founded_year: org.founded_year ?? '',
        team_size: org.team_size ?? '', boilerplate: org.boilerplate ?? '',
        social_links: org.social_links ?? {}, certifications: org.certifications ?? [],
        logo_url: org.logo_url ?? null,
      };
      setForm(snapshot);
      setOriginalForm(snapshot);
    }
  }, [org]);

  const updateField = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const updateSocialLink = (platform: string, value: string) => {
    setForm(prev => ({ ...prev, social_links: { ...(prev.social_links ?? {}), [platform]: value } }));
  };

  const updateCertifications = (text: string) => {
    setForm(prev => ({ ...prev, certifications: text.split(',').map(s => s.trim()).filter(Boolean) }));
  };

  const handleSave = async () => {
    try {
      await updateOrg.mutateAsync(form);
      setEditMode(false);
      setOriginalForm(form);
      Alert.alert('Opgeslagen', 'Organisatie profiel is bijgewerkt.');
    } catch (e: any) {
      Alert.alert('Fout', e?.message ?? 'Opslaan mislukt.');
    }
  };

  const handleCancel = () => { setForm(originalForm); setEditMode(false); };

  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Gekopieerd!');
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const socialLinks = form.social_links ?? {};
  const certifications = form.certifications ?? [];

  const renderSectionTitle = (title: string, icon: string) => (
    <View style={styles.sectionHeader}>
      <MaterialCommunityIcons name={icon as any} size={18} color={colors.primary} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );

  const renderViewField = (icon: string, label: string, value: string | undefined, onPress?: () => void) => {
    if (!value) return null;
    return (
      <TouchableOpacity disabled={!onPress} onPress={onPress} style={styles.viewRow}>
        <MaterialCommunityIcons name={icon as any} size={18} color={colors.textSecondary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>{label}</Text>
          <Text style={[styles.fieldValue, onPress && { color: colors.primary }]}>{value}</Text>
        </View>
        {onPress && <ArrowSquareOut size={14} color={colors.textTertiary} weight="duotone" />}
      </TouchableOpacity>
    );
  };

  const renderEditField = (label: string, key: string, placeholder: string, opts?: { multiline?: boolean; keyboard?: any }) => (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, opts?.multiline && { minHeight: 80, textAlignVertical: 'top' as const }]}
        value={(form as any)[key] ?? ''}
        onChangeText={v => updateField(key, v)}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={opts?.keyboard ?? 'default'}
        autoCapitalize="none"
        multiline={opts?.multiline}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <ArrowLeft size={24} color={colors.text} weight="bold" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Organisatie</Text>
        </View>
        <TouchableOpacity
          style={[styles.editBtn, {
            backgroundColor: editMode ? colors.primary + '18' : colors.surface,
            borderColor: editMode ? colors.primary : colors.border,
          }]}
          onPress={() => editMode ? handleCancel() : setEditMode(true)}
        >
          <MaterialCommunityIcons name={editMode ? 'close' : 'pencil'} size={16} color={editMode ? colors.primary : colors.text} />
          <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: editMode ? colors.primary : colors.text }}>
            {editMode ? 'Annuleer' : 'Bewerken'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
      >
        {/* ── Section 1: Bedrijfsinformatie ──────────────────────── */}
        <View style={styles.sectionCard}>
          {renderSectionTitle('Bedrijfsinformatie', 'office-building')}
          {editMode ? (
            <>
              {renderEditField('Bedrijfsnaam', 'company_name', 'Jouw bedrijfsnaam')}
              {renderEditField('Tagline', 'tagline', 'Korte slogan')}
              {renderEditField('Beschrijving', 'description', 'Beschrijf je organisatie...', { multiline: true })}
              {renderEditField('Branche', 'industry', 'Bijv. SaaS, Marketing, Logistiek')}
              {renderEditField('Opgericht', 'founded_year', '2020', { keyboard: 'numeric' })}
              {renderEditField('Teamgrootte', 'team_size', '10-50')}
              {renderEditField('Locatie', 'location', 'Amsterdam, Nederland')}
            </>
          ) : (
            <>
              <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
                <View style={{
                  width: 72, height: 72, borderRadius: borderRadius.lg,
                  backgroundColor: colors.primary + '18',
                  justifyContent: 'center', alignItems: 'center', marginBottom: spacing.sm,
                }}>
                  <Buildings size={32} color={colors.primary} weight="duotone" />
                </View>
                <Text style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: 4, textAlign: 'center' }}>
                  {form.company_name || 'Bedrijfsnaam'}
                </Text>
                {form.tagline ? <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', marginBottom: 6 }}>{form.tagline}</Text> : null}
                {form.industry ? (
                  <View style={{ backgroundColor: colors.primary + '18', borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
                    <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary }}>{form.industry}</Text>
                  </View>
                ) : null}
              </View>
              {form.description ? <Text style={{ fontSize: fontSize.sm, color: colors.text, lineHeight: 22, marginTop: spacing.sm }}>{form.description}</Text> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
                {form.founded_year ? (
                  <View style={styles.statBox}>
                    <Calendar size={18} color={colors.primary} style={{ marginBottom: 4 }} weight="duotone" />
                    <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>Opgericht</Text>
                    <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text }}>{form.founded_year}</Text>
                  </View>
                ) : null}
                {form.team_size ? (
                  <View style={styles.statBox}>
                    <UsersThree size={18} color={colors.primary} style={{ marginBottom: 4 }} weight="duotone" />
                    <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>Team</Text>
                    <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text }}>{form.team_size}</Text>
                  </View>
                ) : null}
                {form.location ? (
                  <View style={styles.statBox}>
                    <MapPin size={18} color={colors.primary} style={{ marginBottom: 4 }} weight="fill" />
                    <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>Locatie</Text>
                    <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text }}>{form.location}</Text>
                  </View>
                ) : null}
              </View>
            </>
          )}
        </View>

        {/* ── Section 2: Contact ─────────────────────────────────── */}
        <View style={styles.sectionCard}>
          {renderSectionTitle('Contact', 'card-account-details-outline')}
          {editMode ? (
            <>
              {renderEditField('E-mail', 'email', 'info@bedrijf.nl', { keyboard: 'email-address' })}
              {renderEditField('Telefoon', 'phone', '+31 20 1234567', { keyboard: 'phone-pad' })}
              {renderEditField('Website', 'website', 'https://www.bedrijf.nl', { keyboard: 'url' })}
            </>
          ) : (
            <>
              {renderViewField('email-outline', 'E-mail', form.email, form.email ? () => Linking.openURL(`mailto:${form.email}`) : undefined)}
              {renderViewField('phone-outline', 'Telefoon', form.phone, form.phone ? () => Linking.openURL(`tel:${form.phone}`) : undefined)}
              {renderViewField('web', 'Website', form.website, form.website ? () => Linking.openURL(form.website!.startsWith('http') ? form.website! : `https://${form.website}`) : undefined)}
            </>
          )}
        </View>

        {/* ── Section 3: Social Media ────────────────────────────── */}
        <View style={styles.sectionCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ShareNetwork size={18} color={colors.primary} weight="duotone" />
              <Text style={styles.sectionTitle}>Social Media</Text>
            </View>
            {!editMode && (
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                {SOCIAL_PLATFORMS.filter(sp => socialLinks[sp.key]).length} verbonden
              </Text>
            )}
          </View>
          {editMode ? (
            SOCIAL_PLATFORMS.map(sp => (
              <View key={sp.key} style={{ marginBottom: spacing.sm }}>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: colors.background, borderRadius: borderRadius.md,
                  borderWidth: 1, borderColor: socialLinks[sp.key] ? sp.color + '40' : colors.border,
                  paddingHorizontal: spacing.sm, paddingVertical: 10,
                }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: sp.color + '15', justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name={sp.icon} size={18} color={sp.color} />
                  </View>
                  <TextInput
                    style={{ flex: 1, fontSize: fontSize.sm, color: colors.text }}
                    value={socialLinks[sp.key] ?? ''}
                    onChangeText={v => updateSocialLink(sp.key, v)}
                    placeholder={sp.placeholder}
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                  {socialLinks[sp.key] ? (
                    <TouchableOpacity onPress={() => updateSocialLink(sp.key, '')}>
                      <XCircle size={18} color={colors.textTertiary} weight="fill" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ))
          ) : (
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              {SOCIAL_PLATFORMS.map(sp => {
                const val = socialLinks[sp.key];
                if (!val) return null;
                return (
                  <TouchableOpacity
                    key={sp.key}
                    style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: sp.color + '18', justifyContent: 'center', alignItems: 'center' }}
                    onPress={() => openSocialUrl(sp.key, val)}
                  >
                    <MaterialCommunityIcons name={sp.icon} size={22} color={sp.color} />
                  </TouchableOpacity>
                );
              })}
              {SOCIAL_PLATFORMS.every(sp => !socialLinks[sp.key]) && (
                <Text style={{ fontSize: fontSize.sm, color: colors.textTertiary, fontStyle: 'italic' }}>Geen social media ingesteld</Text>
              )}
            </View>
          )}
        </View>

        {/* ── Section 4: Elevator Pitch ──────────────────────────── */}
        {(editMode || form.elevator_pitch) ? (
          <View style={styles.sectionCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Lightning size={18} color={colors.primary} weight="fill" />
                <Text style={styles.sectionTitle}>Elevator Pitch</Text>
              </View>
              {!editMode && form.elevator_pitch ? (
                <TouchableOpacity style={styles.copyBtn} onPress={() => copyToClipboard(form.elevator_pitch ?? '')}>
                  <Copy size={14} color={colors.primary} weight="duotone" />
                  <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary }}>Kopieer</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {editMode ? (
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                value={form.elevator_pitch ?? ''}
                onChangeText={v => updateField('elevator_pitch', v)}
                placeholder="Korte pitch over je bedrijf..."
                placeholderTextColor={colors.textTertiary}
                multiline
              />
            ) : (
              <Text style={{ fontSize: fontSize.sm, color: colors.text, lineHeight: 22, fontStyle: 'italic' }}>{form.elevator_pitch}</Text>
            )}
          </View>
        ) : null}

        {/* ── Section 5: Boilerplate ─────────────────────────────── */}
        {(editMode || form.boilerplate) ? (
          <View style={styles.sectionCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <File size={18} color={colors.primary} weight="duotone" />
                <Text style={styles.sectionTitle}>Boilerplate</Text>
              </View>
              {!editMode && form.boilerplate ? (
                <TouchableOpacity style={styles.copyBtn} onPress={() => copyToClipboard(form.boilerplate ?? '')}>
                  <Copy size={14} color={colors.primary} weight="duotone" />
                  <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary }}>Kopieer boilerplate</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {editMode ? (
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                value={form.boilerplate ?? ''}
                onChangeText={v => updateField('boilerplate', v)}
                placeholder="Standaard bedrijfsbeschrijving voor persberichten..."
                placeholderTextColor={colors.textTertiary}
                multiline
              />
            ) : (
              <Text style={{ fontSize: fontSize.sm, color: colors.text, lineHeight: 22 }}>{form.boilerplate}</Text>
            )}
          </View>
        ) : null}

        {/* ── Section 6: Certificeringen ─────────────────────────── */}
        {(editMode || certifications.length > 0) ? (
          <View style={styles.sectionCard}>
            {renderSectionTitle('Certificeringen', 'certificate')}
            {editMode ? (
              <View>
                <TextInput
                  style={styles.input}
                  value={certifications.join(', ')}
                  onChangeText={updateCertifications}
                  placeholder="ISO 9001, B Corp, MVO (komma-gescheiden)"
                  placeholderTextColor={colors.textTertiary}
                />
                <Text style={{ fontSize: 10, color: colors.textSecondary, fontStyle: 'italic', marginTop: 4 }}>
                  Scheid certificeringen met een komma
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {certifications.map((cert, i) => (
                  <View key={i} style={styles.certBadge}>
                    <SealCheck size={14} color={colors.primary} weight="fill" />
                    <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary }}>{cert}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {/* ── Save / Cancel Buttons ──────────────────────────────── */}
        {editMode && (
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={updateOrg.isPending}>
              {updateOrg.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <FloppyDisk size={18} color="#fff" weight="duotone" />
              )}
              <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: '#fff' }}>
                {updateOrg.isPending ? 'Opslaan...' : 'Opslaan'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
              <X size={18} color={colors.text} weight="bold" />
              <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>Annuleren</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
