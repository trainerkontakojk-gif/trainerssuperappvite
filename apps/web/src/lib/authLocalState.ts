export const LOGOUT_GUEST_LOCK_KEY = "trainers_logout_guest_lock";

export function clearAuthLocalState({ markLoggedOut = false } = {}) {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_profile");
  localStorage.removeItem("trainers_login_time");
  localStorage.removeItem("trainers_last_activity");

  if (markLoggedOut) {
    localStorage.setItem(LOGOUT_GUEST_LOCK_KEY, "1");
  }
}

export function clearLogoutGuestLock() {
  localStorage.removeItem(LOGOUT_GUEST_LOCK_KEY);
}

export function hasLogoutGuestLock(): boolean {
  return localStorage.getItem(LOGOUT_GUEST_LOCK_KEY) === "1";
}
