import { prisma } from './prisma';

export async function getFavorites(userId: string): Promise<string[]> {
  const favorites = await prisma.favorite.findMany({
    where: { userId },
    select: { channelLogin: true },
  });
  return favorites.map((f) => f.channelLogin);
}

export async function addFavorite(userId: string, channelLogin: string) {
  const normalizedLogin = channelLogin.toLowerCase();
  return prisma.favorite.upsert({
    where: {
      userId_channelLogin: {
        userId,
        channelLogin: normalizedLogin,
      },
    },
    update: {},
    create: {
      userId,
      channelLogin: normalizedLogin,
    },
  });
}

export async function removeFavorite(userId: string, channelLogin: string) {
  const normalizedLogin = channelLogin.toLowerCase();
  return prisma.favorite.deleteMany({
    where: {
      userId,
      channelLogin: normalizedLogin,
    },
  });
}

export async function syncFavorites(userId: string, channelLogins: string[]) {
  const normalizedLogins = channelLogins.map((l) => l.toLowerCase());

  // Delete all existing favorites and insert new ones in a transaction
  return prisma.$transaction([
    prisma.favorite.deleteMany({ where: { userId } }),
    prisma.favorite.createMany({
      data: normalizedLogins.map((channelLogin) => ({
        userId,
        channelLogin,
      })),
      skipDuplicates: true,
    }),
  ]);
}
