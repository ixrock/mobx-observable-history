import { action, intercept, makeObservable, observable, reaction } from "mobx";
import { Action, createBrowserHistory, createPath, History, Location, LocationState, parsePath } from "history";
import { ObservableSearchParams, ObservableSearchParamsOptions } from "./observable-search-params";

export function createObservableHistory<S>(history?: History<S>, opts?: ObservableHistoryOptions) {
  return new ObservableHistory<S>(history, opts);
}

export interface ObservableHistory<S> extends History<S> {
}

export interface ObservableHistoryOptions {
  searchParams?: ObservableSearchParamsOptions;
}

export class ObservableHistory<S extends LocationState = {}> {
  private readonly history: History<S>;
  protected unbindEvents: () => void;

  @observable action: Action;
  @observable location: Location<S>;
  @observable.ref searchParams: ObservableSearchParams;

  constructor(history = createBrowserHistory<S>(), protected opts: ObservableHistoryOptions = {}) {
    makeObservable(this);

    this.history = history;
    this.action = this.history.action;
    this.location = this.history.location;
    this.searchParams = new ObservableSearchParams(this.location.search, opts.searchParams);
    this.unbindEvents = this.bindEvents();

    return new Proxy(this, {
      get: (target, prop: string | symbol, context: any) => {
        let fieldRef = Reflect.get(target, prop, context);
        if (!(prop in target)) {
          return Reflect.get(this.history, prop, context); // handle history.js native apis
        }
        return fieldRef;
      },
    })
  }

  protected bindEvents() {
    const disposers = [
      // normalize direct updates of `history.location = string | LocationDescriptor`
      intercept(this, change => {
        if (change.type === "update") {
          switch (change.name) {
            case "location":
              change.newValue = this.normalize(change.newValue);
              break;
          }
        }
        return change;
      }),

      // normalize partial updates of `history.location.(search|hash|pathname) = string`
      intercept(this.location, change => {
        if (change.type === "update") {
          switch (change.name) {
            case "search":
              change.newValue = this.normalize(change.newValue).search;
              break;
            case "hash":
              change.newValue = this.normalize(change.newValue).hash;
              break;
          }
        }
        return change
      }),

      // sync location.search with URLSearchParams()-helper
      reaction(() => this.location.search, search => {
        const params = this.searchParams.toString({ withPrefix: true });
        if (search !== params) {
          this.searchParams.replace(search);
        }
      }),

      // sync from URLSearchParams()-api updates
      reaction(() => this.searchParams.toString({ withPrefix: true }), search => {
        if (this.location.search !== search) {
          this.location.search = search;
        }
      }),

      // update history.js state from observable location changes
      reaction(() => createPath(this.location), path => {
        let currentPath = createPath(this.history.location);
        if (currentPath !== path) {
          this.history.push(path);
        }
      }),

      // sync state updates from history.js native apis
      this.history.listen(action((location, action) => {
        this.action = action;
        this.location = this.normalize(location);
      })),
    ];

    return () => {
      disposers.forEach(dispose => dispose());
    };
  }

  public normalize(location: string | Partial<Location<S>>, { skipEmpty = false } = {}): Location<S> {
    if (typeof location === "string") location = parsePath(location) as Location<S>;
    if (location.search == "?") location.search = ""
    if (location.hash == "#") location.hash = ""

    if (skipEmpty) {
      location = Object.fromEntries(
        Object.entries(location).filter(([chunk, value]) => !!value)
      );
    }
    return location as Location<S>;
  }

  public merge(location: Partial<Location<S>>, replace = false): void {
    location = {
      ...this.location,
      ...this.normalize(location),
    };
    if (replace) {
      this.history.replace(location);
    } else {
      this.history.push(location);
    }
  }

  public destroy(): History<S> {
    this.unbindEvents?.();
    return this.history;
  }

  public toString(): string {
    return createPath(this.location);
  }
}
