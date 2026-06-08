// TODO: migrate to Phosphor — unmapped icons: MaterialCommunityIcons name=<dynamic: cat.icon> | MaterialCommunityIcons name=<dynamic: focused ? 'bullhorn' : 'bullhorn-outline'> | MaterialCommunityIcons name=<dynamic: focused ? 'calendar-star' : 'calendar-blank-outline'> | MaterialCommunityIcons name=<dynamic: focused ? 'post' : 'post-outline'> | MaterialCommunityIcons name=<dynamic: focused ? 'robot' : 'robot-outline'> | MaterialCommunityIcons name=<dynamic: focused ? 'view-dashboard' : 'view-dashboard-outline'>
import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import { fontWeight as fw, spacing, borderRadius, fontSize } from '../theme';
import { useTranslation } from '../i18n';

// ─── Screens ────────────────────────────────────────────────────────
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import HomeScreenV2 from '../screens/HomeScreenV2';
import EventListScreen from '../screens/EventListScreen';
import AutonomousHubScreen from '../screens/AutonomousHubScreen';
import NetworkingEngineScreen from '../screens/NetworkingEngineScreen';
import SettingsScreen from '../screens/SettingsScreen';
import MFASetupScreen from '../screens/MFASetupScreen';
import CampaignListScreen from '../screens/CampaignListScreen';
import AICommandScreen from '../screens/AICommandScreen';
import EventSetupScreen from '../screens/EventSetupScreen';
import LiveCaptureScreen from '../screens/LiveCaptureScreen';
import CaptureWizardScreen from '../screens/CaptureWizardScreen';
import PostReviewScreen from '../screens/PostReviewScreen';
import EventDashboardScreen from '../screens/EventDashboardScreen';
import StoryArcScreen from '../screens/StoryArcScreen';
import EventRecapScreen from '../screens/EventRecapScreen';
import TeamManageScreen from '../screens/TeamManageScreen';
import CampaignCreateScreen from '../screens/CampaignCreateScreen';
import CampaignDetailScreen from '../screens/CampaignDetailScreen';
import ContentCreatorScreen from '../screens/ContentCreatorScreen';
import LeadCaptureScreen from '../screens/LeadCaptureScreen';
import SmartLeadScreen from '../screens/SmartLeadScreen';
import QRScanScreen from '../screens/QRScanScreen';
import CardScanScreen from '../screens/CardScanScreen';
import MyDigitalCardScreen from '../screens/MyDigitalCardScreen';
import NFCShareScreen from '../screens/NFCShareScreen';
import OpportunityRadarScreen from '../screens/OpportunityRadarScreen';
import MarketingAutomationScreen from '../screens/MarketingAutomationScreen';
import BudgetMonitorScreen from '../screens/BudgetMonitorScreen';
import BoostFlowScreen from '../screens/BoostFlowScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import DemoEnvironmentScreen from '../screens/DemoEnvironmentScreen';
import AMOSHubScreen from '../screens/AMOSHubScreen';
import EventScannerScreen from '../screens/EventScannerScreen';
import EventIntelligenceScreen from '../screens/EventIntelligenceScreen';
import OpportunityFeedScreen from '../screens/OpportunityFeedScreen';
import BrandKitScreen from '../screens/BrandKitScreen';
import SocialMediaWizard from '../screens/SocialMediaWizard';
import EventAttendeesScreen from '../screens/EventAttendeesScreen';
import EventShareScreen from '../screens/EventShareScreen';
import CopilotScreen from '../screens/CopilotScreen';
import FollowedOrganizersScreen from '../screens/FollowedOrganizersScreen';
import ProductsScreen from '../screens/ProductsScreen';
import TeamDirectoryScreen from '../screens/TeamDirectoryScreen';
import OrganizationScreen from '../screens/OrganizationScreen';
import MarketingStrategyScreen from '../screens/MarketingStrategyScreen';
import PersonasScreen from '../screens/PersonasScreen';
import ContentProposalsScreen from '../screens/ContentProposalsScreen';
import ContentCalendarScreen from '../screens/ContentCalendarScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import AllPostsScreen from '../screens/AllPostsScreen';
import MultiAgentScreen from '../screens/MultiAgentScreen';
import AgentDetailScreen from '../screens/AgentDetailScreen';
import AgentRunDetailScreen from '../screens/AgentRunDetailScreen';
import GoalSetupScreen from '../screens/GoalSetupScreen';
import GoalDetailScreen from '../screens/GoalDetailScreen';
import VoiceCommandSheet from '../components/VoiceCommandSheet';
import IntegrationsScreen from '../screens/IntegrationsScreen';
import WhatsAppSettingsScreen from '../screens/WhatsAppSettingsScreen';
import LibraryScreen from '../screens/LibraryScreen';
import LibraryImportScreen from '../screens/LibraryImportScreen';
import LibraryPostDetailScreen from '../screens/LibraryPostDetailScreen';

