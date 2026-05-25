import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebaseAdmin';

export interface FacebookChatConfig {
  enabled: boolean;
  pageId: string;
  pageAccessToken: string;
  appSecret: string;
  verifyToken: string;
  graphVersion: string;
}

export interface ZaloChatConfig {
  enabled: boolean;
  oaId: string;
  oaAccessToken: string;
  webhookSecret: string;
}

export interface ChatIntegrationConfig {
  facebook: FacebookChatConfig;
  zalo: ZaloChatConfig;
}

export interface ChatIntegrationConfigPatch {
  facebook?: Partial<FacebookChatConfig>;
  zalo?: Partial<ZaloChatConfig>;
}

export interface PublicChatIntegrationConfig {
  facebook: Omit<FacebookChatConfig, 'pageAccessToken' | 'appSecret' | 'verifyToken'> & {
    pageAccessTokenSet: boolean;
    appSecretSet: boolean;
    verifyTokenSet: boolean;
  };
  zalo: Omit<ZaloChatConfig, 'oaAccessToken' | 'webhookSecret'> & {
    oaAccessTokenSet: boolean;
    webhookSecretSet: boolean;
  };
}

const DOC_REF = ['private_config', 'chat_integrations'] as const;

export const DEFAULT_CHAT_INTEGRATION_CONFIG: ChatIntegrationConfig = {
  facebook: {
    enabled: false,
    pageId: '',
    pageAccessToken: '',
    appSecret: '',
    verifyToken: '',
    graphVersion: 'v25.0',
  },
  zalo: {
    enabled: false,
    oaId: '',
    oaAccessToken: '',
    webhookSecret: '',
  },
};

function envConfig(): ChatIntegrationConfig {
  const facebookToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN || '';
  const facebookSecret = process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET || '';
  const facebookVerifyToken = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN || '';
  const zaloAccessToken = process.env.ZALO_OA_ACCESS_TOKEN || '';
  const zaloWebhookSecret = process.env.ZALO_WEBHOOK_SECRET || process.env.ZALO_WEBHOOK_TOKEN || '';

  return {
    facebook: {
      enabled: !!facebookToken,
      pageId: process.env.FACEBOOK_PAGE_ID || process.env.META_PAGE_ID || '',
      pageAccessToken: facebookToken,
      appSecret: facebookSecret,
      verifyToken: facebookVerifyToken,
      graphVersion: process.env.FACEBOOK_GRAPH_VERSION || process.env.META_GRAPH_VERSION || 'v25.0',
    },
    zalo: {
      enabled: !!zaloAccessToken,
      oaId: process.env.ZALO_OA_ID || '',
      oaAccessToken: zaloAccessToken,
      webhookSecret: zaloWebhookSecret,
    },
  };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeConfig(data: unknown): ChatIntegrationConfig {
  const root = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {};
  const fb = typeof root.facebook === 'object' && root.facebook !== null ? root.facebook as Record<string, unknown> : {};
  const zalo = typeof root.zalo === 'object' && root.zalo !== null ? root.zalo as Record<string, unknown> : {};

  return {
    facebook: {
      enabled: asBoolean(fb.enabled, DEFAULT_CHAT_INTEGRATION_CONFIG.facebook.enabled),
      pageId: asString(fb.pageId),
      pageAccessToken: asString(fb.pageAccessToken),
      appSecret: asString(fb.appSecret),
      verifyToken: asString(fb.verifyToken),
      graphVersion: asString(fb.graphVersion) || DEFAULT_CHAT_INTEGRATION_CONFIG.facebook.graphVersion,
    },
    zalo: {
      enabled: asBoolean(zalo.enabled, DEFAULT_CHAT_INTEGRATION_CONFIG.zalo.enabled),
      oaId: asString(zalo.oaId),
      oaAccessToken: asString(zalo.oaAccessToken),
      webhookSecret: asString(zalo.webhookSecret),
    },
  };
}

function mergeWithEnv(stored: ChatIntegrationConfig | null): ChatIntegrationConfig {
  const env = envConfig();
  if (!stored) return env;

  return {
    facebook: {
      enabled: stored.facebook.enabled,
      pageId: stored.facebook.pageId || env.facebook.pageId,
      pageAccessToken: stored.facebook.pageAccessToken || env.facebook.pageAccessToken,
      appSecret: stored.facebook.appSecret || env.facebook.appSecret,
      verifyToken: stored.facebook.verifyToken || env.facebook.verifyToken,
      graphVersion: stored.facebook.graphVersion || env.facebook.graphVersion,
    },
    zalo: {
      enabled: stored.zalo.enabled,
      oaId: stored.zalo.oaId || env.zalo.oaId,
      oaAccessToken: stored.zalo.oaAccessToken || env.zalo.oaAccessToken,
      webhookSecret: stored.zalo.webhookSecret || env.zalo.webhookSecret,
    },
  };
}

export async function getStoredChatIntegrationConfig(): Promise<ChatIntegrationConfig | null> {
  const snap = await getAdminDb().collection(DOC_REF[0]).doc(DOC_REF[1]).get();
  return snap.exists ? normalizeConfig(snap.data()) : null;
}

export async function getEffectiveChatIntegrationConfig(): Promise<ChatIntegrationConfig> {
  return mergeWithEnv(await getStoredChatIntegrationConfig());
}

export async function saveChatIntegrationConfig(partial: ChatIntegrationConfigPatch) {
  const current = await getStoredChatIntegrationConfig();
  const base = current || DEFAULT_CHAT_INTEGRATION_CONFIG;
  const next: ChatIntegrationConfig = {
    facebook: {
      ...base.facebook,
      ...(partial.facebook || {}),
      graphVersion: partial.facebook?.graphVersion || base.facebook.graphVersion || 'v25.0',
    },
    zalo: {
      ...base.zalo,
      ...(partial.zalo || {}),
    },
  };

  await getAdminDb().collection(DOC_REF[0]).doc(DOC_REF[1]).set({
    ...next,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return next;
}

export function toPublicChatIntegrationConfig(config: ChatIntegrationConfig): PublicChatIntegrationConfig {
  return {
    facebook: {
      enabled: config.facebook.enabled,
      pageId: config.facebook.pageId,
      graphVersion: config.facebook.graphVersion,
      pageAccessTokenSet: !!config.facebook.pageAccessToken,
      appSecretSet: !!config.facebook.appSecret,
      verifyTokenSet: !!config.facebook.verifyToken,
    },
    zalo: {
      enabled: config.zalo.enabled,
      oaId: config.zalo.oaId,
      oaAccessTokenSet: !!config.zalo.oaAccessToken,
      webhookSecretSet: !!config.zalo.webhookSecret,
    },
  };
}
