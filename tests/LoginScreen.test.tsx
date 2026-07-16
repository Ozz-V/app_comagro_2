import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import LoginScreen from '../src/screens/LoginScreen';

jest.mock('../src/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null }),
    auth: {
      signInWithOtp: jest.fn().mockResolvedValue({ error: null }),
    }
  }
}));

jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('lottie-react-native', () => 'LottieView');

describe('LoginScreen', () => {
  it('is defined and can be imported', () => {
    expect(LoginScreen).toBeDefined();
  });
});
