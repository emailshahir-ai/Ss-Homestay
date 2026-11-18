import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Ralat tidak dijangka telah berlaku.',
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, message: '' });
    window.location.reload();
  };

  override render(): React.ReactNode {
    if (this.state.hasError) {
      let friendlyDetail = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed && typeof parsed.error === 'string') {
          friendlyDetail = `Operasi ${parsed.operationType || 'pangkalan data'} gagal: ${parsed.error}`;
        }
      } catch {
        // Keep original string if not JSON
      }

      return (
        <div className="min-h-screen bg-[#F8F9F7] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-[#DDE2DC] rounded-xl p-8 text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 text-red-700 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-semibold text-[#161B17] mb-2">
              Gangguan Sementara Sistem
            </h1>
            <p className="text-sm text-[#525C54] mb-6 leading-relaxed">
              {friendlyDetail}
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#14532D] text-white text-sm font-medium hover:bg-[#166534] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Muat Semula Halaman
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
