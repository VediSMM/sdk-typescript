import { VediSMMClient, type VediSMMClientOptions } from "./client.js";
import type { ApiResult, CallOptions, OperationId } from "./types.js";

export const SERVICE_OPERATION_IDS = Object.freeze({
  system: Object.freeze(["getOpenApi", "ping"] as const),
  auth: Object.freeze([
    "forgotPassword",
    "login",
    "logout",
    "logoutAll",
    "refresh",
    "register",
    "resendVerification",
    "resetPassword",
    "verifyEmail",
  ] as const),
  profile: Object.freeze(["changePassword", "deleteMe", "getMe", "updateMe"] as const),
  sessions: Object.freeze(["getSession", "listSessions", "revokeSession"] as const),
  audit: Object.freeze(["listAuditEvents"] as const),
  personalTokens: Object.freeze([
    "createPersonalToken",
    "getPersonalToken",
    "listPersonalTokens",
    "revokePersonalToken",
    "rotatePersonalToken",
    "updatePersonalToken",
  ] as const),
  preferences: Object.freeze([
    "createContentTemplate",
    "deleteContentTemplate",
    "getContentTemplate",
    "getSignatures",
    "listContentTemplates",
    "replaceSignatures",
    "updateContentTemplate",
  ] as const),
  networks: Object.freeze(["getNetwork", "listNetworks"] as const),
  connections: Object.freeze([
    "cancelAccountConnection",
    "confirmAccountConnection",
    "getAccountConnection",
    "startAccountConnection",
  ] as const),
  accounts: Object.freeze(["disconnectAccount", "getAccount", "listAccounts", "verifyAccount"] as const),
  groups: Object.freeze([
    "createGroup",
    "deleteGroup",
    "getGroup",
    "listGroups",
    "replaceGroupAccounts",
    "updateGroup",
  ] as const),
  media: Object.freeze([
    "deleteMedia",
    "getMedia",
    "getMediaContent",
    "getSignedMediaContent",
    "listMedia",
    "uploadMedia",
  ] as const),
  posts: Object.freeze([
    "checkPostConstraints",
    "createPostDraft",
    "deletePostDraft",
    "getPost",
    "listPosts",
    "schedulePost",
    "unschedulePost",
    "updatePostDraft",
  ] as const),
  jobs: Object.freeze([
    "deletePostEverywhere",
    "getPublicationJob",
    "listPublicationJobs",
    "publishPost",
    "retryPostTargets",
  ] as const),
  calendar: Object.freeze(["listCalendarEvents"] as const),
  analytics: Object.freeze([
    "getAnalyticsAudience",
    "getAnalyticsNetworks",
    "getAnalyticsSummary",
    "getAnalyticsTimeseries",
    "listAnalyticsPosts",
  ] as const),
  webhooks: Object.freeze([
    "createWebhook",
    "deleteWebhook",
    "getWebhook",
    "getWebhookDelivery",
    "listWebhookDeliveries",
    "listWebhooks",
    "retryWebhookDelivery",
    "rotateWebhookSecret",
    "testWebhook",
    "updateWebhook",
  ] as const),
});

export type OperationMethod = <T = unknown>(options?: CallOptions) => Promise<ApiResult<T>>;

export type BoundService<Ids extends readonly OperationId[]> = Readonly<
  { readonly [Id in Ids[number]]: OperationMethod } & { readonly operationIds: Ids }
>;

const bindService = <Ids extends readonly OperationId[]>(
  client: VediSMMClient,
  operationIds: Ids,
): BoundService<Ids> => {
  const service = Object.create(null) as Record<string, unknown>;
  for (const operationId of operationIds) {
    Object.defineProperty(service, operationId, {
      enumerable: true,
      value: <T = unknown>(options: CallOptions = {}) => client.call<T>(operationId, options),
      writable: false,
      configurable: false,
    });
  }
  Object.defineProperty(service, "operationIds", {
    enumerable: false,
    value: operationIds,
    writable: false,
    configurable: false,
  });
  return Object.freeze(service) as BoundService<Ids>;
};

export class VediSMM extends VediSMMClient {
  public readonly system: BoundService<typeof SERVICE_OPERATION_IDS.system>;
  public readonly auth: BoundService<typeof SERVICE_OPERATION_IDS.auth>;
  public readonly profile: BoundService<typeof SERVICE_OPERATION_IDS.profile>;
  public readonly sessions: BoundService<typeof SERVICE_OPERATION_IDS.sessions>;
  public readonly audit: BoundService<typeof SERVICE_OPERATION_IDS.audit>;
  public readonly personalTokens: BoundService<typeof SERVICE_OPERATION_IDS.personalTokens>;
  public readonly preferences: BoundService<typeof SERVICE_OPERATION_IDS.preferences>;
  public readonly networks: BoundService<typeof SERVICE_OPERATION_IDS.networks>;
  public readonly connections: BoundService<typeof SERVICE_OPERATION_IDS.connections>;
  public readonly accounts: BoundService<typeof SERVICE_OPERATION_IDS.accounts>;
  public readonly groups: BoundService<typeof SERVICE_OPERATION_IDS.groups>;
  public readonly media: BoundService<typeof SERVICE_OPERATION_IDS.media>;
  public readonly posts: BoundService<typeof SERVICE_OPERATION_IDS.posts>;
  public readonly jobs: BoundService<typeof SERVICE_OPERATION_IDS.jobs>;
  public readonly calendar: BoundService<typeof SERVICE_OPERATION_IDS.calendar>;
  public readonly analytics: BoundService<typeof SERVICE_OPERATION_IDS.analytics>;
  public readonly webhooks: BoundService<typeof SERVICE_OPERATION_IDS.webhooks>;

  public constructor(options: VediSMMClientOptions = {}) {
    super(options);
    this.system = bindService(this, SERVICE_OPERATION_IDS.system);
    this.auth = bindService(this, SERVICE_OPERATION_IDS.auth);
    this.profile = bindService(this, SERVICE_OPERATION_IDS.profile);
    this.sessions = bindService(this, SERVICE_OPERATION_IDS.sessions);
    this.audit = bindService(this, SERVICE_OPERATION_IDS.audit);
    this.personalTokens = bindService(this, SERVICE_OPERATION_IDS.personalTokens);
    this.preferences = bindService(this, SERVICE_OPERATION_IDS.preferences);
    this.networks = bindService(this, SERVICE_OPERATION_IDS.networks);
    this.connections = bindService(this, SERVICE_OPERATION_IDS.connections);
    this.accounts = bindService(this, SERVICE_OPERATION_IDS.accounts);
    this.groups = bindService(this, SERVICE_OPERATION_IDS.groups);
    this.media = bindService(this, SERVICE_OPERATION_IDS.media);
    this.posts = bindService(this, SERVICE_OPERATION_IDS.posts);
    this.jobs = bindService(this, SERVICE_OPERATION_IDS.jobs);
    this.calendar = bindService(this, SERVICE_OPERATION_IDS.calendar);
    this.analytics = bindService(this, SERVICE_OPERATION_IDS.analytics);
    this.webhooks = bindService(this, SERVICE_OPERATION_IDS.webhooks);
  }
}
