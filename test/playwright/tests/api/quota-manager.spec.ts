/**
 * API Tests for quota manager
 */
import { test, expect } from '../../utils/test-utils';
import { quotaManager } from '../../../../magi/src/utils/quota_manager.js';

test.describe('Quota Manager', () => {
  test('should track quota usage correctly', async () => {
    // Reset quotas before testing
    // Use private method directly or recreate the instance
    (quotaManager as any).initializeProviderQuotas();
    
    // Get initial quota for Google provider
    const initialQuota = quotaManager.getQuota('google');
    expect(initialQuota.dailyUsed).toBe(0);
    
    // Track usage for experimental model
    const result = quotaManager.trackUsage('google', 'gemini-2.5-pro-exp-03-25', 1000, 500);
    expect(result).toBeTruthy(); // Quota should be available
    
    // Verify usage was recorded
    const updatedQuota = quotaManager.getQuota('google');
    expect(updatedQuota.dailyUsed).toBe(1500); // 1000 input + 500 output
    
    // Track more usage to potentially exceed limit
    const additionalUsage = quotaManager.trackUsage(
      'google', 
      'gemini-2.5-pro-exp-03-25', 
      initialQuota.dailyLimit * 2, // Exceed the daily limit
      0
    );
    
    // Should return false when quota is exceeded
    expect(additionalUsage).toBeFalsy();
    
    // Get the quota summary
    const summary = quotaManager.getSummary();
    expect(summary.google).toBeDefined();
    expect(summary.google.dailyUsed).toBeGreaterThan(initialQuota.dailyLimit);
  });
  
  test('should track credit usage correctly', async () => {
    // Reset quotas before testing
    (quotaManager as any).initializeProviderQuotas();
    
    // Get initial quota for OpenAI provider
    const initialQuota = quotaManager.getQuota('openai');
    expect(initialQuota.creditBalance).toBeDefined();
    const initialBalance = initialQuota.creditBalance;
    
    // Track credit usage
    const creditAmount = 10.5; // $10.50
    quotaManager.trackCreditUsage('openai', creditAmount);
    
    // Verify credit usage was recorded
    const updatedQuota = quotaManager.getQuota('openai');
    expect(updatedQuota.creditBalance).toBe(initialBalance - creditAmount);
    
    // Verify we can get the credit balance
    const balance = quotaManager.getCreditBalance('openai');
    expect(balance).toBe(initialBalance - creditAmount);
    
    // Get the quota summary
    const summary = quotaManager.getSummary();
    expect(summary.openai).toBeDefined();
    expect(summary.openai.creditBalance).toBe(initialBalance - creditAmount);
  });
  
  test('should detect when OpenAI free tier is used up', async () => {
    // Reset quotas before testing
    (quotaManager as any).initializeProviderQuotas();
    
    // Check initial status
    const hasInitialQuota = quotaManager.hasOpenAIFreeQuota('gpt-4o');
    expect(hasInitialQuota).toBeTruthy();
    
    // Get OpenAI quota to access the free tier info
    const openaiQuota = quotaManager.getQuota('openai');
    expect(openaiQuota.info).toBeDefined();
    expect(openaiQuota.info.freeQuota).toBeDefined();
    
    // Track enough usage to use up the GPT-4 family quota
    const gpt4Limit = openaiQuota.info.freeQuota.gpt4Family.limit;
    quotaManager.trackUsage('openai', 'gpt-4o', gpt4Limit, 0);
    
    // Check if quota is used up
    const hasRemainingQuota = quotaManager.hasOpenAIFreeQuota('gpt-4o');
    expect(hasRemainingQuota).toBeFalsy();
    
    // Mini models should still have quota
    const hasMiniQuota = quotaManager.hasOpenAIFreeQuota('gpt-4o-mini');
    expect(hasMiniQuota).toBeTruthy();
  });
  
  test('should reset daily quotas on day change', async () => {
    // Reset quotas before testing
    (quotaManager as any).initializeProviderQuotas();
    
    // Track some usage
    quotaManager.trackUsage('google', 'gemini-2.5-pro-exp-03-25', 1000, 500);
    
    // Get quota after usage
    const quotaAfterUsage = quotaManager.getQuota('google');
    expect(quotaAfterUsage.dailyUsed).toBe(1500);
    
    // Simulate a day change by manipulating the last reset date
    // Set it to yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    quotaAfterUsage.lastResetDate = yesterday;
    
    // Track usage again, which should trigger a reset
    quotaManager.trackUsage('google', 'gemini-2.5-pro-exp-03-25', 100, 50);
    
    // Get quota after reset
    const quotaAfterReset = quotaManager.getQuota('google');
    expect(quotaAfterReset.dailyUsed).toBe(150); // Only today's usage
    expect(quotaAfterReset.lastResetDate.getDate()).toBe(new Date().getDate()); // Updated to today
  });
});