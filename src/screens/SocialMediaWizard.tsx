/**
 * SocialMediaWizard — guided flow for connecting social media accounts
 * with AI-driven brand voice analysis.
 *
 * Flow:
 *   goal       → select platforms (with AI recommendation)
 *   status     → per-platform readiness check
 *   connect    → OAuth + disconnect via existing oauth-callback
 *   verify     → show discovered accounts + flag issues
 *   brandVoice → optional AI brand voice analysis
 *   firstPost  → CTA to LiveCapture or close
 */

import React from 'react';
import { View, SafeAreaView, TouchableOpacity, Text, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useTheme } from '../context/ThemeContext';
import { spacing, fontSize, fontWeight } from '../theme';
import { useSocialWizard } from '../hooks/useSocialWizard';
import type { RootStackParamList } from '../types';

import WizardProgress from '../components/wizard/WizardProgress';
import StepGoal from '../components/wizard/StepGoal';
import StepStatus from '../components/wizard/StepStatus';
import StepConnect from '../components/wizard/StepConnect';
import StepVerify from '../components/wizard/StepVerify';
import StepBrandVoice from '../components/wizard/StepBrandVoice';
import StepFirstPost from '../components/wizard/StepFirstPost';

import { X } from 'phosphor-react-native';
type Nav = NativeStackNavigationProp<RootStackParamList, 'SocialMediaWizard'>;
type Route = RouteProp<RootStackParamList, 'SocialMediaWizard'>;

export default function SocialMediaWizard() {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const initialStep = route.params?.initialStep ?? 'goal';

  const wizard = useSocialWizard(initialStep);

  const handleClose = () => {
    if (wizard.step === 'goal' || wizard.step === 'firstPost') {
      navigation.goBack();
    } else {
      Alert.alert(
        'Wizard sluiten?',
        'Je voortgang wordt niet bewaard. Volgende keer begin je opnieuw.',
        [
          { text: 'Doorgaan', style: 'cancel' },
          { text: 'Sluiten', style: 'destructive', onPress: () => navigation.goBack() },
        ],
      );
    }
  };

  const handleCreatePost = () => {
    navigation.replace('LiveCapture', { eventId: '' });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <TouchableOpacity onPress={handleClose} style={{ padding: 6 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <X size={24} color={colors.text} weight="bold" />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginLeft: spacing.sm }}>
          Social media wizard
        </Text>
      </View>

      {/* Progress */}
      <WizardProgress currentStep={wizard.step} />

      {/* Step body */}
      <View style={{ flex: 1 }}>
        {wizard.step === 'goal' && (
          <StepGoal
            selectedPlatforms={wizard.selectedPlatforms}
            togglePlatform={wizard.togglePlatform}
            fetchRecommendations={wizard.fetchRecommendations}
            goNext={wizard.goNext}
          />
        )}

        {wizard.step === 'status' && (
          <StepStatus
            selectedPlatforms={wizard.selectedPlatforms}
            socialAccounts={wizard.socialAccounts}
            goNext={wizard.goNext}
            goBack={wizard.goBack}
          />
        )}

        {wizard.step === 'connect' && (
          <StepConnect
            selectedPlatforms={wizard.selectedPlatforms}
            socialAccounts={wizard.socialAccounts}
            connectionStatuses={wizard.connectionStatuses}
            setPlatformStatus={wizard.setPlatformStatus}
            fetchPrerequisiteExplain={wizard.fetchPrerequisiteExplain}
            fetchScopeExplain={wizard.fetchScopeExplain}
            fetchErrorTroubleshoot={wizard.fetchErrorTroubleshoot}
            refetchAccounts={wizard.refetchAccounts}
            goNext={wizard.goNext}
            goBack={wizard.goBack}
          />
        )}

        {wizard.step === 'verify' && (
          <StepVerify
            selectedPlatforms={wizard.selectedPlatforms}
            socialAccounts={wizard.socialAccounts}
            goNext={wizard.goNext}
            goBack={wizard.goBack}
          />
        )}

        {wizard.step === 'brandVoice' && (
          <StepBrandVoice
            socialAccounts={wizard.socialAccounts}
            brandVoiceProfile={wizard.brandVoiceProfile}
            analyzeBrandVoice={wizard.analyzeBrandVoice}
            goNext={wizard.goNext}
            goBack={wizard.goBack}
          />
        )}

        {wizard.step === 'firstPost' && (
          <StepFirstPost
            connectedCount={wizard.socialAccounts.filter(a => a.status === 'active').length}
            onCreatePost={handleCreatePost}
            onClose={() => navigation.goBack()}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
