import { useState, useMemo } from 'react';
import { PumpWizardState } from '../types';

export const useCalculatorState = () => {
  const [calcMode, setCalcMode] = useState('');
  const [calcInput, setCalcInput] = useState('');
  
  const [bombaTab, setBombaTab] = useState<'guiado' | 'avanzado'>('guiado');
  const [wizardStep, setWizardStep] = useState(1);
  const [pumpWizard, setPumpWizard] = useState<PumpWizardState & { hp?: string }>({ uso: '', caudal: '', unidadCaudal: 'l/min', altura: '', fase: '', hp: '' });
  const [adv, setAdv] = useState({ caudal: '', diamIdx: 4, lRecta: '', hGeo: '', acc: [0,0,0,0,0,0], unidadCaudal: 'm3/h' as 'l/min' | 'm3/h' | 'l/h' });
  const [showDiamPicker, setShowDiamPicker] = useState(false);
  const [showUsosMenu, setShowUsosMenu] = useState(false);
  
  const [genUnit, setGenUnit] = useState<'KVA'|'AMPER'>('KVA');
  const [genFase, setGenFase] = useState<'220v'|'380v'>('380v');
  const [genStats, setGenStats] = useState({ min380: 0, max220: 0 });
  
  const [motorState, setMotorState] = useState({ hp: '', polos: '', fase: '' });
  const [motorWarning, setMotorWarning] = useState<string | null>(null);
  
  const [calcResult, setCalcResult] = useState<any[] | null>(null);
  const [motorResult, setMotorResult] = useState<any[] | null>(null);
  const [motorResultTitle, setMotorResultTitle] = useState('Motores Sugeridos (Eje Libre):');
  const [hasCalculated, setHasCalculated] = useState(false);
  const [waitingForCatalog, setWaitingForCatalog] = useState(false);
  
  const stepHp = (current: number, dir: 'up'|'down') => {
    const steps = [0.5, 0.75, 1, 1.5, 2, 3, 4, 5.5, 7.5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150];
    const idx = steps.findIndex(v => v >= current);
    if (dir === 'up') {
       if (idx === -1) return current + 1;
       if (steps[idx] === current && idx < steps.length - 1) return steps[idx + 1];
       return steps[idx];
    } else {
       if (current <= steps[0]) return steps[0];
       let lowerIdx = steps.findIndex(v => v >= current);
       if (lowerIdx > 0 && steps[lowerIdx] >= current) lowerIdx--;
       return steps[lowerIdx >= 0 ? lowerIdx : 0];
    }
  };

  return {
    calcMode, setCalcMode,
    calcInput, setCalcInput,
    bombaTab, setBombaTab,
    wizardStep, setWizardStep,
    pumpWizard, setPumpWizard,
    adv, setAdv,
    showDiamPicker, setShowDiamPicker,
    showUsosMenu, setShowUsosMenu,
    genUnit, setGenUnit,
    genFase, setGenFase,
    genStats, setGenStats,
    motorState, setMotorState,
    motorWarning, setMotorWarning,
    calcResult, setCalcResult,
    motorResult, setMotorResult,
    motorResultTitle, setMotorResultTitle,
    hasCalculated, setHasCalculated,
    waitingForCatalog, setWaitingForCatalog,
    stepHp
  };
};


