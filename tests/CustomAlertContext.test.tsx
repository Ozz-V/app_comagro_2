import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity, View } from 'react-native';
import { CustomAlertProvider, useCustomAlert } from '../src/contexts/CustomAlertContext';

// Mocks correctos
jest.mock('lottie-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function MockLottieView() { return React.createElement(View, { testID: 'lottie-view' }); };
});

const TestComponent = () => {
  const { showAlert, showToast } = useCustomAlert();
  return (
    <View>
      <TouchableOpacity testID="btn-toast" onPress={() => showToast('Mensaje de prueba')}>
        <Text>Show Toast</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="btn-alert" onPress={() => showAlert('Titulo', 'Mensaje de alerta')}>
        <Text>Show Alert</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="btn-alert-custom" onPress={() => showAlert('Atencion', 'Cuidado', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Aceptar', onPress: () => {} }])}>
        <Text>Show Custom Alert</Text>
      </TouchableOpacity>
    </View>
  );
};

describe('CustomAlertContext', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders and shows toast correctly', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <CustomAlertProvider>
          <TestComponent />
        </CustomAlertProvider>
      );
    });

    const hasText = (text: string) => {
      try {
        return component!.root.findAllByProps({ children: text }).length > 0;
      } catch {
        return false;
      }
    };

    expect(hasText('Mensaje de prueba')).toBe(false);

    act(() => {
      component!.root.findByProps({ testID: 'btn-toast' }).props.onPress();
    });

    expect(hasText('Mensaje de prueba')).toBe(true);

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(hasText('Mensaje de prueba')).toBe(false);
  });

  it('renders and shows alert correctly', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <CustomAlertProvider>
          <TestComponent />
        </CustomAlertProvider>
      );
    });

    const hasText = (text: string) => {
      try {
        return component!.root.findAllByProps({ children: text }).length > 0;
      } catch {
        return false;
      }
    };

    expect(hasText('Titulo')).toBe(false);

    act(() => {
      component!.root.findByProps({ testID: 'btn-alert' }).props.onPress();
    });

    expect(hasText('Titulo')).toBe(true);
    expect(hasText('Mensaje de alerta')).toBe(true);
    expect(hasText('OK')).toBe(true);

    act(() => {
      const btns = component!.root.findAllByType(TouchableOpacity);
      const okBtn = btns.find((b: any) => {
        try { return b.findByType(Text).props.children === 'OK'; } catch { return false; }
      });
      okBtn!.props.onPress();
    });

    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(hasText('Titulo')).toBe(false);
  });

  it('renders and shows custom alert with buttons', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <CustomAlertProvider>
          <TestComponent />
        </CustomAlertProvider>
      );
    });

    const hasText = (text: string) => {
      try {
        return component!.root.findAllByProps({ children: text }).length > 0;
      } catch {
        return false;
      }
    };

    act(() => {
      component!.root.findByProps({ testID: 'btn-alert-custom' }).props.onPress();
    });

    expect(hasText('Atencion')).toBe(true);
    expect(hasText('Cuidado')).toBe(true);
    expect(hasText('Cancelar')).toBe(true);
    expect(hasText('Aceptar')).toBe(true);

    act(() => {
      const btns = component!.root.findAllByType(TouchableOpacity);
      const cancelBtn = btns.find((b: any) => {
        try { return b.findByType(Text).props.children === 'Cancelar'; } catch { return false; }
      });
      cancelBtn!.props.onPress();
    });

    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(hasText('Atencion')).toBe(false);
  });
});
