import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextStore {
  requestId: string;
  method?: string;
  path?: string;
  ip?: string;
}

const requestStorage = new AsyncLocalStorage<RequestContextStore>();

export const RequestContext = {
  run<T>(store: RequestContextStore, fn: () => T): T {
    return requestStorage.run(store, fn);
  },

  get(): RequestContextStore | undefined {
    return requestStorage.getStore();
  },

  getRequestId(): string | undefined {
    return requestStorage.getStore()?.requestId;
  },
};
