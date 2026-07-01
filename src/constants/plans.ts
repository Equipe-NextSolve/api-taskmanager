export const PLANS = {
  FREE: {
    name: 'FREE',
    price: 0,
    days: 30,
    maxUsers: 25,
    maxProjects: 5,
    maxClients: 5,
    logRetentionDays: 7,
  },
  BASIC: {
    name: 'BASIC',
    price: 29.9,
    days: 30,
    maxUsers: 100,
    maxProjects: 100,
    maxClients: 100,
    logRetentionDays: 15,
  },
  PRO: {
    name: 'PRO',
    price: 49.9,
    days: 30,
    maxUsers: -1,
    maxProjects: -1,
    maxClients: -1,
    logRetentionDays: 30,
  },
  ADMIN: {
    name: 'ADMIN',
    price: 0,
    days: 36500,
    maxUsers: -1,
    maxProjects: -1,
    maxClients: -1,
    logRetentionDays: -1,
  },
};

// -1 - ilimitado