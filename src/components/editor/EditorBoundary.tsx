"use client";

// Keeps an editor crash inside the editor.
//
// Without this, one thrown render — a stale hot-reload graph, a malformed block
// in saved content — unmounts the whole admin screen and leaves a blank page
// with the title, sidebar and Save buttons gone. A boundary turns that into a
// panel you can reload from, with the content still on disk.

import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  stack: string;
}

export default class EditorBoundary extends React.Component<Props, State> {
  state: State = { error: null, stack: "" };

  static getDerivedStateFromError(error: Error): State {
    return { error, stack: error.stack ?? "" };
  }

  // The panel below only has room for the message; the stack is what actually
  // says which block threw, so it goes to the console too.
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[EditorBoundary]", error, info.componentStack);
    this.setState({ stack: `${error.stack ?? error.message}
${info.componentStack ?? ""}` });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="my-6 rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-sm font-semibold text-amber-900">The editor stopped responding</p>
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-amber-700">
          Nothing has been lost — this page has not been saved over. Reloading rebuilds the
          editor from the last saved content.
        </p>
        <p className="mx-auto mt-3 max-w-md break-words rounded bg-amber-100/70 px-2 py-1 font-mono text-[10px] text-amber-800">
          {error.message}
        </p>
        {this.state.stack && (
          <details className="mx-auto mt-2 max-w-xl text-left">
            <summary className="cursor-pointer text-[11px] font-semibold text-amber-800">
              Show details
            </summary>
            <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-amber-100/70 p-2 font-mono text-[10px] leading-relaxed text-amber-900">
              {this.state.stack}
            </pre>
          </details>
        )}
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
          >
            Reload the editor
          </button>
          <button
            type="button"
            onClick={() => this.setState({ error: null, stack: "" })}
            className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
