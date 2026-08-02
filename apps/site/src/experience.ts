import { useEffect, useState } from 'react';

export interface ActivationState {
  proofCompleted: boolean;
  receiptInspected: boolean;
  selectedClient: 'typescript' | 'python' | 'mcp' | null;
}

const initialState: ActivationState = {
  proofCompleted: false,
  receiptInspected: false,
  selectedClient: null,
};

const key = 'clervo.activation.v1';

function read(): ActivationState {
  if (typeof localStorage === 'undefined') return initialState;
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<ActivationState> | null;
    if (value === null) return initialState;
    return {
      proofCompleted: value.proofCompleted === true,
      receiptInspected: value.receiptInspected === true,
      selectedClient: ['typescript', 'python', 'mcp'].includes(value.selectedClient ?? '')
        ? value.selectedClient as ActivationState['selectedClient']
        : null,
    };
  } catch {
    return initialState;
  }
}

export function useActivation(): [
  ActivationState,
  (next: Partial<ActivationState>) => void,
] {
  const [state, setState] = useState<ActivationState>(initialState);
  const update = (next: Partial<ActivationState>) => {
    setState((current) => {
      const value = { ...current, ...next };
      localStorage.setItem(key, JSON.stringify(value));
      return value;
    });
  };
  useEffect(() => {
    setState(read());
    const onStorage = () => setState(read());
    addEventListener('storage', onStorage);
    return () => removeEventListener('storage', onStorage);
  }, []);
  return [state, update];
}