import { CameraPlus, CameraSlash, Microphone, Sparkle, ArrowRight } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { brandGradient } from '../theme';
// ─── Navigators ─────────────────────────────────────────────────────
const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();
type Nav = NativeStackNavigationProp<RootStackParamList>;

// ─── Capture Categories ─────────────────────────────────────────────
const CAPTURE_CATEGORIES = [
  { key: 'event', label: 'Event Capture', desc: 'Content van events & conferenties', icon: 'party-popper' as const, color: '#E8317A' },
  { key: 'product', label: 'Product Capture', desc: 'Product shots, demos & unboxings', icon: 'package-variant-closed' as const, color: '#3B82F6' },
  { key: 'inspiration', label: 'Inspiratie', desc: 'Trends, ideeën & concurrentie', icon: 'lightbulb-on' as const, color: '#F59E0B' },
  { key: 'behind_scenes', label: 'Behind the Scenes', desc: 'Team, kantoor & bedrijfscultuur', icon: 'account-group' as const, color: '#10B981' },
];

// ─── Events Stack ───────────────────────────────────────────────────
function EventsStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerTitleStyle: { fontWeight: fw.semibold as any }, headerShadowVisible: false }}>
      <Stack.Screen name={'EventsRoot' as any} component={EventListScreen} options={{ title: 'Events' }} />
      <Stack.Screen name={'EventIntelligenceTab' as any} component={EventIntelligenceScreen} options={{ title: 'Event Intelligence' }} />
    </Stack.Navigator>
  );
}

// ─── Campaigns Stack ────────────────────────────────────────────────
function CampaignsStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerTitleStyle: { fontWeight: fw.semibold as any }, headerShadowVisible: false }}>
      <Stack.Screen name={'CampaignsRoot' as any} component={CampaignListScreen} options={{ title: 'Campagnes' }} />
    </Stack.Navigator>
  );
}

