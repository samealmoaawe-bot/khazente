// ============================================================================
// khizanti_lib_auth.ts
// المصادقة: المستخدم لا يرى أو يتعامل مع أي بريد إلكتروني — فقط
// Username + Password. نبني بريدًا اصطناعيًا ثابتًا خلف الكواليس.
// ============================================================================
import { supabase, KhizantiError, toUserMessage } from './khizanti_lib_supabase';

const EMAIL_DOMAIN = 'khizanti.app'; // ليس .local — Supabase يرفض النطاقات المحجوزة رسميًا (RFC 6762)
const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${EMAIL_DOMAIN}`;
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

  // فحص تجربة مستخدم فقط — الفرض الفعلي في قاعدة البيانات (UNIQUE + Trigger)
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
    options: { data: { username: normalized } }, // يقرأه handle_new_user() Trigger
  });

  if (error) {
    // في حال تجاوز أحد شرط السباق (Race Condition) الفحص أعلاه، الرفض الحقيقي
    // يأتي من الـ Trigger على مستوى قاعدة البيانات ويصل هنا كخطأ.
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

/** تسجيل الدخول باسم المستخدم وكلمة المرور. */
export async function signIn(username: string, password: string): Promise<AuthResult> {
  const normalized = normalizeUsername(username);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(normalized),
    password,
  });

  if (error || !data.user) {
    // رسالة عامة عمدًا — لا نكشف هل الاسم موجود أو كلمة المرور فقط خاطئة
    throw new KhizantiError('اسم المستخدم أو كلمة المرور غير صحيحة');
  }

  return { userId: data.user.id, username: normalized };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new KhizantiError(toUserMessage(error));
}

/** الجلسة الحالية إن وُجدت — تُستخدم عند فتح التطبيق للتحقق من تسجيل الدخول. */
export async function getCurrentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** الاشتراك في تغيّرات الجلسة (تسجيل دخول/خروج من جهاز آخر، انتهاء صلاحية...). */
export function onAuthStateChange(callback: (isLoggedIn: boolean) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event: string, session: unknown) => {
    callback(!!session);
  });
  return () => data.subscription.unsubscribe();
}

/** تغيير كلمة المرور (المستخدم مسجّل دخوله بالفعل). */
export async function changePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new KhizantiError(toUserMessage(error));
}
