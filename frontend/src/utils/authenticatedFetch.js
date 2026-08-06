import { refreshFirebaseIdToken } from "../lib/firebase.js";
import { useStore } from "../store.js";

let refreshPromise = null;

const requestWithToken = (input, init, token) => {
  const headers = new Headers(init?.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
};

export const refreshAuthenticatedSession = async () => {
  if (!refreshPromise) {
    refreshPromise = refreshFirebaseIdToken().finally(() => {
      refreshPromise = null;
    });
  }
  const refreshedToken = await refreshPromise;
  if (!refreshedToken) return null;

  useStore.getState().setAuthSession({ accessToken: refreshedToken });
  return refreshedToken;
};

export const authenticatedFetch = async (input, init = {}) => {
  const initialToken = useStore.getState().token;
  let response = await requestWithToken(input, init, initialToken);
  if (response.status !== 401) return response;

  const refreshedToken = await refreshAuthenticatedSession();
  if (!refreshedToken) return response;

  return requestWithToken(input, init, refreshedToken);
};
