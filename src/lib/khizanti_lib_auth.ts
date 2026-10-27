// ============================================================================
// khizanti_lib_auth.ts
// المصادقة: تسجيل دخول باسم مستخدم (الوضع الافتراضي) أو ببريد حقيقي حقيقي
// إن أضافه المستخدم لاحقًا لتفعيل استرجاع كلمة المرور.
// ============================================================================
import { supabase, KhizantiError, toUserMessage } from './khizanti_lib_supabase';

const EMAIL_DOMAIN = 'khizanti.app';
const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${EMAIL_DOMAIN}`;
}

/** هل المُدخَل بريدًا إلكترونيًا حقيقيًا (وليس اسم مستخدم)؟ فحص شكلي بسيط فقط. */
function looksLikeEmail(value: string): boolean {
  return value.includes('@') && !value.trim().toLowerCase().endsWith(`@${EMAIL_DOMAIN}`);
}

export interface AuthResult {
  userId: string;
  username: string;
}

/** تسجيل مستخدم جديد. يفشل بالكامل (Atomic) إذا كان اسم المستخدم مكررًا. */
export async function signUp(username: string, password: string): Promise<AuthResult> {
  const normalized = normalizeUsername(username);

  if (!USERNAME_REGEX.test(normalized)) {
    throw new KhizantiError('اسم المستخدم يجب أن يكون 3 أحرف على الأقل (أحرف إنجليزية صغيرة وأرقام و _ فقط)');
  }
  if (!password || password.length < 1) {
    throw new KhizantiError('يرجى إدخال كلمة المرور');
  }

  const { data: available, error: checkError } = await supabase.rpc('is_username_available', {
    p_username: normalized,
  });
  if (checkError) throw new KhizantiError(toUserMessage(checkError));
  if (available === false) {
    throw new KhizantiError('اسم المستخدم مستخدم بالفعل، يرجى اختيار اسم آخر');
  }

  const { data, error } = await supabase.auth.signUp({
    email: usernameToEmail(normalized),
    password,
    options: { data: { username: normalized } },
  });

  if (error) {
    if (error.message.toLowerCase().includes('already registered')) {
      throw new KhizantiError('اسم المستخدم مستخدم بالفعل، يرجى اختيار اسم آخر');
    }
    throw new KhizantiError(toUserMessage(error));
  }
  if (!data.user) {
    throw new KhizantiError('تعذّر إنشاء الحساب، يرجى المحاولة مرة أخرى');
  }

  return { userId: data.user.id, username: normalized };
}

/**
 * تسجيل الدخول — يقبل اسم المستخدم (الوضع الافتراضي) أو البريد الإلكتروني
 * الحقيقي مباشرة (لمن أضافه وأكّده من الإعدادات).
 */
export async function signIn(usernameOrEmail: string, password: string): Promise<AuthResult> {
  const trimmed = usernameOrEmail.trim();
  const email = looksLikeEmail(trimmed) ? trimmed.toLowerCase() : usernameToEmail(trimmed);

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    throw new KhizantiError('بيانات الدخول غير صحيحة');
  }

  const username = (data.user.user_metadata?.username as string) ?? trimmed;
  return { userId: data.user.id, username };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new KhizantiError(toUserMessage(error));
}

export async function getCurrentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** يُستدعى callback بوسيطين: isLoggedIn، وisPasswordRecovery (رابط استرجاع كلمة المرور تحديدًا). */
export function onAuthStateChange(callback: (isLoggedIn: boolean, isPasswordRecovery: boolean) => void) {
  const { data } = supabase.auth.onAuthStateChange((event: string, session: unknown) => {
    callback(!!session, event === 'PASSWORD_RECOVERY');
  });
  return () => data.subscription.unsubscribe();
}

/** تغيير كلمة المرور من داخل الإعدادات — يتحقق فعليًا من كلمة المرور الحالية أولًا. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  if (!newPassword || newPassword.length < 6) {
    throw new KhizantiError('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.email) {
    throw new KhizantiError('تعذّر التحقق من الجلسة الحالية — يرجى تسجيل الدخول من جديد');
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: userData.user.email,
    password: currentPassword,
  });
  if (verifyError) {
    throw new KhizantiError('كلمة المرور الحالية غير صحيحة');
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new KhizantiError(toUserMessage(error));
}

/** البريد الحالي للحساب — إن انتهى بالنطاق الوهمي فالمستخدم لم يُضِف بريدًا حقيقيًا بعد. */
export async function getCurrentEmailInfo(): Promise<{ email: string; isReal: boolean }> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) throw new KhizantiError('تعذّر جلب بيانات الحساب');
  const email = data.user.email;
  return { email, isReal: !email.toLowerCase().endsWith(`@${EMAIL_DOMAIN}`) };
}

/**
 * إضافة/تحديث البريد الإلكتروني الحقيقي — يرسل Supabase رابط تأكيد حقيقي لهذا
 * البريد؛ بعد تأكيده يصبح هو بريد الدخول الفعلي، ويُفعَّل معه "نسيت كلمة المرور".
 */
export async function addRecoveryEmail(email: string): Promise<void> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes('@') || trimmed.endsWith(`@${EMAIL_DOMAIN}`)) {
    throw new KhizantiError('يرجى إدخال بريد إلكتروني حقيقي صالح');
  }
  const { error } = await supabase.auth.updateUser({ email: trimmed });
  if (error) throw new KhizantiError(toUserMessage(error));
}

/** طلب رابط استرجاع كلمة المرور — يعمل فقط للبريد الحقيقي المؤكَّد (وليس اسم المستخدم). */
export async function requestPasswordReset(email: string): Promise<void> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes('@')) {
    throw new KhizantiError('يرجى إدخال بريدك الإلكتروني الحقيقي (وليس اسم المستخدم)');
  }
  const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw new KhizantiError(toUserMessage(error));
}

/** تعيين كلمة مرور جديدة بعد فتح رابط الاسترجاع من البريد (جلسة استرجاع مؤقتة بالفعل). */
export async function confirmPasswordReset(newPassword: string): Promise<void> {
  if (!newPassword || newPassword.length < 6) {
    throw new KhizantiError('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new KhizantiError(toUserMessage(error));
}
