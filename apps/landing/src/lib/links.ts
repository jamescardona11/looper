const desktopReleaseVersion = "1.0.2";
const desktopReleaseBaseUrl = `https://github.com/jamescardona11/looper/releases/download/desktop-v${desktopReleaseVersion}`;

export const macosDesktopDownloadUrl = `${desktopReleaseBaseUrl}/Looper_${desktopReleaseVersion}_darwin_aarch64.dmg`;
export const windowsDesktopDownloadUrl = `${desktopReleaseBaseUrl}/Looper_${desktopReleaseVersion}_windows_x64_setup.exe`;
export const desktopReleasesUrl = "https://github.com/jamescardona11/looper/releases/latest";

export function resolveDesktopDownload(userAgent: string, maxTouchPoints = 0) {
  if (/Windows/i.test(userAgent)) {
    return { label: "Download for Windows", url: windowsDesktopDownloadUrl };
  }

  if (/(Macintosh|Mac OS X)/i.test(userAgent) && maxTouchPoints === 0) {
    return { label: "Download for macOS", url: macosDesktopDownloadUrl };
  }

  return { label: "View desktop downloads", url: desktopReleasesUrl };
}

const desktopDownload =
  typeof navigator === "undefined"
    ? { label: "Download Desktop", url: desktopReleasesUrl }
    : resolveDesktopDownload(navigator.userAgent, navigator.maxTouchPoints);

export const desktopDownloadLabel = desktopDownload.label;
export const desktopDownloadUrl = desktopDownload.url;
