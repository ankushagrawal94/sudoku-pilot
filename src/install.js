export const INSTALL_PROMOTION_KEY = "sudoku-pilot-install-promotion-v1";

export function installPlatform(browser = window) {
  const userAgent = browser.navigator?.userAgent || "";
  const touchPoints = Number(browser.navigator?.maxTouchPoints) || 0;
  const ios = /iPhone|iPad|iPod/i.test(userAgent)
    || (/Macintosh/i.test(userAgent) && touchPoints > 1);
  const android = /Android/i.test(userAgent);
  const standalone = Boolean(browser.navigator?.standalone)
    || Boolean(browser.matchMedia?.("(display-mode: standalone)").matches);

  return { ios, android, mobile: ios || android, standalone };
}

export function installPromotionStatus(storage = window.localStorage) {
  try {
    return storage.getItem(INSTALL_PROMOTION_KEY) || "new";
  } catch {
    return "new";
  }
}

export function saveInstallPromotionStatus(status, storage = window.localStorage) {
  try {
    storage.setItem(INSTALL_PROMOTION_KEY, status);
  } catch {
    // Installation remains available when local storage is unavailable.
  }
}

export function clearInstallPromotionStatus(storage = window.localStorage) {
  try {
    storage.removeItem(INSTALL_PROMOTION_KEY);
  } catch {
    // The main local-data action reports storage failures to the user.
  }
}
