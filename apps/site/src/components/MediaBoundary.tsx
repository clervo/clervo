import { Component, type ErrorInfo, type ReactNode } from 'react';

export class MediaBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The deterministic poster remains visible. Runtime media never owns truth or recovery UI.
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
