import { View, Text, Pressable, StyleSheet, Platform, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, ScrollView } from 'react-native';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { apiRequest, queryClient } from '@/lib/query-client';
import { useAuth } from '@/contexts/AuthContext';

const STAR_LABELS = ['', 'Poor', 'Below Average', 'Good', 'Very Good', 'Excellent'];

export default function ReviewScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    jobId: string;
    revieweeId: string;
    revieweeName: string;
    material: string;
  }>();

  const { data: jobData, isLoading: jobLoading } = useQuery<any>({
    queryKey: [`/api/jobs/${params.jobId}`],
    enabled: !!params.jobId && !params.revieweeId,
  });

  const resolvedRevieweeId = params.revieweeId || (() => {
    if (!jobData || !user) return '';
    const job = jobData.job || jobData;
    return job.contractor_id === user.id ? (job.driver_id || '') : (job.contractor_id || '');
  })();

  const resolvedRevieweeName = params.revieweeName || (() => {
    if (!jobData || !user) return '';
    const job = jobData.job || jobData;
    const contractor = jobData.contractor || job.contractor;
    if (job.contractor_id === user.id) {
      return job.driver_name || job.driver?.full_name || 'Driver';
    }
    return contractor?.company || contractor?.full_name || 'Contractor';
  })();

  const resolvedMaterial = params.material || jobData?.job?.material || jobData?.material || '';

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (jobLoading && !params.revieweeId) {
    return (
      <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
        <View style={styles.successContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  async function handleSubmit() {
    if (rating === 0) {
      Alert.alert('Rating Required', 'Please select a star rating before submitting.');
      return;
    }

    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);

    try {
      await apiRequest('POST', '/api/reviews', {
        jobId: params.jobId,
        revieweeId: resolvedRevieweeId,
        rating,
        comment: comment.trim() || null,
      });

      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ['/api/reviews/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });

      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (err: any) {
      const msg = err?.message || 'Failed to submit review';
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  }

  function handleStarPress(star: number) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRating(star);
  }

  if (submitted) {
    return (
      <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
        <View style={styles.successContainer}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={48} color={Colors.success} />
          </View>
          <Text style={styles.successTitle}>Review Submitted</Text>
          <Text style={styles.successText}>Thanks for your feedback!</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>LEAVE A REVIEW</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.jobInfoCard}>
            <View style={styles.jobInfoIcon}>
              <Ionicons name="briefcase" size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.jobMaterial}>{resolvedMaterial || 'Hauling Job'}</Text>
              <Text style={styles.jobLabel}>Job completed</Text>
            </View>
          </View>

          <View style={styles.revieweeSection}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={32} color={Colors.textMuted} />
            </View>
            <Text style={styles.revieweeName}>{resolvedRevieweeName || 'User'}</Text>
            <Text style={styles.ratePrompt}>How was your experience?</Text>
          </View>

          <View style={styles.starsContainer}>
            {[1, 2, 3, 4, 5].map(star => (
              <Pressable
                key={star}
                onPress={() => handleStarPress(star)}
                style={styles.starBtn}
              >
                <Ionicons
                  name={star <= rating ? 'star' : 'star-outline'}
                  size={44}
                  color={star <= rating ? Colors.primary : Colors.textMuted}
                />
              </Pressable>
            ))}
          </View>
          {rating > 0 && (
            <Text style={styles.ratingLabel}>{STAR_LABELS[rating]}</Text>
          )}

          <View style={styles.commentSection}>
            <Text style={styles.commentLabel}>ADDITIONAL COMMENTS</Text>
            <TextInput
              style={styles.commentInput}
              placeholder="Share details about your experience..."
              placeholderTextColor={Colors.textMuted}
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={styles.charCount}>{comment.length}/500</Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.submitBtn,
              rating === 0 && styles.submitBtnDisabled,
              pressed && { opacity: 0.85 },
            ]}
            onPress={handleSubmit}
            disabled={submitting || rating === 0}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.submitBtnText}>SUBMIT REVIEW</Text>
            )}
          </Pressable>

          <Pressable onPress={() => router.back()} style={styles.skipBtn}>
            <Text style={styles.skipBtnText}>Skip for Now</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 14,
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  content: {
    padding: 20,
    gap: 24,
  },
  jobInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  jobInfoIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobMaterial: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
  },
  jobLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
  },
  revieweeSection: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revieweeName: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 20,
    color: Colors.text,
  },
  ratePrompt: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  starBtn: {
    padding: 4,
  },
  ratingLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.primary,
    textAlign: 'center',
    marginTop: -12,
  },
  commentSection: {
    gap: 8,
  },
  commentLabel: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 11,
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  commentInput: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.text,
    minHeight: 100,
  },
  charCount: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'right',
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 15,
    color: '#000',
    letterSpacing: 1,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  skipBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.textMuted,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  successCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 22,
    color: Colors.text,
  },
  successText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
  },
});
