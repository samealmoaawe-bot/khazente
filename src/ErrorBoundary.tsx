// ============================================================================
// ErrorBoundary.tsx — يمنع "الشاشة البيضاء": أي خطأ غير متوقع يُعرض بوضوح
// بدل أن يختفي التطبيق بالكامل بصمت
// ============================================================================
import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // يظهر في Console دائمًا لتشخيص أدق حتى لو غُطّي الخطأ بالواجهة أدناه
    console.error('Khizanti fatal error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          direction: 'rtl', textAlign: 'center', padding: '48px 24px',
          fontFamily: 'sans-serif', color: '#b1462e', maxWidth: 480, margin: '0 auto',
        }}>
          <h1 style={{ fontSize: '1.3rem', marginBottom: 12 }}>حدث خطأ غير متوقع</h1>
          <p style={{ color: '#6b6558', marginBottom: 16 }}>
            افتح أدوات المطوّر (F12) ← تبويب Console لرؤية التفاصيل الكاملة.
          </p>
          <pre style={{
            background: '#f7e6e1', padding: 12, borderRadius: 8, textAlign: 'left',
            direction: 'ltr', overflowX: 'auto', fontSize: '0.8rem',
          }}>
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
