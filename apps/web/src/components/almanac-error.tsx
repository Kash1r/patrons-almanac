import type { ReactNode } from 'react';
import type { AlmanacError } from '@almanac/api-client';

export interface AlmanacErrorStateProps {
  readonly error: AlmanacError;
  readonly retryHref: string;
}

export function AlmanacErrorState({ error, retryHref }: AlmanacErrorStateProps) {
  const { title, body } = describe(error);
  return (
    <section className="mt-8 border border-brass bg-surface p-4 corner-step-lg md:p-6">
      <h2 className="type-h2">{title}</h2>
      <p className="mt-2 type-body text-text-muted">{body}</p>
      <a href={retryHref} className="mt-6 button-brass type-body">
        Try again
      </a>
    </section>
  );
}

function describe(error: AlmanacError): { readonly title: string; readonly body: ReactNode } {
  switch (error.kind) {
    case 'rate-limited':
      return { title: 'The archive is busy', body: 'deadlock-api.com is limiting requests. Try again in a minute.' };
    case 'upstream':
      return {
        title: 'The archive could not be reached',
        body:
          error.status === null ? (
            'deadlock-api.com did not answer.'
          ) : (
            <>
              deadlock-api.com answered with an error (status <span className="type-table">{error.status}</span>).
            </>
          ),
      };
    case 'drift':
      return {
        title: 'The records changed shape',
        body: 'deadlock-api.com sent data this page cannot read yet. It has been logged.',
      };
    default: {
      const unhandled: never = error;
      throw new Error(`unhandled error kind: ${JSON.stringify(unhandled)}`);
    }
  }
}
