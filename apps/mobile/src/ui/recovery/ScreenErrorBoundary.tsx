import { Component, type ReactNode } from "react";

import { FullScreenError } from "./FullScreenError";
import { recoveryConfig } from "./config";

type Props = { readonly children: ReactNode; readonly screen?: string; readonly onReset?: () => void };
type State = { readonly failed: boolean };

/** Catches render crashes per screen: SCREEN_CRASHED with Retry, data stays safe (REC-05). */
export class ScreenErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error): void {
    recoveryConfig.getState().recordCrash?.(error, this.props.screen);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <FullScreenError
          code="SCREEN_CRASHED"
          handlers={{
            retry: () => {
              this.props.onReset?.();
              this.setState({ failed: false });
            },
          }}
        />
      );
    }
    return this.props.children;
  }
}
