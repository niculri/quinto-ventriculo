// What the API is built from: the four parts it cannot work without and the optional ones, which `resolveDependencies`
// replaces with a null implementation, so that nothing after it asks whether one exists.
import { ANYONE_INVITED } from './ports/access';
import type { AccessChecker } from './ports/access';
import { NO_ADMINS } from './ports/admin';
import type { AdminChecker } from './ports/admin';
import { NO_CLIENT_ERRORS, NO_CLIENT_ERRORS_READER } from './ports/client-errors';
import type { ClientErrorRecorder, ClientErrorsReader } from './ports/client-errors';
import type { ContentRepository } from './ports/content';
import { NO_DEEP_HEALTH } from './ports/health';
import type { DeepHealth } from './ports/health';
import type { MediaStore } from './ports/media';
import { NO_RELEASES } from './ports/releases';
import type { ReleaseRepository } from './ports/releases';
import type { SessionVerifier } from './ports/session';
import { NO_SETTINGS_REPOSITORY } from './ports/settings';
import type { SiteSettingsRepository } from './ports/settings';
import { NO_UNPUBLISHED } from './ports/unpublished';
import type { UnpublishedRepository } from './ports/unpublished';
import { NO_USAGE_EVENTS, NO_USAGE_OPENS, NO_USAGE_STATS } from './ports/usage';
import type { UsageOpensReader, UsageRecorder, UsageStatsSource } from './ports/usage';
import type { MediaSigner } from './services/media-signer';

export interface AppOptions {
  verifier: SessionVerifier;
  repository: ContentRepository;
  media: MediaStore;
  signer: MediaSigner;
  now?: () => number;
  /** The draft the administrators see in the admin mode. */
  preview?: ContentRepository;
  access?: AccessChecker;
  admins?: AdminChecker;
  releases?: ReleaseRepository;
  settings?: SiteSettingsRepository;
  unpublished?: UnpublishedRepository;
  version?: string;
  usageStats?: UsageStatsSource;
  usageOpens?: UsageOpensReader | null;
  usageEvents?: UsageRecorder;
  /** Seconds the usage report is kept (60 by default). */
  usageTtl?: number;
  /** Milliseconds a read of the settings is kept (3000 by default); a change through the panel drops it at once. */
  settingsTtl?: number;
  clientErrors?: ClientErrorRecorder;
  clientErrorsReader?: ClientErrorsReader | null;
  deepHealth?: DeepHealth;
}

/** Which of the optional parts were given: a null implementation stands for the rest. */
interface Configured {
  releases: boolean;
  settings: boolean;
  unpublished: boolean;
  usageStats: boolean;
  usageOpens: boolean;
  usageEvents: boolean;
  clientErrorsReader: boolean;
  deepHealth: boolean;
}

export interface Dependencies {
  verifier: SessionVerifier;
  repository: ContentRepository;
  media: MediaStore;
  signer: MediaSigner;
  now: () => number;
  preview: ContentRepository | null;
  access: AccessChecker;
  admins: AdminChecker;
  releases: ReleaseRepository;
  settings: SiteSettingsRepository;
  unpublished: UnpublishedRepository;
  version: string | null;
  usageStats: UsageStatsSource;
  usageOpens: UsageOpensReader;
  usageEvents: UsageRecorder;
  usageTtl: number;
  settingsTtl: number;
  clientErrors: ClientErrorRecorder;
  clientErrorsReader: ClientErrorsReader;
  deepHealth: DeepHealth;
  configured: Configured;
}

export function resolveDependencies(options: AppOptions): Dependencies {
  return {
    verifier: options.verifier,
    repository: options.repository,
    media: options.media,
    signer: options.signer,
    now: options.now ?? (() => Math.floor(Date.now() / 1000)),
    preview: options.preview ?? null,
    access: options.access ?? ANYONE_INVITED,
    admins: options.admins ?? NO_ADMINS,
    releases: options.releases ?? NO_RELEASES,
    settings: options.settings ?? NO_SETTINGS_REPOSITORY,
    unpublished: options.unpublished ?? NO_UNPUBLISHED,
    version: options.version ?? null,
    usageStats: options.usageStats ?? NO_USAGE_STATS,
    usageOpens: options.usageOpens ?? NO_USAGE_OPENS,
    usageEvents: options.usageEvents ?? NO_USAGE_EVENTS,
    usageTtl: options.usageTtl ?? 60,
    settingsTtl: options.settingsTtl ?? 3000,
    clientErrors: options.clientErrors ?? NO_CLIENT_ERRORS,
    clientErrorsReader: options.clientErrorsReader ?? NO_CLIENT_ERRORS_READER,
    deepHealth: options.deepHealth ?? NO_DEEP_HEALTH,
    configured: {
      releases: !!options.releases,
      settings: !!options.settings,
      unpublished: !!options.unpublished,
      usageStats: !!options.usageStats,
      usageOpens: !!options.usageOpens,
      usageEvents: !!options.usageEvents,
      clientErrorsReader: !!options.clientErrorsReader,
      deepHealth: !!options.deepHealth,
    },
  };
}
