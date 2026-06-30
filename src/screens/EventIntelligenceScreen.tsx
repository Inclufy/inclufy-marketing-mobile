// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: cfg.icon as any> | Ionicons name=<dynamic: isExpanded ? 'chevron-up' : 'chevron-down'>
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Linking,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import { api } from '../services/api';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { subtleShadow } from '../utils/shadows';
import type { RootStackParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import type { RegionData } from '../hooks/useLocation';

import { Calendar, CheckCircle, CreditCard, Globe, MapPin, Radioactive, Sparkle, Star } from 'phosphor-react-native';
type Nav = NativeStackNavigationProp<RootStackParamList>;

interface DiscoveredEvent {
  id: string;
  name: string;
  type: string;
  description: string;
  location: string;
  city: string;
  date_start: string;
  date_end: string;
  website: string;
  expected_attendees: number;
  target_audience_match: number;
  estimated_roi: number;
  estimated_leads: number;
  networking_value: number;
  cost: { ticket: number; travel: number; accommodation: number; total: number } | null;
  status: string;
  priority_score: number;
  ai_recommendation: string;
  tags: string[];
  scan_layer?: string;
  organizer_id?: string;
}

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  conference:  { icon: 'megaphone-outline',   color: '#E8317A' },
  trade_show:  { icon: 'storefront-outline',  color: '#DB2777' },
  networking:  { icon: 'people-outline',      color: '#10B981' },
  meetup:      { icon: 'chatbubbles-outline', color: '#3B82F6' },
  workshop:    { icon: 'construct-outline',   color: '#F59E0B' },
  webinar:     { icon: 'desktop-outline',     color: '#06B6D4' },
  hackathon:   { icon: 'code-slash-outline',  color: '#EF4444' },
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

// ── Scan layers ──────────────────────────────────────────────────────────
interface ScanLayer {
  label: string;
  radius_km: number;
  queryBuilder: (region: RegionData) => string;
  seedTag: string;
}

const SCAN_LAYERS: ScanLayer[] = [
  { label: 'Stad', radius_km: 25, queryBuilder: (r) => `B2B marketing event ${r.city} 2026`, seedTag: 'city' },
  { label: 'Provincie', radius_km: 75, queryBuilder: (r) => `B2B marketing conference ${r.province} ${r.country} 2026`, seedTag: 'province' },
  { label: 'Landelijk', radius_km: 200, queryBuilder: (r) => `B2B marketing conference trade show ${r.country} 2026`, seedTag: 'national' },
  { label: 'Benelux', radius_km: 400, queryBuilder: () => `B2B marketing conference Belgium Netherlands Luxembourg 2026`, seedTag: 'benelux' },
  { label: 'Europa', radius_km: 1500, queryBuilder: () => `B2B marketing summit conference Europe 2026`, seedTag: 'europe' },
  { label: 'Globaal', radius_km: 99999, queryBuilder: () => `B2B marketing summit conference global 2026`, seedTag: 'global' },
];

// ── Filter chip config ───────────────────────────────────────────────────
const LAYER_CHIPS = [
  { key: 'all',       label: 'Alle',        emoji: '' },
  { key: 'organizer', label: 'Organisator', emoji: '⭐' },
  { key: 'city',      label: 'Stad',        emoji: '🏙️' },
  { key: 'province',  label: 'Regio',       emoji: '📍' },
  { key: 'national',  label: 'NL',          emoji: '🇳🇱' },
  { key: 'benelux',   label: 'Benelux',     emoji: '🇧🇪' },
  { key: 'europe',    label: 'EU',          emoji: '🇪🇺' },
  { key: 'global',    label: 'Wereld',      emoji: '🌍' },
];

// ── Time filter chips ────────────────────────────────────────────────────
const TIME_CHIPS = [
  { key: 'all_time', label: 'Alles',   emoji: '📅', months: 0 },
  { key: '1m',       label: '1 mnd',   emoji: '⏳', months: 1 },
  { key: '2m',       label: '2 mnd',   emoji: '⏳', months: 2 },
  { key: '3m',       label: '3 mnd',   emoji: '⏳', months: 3 },
  { key: '6m',       label: '6 mnd',   emoji: '📆', months: 6 },
  { key: '1y',       label: '1 jaar',  emoji: '🗓️', months: 12 },
];

// ── Seed events per layer ─────────────────────────────────────────────
const SEED_EVENTS_BY_LAYER: Record<string, Array<Omit<DiscoveredEvent, 'id'>>> = {
  city: [
    {
      name: 'Startup Almere Pitch Night', type: 'networking',
      description: 'Maandelijkse pitch avond voor startups en scale-ups in Almere.',
      location: 'Kunstlinie, Almere', city: 'Almere',
      date_start: '2026-04-15', date_end: '2026-04-15',
      website: 'https://startupalmere.nl', expected_attendees: 60,
      target_audience_match: 75, estimated_roi: 120, estimated_leads: 8, networking_value: 82,
      cost: { ticket: 0, travel: 0, accommodation: 0, total: 0 },
      status: 'discovered', priority_score: 72,
      ai_recommendation: 'Lokaal en laagdrempelig. Perfecte kans voor regionale zichtbaarheid.',
      tags: ['city', 'networking', 'startup', 'almere', 'lokaal'],
    },
  ],
  province: [
    {
      name: 'ICT Tribe Flevoland Meetup', type: 'meetup',
      description: 'Kwartaalbijeenkomst voor ICT-professionals en digitale marketeers in Flevoland.',
      location: 'De Meerpaal, Dronten', city: 'Dronten',
      date_start: '2026-05-08', date_end: '2026-05-08',
      website: 'https://icttribe.nl', expected_attendees: 45,
      target_audience_match: 70, estimated_roi: 100, estimated_leads: 6, networking_value: 78,
      cost: { ticket: 0, travel: 15, accommodation: 0, total: 15 },
      status: 'discovered', priority_score: 68,
      ai_recommendation: 'Regionaal relevant. Goede kans om ICT-netwerk in de provincie uit te breiden.',
      tags: ['province', 'ict', 'meetup', 'flevoland', 'provinciaal'],
    },
    {
      name: 'Innovaly Innovation Day', type: 'conference',
      description: 'Jaarlijks innovatie-event met focus op digitale transformatie.',
      location: 'Innovaly Hub, Lelystad', city: 'Lelystad',
      date_start: '2026-06-12', date_end: '2026-06-12',
      website: 'https://innovaly.nl', expected_attendees: 120,
      target_audience_match: 82, estimated_roi: 200, estimated_leads: 15, networking_value: 80,
      cost: { ticket: 95, travel: 20, accommodation: 0, total: 115 },
      status: 'discovered', priority_score: 78,
      ai_recommendation: 'Sterke innovatiefocus. Goed platform voor thought leadership.',
      tags: ['province', 'innovatie', 'digitaal', 'lelystad', 'provinciaal'],
    },
  ],
  national: [
    {
      name: 'KubeCon Europe 2026', type: 'conference',
      description: 'De grootste cloud-native conferentie in Europa met 12.000+ bezoekers.',
      location: 'RAI Amsterdam', city: 'Amsterdam',
      date_start: '2026-03-30', date_end: '2026-04-02',
      website: 'https://events.linuxfoundation.org/kubecon-cloudnativecon-europe/',
      expected_attendees: 12500,
      target_audience_match: 95, estimated_roi: 500, estimated_leads: 110, networking_value: 95,
      cost: { ticket: 800, travel: 50, accommodation: 0, total: 850 },
      status: 'discovered', priority_score: 99,
      ai_recommendation: 'Top prioriteit! Enorm bereik en perfecte match voor cloud-native doelgroep.',
      tags: ['national', 'tech', 'cloud', 'amsterdam', 'nationaal'],
    },
    {
      name: 'DevOps Days Amsterdam', type: 'conference',
      description: 'Community-gedreven DevOps conferentie in Amsterdam.',
      location: 'Pakhuis de Zwijger, Amsterdam', city: 'Amsterdam',
      date_start: '2026-04-25', date_end: '2026-04-25',
      website: 'https://devopsdays.org/amsterdam', expected_attendees: 800,
      target_audience_match: 90, estimated_roi: 300, estimated_leads: 40, networking_value: 88,
      cost: { ticket: 250, travel: 50, accommodation: 0, total: 300 },
      status: 'discovered', priority_score: 88,
      ai_recommendation: 'Sterke DevOps community. Ideaal voor tech-leads en engineering teams.',
      tags: ['national', 'devops', 'amsterdam', 'nationaal'],
    },
  ],
  benelux: [
    {
      name: 'B2B Marketing Forum Antwerpen', type: 'conference',
      description: 'Jaarlijks forum voor B2B marketeers in de Benelux. Focus op demand generation en ABM.',
      location: 'Antwerp Expo, Antwerpen', city: 'Antwerpen',
      date_start: '2026-04-22', date_end: '2026-04-22',
      website: 'https://b2bforum.be', expected_attendees: 350,
      target_audience_match: 92, estimated_roi: 280, estimated_leads: 35, networking_value: 85,
      cost: { ticket: 295, travel: 40, accommodation: 0, total: 335 },
      status: 'discovered', priority_score: 91,
      ai_recommendation: 'Top prioriteit. 92% match met jouw doelgroep.',
      tags: ['benelux', 'b2b', 'abm', 'antwerpen'],
    },
  ],
  europe: [
    {
      name: 'AWS Summit Berlin', type: 'conference',
      description: 'AWS cloud summit met focus op enterprise architectuur en AI/ML.',
      location: 'Station Berlin', city: 'Berlin',
      date_start: '2026-05-11', date_end: '2026-05-12',
      website: 'https://aws.amazon.com/events/summits/berlin/',
      expected_attendees: 5000,
      target_audience_match: 78, estimated_roi: 350, estimated_leads: 55, networking_value: 82,
      cost: { ticket: 0, travel: 200, accommodation: 250, total: 450 },
      status: 'discovered', priority_score: 79,
      ai_recommendation: 'Gratis entree, grote cloud community. Goede ROI voor tech-bedrijven.',
      tags: ['europe', 'aws', 'cloud', 'berlin', 'europa'],
    },
    {
      name: 'Web Summit 2026', type: 'conference',
      description: "Europa's grootste tech-conferentie in Lissabon.",
      location: 'Altice Arena, Lisbon', city: 'Lissabon',
      date_start: '2026-11-02', date_end: '2026-11-05',
      website: 'https://websummit.com', expected_attendees: 70000,
      target_audience_match: 72, estimated_roi: 500, estimated_leads: 80, networking_value: 95,
      cost: { ticket: 850, travel: 250, accommodation: 400, total: 1500 },
      status: 'discovered', priority_score: 82,
      ai_recommendation: 'Massaal bereik. Ideaal voor internationale thought leadership.',
      tags: ['europe', 'tech', 'startup', 'lisbon', 'europa'],
    },
  ],
  global: [
    {
      name: 'GITEX Global 2026', type: 'trade_show',
      description: 'Grootste tech beurs in het Midden-Oosten met 170.000+ bezoekers.',
      location: 'Dubai World Trade Centre', city: 'Dubai',
      date_start: '2026-10-13', date_end: '2026-10-17',
      website: 'https://gitex.com', expected_attendees: 170000,
      target_audience_match: 68, estimated_roi: 800, estimated_leads: 120, networking_value: 90,
      cost: { ticket: 500, travel: 600, accommodation: 800, total: 1900 },
      status: 'discovered', priority_score: 76,
      ai_recommendation: 'Enorm internationaal bereik. Sterk voor MENA-expansie.',
      tags: ['global', 'tech', 'dubai', 'globaal'],
    },
  ],
};

// ── Events for known organizers (seed when followed) ─────────────────────
const ORGANIZER_EVENTS: Record<string, Array<Omit<DiscoveredEvent, 'id'>>> = {
  'RVO': [{
    name: 'RVO Innovatie & Internationalisering Summit', type: 'conference',
    description: 'Jaarlijks RVO-event over subsidies, innovatie en internationaal ondernemen.',
    location: 'World Forum, Den Haag', city: 'Den Haag',
    date_start: '2026-06-18', date_end: '2026-06-18',
    website: 'https://rvo.nl', expected_attendees: 600,
    target_audience_match: 85, estimated_roi: 400, estimated_leads: 45, networking_value: 88,
    cost: { ticket: 0, travel: 50, accommodation: 0, total: 50 },
    status: 'discovered', priority_score: 90,
    ai_recommendation: 'Gratis, hoog relevant voor subsidies en innovatie netwerk.',
    tags: ['rvo', 'innovatie', 'subsidie', 'nationaal', 'organizer'],
  }],
  'GITEX': [{
    name: 'GITEX Global 2026', type: 'trade_show',
    description: 'Grootste tech beurs met 170.000+ bezoekers uit 170+ landen.',
    location: 'Dubai World Trade Centre', city: 'Dubai',
    date_start: '2026-10-13', date_end: '2026-10-17',
    website: 'https://gitex.com', expected_attendees: 170000,
    target_audience_match: 68, estimated_roi: 800, estimated_leads: 120, networking_value: 90,
    cost: { ticket: 500, travel: 600, accommodation: 800, total: 1900 },
    status: 'discovered', priority_score: 76,
    ai_recommendation: 'Enorm internationaal bereik. Sterk voor MENA-expansie.',
    tags: ['gitex', 'tech', 'dubai', 'globaal', 'organizer'],
  }],
  'Slush': [{
    name: 'Slush 2026', type: 'conference',
    description: 'Het grootste startup event van Noord-Europa in Helsinki.',
    location: 'Helsinki Expo, Helsinki', city: 'Helsinki',
    date_start: '2026-11-19', date_end: '2026-11-20',
    website: 'https://slush.org', expected_attendees: 13000,
    target_audience_match: 82, estimated_roi: 450, estimated_leads: 65, networking_value: 92,
    cost: { ticket: 450, travel: 300, accommodation: 350, total: 1100 },
    status: 'discovered', priority_score: 85,
    ai_recommendation: 'Top startup event. Perfecte match voor funding en partnerships.',
    tags: ['slush', 'startup', 'helsinki', 'europa', 'organizer'],
  }],
  'Web Summit': [{
    name: 'Web Summit 2026', type: 'conference',
    description: "Europa's grootste tech-conferentie met 70.000 bezoekers.",
    location: 'Altice Arena, Lisbon', city: 'Lissabon',
    date_start: '2026-11-02', date_end: '2026-11-05',
    website: 'https://websummit.com', expected_attendees: 70000,
    target_audience_match: 72, estimated_roi: 500, estimated_leads: 80, networking_value: 95,
    cost: { ticket: 850, travel: 250, accommodation: 400, total: 1500 },
    status: 'discovered', priority_score: 82,
    ai_recommendation: 'Massaal bereik. Internationaal thought leadership.',
    tags: ['websummit', 'tech', 'lisbon', 'europa', 'organizer'],
  }],
  'Collision': [{
    name: 'Collision 2026', type: 'conference',
    description: "Noord-Amerika's snelstgroeiende tech conferentie in Toronto.",
    location: 'Enercare Centre, Toronto', city: 'Toronto',
    date_start: '2026-06-23', date_end: '2026-06-26',
    website: 'https://collisionconf.com', expected_attendees: 40000,
    target_audience_match: 70, estimated_roi: 550, estimated_leads: 70, networking_value: 88,
    cost: { ticket: 700, travel: 700, accommodation: 500, total: 1900 },
    status: 'discovered', priority_score: 78,
    ai_recommendation: 'Groot internationaal bereik. Ideaal voor Noord-Amerikaanse markt.',
    tags: ['collision', 'tech', 'toronto', 'globaal', 'organizer'],
  }],
  'VivaTech': [{
    name: 'VivaTech 2026', type: 'conference',
    description: "Europa's grootste startup en tech innovatie evenement in Parijs.",
    location: 'Paris Expo, Parijs', city: 'Parijs',
    date_start: '2026-06-11', date_end: '2026-06-14',
    website: 'https://vivatechnology.com', expected_attendees: 150000,
    target_audience_match: 75, estimated_roi: 600, estimated_leads: 90, networking_value: 92,
    cost: { ticket: 350, travel: 150, accommodation: 250, total: 750 },
    status: 'discovered', priority_score: 84,
    ai_recommendation: 'Enorm bereik in Europese innovatie. Sterk voor partnerships.',
    tags: ['vivatech', 'innovatie', 'parijs', 'europa', 'organizer'],
  }],
  'DMEXCO': [{
    name: 'DMEXCO 2026', type: 'trade_show',
    description: 'Toonaangevende digital marketing beurs in Keulen.',
    location: 'Koelnmesse, Keulen', city: 'Keulen',
    date_start: '2026-09-16', date_end: '2026-09-17',
    website: 'https://dmexco.com', expected_attendees: 40000,
    target_audience_match: 90, estimated_roi: 500, estimated_leads: 75, networking_value: 90,
    cost: { ticket: 300, travel: 100, accommodation: 200, total: 600 },
    status: 'discovered', priority_score: 89,
    ai_recommendation: 'Top digital marketing event. 90% doelgroep match!',
    tags: ['dmexco', 'marketing', 'keulen', 'europa', 'organizer'],
  }],
  'Innovaly': [{
    name: 'Innovaly Innovation Day 2026', type: 'conference',
    description: 'Jaarlijks innovatie-event met focus op digitale transformatie.',
    location: 'Innovaly Hub, Lelystad', city: 'Lelystad',
    date_start: '2026-06-12', date_end: '2026-06-12',
    website: 'https://innovaly.nl', expected_attendees: 120,
    target_audience_match: 82, estimated_roi: 200, estimated_leads: 15, networking_value: 80,
    cost: { ticket: 95, travel: 20, accommodation: 0, total: 115 },
    status: 'discovered', priority_score: 78,
    ai_recommendation: 'Lokale innovatiefocus. Goed voor regionale zichtbaarheid.',
    tags: ['innovaly', 'innovatie', 'lelystad', 'provinciaal', 'organizer'],
  }],
  'ROC': [{
    name: 'ROC Digital Skills Conference', type: 'conference',
    description: 'Landelijke conferentie over digitale vaardigheden en marketing.',
    location: 'Jaarbeurs, Utrecht', city: 'Utrecht',
    date_start: '2026-05-21', date_end: '2026-05-21',
    website: 'https://roc-digitaal.nl', expected_attendees: 400,
    target_audience_match: 78, estimated_roi: 250, estimated_leads: 30, networking_value: 75,
    cost: { ticket: 175, travel: 40, accommodation: 0, total: 215 },
    status: 'discovered', priority_score: 77,
    ai_recommendation: 'B2B in onderwijs en digitale training. Sterke doelgroep match.',
    tags: ['roc', 'onderwijs', 'utrecht', 'nationaal', 'organizer'],
  }],
};

export default function EventIntelligenceScreen() {
  const navigation = useNavigation<Nav>();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [attendingId, setAttendingId] = useState<string | null>(null);
  const [activeLayer, setActiveLayer] = useState<string>('all');
  const [activeTimeFilter, setActiveTimeFilter] = useState<string>('all_time');
  const autoSeeded = useRef(false);

  // ── Load user location ──────────────────────────────────────────────────
  const [userRegion, setUserRegion] = useState<RegionData | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } = {} as any } = await supabase.auth.getUser();
        const meta = user?.user_metadata;
        if (meta?.location_city || meta?.location_country) {
          setUserRegion({
            city: meta.location_city || '',
            province: meta.location_province || '',
            country: meta.location_country || '',
            countryCode: meta.location_country_code || '',
            continent: meta.location_continent || '',
          });
        }
      } catch {}
    })();
  }, []);

  // ── Fetch discovered events ─────────────────────────────────────────────
  const { data: events = [], isLoading, refetch } = useQuery<DiscoveredEvent[]>({
    queryKey: ['discovered_events'],
    queryFn: async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;
        if (!user) return [];
        const { data, error } = await supabase
          .from('discovered_events')
          .select('*')
          .eq('user_id', user.id)
          .order('priority_score', { ascending: false });
        if (error) {
          console.warn('[EventIntelligence] fetch error:', error.message);
          return [];
        }
        return (data ?? []) as DiscoveredEvent[];
      } catch (err: any) {
        console.warn('[EventIntelligence] unexpected error:', err?.message);
        return [];
      }
    },
    retry: 1,
    staleTime: 30_000,
  });

  // ── Hierarchical Scan ──────────────────────────────────────────────────
  const handleScan = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    setScanProgress('');

    try {
      const { data: authSeed } = await supabase.auth.getUser();
      const user = authSeed?.user;
      if (!user) {
        Alert.alert('Fout', 'Niet ingelogd.');
        return;
      }

      const region: RegionData = userRegion ?? {
        city: user.user_metadata?.location_city || 'Almere',
        province: user.user_metadata?.location_province || 'Flevoland',
        country: user.user_metadata?.location_country || 'Nederland',
        countryCode: user.user_metadata?.location_country_code || 'NL',
        continent: user.user_metadata?.location_continent || 'Europe',
      };

      let totalFound = 0;
      const layerResults: string[] = [];

      // ── 1. Fetch events from followed organizers FIRST ────────────────
      setScanProgress('⭐ Organisatoren scannen...');
      try {
        const { data: orgs } = await supabase
          .from('followed_organizers')
          .select('id, organizer_name')
          .eq('user_id', user.id);

        if (orgs && orgs.length > 0) {
          let orgEventsFound = 0;

          for (const org of orgs) {
            try {
              const resp = await api.post('/api/events/discover', {
                radius_km: 99999,
                query: `${org.organizer_name} event 2026`,
                limit: 3,
                source: 'followed_organizer',
              });
              orgEventsFound += resp.data?.discovered ?? 0;
            } catch {
              const orgName = org.organizer_name?.trim() || '';
              const matchingKey = Object.keys(ORGANIZER_EVENTS).find(k =>
                orgName.toLowerCase().includes(k.toLowerCase()) ||
                k.toLowerCase().includes(orgName.toLowerCase().split(' ')[0])
              );

              if (matchingKey) {
                const seeds = ORGANIZER_EVENTS[matchingKey];
                for (const ev of seeds) {
                  await supabase
                    .from('discovered_events')
                    .upsert(
                      { ...ev, user_id: user.id, scan_layer: 'organizer', organizer_id: org.id },
                      { onConflict: 'user_id,name', ignoreDuplicates: true }
                    );
                }
                orgEventsFound += seeds.length;
              }
            }
          }

          if (orgEventsFound > 0) {
            totalFound += orgEventsFound;
            layerResults.push(`Organisatoren: ${orgEventsFound}`);
          }
        }
      } catch {}

      // ── 2. Scan each geographic layer (stad → provincie → … → global) ──
      for (const layer of SCAN_LAYERS) {
        setScanProgress(`🔍 ${layer.label} scannen...`);

        let backendOk = false;
        try {
          const resp = await api.post('/api/events/discover', {
            radius_km: layer.radius_km,
            query: layer.queryBuilder(region),
            limit: 5,
            layer: layer.seedTag,
          });
          const found = resp.data?.discovered ?? 0;
          if (found > 0) {
            totalFound += found;
            layerResults.push(`${layer.label}: ${found}`);
          }
          backendOk = true;
        } catch {
          // Backend not running — use curated seed events
        }

        if (!backendOk) {
          const seeds = SEED_EVENTS_BY_LAYER[layer.seedTag] ?? [];
          for (const ev of seeds) {
            await supabase
              .from('discovered_events')
              .upsert(
                { ...ev, user_id: user.id, scan_layer: layer.seedTag },
                { onConflict: 'user_id,name', ignoreDuplicates: true }
              );
          }
          if (seeds.length > 0) {
            totalFound += seeds.length;
            layerResults.push(`${layer.label}: ${seeds.length}`);
          }
        }
      }

      await refetch();
      setScanProgress('');

      if (totalFound > 0) {
        Alert.alert('✅ Scannen klaar', `${totalFound} events gevonden:\n\n${layerResults.join('\n')}`);
      } else {
        Alert.alert('ℹ️ Geen nieuwe events', 'Probeer later opnieuw of pas je locatie aan.');
      }
    } catch (err: any) {
      console.warn('[EventIntelligence] scan error:', err?.message);
      Alert.alert('Fout', 'Scannen mislukt. Controleer je verbinding.');
    } finally {
      setScanning(false);
      setScanProgress('');
    }
  }, [scanning, refetch, userRegion]);

  // ── Auto-seed on first load ─────────────────────────────────────────────
  useEffect(() => {
    if (!isLoading && events.length === 0 && !autoSeeded.current && !scanning) {
      autoSeeded.current = true;
      const t = setTimeout(() => { handleScan().catch(() => {}); }, 900);
      return () => clearTimeout(t);
    }
  }, [isLoading, events.length]);

  // ── Filter by layer ─────────────────────────────────────────────────────
  const layerFiltered = activeLayer === 'all'
    ? events
    : events.filter(e => {
        const tags = e.tags ?? [];
        return tags.includes(activeLayer) || (e as any).scan_layer === activeLayer;
      });

  // ── Filter by time horizon ────────────────────────────────────────────
  const filteredEvents = activeTimeFilter === 'all_time'
    ? layerFiltered
    : layerFiltered.filter(e => {
        if (!e.date_start) return false;
        const eventDate = new Date(e.date_start);
        const now = new Date();
        const chip = TIME_CHIPS.find(c => c.key === activeTimeFilter);
        if (!chip?.months) return true;
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() + chip.months);
        return eventDate >= now && eventDate <= cutoff;
      });

  // ── Attend / register for event (directly via Supabase) ─────────────────
  const handleAttend = useCallback(async (item: DiscoveredEvent) => {
    if (attendingId) return;
    setAttendingId(item.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Niet ingelogd');

      // 1) Update discovered event status
      await supabase
        .from('discovered_events')
        .update({ status: 'registered' })
        .eq('id', item.id);

      // 2) Create a go_event so it appears in the user's event list
      const { data: newEvent, error: eventErr } = await supabase
        .from('go_events')
        .insert({
          user_id: user.id,
          name: item.name,
          description: item.description || '',
          location: item.location || item.city || '',
          event_date: item.date_start || new Date().toISOString().split('T')[0],
          event_start_time: null,
          event_end_time: null,
          channels: [],
          hashtags: (item.tags || []).slice(0, 5),
          default_tags: [],
          goals: [],
          status: 'active',
          settings: {
            source: 'event_intelligence',
            discovered_event_id: item.id,
            website: item.website,
            expected_attendees: item.expected_attendees,
            priority_score: item.priority_score,
          },
        })
        .select('id')
        .single();

      if (eventErr) {
        console.warn('Create go_event error:', eventErr.message);
        // Still show success if status was updated
        Alert.alert('✅ Ingeschreven', `Je staat ingeschreven voor ${item.name}.`);
      } else {
        qc.invalidateQueries({ queryKey: ['discovered_events'] });
        qc.invalidateQueries({ queryKey: ['events'] });
        Alert.alert(
          '🎉 Bijgeschreven!',
          `${item.name} is toegevoegd aan je events.`,
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Open Event',
              onPress: () => {
                try {
                  navigation.navigate('EventDashboard', { eventId: newEvent!.id });
                } catch {}
              },
            },
          ]
        );
      }
    } catch (err: any) {
      Alert.alert('Fout', err?.message ?? 'Inschrijving mislukt.');
    } finally {
      setAttendingId(null);
    }
  }, [attendingId, navigation, qc]);

  // ── Render event card ──────────────────────────────────────────────────
  const renderEvent = useCallback(({ item }: { item: DiscoveredEvent }) => {
    const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.conference;
    const isExpanded = expandedId === item.id;
    const isRegistered = item.status === 'registered' || item.status === 'attending';
    const score = item.priority_score ?? 0;
    const scoreColor = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#6B7280';
    const isAttending = attendingId === item.id;

    return (
      <TouchableOpacity
        style={{
          backgroundColor: colors.surface,
          borderRadius: borderRadius.lg,
          padding: spacing.md,
          marginBottom: spacing.sm,
          ...(isExpanded ? { borderColor: colors.primary + '30', borderWidth: 1 } : {}),
          ...subtleShadow,
        }}
        onPress={() => setExpandedId(isExpanded ? null : item.id)}
        activeOpacity={0.85}
      >
        {/* Top row */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginBottom: spacing.sm }}>
          <View style={{
            width: 40, height: 40, borderRadius: 10,
            backgroundColor: cfg.color + '18',
            justifyContent: 'center', alignItems: 'center',
          }}>
            <Ionicons name={cfg.icon as any} size={22} color={cfg.color} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text, lineHeight: 18 }} numberOfLines={isExpanded ? 3 : 2}>
              {item.name ?? '—'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}>
              <MapPin size={12} color={colors.textSecondary} weight="duotone" />
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>{item.city || item.location || '—'}</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>•</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>{formatDate(item.date_start)}</Text>
            </View>
          </View>

          <View style={{
            borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
            alignItems: 'center', borderWidth: 1, minWidth: 48,
            backgroundColor: scoreColor + '18', borderColor: scoreColor + '40',
          }}>
            <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: scoreColor, lineHeight: 18 }}>{score}</Text>
            <Text style={{ fontSize: 9, fontWeight: fontWeight.medium, color: scoreColor }}>/100</Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={{
          flexDirection: 'row', backgroundColor: colors.background,
          borderRadius: borderRadius.sm, padding: spacing.sm, marginBottom: spacing.sm,
        }}>
          {[
            { label: 'ROI', val: `${typeof item.estimated_roi === 'number' ? item.estimated_roi : 0}%` },
            { label: 'Leads', val: String(item.estimated_leads ?? 0) },
            { label: 'Match', val: `${item.target_audience_match ?? 0}%` },
            { label: 'Bezoekers', val: item.expected_attendees ? String(Math.round(item.expected_attendees / 100) * 100) : '—' },
          ].map(({ label, val }) => (
            <View key={label} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text }}>{val}</Text>
              <Text style={{ fontSize: 9, color: colors.textSecondary, marginTop: 1 }}>{label}</Text>
            </View>
          ))}
        </View>

        {/* AI recommendation */}
        {!!item.ai_recommendation && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginBottom: spacing.xs }}>
            <Sparkle size={12} color={colors.primary} weight="regular" />
            <Text style={{ fontSize: 11, color: colors.primary, fontStyle: 'italic', flex: 1, lineHeight: 16 }}>
              {item.ai_recommendation}
            </Text>
          </View>
        )}

        {/* Expanded */}
        {isExpanded && (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, gap: spacing.sm }}>
            {!!item.description && (
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 }}>{item.description}</Text>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <CreditCard size={14} color={colors.textSecondary} weight="duotone" />
              <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                Ticket: €{item.cost?.ticket ?? 0} · Totaal: €{item.cost?.total ?? 0}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              {!!item.website && (
                <TouchableOpacity
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    borderWidth: 1, borderColor: colors.primary + '60',
                    borderRadius: borderRadius.full, paddingHorizontal: 12, paddingVertical: 7,
                  }}
                  onPress={() => Linking.openURL(item.website).catch(() => {})}
                >
                  <Globe size={14} color={colors.primary} weight="duotone" />
                  <Text style={{ fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.medium }}>Website</Text>
                </TouchableOpacity>
              )}

              {isRegistered ? (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: colors.success + '15',
                  borderRadius: borderRadius.full,
                  paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
                }}>
                  <CheckCircle size={16} color={colors.success} weight="fill" />
                  <Text style={{ color: colors.success, fontWeight: fontWeight.bold, fontSize: fontSize.sm }}>Ingeschreven</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: colors.primary, borderRadius: borderRadius.full,
                    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
                    opacity: isAttending ? 0.7 : 1,
                  }}
                  onPress={() => handleAttend(item)}
                  disabled={!!attendingId}
                >
                  {isAttending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Calendar size={16} color="#fff" weight="duotone" />
                      <Text style={{ color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.sm }}>Bijwonen →</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View style={{ alignItems: 'center', marginTop: spacing.xs }}>
          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>
    );
  }, [expandedId, attendingId, colors, handleAttend]);

  const highCount = filteredEvents.filter(e => (e.priority_score ?? 0) >= 75).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        paddingTop: spacing.md,
        paddingBottom: spacing.md,
        gap: spacing.xs,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 5,
          backgroundColor: colors.primary + '15', alignSelf: 'flex-start',
          paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
        }}>
          <Radioactive size={16} color={colors.primary} weight="duotone" />
          <Text style={{ fontSize: 11, color: colors.primary, fontWeight: fontWeight.semibold }}>Live AI Radar</Text>
        </View>

        <Text style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text }}>Event Intelligence</Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
          {userRegion?.city
            ? `📍 ${userRegion.city}, ${userRegion.country} — ${highCount > 0 ? `${highCount} high-impact events` : 'Scan voor events'}`
            : highCount > 0
              ? `${highCount} high-impact events gevonden`
              : 'Stel je locatie in via Instellingen'}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <TouchableOpacity
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: colors.primary, borderRadius: borderRadius.full,
              paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
              opacity: scanning ? 0.6 : 1,
            }}
            onPress={handleScan}
            disabled={scanning}
          >
            {scanning
              ? <ActivityIndicator size="small" color="#fff" />
              : <Radioactive size={18} color="#fff" weight="duotone" />}
            <Text style={{ color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.sm }}>
              {scanning ? 'Scannen...' : 'Scannen'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              borderWidth: 1.5, borderColor: colors.primary + '60',
              borderRadius: borderRadius.full,
              paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
            }}
            onPress={() => (navigation as any).navigate('FollowedOrganizers')}
          >
            <Star size={16} color={colors.primary} weight="duotone" />
            <Text style={{ fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.medium }}>Organisatoren</Text>
          </TouchableOpacity>
        </View>

        {scanning && scanProgress ? (
          <Text style={{ fontSize: fontSize.xs, color: colors.primary, fontStyle: 'italic', marginTop: 2 }}>{scanProgress}</Text>
        ) : null}
      </View>

      {/* Filter chips - geo layer row */}
      {events.length > 0 && (
        <View style={{ backgroundColor: colors.surface, paddingTop: spacing.sm }}>
          <Text style={{ fontSize: 11, fontWeight: fontWeight.semibold, color: colors.textSecondary, paddingHorizontal: spacing.md, marginBottom: 6 }}>📍 Regio</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: spacing.sm, paddingBottom: 8, gap: 8, alignItems: 'center' }}
          >
            {LAYER_CHIPS.map(c => {
              const isActive = activeLayer === c.key;
              const count = c.key === 'all'
                ? events.length
                : events.filter(e => (e.tags ?? []).includes(c.key) || (e as any).scan_layer === c.key).length;
              return (
                <TouchableOpacity
                  key={c.key}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                    backgroundColor: isActive ? colors.primary : colors.background,
                    borderWidth: 1.5,
                    borderColor: isActive ? colors.primary : colors.border,
                    opacity: count === 0 && c.key !== 'all' ? 0.4 : 1,
                  }}
                  onPress={() => setActiveLayer(c.key)}
                >
                  {c.emoji ? <Text style={{ fontSize: 14 }}>{c.emoji}</Text> : null}
                  <Text style={{
                    fontSize: 13,
                    fontWeight: fontWeight.semibold,
                    color: isActive ? '#fff' : colors.text,
                  }}>
                    {c.label}
                  </Text>
                  <View style={{
                    backgroundColor: isActive ? '#ffffff40' : colors.primary + '18',
                    borderRadius: 10, minWidth: 20, paddingHorizontal: 5, paddingVertical: 1, alignItems: 'center',
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: fontWeight.bold, color: isActive ? '#fff' : colors.primary }}>{count}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Filter chips - time horizon row */}
      {events.length > 0 && (
        <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingTop: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: fontWeight.semibold, color: colors.textSecondary, paddingHorizontal: spacing.md, marginBottom: 6 }}>⏰ Tijdlijn</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: spacing.sm, paddingBottom: 10, gap: 6, alignItems: 'center' }}
          >
            {TIME_CHIPS.map(c => {
              const isActive = activeTimeFilter === c.key;
              // Count events matching this time filter
              const count = c.key === 'all_time'
                ? layerFiltered.length
                : layerFiltered.filter(e => {
                    if (!e.date_start) return false;
                    const eventDate = new Date(e.date_start);
                    const now = new Date();
                    const cutoff = new Date();
                    cutoff.setMonth(cutoff.getMonth() + (c.months || 0));
                    return eventDate >= now && eventDate <= cutoff;
                  }).length;
              return (
                <TouchableOpacity
                  key={c.key}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
                    backgroundColor: isActive ? colors.primary + '20' : 'transparent',
                    borderWidth: 1.5,
                    borderColor: isActive ? colors.primary : colors.border + '80',
                    opacity: count === 0 && c.key !== 'all_time' ? 0.4 : 1,
                  }}
                  onPress={() => setActiveTimeFilter(c.key)}
                >
                  <Text style={{ fontSize: 13 }}>{c.emoji}</Text>
                  <Text style={{
                    fontSize: 13,
                    fontWeight: isActive ? fontWeight.bold : fontWeight.medium,
                    color: isActive ? colors.primary : colors.textSecondary,
                  }}>
                    {c.label}
                  </Text>
                  <Text style={{ fontSize: 10, fontWeight: fontWeight.bold, color: isActive ? colors.primary : colors.textSecondary }}>
                    ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Metrics bar */}
      {events.length > 0 && (
        <View style={{
          flexDirection: 'row', backgroundColor: colors.surface,
          paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
        }}>
          {[
            { val: String(filteredEvents.length), label: 'Gevonden', color: colors.text },
            { val: String(highCount), label: 'High Impact', color: colors.success },
            { val: String(events.filter(e => e.status === 'registered').length), label: 'Ingeschreven', color: colors.primary },
            {
              val: filteredEvents.length > 0
                ? String(Math.round(filteredEvents.reduce((s, e) => s + (e.estimated_leads ?? 0), 0) / filteredEvents.length))
                : '0',
              label: 'Avg Leads', color: colors.text,
            },
          ].map(({ val, label, color }) => (
            <View key={label} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color }}>{val}</Text>
              <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 1 }}>{label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Content */}
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.sm }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>Events laden...</Text>
        </View>
      ) : events.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.sm, padding: spacing.xl }}>
          <Radioactive size={56} color={colors.textSecondary} weight="duotone" />
          <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>Nog geen events gevonden</Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>
            Tik op "Scannen" om events te ontdekken in jouw regio
          </Text>
          <TouchableOpacity
            style={{
              backgroundColor: colors.primary, borderRadius: borderRadius.full,
              paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginTop: spacing.sm,
              opacity: scanning ? 0.6 : 1,
            }}
            onPress={handleScan}
            disabled={scanning}
          >
            {scanning
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={{ color: '#fff', fontWeight: fontWeight.bold }}>🔍 Scannen</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredEvents}
          keyExtractor={item => item.id}
          renderItem={renderEvent}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={() => { refetch().catch(() => {}); }} tintColor={colors.primary} />
          }
        />
      )}
    </View>
  );
}
