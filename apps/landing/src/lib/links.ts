const latestDesktopReleaseUrl = "https://github.com/jamescardona11/looper/releases/latest/download";

export const macosDesktopDownloadUrl = `${latestDesktopReleaseUrl}/Looper_darwin_aarch64.dmg`;
export const windowsDesktopDownloadUrl = `${latestDesktopReleaseUrl}/Looper_windows_x64_setup.exe`;
export const desktopReleasesUrl = "https://github.com/jamescardona11/looper/releases/latest";

export type DesktopDownloadTarget = "macos" | "windows" | "desktop";

export function resolveDesktopDownload(userAgent: string, maxTouchPoints = 0) {
  if (/Windows/i.test(userAgent)) {
    return { target: "windows" as const, url: windowsDesktopDownloadUrl };
  }

  if (/(Macintosh|Mac OS X)/i.test(userAgent) && maxTouchPoints === 0) {
    return { target: "macos" as const, url: macosDesktopDownloadUrl };
  }

  return { target: "desktop" as const, url: desktopReleasesUrl };
}

const desktopDownload =
  typeof navigator === "undefined"
    ? { target: "desktop" as const, url: desktopReleasesUrl }
    : resolveDesktopDownload(navigator.userAgent, navigator.maxTouchPoints);

export const desktopDownloadTarget: DesktopDownloadTarget = desktopDownload.target;
export const desktopDownloadUrl = desktopDownload.url;
