import { requireSupabase } from "../supabase";

const client = () => requireSupabase();
export const auth = {};
export const googleProvider = { provider: "google" };
export const githubProvider = { provider: "github" };

const toCompatUser = (user) => user ? {
  ...user,
  uid: user.id,
  displayName: user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
  photoURL: user.user_metadata?.avatar_url || user.user_metadata?.picture || "",
  emailVerified: Boolean(user.email_confirmed_at),
  providerData: [{ providerId: user.app_metadata?.provider || "email" }],
} : null;
const withUser = async (result) => {
  if (result.error) throw result.error;
  return { ...result.data, user: toCompatUser(result.data.user) };
};

export const onAuthStateChanged = (unused, callback) => {
  const sb = client();
  sb.auth.getSession().then(({ data }) => callback(toCompatUser(data.session?.user)));
  const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => callback(toCompatUser(session?.user)));
  return () => subscription.unsubscribe();
};
export const createUserWithEmailAndPassword = async (_auth, email, password, metadata = {}) => withUser(await client().auth.signUp({ email, password, options: { data: metadata } }));
export const signInWithEmailAndPassword = async (_auth, email, password) => {
  try { return await withUser(await client().auth.signInWithPassword({ email, password })); }
  catch (error) {
    if (error.code === "email_not_confirmed") { error.code = "auth/email-not-verified"; error.email = email; }
    throw error;
  }
};
export const signInWithPopup = async (_auth, provider) => {
  const { data, error } = await client().auth.signInWithOAuth({ provider: provider.provider, options: { redirectTo: `${window.location.origin}/auth/callback` } });
  if (error) throw error;
  return data;
};
export const signInWithRedirect = signInWithPopup;
export const getRedirectResult = async () => null;
export const signOut = async () => { const { error } = await client().auth.signOut(); if (error) throw error; };
export const updateProfile = async (user, data) => {
  const activeUser = user || (await client().auth.getUser()).data.user;
  const attrs = {};
  if (data.displayName !== undefined) attrs.data = { ...(activeUser?.user_metadata || {}), display_name: data.displayName };
  if (data.photoURL !== undefined) attrs.data = { ...(activeUser?.user_metadata || {}), avatar_url: data.photoURL };
  const { error } = await client().auth.updateUser(attrs); if (error) throw error;
};
export const sendEmailVerification = async (user) => {
  const { error } = await client().auth.resend({ type: "signup", email: user.email }); if (error) throw error;
};
export const sendPasswordResetEmail = async (_auth, email) => {
  const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` }); if (error) throw error;
};
export const updatePassword = async (_user, password) => {
  const { error } = await client().auth.updateUser({ password }); if (error) throw error;
};
export const EmailAuthProvider = { credential: (email, password) => ({ email, password }) };
export const reauthenticateWithCredential = async (_user, credential) => {
  const { error } = await client().auth.signInWithPassword(credential); if (error) throw error;
};
