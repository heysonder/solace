import { prisma } from './prisma';

export interface UserData {
  id: string;
  login: string;
  displayName: string;
  email?: string | null;
  profileImageUrl?: string | null;
}

export async function upsertUser(userData: UserData) {
  return prisma.user.upsert({
    where: { id: userData.id },
    update: {
      login: userData.login,
      displayName: userData.displayName,
      email: userData.email,
      profileImageUrl: userData.profileImageUrl,
    },
    create: {
      id: userData.id,
      login: userData.login,
      displayName: userData.displayName,
      email: userData.email,
      profileImageUrl: userData.profileImageUrl,
    },
  });
}

export async function getUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      favorites: true,
      preferences: true,
    },
  });
}

export async function deleteUser(userId: string) {
  return prisma.user.delete({
    where: { id: userId },
  });
}
