import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { SiteSetting } from '../types/models';
import { api } from './api';

const defaults: SiteSetting = {
  id: 'default',
  siteName: 'NovaStream',
  primaryColor: '#22d3ee',
  secondaryColor: '#fb7185',
  colorMode: 'dark',
  heroTitle: 'Historias originales para descubrir',
  heroText: 'Explora series ficticias, episodios demo y contenido original.',
  featuredSeriesIds: [],
  sectionOrder: ['featured', 'latest', 'popular', 'genres', 'catalog'],
  showLatestEpisodes: true,
  showPopularSeries: true,
  showGenres: true,
  showComments: true,
  showFooter: true,
  footerText: 'Contenido ficticio para catalogo privado.',
};

const SiteSettingsContext = createContext<SiteSetting>(defaults);

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(defaults);

  useEffect(() => {
    api<SiteSetting>('/site-settings').then(setSettings).catch(() => undefined);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--site-primary', settings.primaryColor);
    document.documentElement.style.setProperty('--site-secondary', settings.secondaryColor);
    document.documentElement.dataset.theme = settings.colorMode;
    document.title = settings.siteName;
    if (settings.favicon) {
      let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
      }
      favicon.href = settings.favicon;
    }
  }, [settings]);

  return <SiteSettingsContext.Provider value={settings}>{children}</SiteSettingsContext.Provider>;
}

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}
