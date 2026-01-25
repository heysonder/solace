import { prisma } from './prisma';

export interface UserPreferences {
  proxySelection: string;
  chatFontSize: string;
  showTimestamps: boolean;
  bttvEmotesEnabled: boolean;
  ffzEmotesEnabled: boolean;
  seventvEmotesEnabled: boolean;
  disableNativePlayer: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  proxySelection: 'auto',
  chatFontSize: 'medium',
  showTimestamps: false,
  bttvEmotesEnabled: true,
  ffzEmotesEnabled: true,
  seventvEmotesEnabled: true,
  disableNativePlayer: false,
};

export async function getPreferences(userId: string): Promise<UserPreferences> {
  const prefs = await prisma.preferences.findUnique({
    where: { userId },
  });

  if (!prefs) {
    return DEFAULT_PREFERENCES;
  }

  return {
    proxySelection: prefs.proxySelection,
    chatFontSize: prefs.chatFontSize,
    showTimestamps: prefs.showTimestamps,
    bttvEmotesEnabled: prefs.bttvEmotesEnabled,
    ffzEmotesEnabled: prefs.ffzEmotesEnabled,
    seventvEmotesEnabled: prefs.seventvEmotesEnabled,
    disableNativePlayer: prefs.disableNativePlayer,
  };
}

export async function updatePreferences(
  userId: string,
  updates: Partial<UserPreferences>
) {
  return prisma.preferences.upsert({
    where: { userId },
    update: updates,
    create: {
      userId,
      ...DEFAULT_PREFERENCES,
      ...updates,
    },
  });
}

export async function syncPreferences(userId: string, prefs: UserPreferences) {
  return prisma.preferences.upsert({
    where: { userId },
    update: prefs,
    create: {
      userId,
      ...prefs,
    },
  });
}
