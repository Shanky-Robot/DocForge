import { create } from 'zustand';

export type Theme = 'light' | 'dark';
export type ConnectionStatus = 'disconnected' | 'connected' | 'error';
export type ProcessingMode = 'bulk' | 'semantic';
export type OutputType = 'BRD' | 'FRD' | 'PRD' | 'CRD' | 'PRESENTATION';
export type BaseTemplate = 'default' | 'enterprise' | 'custom';

export interface AppState {
  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;

  // Connection State
  selectedProvider: string;
  primaryUrl: string;
  fallbackUrl: string;
  apiKey: string;
  connectionStatus: ConnectionStatus;
  connectionMessage: string;
  setSelectedProvider: (provider: string) => void;
  setPrimaryUrl: (url: string) => void;
  setFallbackUrl: (url: string) => void;
  setApiKey: (key: string) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setConnectionMessage: (msg: string) => void;

  // Form State
  projectName: string;
  files: File[];
  outputType: OutputType;
  baseTemplate: BaseTemplate | string;
  templateFile: File | null;
  processingMode: ProcessingMode;
  creatorName: string;
  webSearchEnabled: boolean;
  mcpServerUrl: string;
  
  // Actions
  setProjectName: (name: string) => void;
  setFiles: (files: File[]) => void;
  setOutputType: (type: OutputType) => void;
  setBaseTemplate: (template: BaseTemplate | string) => void;
  setTemplateFile: (file: File | null) => void;
  setProcessingMode: (mode: ProcessingMode) => void;
  setCreatorName: (name: string) => void;
  setWebSearchEnabled: (enabled: boolean) => void;
  setMcpServerUrl: (url: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Theme
  theme: 'dark',
  setTheme: (theme) => set({ theme }),

  // Connection State
  selectedProvider: 'Local Server',
  primaryUrl: 'http://localhost:1234/v1',
  fallbackUrl: '',
  apiKey: '',
  connectionStatus: 'disconnected',
  connectionMessage: 'Offline',
  setSelectedProvider: (provider) => set({ selectedProvider: provider }),
  setPrimaryUrl: (url) => set({ primaryUrl: url }),
  setFallbackUrl: (url) => set({ fallbackUrl: url }),
  setApiKey: (key) => set({ apiKey: key }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setConnectionMessage: (msg) => set({ connectionMessage: msg }),

  // Form State
  projectName: '',
  files: [],
  outputType: 'BRD',
  baseTemplate: 'default',
  templateFile: null,
  processingMode: 'semantic',
  creatorName: 'John Doe',
  webSearchEnabled: false,
  mcpServerUrl: 'http://localhost:3000',
  
  // Actions
  setProjectName: (name) => set({ projectName: name }),
  setFiles: (files) => set({ files }),
  setOutputType: (type) => set({ outputType: type }),
  setBaseTemplate: (template) => set({ baseTemplate: template }),
  setTemplateFile: (file) => set({ templateFile: file }),
  setProcessingMode: (mode) => set({ processingMode: mode }),
  setCreatorName: (name) => set({ creatorName: name }),
  setWebSearchEnabled: (enabled) => set({ webSearchEnabled: enabled }),
  setMcpServerUrl: (url) => set({ mcpServerUrl: url }),
}));
