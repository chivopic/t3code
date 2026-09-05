import { spawnSync } from "node:child_process";

import type * as Electron from "electron";

const GTK_FRAME_EXTENTS_HINT = "_GTK_FRAME_EXTENTS";
const XPROP_TIMEOUT_MS = 250;

type WindowEnvironment = Readonly<
  Pick<NodeJS.ProcessEnv, "DISPLAY" | "WAYLAND_DISPLAY" | "XDG_SESSION_TYPE">
>;

type ResolveLinuxX11WindowFrameOptionsInput = {
  readonly options: Electron.BrowserWindowConstructorOptions;
  readonly platform: NodeJS.Platform;
  readonly env: WindowEnvironment;
  readonly ozonePlatform?: string | null;
  readonly readWmSupportedHints?: () => string | null;
};

export function isLinuxX11Session(
  platform: NodeJS.Platform,
  env: WindowEnvironment,
  ozonePlatform?: string | null,
): boolean {
  if (platform !== "linux") {
    return false;
  }

  const forcedOzonePlatform = ozonePlatform?.trim().toLowerCase();
  if (forcedOzonePlatform === "x11") {
    return true;
  }
  if (forcedOzonePlatform === "wayland") {
    return false;
  }

  const sessionType = env.XDG_SESSION_TYPE?.trim().toLowerCase();
  if (sessionType === "wayland" || env.WAYLAND_DISPLAY?.trim()) {
    return false;
  }
  if (sessionType === "x11") {
    return true;
  }

  return Boolean(env.DISPLAY?.trim());
}

export function readX11WmSupportedHints(env: NodeJS.ProcessEnv = process.env): string | null {
  const result = spawnSync("xprop", ["-root", "_NET_SUPPORTED"], {
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "ignore"],
    timeout: XPROP_TIMEOUT_MS,
  });

  if (result.error || result.status !== 0 || typeof result.stdout !== "string") {
    return null;
  }
  return result.stdout;
}

export function resolveLinuxX11WindowFrameOptions(
  input: ResolveLinuxX11WindowFrameOptionsInput,
): Electron.BrowserWindowConstructorOptions {
  const { options } = input;
  const usesHiddenTitleBar =
    options.frame !== true &&
    options.titleBarStyle === "hidden" &&
    options.titleBarOverlay !== undefined &&
    options.titleBarOverlay !== false;

  if (
    !usesHiddenTitleBar ||
    !isLinuxX11Session(input.platform, input.env, input.ozonePlatform)
  ) {
    return options;
  }

  const supportedHints = (input.readWmSupportedHints ?? (() => readX11WmSupportedHints()))();
  if (supportedHints === null || supportedHints.includes(GTK_FRAME_EXTENTS_HINT)) {
    return options;
  }

  const nativeFrameOptions = { ...options, frame: true };
  delete nativeFrameOptions.titleBarStyle;
  delete nativeFrameOptions.titleBarOverlay;
  return nativeFrameOptions;
}