// ─── AI / AMOS Stack ────────────────────────────────────────────────
function AIStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerTitleStyle: { fontWeight: fw.semibold as any }, headerShadowVisible: false }}>
      <Stack.Screen name={'AIRoot' as any} component={AMOSHubScreen} options={{ headerShown: false }} />
      <Stack.Screen name={'OpportunityFeedTab' as any} component={OpportunityFeedScreen} options={{ title: 'AI Opportunity Feed' }} />
      <Stack.Screen name={'CampaignListTab' as any} component={CampaignListScreen} options={{ title: 'Campagnes' }} />
      <Stack.Screen name={'AutonomousHubTab' as any} component={AutonomousHubScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

// ─── Main Tabs + Floating Camera FAB ────────────────────────────────
// AsyncStorage key for the first-run voice tooltip (Tier-1 #5 discovery).
const VOICE_TIP_DISMISSED_KEY = '@amos:voice_tip_dismissed_v1';

function MainTabsWrapper() {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const { locale } = useTranslation();
  const isNl = locale === 'nl';
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  // Tier-1 #5 — Voice command sheet, opened via FAB long-press.
  const [showVoiceSheet, setShowVoiceSheet] = useState(false);
  // First-run hint that long-press = voice. Dismissed forever after one tap.
  const [showVoiceTip, setShowVoiceTip] = useState(false);
  useEffect(() => {
    (async () => {
      const dismissed = await AsyncStorage.getItem(VOICE_TIP_DISMISSED_KEY);
      if (!dismissed) setShowVoiceTip(true);
    })();
  }, []);
  const dismissVoiceTip = async () => {
    setShowVoiceTip(false);
    await AsyncStorage.setItem(VOICE_TIP_DISMISSED_KEY, '1');
  };

  const handleCaptureCategory = (category: string) => {
    setShowCaptureModal(false);
    setTimeout(() => navigation.navigate('CaptureWizard' as any, { category }), 200);
  };

  const handleOpenWizard = () => {
    setShowCaptureModal(false);
    setTimeout(() => navigation.navigate('CaptureWizard' as any), 200);
  };

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textTertiary,
          tabBarLabelStyle: { fontSize: 10, fontWeight: fw.medium as any, marginTop: -2 },
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: Platform.OS === 'ios' ? 88 : 68,
            paddingBottom: Platform.OS === 'ios' ? 28 : 10,
            paddingTop: 8,
          },
        }}
      >
        {/* Tab 1 — Dashboard */}
        <Tab.Screen
          name="HomeTab"
          component={HomeScreenV2}
          options={{
            tabBarLabel: 'Dashboard',
            tabBarIcon: ({ focused, color }) => (
              <MaterialCommunityIcons name={focused ? 'view-dashboard' : 'view-dashboard-outline'} size={22} color={color} />
            ),
          }}
        />

        {/* Tab 2 — Events */}
        <Tab.Screen
          name="EventsTab"
          component={EventsStack}
          options={{
            tabBarLabel: 'Events',
            tabBarIcon: ({ focused, color }) => (
              <MaterialCommunityIcons name={focused ? 'calendar-star' : 'calendar-blank-outline'} size={22} color={color} />
            ),
          }}
        />

        {/* Tab 3 — Campaigns */}
        <Tab.Screen
          name="CampaignsTab"
          component={CampaignsStack}
          options={{
            tabBarLabel: 'Campagnes',
            tabBarIcon: ({ focused, color }) => (
              <MaterialCommunityIcons name={focused ? 'bullhorn' : 'bullhorn-outline'} size={22} color={color} />
            ),
          }}
        />

        {/* Tab 4 — Alle Posts */}
        <Tab.Screen
          name="AllPostsTab"
          component={AllPostsScreen}
          options={{
            tabBarLabel: 'Posts',
            tabBarIcon: ({ focused, color }) => (
              <MaterialCommunityIcons name={focused ? 'post' : 'post-outline'} size={22} color={color} />
            ),
          }}
        />

        {/* Tab 5 — Copilot */}
        <Tab.Screen
          name="CopilotTab"
          component={CopilotScreen}
          options={{
            tabBarLabel: 'Copilot',
            tabBarIcon: ({ focused, color }) => (
              <MaterialCommunityIcons name={focused ? 'robot' : 'robot-outline'} size={22} color={color} />
            ),
          }}
        />
      </Tab.Navigator>

      {/* ── Floating Camera FAB ── */}
      <TouchableOpacity
        testID="camera-fab"
        accessibilityLabel="camera-fab"
        style={[fabStyles.fab, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
        onPress={() => setShowCaptureModal(true)}
        // Long-press → voice command (Tier-1 #5). 600ms is the React Native default.
        onLongPress={() => { dismissVoiceTip(); setShowVoiceSheet(true); }}
        delayLongPress={500}
        activeOpacity={0.85}
      >
        <CameraPlus size={28} color="#fff" weight="duotone" />
      </TouchableOpacity>

      {/* ── First-run voice discovery tip (Tier-1 #5) ── */}
      {showVoiceTip && (
        <TouchableOpacity
          accessibilityLabel="voice-tip"
          activeOpacity={0.85}
          onPress={dismissVoiceTip}
          style={fabStyles.voiceTip}
        >
          <View style={[fabStyles.voiceTipBubble, { backgroundColor: colors.text }]}>
            <Microphone size={14} color={colors.background} weight="regular" />
            <Text style={[fabStyles.voiceTipText, { color: colors.background }]}>
              {isNl ? 'Houd ingedrukt voor spraak' : 'Hold to speak'}
            </Text>
          </View>
          <View style={[fabStyles.voiceTipArrow, { borderTopColor: colors.text }]} />
        </TouchableOpacity>
      )}

      {/* ── Voice command sheet (Tier-1 #5) ── */}
      <VoiceCommandSheet
        visible={showVoiceSheet}
        onClose={() => setShowVoiceSheet(false)}
        onDispatched={(runId) => {
          setShowVoiceSheet(false);
          if (runId) {
            navigation.navigate('AgentRunDetail' as any, { runId });
          } else {
            navigation.navigate('MultiAgent' as any);
          }
        }}
      />

      {/* ── Capture Category Modal ── */}
      <Modal visible={showCaptureModal} transparent animationType="slide" onRequestClose={() => setShowCaptureModal(false)}>
        <TouchableOpacity style={fabStyles.modalOverlay} activeOpacity={1} onPress={() => setShowCaptureModal(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={[fabStyles.modalContent, { backgroundColor: colors.surface }]}>
              <View style={[fabStyles.handleBar, { backgroundColor: colors.border }]} />

              <Text style={[fabStyles.modalTitle, { color: colors.text }]}>Wat wil je vastleggen?</Text>
              <Text style={[fabStyles.modalSubtitle, { color: colors.textSecondary }]}>Start de wizard of pak een snelkoppeling</Text>

              {/* ── NIEUW: prominente Wizard CTA ── */}
              <TouchableOpacity
                style={fabStyles.wizardCta}
                onPress={handleOpenWizard}
                activeOpacity={0.85}
                testID="wizard-cta"
              >
                <LinearGradient
                  colors={brandGradient.deep as any}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={fabStyles.wizardCtaGradient}
                >
                  <View style={fabStyles.wizardCtaIcon}>
                    <Sparkle size={22} color="#fff" weight="fill" />
                  </View>
                  <View style={fabStyles.wizardCtaText}>
                    <Text style={fabStyles.wizardCtaTitle}>Capture-to-Publish Wizard</Text>
                    <Text style={fabStyles.wizardCtaSubtitle}>5 stappen: foto → bake → kanalen → preview → publish</Text>
                  </View>
                  <ArrowRight size={20} color="#fff" weight="bold" />
                </LinearGradient>
              </TouchableOpacity>

              <Text style={[fabStyles.sectionDivider, { color: colors.textTertiary }]}>OF KIES EEN CATEGORIE</Text>

              <View style={fabStyles.categoriesGrid}>
                {CAPTURE_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.key}
                    style={[fabStyles.categoryCard, { backgroundColor: cat.color + '08', borderColor: cat.color + '30' }]}
                    onPress={() => handleCaptureCategory(cat.key)}
                    activeOpacity={0.7}
                  >
                    <View style={[fabStyles.categoryIcon, { backgroundColor: cat.color + '18' }]}>
                      <MaterialCommunityIcons name={cat.icon} size={28} color={cat.color} />
                    </View>
                    <Text style={[fabStyles.categoryLabel, { color: colors.text }]}>{cat.label}</Text>
                    <Text style={[fabStyles.categoryDesc, { color: colors.textSecondary }]}>{cat.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[fabStyles.quickCapture, { borderColor: colors.border, backgroundColor: colors.background }]}
                onPress={() => handleCaptureCategory('quick')}
              >
                <CameraSlash size={20} color={colors.primary} weight="duotone" />
                <Text style={[fabStyles.quickCaptureText, { color: colors.primary }]}>Snel vastleggen</Text>
              </TouchableOpacity>

              <TouchableOpacity style={fabStyles.cancelBtn} onPress={() => setShowCaptureModal(false)}>
                <Text style={[fabStyles.cancelText, { color: colors.textSecondary }]}>Annuleren</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Root Navigator ─────────────────────────────────────────────────
export default function AppNavigator({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: fw.semibold as any },
        headerShadowVisible: false,
      }}
    >
      {!isLoggedIn ? (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabsWrapper} options={{ headerShown: false }} />

          {/* ─── Event Screens ─── */}
          <Stack.Screen name="EventSetup" component={EventSetupScreen} options={{ title: t.screenTitles.eventSetup }} />
          <Stack.Screen name="EventDashboard" component={EventDashboardScreen} options={{ title: t.screenTitles.event }} />
          <Stack.Screen name="LiveCapture" component={LiveCaptureScreen} options={{ headerShown: false }} />
          <Stack.Screen name="PostReview" component={PostReviewScreen} options={{ title: t.screenTitles.reviewPosts }} />
          <Stack.Screen name="StoryArc" component={StoryArcScreen} options={{ title: t.screenTitles.storyArc }} />
          <Stack.Screen name="EventRecap" component={EventRecapScreen} options={{ title: t.screenTitles.eventRecap }} />
          <Stack.Screen name="TeamManage" component={TeamManageScreen} options={{ title: t.screenTitles.team }} />
          <Stack.Screen name="EventScanner" component={EventScannerScreen} options={{ title: 'Event Scanner' }} />
          <Stack.Screen name="EventAttendees" component={EventAttendeesScreen} options={{ title: t.screenTitles.eventAttendees ?? 'Attendees' }} />
          <Stack.Screen name="EventShare" component={EventShareScreen} options={{ title: t.screenTitles.eventShare ?? 'Share Event' }} />

          {/* ─── Campaign Screens ─── */}
          <Stack.Screen name="CampaignList" component={CampaignListScreen} options={{ title: t.screenTitles.campaigns }} />
          <Stack.Screen name="CampaignCreate" component={CampaignCreateScreen} options={{ title: t.screenTitles.campaignCreate }} />
          <Stack.Screen name="CampaignDetail" component={CampaignDetailScreen} options={{ title: t.screenTitles.campaign }} />

          {/* ─── AI & Content ─── */}
          <Stack.Screen name="ContentCreator" component={ContentCreatorScreen} options={{ title: t.screenTitles.contentCreator }} />
          <Stack.Screen name="AICommand" component={AICommandScreen} options={{ title: t.screenTitles.aiCopilot }} />

          {/* ─── Networking / Contacts ─── */}
          <Stack.Screen name="SmartLead" component={SmartLeadScreen} options={{ title: t.screenTitles.smartLead ?? 'Smart Contact' }} />
          <Stack.Screen name="QRScan" component={QRScanScreen} options={{ headerShown: false }} />
          <Stack.Screen name="CardScan" component={CardScanScreen} options={{ headerShown: false }} />
          <Stack.Screen name="MyDigitalCard" component={MyDigitalCardScreen} options={{ title: t.screenTitles.myDigitalCard ?? 'My Digital Card' }} />
          <Stack.Screen name="NFCShare" component={NFCShareScreen} options={{ title: t.screenTitles.nfcShare ?? 'NFC Share' }} />
          <Stack.Screen name="LeadCapture" component={LeadCaptureScreen} options={{ title: t.screenTitles.leadCapture }} />

          {/* ─── Intelligence ─── */}
          <Stack.Screen name="OpportunityRadar" component={OpportunityRadarScreen} options={{ title: t.screenTitles.opportunityRadar ?? 'Opportunity Radar' }} />
          <Stack.Screen name="EventIntelligence" component={EventIntelligenceScreen} options={{ title: 'Event Intelligence' }} />
          <Stack.Screen name="OpportunityFeed" component={OpportunityFeedScreen} options={{ title: 'AI Opportunity Feed' }} />
          <Stack.Screen name="FollowedOrganizers" component={FollowedOrganizersScreen} options={{ title: 'Gevolgde Organisatoren' }} />

          {/* ─── Marketing Automation ─── */}
          <Stack.Screen name="MarketingAutomation" component={MarketingAutomationScreen} options={{ title: t.screenTitles.automation ?? 'Automation' }} />
          <Stack.Screen name="BudgetMonitor" component={BudgetMonitorScreen} options={{ title: t.screenTitles.marketingBudget }} />
          <Stack.Screen name="BoostFlow" component={BoostFlowScreen} options={{ title: 'Boost', headerShown: false }} />
          <Stack.Screen name="AMOSHub" component={AMOSHubScreen} options={{ headerShown: false }} />
          <Stack.Screen name="AutonomousHub" component={AutonomousHubScreen} options={{ headerShown: false }} />
          <Stack.Screen name="NetworkingEngine" component={NetworkingEngineScreen} options={{ title: 'Networking Engine' }} />

          {/* ─── Content Hubs ─── */}
          <Stack.Screen name="Products" component={ProductsScreen} options={{ headerShown: false }} />
          <Stack.Screen name="TeamDirectory" component={TeamDirectoryScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Organization" component={OrganizationScreen} options={{ headerShown: false }} />
          <Stack.Screen name="MarketingStrategy" component={MarketingStrategyScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Personas" component={PersonasScreen} options={{ headerShown: false }} />
          <Stack.Screen name="ContentProposals" component={ContentProposalsScreen} options={{ headerShown: false }} />
          <Stack.Screen name="ContentCalendar" component={ContentCalendarScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Analytics" component={AnalyticsScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
          <Stack.Screen name="AllPosts" component={AllPostsScreen} options={{ title: t.screenTitles.allPosts ?? 'Alle Posts' }} />
          <Stack.Screen name="MultiAgent" component={MultiAgentScreen} options={{ headerShown: false }} />
          <Stack.Screen name="AgentDetail" component={AgentDetailScreen} options={{ headerShown: false }} />
          <Stack.Screen name="AgentRunDetail" component={AgentRunDetailScreen} options={{ headerShown: false }} />
          {/* ─── Goal Mode (Tier-2) ─── */}
          <Stack.Screen name="GoalSetup" component={GoalSetupScreen} options={{ headerShown: false }} />
          <Stack.Screen name="GoalDetail" component={GoalDetailScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Integrations" component={IntegrationsScreen} options={{ headerShown: false }} />

          {/* ─── Content Library ─── */}
          <Stack.Screen name="Library" component={LibraryScreen} options={{ headerShown: false }} />
          <Stack.Screen name="LibraryImport" component={LibraryImportScreen} options={{ headerShown: false }} />
          <Stack.Screen name="LibraryPostDetail" component={LibraryPostDetailScreen} options={{ headerShown: false }} />

          {/* ─── Settings & Notifications ─── */}
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t.screenTitles.settings }} />
          <Stack.Screen name={'MFASetup' as any} component={MFASetupScreen} options={{ title: '2FA' }} />
          <Stack.Screen name="WhatsAppSettings" component={WhatsAppSettingsScreen} options={{ title: 'WhatsApp Business' }} />
          <Stack.Screen name="BrandKit" component={BrandKitScreen} options={{ title: t.screenTitles.brandKit ?? 'Brand Kit' }} />
          <Stack.Screen name="SocialMediaWizard" component={SocialMediaWizard} options={{ headerShown: false }} />
          <Stack.Screen name="CaptureWizard" component={CaptureWizardScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: t.screenTitles.notifications }} />
          <Stack.Screen name="DemoEnvironment" component={DemoEnvironmentScreen} options={{ title: t.screenTitles.demoEnvironment ?? 'Demo Omgeving' }} />
        </>
      )}
    </Stack.Navigator>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────
const { width: SCREEN_W } = Dimensions.get('window');

const fabStyles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 76,
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 100,
  },
  // Tier-1 #5 — first-run voice discovery tooltip, sits above the FAB.
  voiceTip: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 168 : 144,
    alignSelf: 'center',
    alignItems: 'center',
    zIndex: 101,
  },
  voiceTipBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  voiceTipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  voiceTipArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    paddingTop: 12,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: fw.bold as any,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  wizardCta: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#E8317A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  wizardCtaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  wizardCtaIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wizardCtaText: {
    flex: 1,
  },
  wizardCtaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  wizardCtaSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 16,
  },
  sectionDivider: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 12,
    marginTop: 4,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  categoryCard: {
    width: (SCREEN_W - 52) / 2,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  categoryIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: fw.bold as any,
    textAlign: 'center',
  },
  categoryDesc: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
  },
  quickCapture: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  quickCaptureText: {
    fontSize: 14,
    fontWeight: fw.semibold as any,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: fw.medium as any,
  },
});
