// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: showToken ? 'eye-off' : 'eye'>
/**
 * WhatsAppSettingsScreen
 *
 * CRUD surface for WhatsApp Business Cloud API configuration:
 *   - WABA connection status
 *   - Approved templates (read-only — approved in Meta dashboard)
 *   - Recipients management (add / opt-out)
 *   - Recent sends audit trail
 *
 * TODO (future sprints):
 *   - Allow editing WABA credentials in-app (currently set via Supabase dashboard)
 *   - Bulk CSV import for recipients
 *   - Template sync: pull templates directly from Meta Graph API
 *   - Per-template variable preview / test send
 *   - Aggregate cost reporting chart
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
  SectionList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { DownloadSimple, FileText, UserMinus, WhatsappLogo } from 'phosphor-react-native';
import {
  useWhatsAppConfig,
  useWhatsAppTemplates,
  useWhatsAppRecipients,
  useWhatsAppSends,
  useAddWhatsAppRecipient,
  useOptOutRecipient,
  useUpsertWhatsAppConfig,
  useDisconnectWhatsAppConfig,
  useSyncWhatsAppTemplates,
  useBulkAddWhatsAppRecipients,
} from '../hooks/useWhatsApp';

// ─── Section header ──────────────────────────────────────────────────
function SectionHeader({ title, colors }: { title: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title.toUpperCase()}</Text>
    </View>
  );
}

// ─── Status badge ────────────────────────────────────────────────────
// ─── WABA Config Section: in-app setup + edit form ──────────────────
function WABAConfigSection({
  config,
  colors,
}: {
  config: import('../hooks/useWhatsApp').WhatsAppConfig | null;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const [editing, setEditing]               = useState(!config);
  const [wabaId, setWabaId]                 = useState(config?.waba_id ?? '');
  const [phoneNumberId, setPhoneNumberId]   = useState(config?.phone_number_id ?? '');
  const [displayPhone, setDisplayPhone]     = useState(config?.display_phone_number ?? '');
  const [businessName, setBusinessName]     = useState(config?.business_name ?? '');
  const [accessToken, setAccessToken]       = useState('');
  const [showToken, setShowToken]           = useState(false);

  const { mutate: upsert,     isPending: saving }       = useUpsertWhatsAppConfig();
  const { mutate: disconnect, isPending: disconnecting } = useDisconnectWhatsAppConfig();

  function handleSave() {
    if (!wabaId.trim() || !phoneNumberId.trim() || (!config && !accessToken.trim())) {
      Alert.alert('Velden ontbreken', 'WABA ID, Phone Number ID en Access Token (bij eerste setup) zijn verplicht.');
      return;
    }
    upsert(
      {
        id: config?.id,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        display_phone_number: displayPhone || null,
        business_name: businessName || null,
        // Keep existing token if user didn't re-enter
        access_token: accessToken.trim() || (config ? '__KEEP__' : ''),
      },
      {
        onSuccess: () => {
          setAccessToken('');
          setEditing(false);
          Alert.alert('Opgeslagen', config ? 'WABA-config bijgewerkt.' : 'WhatsApp Business Account gekoppeld.');
        },
        onError: (err) => Alert.alert('Fout', err.message),
      },
    );
  }

  function handleDisconnect() {
    if (!config) return;
    Alert.alert(
      'Loskoppelen?',
      'WhatsApp Business wordt uitgeschakeld. Je templates en ontvangers blijven bewaard.',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Loskoppelen',
          style: 'destructive',
          onPress: () => disconnect(config.id, {
            onError: (err) => Alert.alert('Fout', err.message),
          }),
        },
      ],
    );
  }

  // Read-only view (config exists, not editing)
  if (config && !editing) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.row}>
          <WhatsappLogo size={24} color="#25D366" weight="fill" />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {config.business_name ?? 'WhatsApp Business'}
            </Text>
            <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
              {config.display_phone_number ?? config.phone_number_id}
            </Text>
          </View>
          <StatusBadge status={config.status} />
        </View>
        <Text style={[styles.caption, { color: colors.textTertiary, marginTop: spacing.sm }]}>
          WABA ID: {config.waba_id}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <TouchableOpacity
            onPress={() => setEditing(true)}
            style={[styles.button, { backgroundColor: colors.primary, flex: 1 }]}
          >
            <Text style={styles.buttonText}>Bewerken</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDisconnect}
            disabled={disconnecting}
            style={[styles.button, { backgroundColor: '#EF4444', opacity: disconnecting ? 0.6 : 1, flex: 1 }]}
          >
            {disconnecting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Loskoppelen</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Form (no config OR editing)
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.row}>
        <WhatsappLogo size={28} color="#25D366" weight="fill" />
        <Text style={[styles.cardTitle, { color: colors.text, marginLeft: spacing.sm, flex: 1 }]}>
          {config ? 'WABA bewerken' : 'WABA koppelen'}
        </Text>
      </View>

      <Text style={[styles.caption, { color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.md }]}>
        Deze gegevens vind je in Meta Business Manager → WhatsApp Manager → API Setup.
      </Text>

      <Text style={[styles.fieldLabel, { color: colors.text }]}>WABA ID *</Text>
      <TextInput
        value={wabaId}
        onChangeText={setWabaId}
        placeholder="123456789012345"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        keyboardType="numeric"
        style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
      />

      <Text style={[styles.fieldLabel, { color: colors.text, marginTop: spacing.md }]}>Phone Number ID *</Text>
      <TextInput
        value={phoneNumberId}
        onChangeText={setPhoneNumberId}
        placeholder="987654321098765"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        keyboardType="numeric"
        style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
      />

      <Text style={[styles.fieldLabel, { color: colors.text, marginTop: spacing.md }]}>Display Phone Number</Text>
      <TextInput
        value={displayPhone}
        onChangeText={setDisplayPhone}
        placeholder="+31 6 12345678"
        placeholderTextColor={colors.textTertiary}
        keyboardType="phone-pad"
        style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
      />

      <Text style={[styles.fieldLabel, { color: colors.text, marginTop: spacing.md }]}>Business Name</Text>
      <TextInput
        value={businessName}
        onChangeText={setBusinessName}
        placeholder="Inclufy B.V."
        placeholderTextColor={colors.textTertiary}
        style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
      />

      <Text style={[styles.fieldLabel, { color: colors.text, marginTop: spacing.md }]}>
        Permanent Access Token {config ? '(laat leeg om huidige te behouden)' : '*'}
      </Text>
      <View style={{ position: 'relative' }}>
        <TextInput
          value={accessToken}
          onChangeText={setAccessToken}
          placeholder="EAAxxxxx... (System User token)"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={!showToken}
          style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, paddingRight: 44 }]}
        />
        <TouchableOpacity
          onPress={() => setShowToken((s) => !s)}
          style={{ position: 'absolute', right: spacing.sm, top: 0, bottom: 0, justifyContent: 'center' }}
        >
          <Ionicons name={showToken ? 'eye-off' : 'eye'} size={20} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>
      <Text style={[styles.caption, { color: colors.textTertiary, marginTop: 4 }]}>
        Tip: gebruik een System User token (geen verlooptijd) ipv user token.
      </Text>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
        {config && (
          <TouchableOpacity
            onPress={() => { setEditing(false); setAccessToken(''); }}
            style={[styles.button, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, flex: 1 }]}
          >
            <Text style={[styles.buttonText, { color: colors.text }]}>Annuleren</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[styles.button, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1, flex: 1 }]}
        >
          {saving ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.buttonText}>{config ? 'Opslaan' : 'Koppelen'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Templates sync bar (Meta Graph API → DB) ───────────────────────
function TemplatesSyncBar({
  config,
  colors,
}: {
  config: import('../hooks/useWhatsApp').WhatsAppConfig | null;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const { mutate: syncTemplates, isPending: syncing } = useSyncWhatsAppTemplates();

  if (!config) return null;

  function handleSync() {
    syncTemplates(undefined, {
      onSuccess: (r) => {
        Alert.alert(
          'Sync voltooid',
          `${r.synced} templates opgehaald uit Meta.\n` +
          `Nieuw: ${r.created} · Bijgewerkt: ${r.updated} · Overgeslagen: ${r.skipped}` +
          (r.errors.length > 0 ? `\nFouten: ${r.errors.length}` : ''),
        );
      },
      onError: (err) => Alert.alert('Sync mislukt', err.message),
    });
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: spacing.sm }]}>
      <TouchableOpacity
        onPress={handleSync}
        disabled={syncing}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          paddingVertical: spacing.sm,
          opacity: syncing ? 0.6 : 1,
        }}
      >
        {syncing ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <DownloadSimple size={18} color={colors.primary} weight="duotone" />
            <Text style={{ color: colors.primary, fontWeight: fontWeight.semibold as '600', marginLeft: spacing.xs }}>
              Sync templates vanuit Meta
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── CSV import button for bulk recipients ──────────────────────────
function CSVImportButton({
  colors,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const { mutate: bulkAdd, isPending: importing } = useBulkAddWhatsAppRecipients();

  async function handlePickAndImport() {
    // Lazy import expo-document-picker (native module — not in Expo Go)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let DocumentPicker: any = null;
    try { DocumentPicker = require('expo-document-picker'); } catch { /* ignore */ }
    if (!DocumentPicker) {
      Alert.alert('Niet beschikbaar', 'expo-document-picker is niet geïnstalleerd in deze build.');
      return;
    }

    const res = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset) return;

    // Parse CSV
    let text: string;
    try {
      const r = await fetch(asset.uri);
      text = await r.text();
    } catch (e) {
      Alert.alert('Lezen mislukt', (e as Error).message);
      return;
    }

    const recipients = parseCSV(text);
    if (recipients.length === 0) {
      Alert.alert('Geen rijen', 'CSV bevat geen herkenbare ontvangers (kolom "phone" of "phone_e164" verplicht).');
      return;
    }

    Alert.alert(
      'Importeren',
      `${recipients.length} ontvangers gevonden. Importeren?`,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Importeer',
          onPress: () => bulkAdd(
            { recipients, source: 'csv_import' },
            {
              onSuccess: (r) => Alert.alert(
                'Klaar',
                `Toegevoegd: ${r.inserted}\nDuplicaten: ${r.duplicates}\nOngeldig: ${r.invalid}` +
                (r.errors.length > 0 ? `\nFouten: ${r.errors.length}` : ''),
              ),
              onError: (err) => Alert.alert('Fout', err.message),
            },
          ),
        },
      ],
    );
  }

  return (
    <TouchableOpacity
      onPress={handlePickAndImport}
      disabled={importing}
      style={[styles.button, {
        backgroundColor: colors.background,
        borderWidth: 1, borderColor: colors.border,
        opacity: importing ? 0.6 : 1, flex: 1,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      }]}
    >
      {importing ? <ActivityIndicator color={colors.primary} /> : (
        <>
          <FileText size={16} color={colors.text} weight="duotone" />
          <Text style={[styles.buttonText, { color: colors.text, marginLeft: 6 }]}>CSV import</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

/**
 * Lightweight CSV parser. Expects header row with at minimum a "phone" or "phone_e164" column.
 * Optional columns: name, display_name, tags (comma-separated within quotes).
 */
function parseCSV(text: string): Array<{ phone_e164: string; display_name?: string; tags?: string[] }> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const splitRow = (row: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '"' && row[i + 1] === '"') { cur += '"'; i++; continue; }
      if (c === '"') { inQuote = !inQuote; continue; }
      if (c === ',' && !inQuote) { out.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    out.push(cur.trim());
    return out;
  };

  const headers = splitRow(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  const phoneIdx = headers.findIndex((h) => h === 'phone' || h === 'phone_e164' || h === 'phonenumber' || h === 'telefoon');
  if (phoneIdx === -1) return [];

  const nameIdx = headers.findIndex((h) => h === 'name' || h === 'display_name' || h === 'naam');
  const tagsIdx = headers.findIndex((h) => h === 'tags');

  const out: Array<{ phone_e164: string; display_name?: string; tags?: string[] }> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    const phone = cols[phoneIdx]?.trim();
    if (!phone) continue;
    out.push({
      phone_e164: phone,
      display_name: nameIdx >= 0 ? cols[nameIdx]?.trim() || undefined : undefined,
      tags: tagsIdx >= 0 && cols[tagsIdx] ? cols[tagsIdx].split(/[;|]/).map((t) => t.trim()).filter(Boolean) : undefined,
    });
  }
  return out;
}

function StatusBadge({ status }: { status: string }) {
  const color = status === 'active' || status === 'approved'
    ? '#10B981'
    : status === 'pending'
    ? '#F59E0B'
    : '#EF4444';
  return (
    <View style={[styles.badge, { backgroundColor: color + '20', borderColor: color + '40' }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }]}>{status}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Main Screen
// ═══════════════════════════════════════════════════════════════════
export default function WhatsAppSettingsScreen() {
  const { colors } = useTheme();

  const { data: config,     isLoading: configLoading }     = useWhatsAppConfig();
  const { data: templates,  isLoading: templatesLoading }  = useWhatsAppTemplates();
  const { data: recipients, isLoading: recipientsLoading } = useWhatsAppRecipients();
  const { data: sends,      isLoading: sendsLoading }      = useWhatsAppSends(50);

  const { mutate: addRecipient,  isPending: addingRecipient }  = useAddWhatsAppRecipient();
  const { mutate: optOut,        isPending: optingOut }         = useOptOutRecipient();

  const [newPhone, setNewPhone]   = useState('');
  const [newName,  setNewName]    = useState('');

  const isLoading = configLoading || templatesLoading || recipientsLoading || sendsLoading;

  // ─── Add recipient ─────────────────────────────────────────────
  function handleAddRecipient() {
    const phone = newPhone.trim();
    if (!phone.startsWith('+') || phone.length < 8) {
      Alert.alert('Ongeldig nummer', 'Voer een geldig E.164 nummer in, bijv. +31612345678');
      return;
    }
    addRecipient(
      { phoneE164: phone, displayName: newName.trim() || undefined, source: 'manual' },
      {
        onSuccess: () => { setNewPhone(''); setNewName(''); },
        onError: (err) => Alert.alert('Fout', err.message),
      },
    );
  }

  // ─── Opt-out recipient ─────────────────────────────────────────
  function handleOptOut(recipientId: string, phone: string) {
    Alert.alert(
      'Afmelden?',
      `${phone} wordt afgemeld en ontvangt geen berichten meer.`,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Afmelden',
          style: 'destructive',
          onPress: () => optOut(recipientId, {
            onError: (err) => Alert.alert('Fout', err.message),
          }),
        },
      ],
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 48 }}
    >

      {/* ── WABA Status / Config form ── */}
      <SectionHeader title="WhatsApp Business Account" colors={colors} />
      <WABAConfigSection config={config ?? null} colors={colors} />

      {/* ── Templates ── */}
      <SectionHeader title={`Goedgekeurde templates (${templates?.length ?? 0})`} colors={colors} />
      <TemplatesSyncBar config={config ?? null} colors={colors} />
      {(!templates || templates.length === 0) ? (
        <View style={[styles.card, styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <FileText size={32} color={colors.textTertiary} weight="duotone" />
          <Text style={[styles.emptyDesc, { color: colors.textSecondary, textAlign: 'center' }]}>
            {config
              ? 'Nog geen templates. Tik op "Sync vanuit Meta" om je goedgekeurde templates op te halen.'
              : 'Koppel eerst een WhatsApp Business Account.'}
          </Text>
        </View>
      ) : (
        templates.map(tpl => (
          <View key={tpl.id} style={[styles.card, styles.listItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{tpl.name}</Text>
              <Text style={[styles.caption, { color: colors.textSecondary }]}>
                {tpl.category} · {tpl.language}
              </Text>
              {tpl.body_text ? (
                <Text style={[styles.bodyPreview, { color: colors.textTertiary }]} numberOfLines={2}>
                  {tpl.body_text}
                </Text>
              ) : null}
            </View>
            <StatusBadge status={tpl.status} />
          </View>
        ))
      )}

      {/* ── Recipient Management ── */}
      <SectionHeader title={`Ontvangers (${recipients?.length ?? 0} actief)`} colors={colors} />

      {/* Add recipient form */}
      {config ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text, marginBottom: spacing.sm }]}>
            Ontvanger toevoegen
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
            placeholder="+31612345678"
            placeholderTextColor={colors.textTertiary}
            value={newPhone}
            onChangeText={setNewPhone}
            keyboardType="phone-pad"
            autoCorrect={false}
          />
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
            placeholder="Naam (optioneel)"
            placeholderTextColor={colors.textTertiary}
            value={newName}
            onChangeText={setNewName}
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary, opacity: addingRecipient ? 0.6 : 1, flex: 1 }]}
              onPress={handleAddRecipient}
              disabled={addingRecipient}
            >
              {addingRecipient
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.buttonText}>Toevoegen</Text>
              }
            </TouchableOpacity>
            <CSVImportButton colors={colors} />
          </View>
        </View>
      ) : null}

      {/* Recipients list */}
      {recipients && recipients.length > 0 ? (
        recipients.map(r => (
          <View key={r.id} style={[styles.card, styles.listItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {r.display_name ?? r.phone_e164}
              </Text>
              {r.display_name ? (
                <Text style={[styles.caption, { color: colors.textSecondary }]}>{r.phone_e164}</Text>
              ) : null}
              <Text style={[styles.caption, { color: colors.textTertiary }]}>
                Ingeschreven: {new Date(r.opt_in_at).toLocaleDateString('nl-NL')}
                {r.source ? ` · ${r.source}` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => handleOptOut(r.id, r.phone_e164)}
              disabled={optingOut}
            >
              <UserMinus size={18} color={colors.textTertiary} weight="duotone" />
            </TouchableOpacity>
          </View>
        ))
      ) : (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary, textAlign: 'center' }]}>
            Nog geen ontvangers. Voeg mensen toe die opt-in hebben gegeven.
          </Text>
        </View>
      )}

      {/* ── Recent Sends (audit trail) ── */}
      <SectionHeader title="Recente verzendingen" colors={colors} />
      {sends && sends.length > 0 ? (
        sends.slice(0, 20).map(s => (
          <View key={s.id} style={[styles.card, styles.listItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{s.phone_e164}</Text>
              <Text style={[styles.caption, { color: colors.textSecondary }]}>
                {new Date(s.sent_at).toLocaleString('nl-NL')}
                {s.cost_usd ? ` · $${s.cost_usd.toFixed(4)}` : ''}
              </Text>
              {s.error ? (
                <Text style={[styles.caption, { color: '#EF4444' }]} numberOfLines={1}>{s.error}</Text>
              ) : null}
            </View>
            <StatusBadge status={s.status} />
          </View>
        ))
      ) : (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary, textAlign: 'center' }]}>
            Nog geen verzendingen.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold as any,
    letterSpacing: 0.8,
  },
  card: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: fontSize.xs,
  },
  caption: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  bodyPreview: {
    fontSize: fontSize.xs,
    marginTop: 4,
    fontStyle: 'italic',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: fontWeight.semibold as any,
  },
  emptyState: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold as any,
  },
  emptyDesc: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold as '600',
    marginBottom: 4,
  },
  button: {
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  buttonText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
  iconButton: {
    padding: spacing.xs,
  },
});
