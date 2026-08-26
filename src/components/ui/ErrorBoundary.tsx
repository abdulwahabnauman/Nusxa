/**
 * ErrorBoundary — app-wide crash guard.
 * Catches render-time errors anywhere below it and shows a friendly,
 * translated screen with a retry action and an option to share the
 * error details, instead of the raw red-box crash.
 */

import React from 'react';
import { View, Text, Share } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';
import { useI18n } from '../../i18n';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorScreen error={this.state.error} onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}

function ErrorScreen({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const { colors, typography, spacing } = useTheme();
  const { t } = useI18n();

  const shareDetails = async () => {
    try {
      await Share.share({
        message: `Nusxa error:\n${error?.message ?? 'Unknown error'}\n${error?.stack ?? ''}`.trim(),
      });
    } catch {
      // Sharing is best-effort
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background.primary,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: colors.error + '1F',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialCommunityIcons name="emoticon-sad-outline" size={36} color={colors.error} />
      </View>
      <Text
        style={[
          typography.heading.h3,
          { color: colors.text.primary, marginTop: spacing.base, textAlign: 'center' },
        ]}
      >
        {t.errorBoundary.title}
      </Text>
      <Text
        style={[
          typography.body.base,
          { color: colors.text.secondary, marginTop: spacing.sm, textAlign: 'center' },
        ]}
      >
        {t.errorBoundary.message}
      </Text>
      <View style={{ width: '100%', marginTop: spacing.xl }}>
        <Button title={t.errorBoundary.retry} onPress={onRetry} size="lg" />
        <Button
          title={t.errorBoundary.shareDetails}
          variant="ghost"
          onPress={shareDetails}
          style={{ marginTop: spacing.sm }}
        />
      </View>
    </View>
  );
}
