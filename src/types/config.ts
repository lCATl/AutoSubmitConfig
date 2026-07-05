export type CookieCaptureMode = "named" | "all";

export interface TaskConfig {
  id: string;
  name: string;
  enabled: boolean;
  targetPageUrl: string;
  scheduleMinutes: number;
  pageLoadWaitMs: number;
  closeTabAfterCapture: boolean;
  cookieCaptureEnabled: boolean;
  cookieCaptureMode: CookieCaptureMode;
  cookieNames: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CapturedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
  expirationDate?: number;
  session: boolean;
  storeId: string;
}

export interface CookieCapturePayload {
  targetPageUrl: string;
  captureMode: CookieCaptureMode;
  matchedCount: number;
  missingCookieNames: string[];
  cookies: CapturedCookie[];
}

export interface TaskSummary {
  id: string;
  name: string;
  enabled: boolean;
  targetPageUrl: string;
  scheduleMinutes: number;
  updatedAt: string;
  nextRunAt?: string;
}

export interface PopupState {
  tasks: TaskSummary[];
}

export interface TaskDetailState {
  task: TaskConfig;
  isNew: boolean;
}
