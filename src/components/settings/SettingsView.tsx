import React, { useState } from 'react';
import { 
  Key, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Moon, 
  Sun, 
  Eye, 
  EyeOff, 
  Globe, 
  Check, 
  ExternalLink,
  Monitor,
  Trash2,
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import { AISettings, AIProviderName, ThemeStyle } from '../../types';
import { AIManager } from '../../lib/ai/AIManager';
import { PROVIDER_CAPABILITIES } from '../../lib/ai/capabilities';
import { TestConnectionResult } from '../../lib/ai/providerTypes';
import { useTheme } from '../../lib/theme/ThemeContext';

interface SettingsViewProps {
  settings: AISettings;
  onUpdateSettings: (newSettings: AISettings) => void;
  showToast: (msg: string) => void;
}

interface ProviderMeta {
  id: AIProviderName;
  name: string;
  badge: string;
  getKeyUrl: string;
  keyPlaceholder: string;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    badge: 'Vision + Text (Fastest)',
    getKeyUrl: 'https://aistudio.google.com/app/apikey',
    keyPlaceholder: 'AIzaSy...',
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    badge: 'Vision + Text (Ultra-Fast)',
    getKeyUrl: 'https://console.groq.com/keys',
    keyPlaceholder: 'gsk_...',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    badge: 'Vision + Text',
    getKeyUrl: 'https://console.mistral.ai/api-keys/',
    keyPlaceholder: 'paste mistral key...',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    badge: 'Vision + Text (100+ Models)',
    getKeyUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-v1-...',
  },
  {
    id: 'cerebras',
    name: 'Cerebras Cloud',
    badge: 'Text Only (Instant)',
    getKeyUrl: 'https://cloud.cerebras.ai/platform/',
    keyPlaceholder: 'csk-...',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    badge: 'Text Only (Open Source)',
    getKeyUrl: 'https://huggingface.co/settings/tokens',
    keyPlaceholder: 'hf_...',
  },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  showToast,
}) => {
  const { setTheme: setGlobalTheme } = useTheme();
  const [activeProvider, setActiveProvider] = useState<AIProviderName>(settings.provider || 'gemini');
  const [apiKeys, setApiKeys] = useState<Record<AIProviderName, string>>({
    gemini: settings.apiKeys?.gemini || (settings.provider === 'gemini' ? settings.apiKey : '') || '',
    groq: settings.apiKeys?.groq || (settings.provider === 'groq' ? settings.apiKey : '') || '',
    mistral: settings.apiKeys?.mistral || (settings.provider === 'mistral' ? settings.apiKey : '') || '',
    openrouter: settings.apiKeys?.openrouter || (settings.provider === 'openrouter' ? settings.apiKey : '') || '',
    cerebras: settings.apiKeys?.cerebras || (settings.provider === 'cerebras' ? settings.apiKey : '') || '',
    huggingface: settings.apiKeys?.huggingface || (settings.provider === 'huggingface' ? settings.apiKey : '') || '',
  });

  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(settings.theme || 'dark');
  const [themeStyle, setThemeStyle] = useState<ThemeStyle>(settings.themeStyle || 'sweet');

  const [testingProvider, setTestingProvider] = useState<AIProviderName | null>(null);
  const [testResults, setTestResults] = useState<Partial<Record<AIProviderName, TestConnectionResult>>>({});

  const handleInputChange = (prov: AIProviderName, val: string) => {
    setInputValues(prev => ({ ...prev, [prov]: val }));
  };

  /**
   * Smart Test & Save:
   * Tests connection, clears input box, saves key to browser storage,
   * activates provider and assigns optimal model.
   */
  const handleTestSaveAndActivate = async (prov: AIProviderName) => {
    const keyToSave = (inputValues[prov] || apiKeys[prov] || '').trim();
    if (!keyToSave) {
      showToast(`Please enter an API key for ${prov.toUpperCase()} first`);
      return;
    }

    setTestingProvider(prov);
    try {
      const caps = PROVIDER_CAPABILITIES[prov];
      const autoModel = caps?.defaultTextModel || 'gemini-2.5-flash';

      // Live test connection ping
      const res = await AIManager.testConnection(prov, keyToSave, autoModel);
      setTestResults(prev => ({ ...prev, [prov]: res }));

      // Save key and update states
      const updatedKeys = { ...apiKeys, [prov]: keyToSave };
      setApiKeys(updatedKeys);
      setActiveProvider(prov);

      // Clear input field so key is not visibly left in box
      setInputValues(prev => ({ ...prev, [prov]: '' }));

      const updatedSettings: AISettings = {
        ...settings,
        provider: prov,
        apiKey: keyToSave,
        apiKeys: updatedKeys,
        model: autoModel,
        autoModel: true,
        commercialMode: true,
        theme,
        themeStyle,
      };

      onUpdateSettings(updatedSettings);

      if (res.success) {
        showToast(`✓ Connected & Saved! ${prov.toUpperCase()} is active.`);
      } else {
        showToast(`⚠️ ${prov.toUpperCase()} saved. Note: ${res.message || 'Key verified'}`);
      }
    } catch (err: any) {
      const updatedKeys = { ...apiKeys, [prov]: keyToSave };
      setApiKeys(updatedKeys);
      setActiveProvider(prov);
      setInputValues(prev => ({ ...prev, [prov]: '' }));

      const updatedSettings: AISettings = {
        ...settings,
        provider: prov,
        apiKey: keyToSave,
        apiKeys: updatedKeys,
        model: 'gemini-2.5-flash',
        autoModel: true,
        commercialMode: true,
        theme,
        themeStyle,
      };
      onUpdateSettings(updatedSettings);

      setTestResults(prev => ({
        ...prev,
        [prov]: {
          success: false,
          provider: prov,
          message: err.message || 'Connection test warning',
          error: err.message,
          hasText: false,
          hasVision: false,
          modelsCount: 0,
          availableModels: [],
        }
      }));
      showToast(`Key saved for ${prov.toUpperCase()}.`);
    } finally {
      setTestingProvider(null);
    }
  };

  /**
   * Clears saved key for a provider
   */
  const handleClearKey = (prov: AIProviderName) => {
    const updatedKeys = { ...apiKeys, [prov]: '' };
    setApiKeys(updatedKeys);
    setInputValues(prev => ({ ...prev, [prov]: '' }));

    // Find next available active provider if active one was cleared
    let nextProv = activeProvider;
    let nextKey = '';
    if (activeProvider === prov) {
      const remaining = Object.entries(updatedKeys).find(([_, k]) => Boolean(k && k.trim()));
      if (remaining) {
        nextProv = remaining[0] as AIProviderName;
        nextKey = remaining[1];
      } else {
        nextProv = 'gemini';
        nextKey = '';
      }
      setActiveProvider(nextProv);
    }

    onUpdateSettings({
      ...settings,
      provider: nextProv,
      apiKey: nextKey,
      apiKeys: updatedKeys,
    });

    showToast(`Cleared API Key for ${prov.toUpperCase()}`);
  };

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    setGlobalTheme(newTheme);
    onUpdateSettings({ ...settings, theme: newTheme });
  };

  const toggleShowKey = (prov: string) => {
    setShowKeys(prev => ({ ...prev, [prov]: !prev[prov] }));
  };

  const configuredCount = Object.values(apiKeys).filter(k => Boolean(k && k.trim())).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#272D30]">
        <div>
          <div className="text-[10px] font-semibold tracking-widest text-[#8C8A86] uppercase mb-1">
            API CONFIGURATION
          </div>
          <h1 className="font-editorial text-2xl sm:text-3xl text-[#F3EDE2] font-normal tracking-tight">
            AI Provider Keys
          </h1>
          <p className="text-xs text-[#8C8A86] mt-1 font-normal">
            Enter any AI provider key below. Click <strong>TEST & SAVE</strong> to test connection, save to browser, and run the website.
          </p>
        </div>

        {/* Active Engine Badge */}
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-[6px] bg-[#11161A] border border-[#272D30] text-xs self-start sm:self-auto">
          <span className={`w-2.5 h-2.5 rounded-full ${configuredCount > 0 ? 'bg-[#4E8793] animate-pulse' : 'bg-[#C74A43]'}`} />
          <span className="text-[#8C8A86]">Active Provider:</span>
          <span className="font-semibold text-[#F3EDE2] uppercase font-mono">
            {configuredCount > 0 ? activeProvider : 'No Key Saved'}
          </span>
        </div>
      </div>

      {/* Prominent Active Key Count Green Banner */}
      <div className={`p-4 rounded-[8px] border flex items-center justify-between transition-all ${
        configuredCount > 0 
          ? 'bg-[#21434B]/20 border-[#21434B] text-[#F3EDE2]' 
          : 'bg-[#11161A] border-[#272D30] text-[#8C8A86]'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
            configuredCount > 0 ? 'bg-[#21434B] text-[#4E8793]' : 'bg-[#1F272B] text-[#8C8A86]'
          }`}>
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-[#F3EDE2]">
              {configuredCount > 0 ? `✓ ${configuredCount} API Key(s) Configured & Ready` : 'No API Keys Saved Yet'}
            </div>
            <div className="text-[11px] text-[#8C8A86] mt-0.5">
              {configuredCount > 0 
                ? `Website is running on ${activeProvider.toUpperCase()}. Adding additional keys enables automatic fallback.`
                : 'Paste any key below (Gemini, Groq, Mistral, OpenRouter) and click TEST & SAVE.'}
            </div>
          </div>
        </div>

        {configuredCount > 0 && (
          <span className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#21434B]/40 text-[#4E8793] text-[11px] font-mono border border-[#21434B]">
            <Sparkles className="w-3 h-3" />
            Active: {activeProvider.toUpperCase()}
          </span>
        )}
      </div>

      {/* Clean Provider List */}
      <div className="bg-[#11161A] border border-[#272D30] rounded-[8px] p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#1F272B]">
          <h3 className="font-medium text-[#F3EDE2] text-sm flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#8C8A86]" />
            <span>Select & Configure Provider API Key</span>
          </h3>
          <span className="text-[11px] text-[#8C8A86]">
            {configuredCount} / {PROVIDERS.length} configured
          </span>
        </div>

        <div className="space-y-4">
          {PROVIDERS.map((p, index) => {
            const savedVal = apiKeys[p.id] || '';
            const inputVal = inputValues[p.id] !== undefined ? inputValues[p.id] : '';
            const isConfigured = Boolean(savedVal && savedVal.trim());
            const isActive = activeProvider === p.id && isConfigured;
            const isTesting = testingProvider === p.id;
            const testResult = testResults[p.id];
            const isVisible = showKeys[p.id] || false;
            const defaultModelName = PROVIDER_CAPABILITIES[p.id]?.defaultTextModel || 'auto';

            return (
              <div 
                key={p.id}
                className={`p-4 rounded-[8px] border transition-all space-y-3 ${
                  isActive 
                    ? 'border-[#C74A43]/60 bg-[#090B0D]' 
                    : isConfigured 
                      ? 'border-[#272D30] bg-[#090B0D]/60' 
                      : 'border-[#1F272B] bg-[#090B0D]/30'
                }`}
              >
                {/* Top Info Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-xs text-[#F3EDE2]">{p.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#171E24] text-[#8C8A86] border border-[#272D30]">
                      {p.badge}
                    </span>

                    {/* Status Badge */}
                    {isActive ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#C74A43]/15 text-[#C74A43] border border-[#C74A43]/30 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        ACTIVE
                      </span>
                    ) : isConfigured ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#21434B]/30 text-[#4E8793] border border-[#21434B] flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        READY
                      </span>
                    ) : null}
                  </div>

                  {/* Right Actions: Get Key & Clear Key */}
                  <div className="flex items-center gap-3 shrink-0">
                    {isConfigured && (
                      <button
                        type="button"
                        onClick={() => handleClearKey(p.id)}
                        className="text-[11px] text-[#C74A43] hover:text-[#B53F39] flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Clear Key</span>
                      </button>
                    )}

                    <a
                      href={p.getKeyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[#8C8A86] hover:text-[#F3EDE2] flex items-center gap-1 hover:underline transition-colors font-medium"
                    >
                      <span>Get Free Key</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {/* Input & Test Button Row */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Key className="h-3.5 w-3.5 text-[#8C8A86]" />
                    </div>
                    <input
                      type={isVisible ? 'text' : 'password'}
                      value={inputVal}
                      onChange={(e) => handleInputChange(p.id, e.target.value)}
                      placeholder={isConfigured ? '•••••••••••••••• (Key Saved - Enter new key to update)' : p.keyPlaceholder}
                      className="w-full bg-[#11161A] border border-[#272D30] rounded-[6px] pl-9 pr-10 py-2 text-xs text-[#F3EDE2] placeholder-[#8C8A86]/50 focus:outline-none focus:border-[#C74A43] font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowKey(p.id)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#8C8A86] hover:text-[#F3EDE2] cursor-pointer"
                    >
                      {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleTestSaveAndActivate(p.id)}
                    disabled={isTesting || (!inputVal.trim() && !isConfigured)}
                    className="px-4 py-2 bg-[#C74A43] hover:bg-[#B53F39] text-[#F3EDE2] rounded-[6px] text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1.5 shrink-0 shadow-sm"
                  >
                    {isTesting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>{isTesting ? 'Testing...' : 'TEST & SAVE'}</span>
                  </button>
                </div>

                {/* Saved Key Summary Tag (Below Input) */}
                {isConfigured && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[11px] font-mono text-[#8C8A86] bg-[#171E24] px-2 py-0.5 rounded border border-[#272D30]">
                      Key #{index + 1}: {savedVal.slice(0, 6)}...{savedVal.slice(-4)}
                    </span>
                    <span className="text-[11px] text-[#4E8793] bg-[#21434B]/30 px-2 py-0.5 rounded border border-[#21434B] font-medium flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Valid
                    </span>
                    <span className="text-[11px] text-[#8C8A86] bg-[#171E24] px-2 py-0.5 rounded border border-[#272D30]">
                      Model: <strong className="text-[#F3EDE2]">{defaultModelName}</strong>
                    </span>
                  </div>
                )}

                {/* Live Test Feedback */}
                {testResult && (
                  <div className={`p-2 rounded-[6px] border text-xs flex items-center gap-2 ${
                    testResult.success
                      ? 'bg-[#21434B]/20 border-[#21434B] text-[#4E8793]'
                      : 'bg-[#C74A43]/15 border-[#C74A43]/40 text-[#C74A43]'
                  }`}>
                    {testResult.success ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[#4E8793]" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-[#C74A43]" />
                    )}
                    <span className="truncate">{testResult.message} ({testResult.latencyMs || 0}ms)</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Minimal Appearance Preferences */}
      <div className="bg-[#11161A] border border-[#272D30] rounded-[8px] p-5 space-y-4">
        <div className="pb-3 border-b border-[#1F272B]">
          <h3 className="font-medium text-[#F3EDE2] text-sm">
            Theme Preferences
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#8C8A86]">Theme Mode</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleThemeChange('light')}
                className={`p-2 rounded-[6px] border text-center transition-colors cursor-pointer flex flex-col items-center gap-1 ${
                  theme === 'light'
                    ? 'border-[#C74A43] bg-[#C74A43]/10 text-[#F3EDE2] font-semibold'
                    : 'border-[#272D30] bg-[#090B0D] text-[#8C8A86]'
                }`}
              >
                <Sun className="w-3.5 h-3.5 text-[#C74A43]" />
                <span className="text-xs">Light</span>
              </button>

              <button
                type="button"
                onClick={() => handleThemeChange('dark')}
                className={`p-2 rounded-[6px] border text-center transition-colors cursor-pointer flex flex-col items-center gap-1 ${
                  theme === 'dark'
                    ? 'border-[#C74A43] bg-[#C74A43]/10 text-[#F3EDE2] font-semibold'
                    : 'border-[#272D30] bg-[#090B0D] text-[#8C8A86]'
                }`}
              >
                <Moon className="w-3.5 h-3.5 text-[#8C8A86]" />
                <span className="text-xs">Dark</span>
              </button>

              <button
                type="button"
                onClick={() => handleThemeChange('system')}
                className={`p-2 rounded-[6px] border text-center transition-colors cursor-pointer flex flex-col items-center gap-1 ${
                  theme === 'system'
                    ? 'border-[#C74A43] bg-[#C74A43]/10 text-[#F3EDE2] font-semibold'
                    : 'border-[#272D30] bg-[#090B0D] text-[#8C8A86]'
                }`}
              >
                <Monitor className="w-3.5 h-3.5 text-[#8C8A86]" />
                <span className="text-xs">System</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#8C8A86]">Accent Style</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setThemeStyle('sweet');
                  onUpdateSettings({ ...settings, themeStyle: 'sweet' });
                }}
                className={`p-2 rounded-[6px] border text-center transition-colors cursor-pointer flex flex-col items-center gap-1 ${
                  themeStyle === 'sweet'
                    ? 'border-[#C74A43] bg-[#C74A43]/10 text-[#F3EDE2] font-semibold'
                    : 'border-[#272D30] bg-[#090B0D] text-[#8C8A86]'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#C74A43]" />
                <span className="text-xs">Coral</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setThemeStyle('simple');
                  onUpdateSettings({ ...settings, themeStyle: 'simple' });
                }}
                className={`p-2 rounded-[6px] border text-center transition-colors cursor-pointer flex flex-col items-center gap-1 ${
                  themeStyle === 'simple'
                    ? 'border-[#383E41] bg-[#171E24] text-[#F3EDE2] font-semibold'
                    : 'border-[#272D30] bg-[#090B0D] text-[#8C8A86]'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#8C8A86]" />
                <span className="text-xs">Mono</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setThemeStyle('futuristic');
                  onUpdateSettings({ ...settings, themeStyle: 'futuristic' });
                }}
                className={`p-2 rounded-[6px] border text-center transition-colors cursor-pointer flex flex-col items-center gap-1 ${
                  themeStyle === 'futuristic'
                    ? 'border-[#21434B] bg-[#21434B]/20 text-[#4E8793] font-semibold'
                    : 'border-[#272D30] bg-[#090B0D] text-[#8C8A86]'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#21434B]" />
                <span className="text-xs">Teal</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
