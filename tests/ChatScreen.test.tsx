import React from 'react';
import { render } from '@testing-library/react-native';
import ChatScreen from '../src/screens/ChatScreen';

// Mock dependencies
jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn()
}));

jest.mock('../src/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn().mockResolvedValue({ data: { response: 'Hola' }, error: null })
    }
  }
}));

jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('lottie-react-native', () => 'LottieView');

describe('ChatScreen', () => {
  it('is defined and can be imported', () => {
    expect(ChatScreen).toBeDefined();
  });
});
