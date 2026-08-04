import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSiteSettings } from '../lib/site-settings';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export function InstallAppButton() {
  const settings = useSiteSettings();
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', capture);
    return () => window.removeEventListener('beforeinstallprompt', capture);
  }, []);
  if (!prompt) return null;
  async function install() { await prompt?.prompt(); await prompt?.userChoice; setPrompt(null); }
  return <button type="button" onClick={() => void install()} aria-label={`Instalar ${settings.siteName}`} title="Instalar aplicacion" className="icon-button hidden sm:inline-flex"><Download size={18} /></button>;
}
