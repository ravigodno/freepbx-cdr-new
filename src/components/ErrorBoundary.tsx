import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  private handleReload = () => {
    // Clear active view and other potentially corrupted states in localStorage
    localStorage.removeItem('asterisk_cdr_active_view');
    // Reload page
    window.location.reload();
  };

  private handleGoHome = () => {
    localStorage.removeItem('asterisk_cdr_active_view');
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-6 font-sans">
          <div className="max-w-xl w-full bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xl p-8 space-y-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-2xl">
                <AlertOctagon className="h-8 w-8 animate-bounce" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Произошла непредвиденная ошибка</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  React-компонент вызвал исключение во время рендеринга.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2">
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400 font-mono">
                {this.state.error && this.state.error.toString()}
              </p>
              {this.state.errorInfo && (
                <pre className="text-[10px] text-slate-500 dark:text-slate-400 font-mono overflow-auto max-h-40 whitespace-pre-wrap leading-relaxed">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2">
              <p className="font-semibold">Почему это происходит?</p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                <li>Временный сбой при обновлении интерфейса (Hot Module Replacement / сборка).</li>
                <li>Обращение к отсутствующим свойствам объектов (например, null-ссылки).</li>
                <li>Проблемы с загрузкой данных из локального кэша браузера.</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/10 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Сбросить кэш и обновить
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex items-center justify-center gap-2 px-4 py-3 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors"
              >
                <Home className="h-4 w-4" />
                На главную
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
