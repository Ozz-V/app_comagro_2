import * as Notifications from 'expo-notifications';

jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { eas: { projectId: 'test-project-id' } } }, easConfig: {} },
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  AndroidImportance: { MAX: 5 },
}));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import { registerForPushNotificationsAsync } from '../src/utils/pushNotifications';

describe('pushNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: 'ExponentPushToken[abc123]' });
  });

  it('returns a token when permissions are already granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    const token = await registerForPushNotificationsAsync();
    expect(token).toBe('ExponentPushToken[abc123]');
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests permission when not already granted, and returns token if accepted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    const token = await registerForPushNotificationsAsync();
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    expect(token).toBe('ExponentPushToken[abc123]');
  });

  it('returns null when permission is denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    const token = await registerForPushNotificationsAsync();
    expect(token).toBeNull();
  });

  it('returns undefined without asking for permissions on a non-physical device (emulator)', async () => {
    const deviceMock = jest.requireMock('expo-device') as { isDevice: boolean };
    deviceMock.isDevice = false;
    try {
      const token = await registerForPushNotificationsAsync();
      expect(token).toBeUndefined();
      expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    } finally {
      deviceMock.isDevice = true; // restaurar para no afectar otros tests
    }
  });

  it('swallows errors from getExpoPushTokenAsync and returns undefined instead of throwing', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValue(new Error('network down'));
    const token = await registerForPushNotificationsAsync();
    expect(token).toBeUndefined();
  });

  it('sets up the Android notification channel on android', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    await registerForPushNotificationsAsync();
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('default', expect.objectContaining({ name: 'default' }));
  });
});
